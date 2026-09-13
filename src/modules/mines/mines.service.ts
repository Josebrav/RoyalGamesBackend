import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes, randomInt, randomUUID, createHash } from 'crypto';
import { MinesRound } from './entities/mines-round.entity';
import { MinesJackpot } from './entities/mines-jackpot.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { StartRoundDto } from './dtos/start-round.dto';
import { RevealTileDto } from './dtos/reveal-tile.dto';
import { CashoutDto } from './dtos/cashout.dto';
import { StartAndRevealDto } from './dtos/start-and-reveal.dto';
import { MINES_TILE_COUNT, MINES_HOUSE_EDGE } from './constants/fixed-bet-values';
import {
  MINES_JACKPOT_ID,
  MINES_JACKPOT_CONTRIBUTION_RATE,
  MINES_JACKPOT_ELIGIBILITY_WINDOW_MS,
} from './constants/jackpot.constants';
import { BingoService } from '../bingo/bingo.service';
import { BingoGateway } from '../bingo/bingo.gateway';

export interface RevealTileResult {
  result: 'bomb' | 'diamond';
  busted: boolean;
  minePositions?: number[];
  serverSeed?: string;
  multiplier?: number;
  accumulatedWinnings?: number;
  jackpotWon: boolean;
  jackpotAmount: number;
  chips?: number;
}

// Postgres unique_violation, thrown by the partial unique index on (userId) WHERE
// status = 'active' when two concurrent `start` calls race past the pre-check below.
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class MinesService {
  private readonly logger = new Logger(MinesService.name);

  // In-memory short-circuit for the jackpot check on every diamond reveal - the DB (Postgres on
  // Render) is a ~200ms round trip away, and revealTile already does several sequential locked
  // queries per call, so an extra unconditional jackpot lock on every single reveal was making
  // the game feel sluggish for no benefit 99%+ of the time (the pot is eligible maybe once a day).
  // null means "unknown, go check" (ej. right after a server restart); once populated, reveals
  // skip the jackpot row entirely until real time catches up to this timestamp, at which point
  // revealTile falls back to the real locked read/claim below - never trusted for the actual
  // claim decision, only for deciding whether it's worth asking the DB at all.
  private cachedJackpotNextEligibleAt: Date | null = null;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private bingoService: BingoService,
    private bingoGateway: BingoGateway,
  ) {}

  /**
   * Chips only change here on start (debit) and cashout (credit) - the Minas chat panel's player
   * list (PresenceEntry.chips, see bingo.gateway.ts buildPresence) is a snapshot the gateway only
   * refreshes on its own WS events, so without this a player's displayed chip count would go
   * stale the moment they play. Best-effort: never let a chat-refresh hiccup fail the actual
   * money-moving request, which has already succeeded by the time this runs.
   */
  private async refreshMinasChatPresence(): Promise<void> {
    try {
      const room = await this.bingoService.ensureLobbyRoom('minas', 'Minas');
      await this.bingoGateway.broadcastRoomState(room.id);
    } catch (err: any) {
      this.logger.warn(`Could not refresh Minas chat presence: ${err?.message}`);
    }
  }

  /**
   * Single round trip instead of the previous existingActive check + BEGIN + lock user + save
   * user + lock jackpot + save jackpot + insert round + COMMIT (8 round trips - this, not
   * anything jackpot-specific, was the ~5s-feeling delay when starting a fresh round; see
   * revealTile's own doc comment for the same class of fix). The debit, the jackpot contribution,
   * and the round insert are three CTEs in one statement: `jackpot_updated` and `inserted_round`
   * both gate on `debited_user` actually having produced a row, so insufficient chips (or a
   * nonexistent user) atomically does nothing at all, exactly like the old transaction did. The
   * existing partial unique index on mines_rounds(userId) WHERE status='active' still does the
   * "only one active round" enforcement - inserted_round's INSERT hits it exactly as before, and
   * the same PG_UNIQUE_VIOLATION catch below still converts that into the same ConflictException.
   */
  async startRound(userId: string, dto: StartRoundDto) {
    const { betAmount, minesCount } = dto;

    const minePositions = this.generateMinePositions(minesCount);
    const serverSeed = randomBytes(32).toString('hex');
    const serverSeedHash = createHash('sha256').update(serverSeed).digest('hex');
    // Preview only (K=1 fair-minus-edge multiplier) - the real per-reveal multiplier is computed
    // fresh in revealTile's own SQL from the actual live reveal count, not derived from this.
    const multiplierBp = this.previewMultiplierBp(minesCount);
    // No longer a flat step (the real formula is a nonlinear hypergeometric product, recomputed
    // per reveal in revealTile) - kept at 0 rather than dropping the column/migrating.
    const incrementBp = 0;
    const roundId = randomUUID();

    // Every bet feeds the Gema Royal pot - Math.max(1, ...) is deliberate: the smallest bet tier
    // (10 chips, see FIXED_BET_VALUES) would round 1% down to 0 and never contribute otherwise.
    const jackpotContribution = Math.max(1, Math.round(betAmount * MINES_JACKPOT_CONTRIBUTION_RATE));

    try {
      const [row] = await this.dataSource.query(
        `
        WITH debited_user AS (
          UPDATE users SET chips = chips - $2 WHERE id = $1 AND chips >= $2 RETURNING chips
        ),
        jackpot_updated AS (
          UPDATE mines_jackpot
          SET "potAmount" = "potAmount" + $3
          WHERE id = $4 AND EXISTS (SELECT 1 FROM debited_user)
          RETURNING "potAmount", "nextEligibleAt"
        ),
        inserted_round AS (
          INSERT INTO mines_rounds
            (id, "userId", "betAmount", "minesCount", "tileCount", "minePositions", "revealedTiles",
             "multiplierBp", "incrementBp", "accumulatedWinnings", status, "serverSeed", "serverSeedHash")
          SELECT $5, $1, $2, $6, $7, $8::jsonb, '[]'::jsonb, $9, $10, 0, 'active', $11, $12
          FROM debited_user
          RETURNING id
        )
        SELECT
          (SELECT chips FROM debited_user) AS chips,
          (SELECT id FROM inserted_round) AS "roundId",
          (SELECT "nextEligibleAt" FROM jackpot_updated) AS "jackpotNextEligibleAt";
        `,
        [
          userId,
          betAmount,
          jackpotContribution,
          MINES_JACKPOT_ID,
          roundId,
          minesCount,
          MINES_TILE_COUNT,
          JSON.stringify(minePositions),
          multiplierBp,
          incrementBp,
          serverSeed,
          serverSeedHash,
        ],
      );

      if (row?.roundId == null) {
        // Never hit on a normal successful start - only here to build an accurate error message
        // (nonexistent user vs. insufficient chips), so the extra round trip doesn't matter.
        const user = await this.dataSource.manager.findOne(User, { where: { id: userId } });
        if (!user) {
          throw new NotFoundException('User not found');
        }
        throw new BadRequestException('Insufficient chips');
      }

      if (row.jackpotNextEligibleAt) {
        this.cachedJackpotNextEligibleAt = new Date(row.jackpotNextEligibleAt);
      }

      // Fire-and-forget - refreshMinasChatPresence is already best-effort (try/catch, never
      // throws) and the money-moving part of this request has already fully committed by now, so
      // there's no reason to make the client wait out its own extra handful of round trips too.
      this.refreshMinasChatPresence();

      return {
        roundId: row.roundId,
        serverSeedHash,
        multiplier: multiplierBp / 10000,
        chips: Number(row.chips),
      };
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('You already have an active Mines round');
      }
      throw err;
    }
  }

  /**
   * Combines startRound + revealTile into one HTTP round trip - the client's very first click of
   * a round used to pay for two full client<->server round trips back to back (see
   * BetManager.cs's old StartRoundThenReveal) before anything ever appeared on screen. Each half
   * is already its own single-DB-query operation (see their own doc comments), so this doesn't
   * add new DB round trips - it just removes the extra network hop between them by making it one
   * request instead of two. Reuses startRound/revealTile as-is (not reimplemented here) so their
   * validation, locking and jackpot logic stay the single source of truth.
   */
  async startRoundAndReveal(userId: string, dto: StartAndRevealDto): Promise<RevealTileResult & { roundId: string; serverSeedHash: string }> {
    const { betAmount, minesCount, tileIndex } = dto;

    const startResult = await this.startRound(userId, { betAmount, minesCount });
    const revealResult = await this.revealTile(userId, { roundId: startResult.roundId, tileIndex });

    return {
      ...revealResult,
      roundId: startResult.roundId,
      serverSeedHash: startResult.serverSeedHash,
      chips: revealResult.chips ?? startResult.chips,
    };
  }

  /**
   * Single round trip instead of the previous BEGIN + SELECT ... FOR UPDATE + UPDATE + COMMIT
   * (4 round trips - the actual source of the ~1s-per-click feel against a distant DB, not
   * anything jackpot-related). The UPDATE's own row lock replaces the separate SELECT ... FOR
   * UPDATE, and the bomb-vs-diamond branch plus all the new-value math (revealedTiles append,
   * multiplier increment, winnings accrual) happen in SQL via CASE expressions evaluated against
   * the row's pre-update values - equivalent to the old read-then-decide-then-write, just as one
   * statement. WHERE guards status='active' and "not already revealed" atomically; 0 rows
   * affected means one of those failed, so a plain (unlocked, off the hot path) follow-up read
   * figures out which error to throw.
   *
   * The Gema Royal jackpot claim (rare - only matters once the pot is actually eligible, gated by
   * the in-memory cache below) stays its own small transaction with real row locks, same as
   * before: decoupling it from the round-reveal update means a jackpot-claim hiccup can no longer
   * roll back the reveal itself, but the reveal is fully valid on its own either way, and this
   * keeps the 99.99% hot path down to exactly one query.
   */
  async revealTile(userId: string, dto: RevealTileDto): Promise<RevealTileResult> {
    const { roundId, tileIndex } = dto;

    // Single round trip, same shape as before, but "accumulatedWinnings"/"multiplierBp" are no
    // longer a running sum with a flat per-step increment - they're recomputed fresh from the
    // real hypergeometric odds each reveal (see previewMultiplierBp's doc comment for why the old
    // linear formula was wrong). fair_multiplier = prod_{i=0}^{k-1} (25-i)/(safe_count-i),
    // computed via EXP(SUM(LN(...))) since Postgres has no PRODUCT aggregate - equivalent and
    // exact for the range of values here (k up to 24, no risk of float blowup). "calc" locks the
    // row (FOR UPDATE) and validates the same conditions as before (active, right user, tile not
    // already revealed) in one WHERE; 0 matching rows flows through to the same not-found/
    // not-active/already-revealed diagnosis as before.
    //
    // This query's outermost statement is a plain SELECT (of the "updated" CTE), not a bare
    // UPDATE ... RETURNING like the old version of this query - dataSource.query() returns the
    // bare rows array directly for that shape (confirmed against this driver/TypeORM version),
    // not the [rows, affectedCount] tuple a top-level UPDATE/INSERT ... RETURNING gives.
    const rows = await this.dataSource.query(
      `
      WITH calc AS (
        SELECT
          id,
          "minePositions" @> to_jsonb($3::int) AS is_mine,
          jsonb_array_length("revealedTiles") + 1 AS new_k,
          ($5::int - "minesCount") AS safe_count
        FROM mines_rounds
        WHERE id = $1 AND "userId" = $2 AND status = 'active' AND NOT ("revealedTiles" @> to_jsonb($3::int))
        FOR UPDATE
      ),
      mult AS (
        SELECT
          calc.*,
          CASE WHEN is_mine THEN NULL ELSE
            EXP((
              SELECT COALESCE(SUM(LN($5::int - i) - LN(calc.safe_count - i)), 0)
              FROM generate_series(0, calc.new_k - 1) AS i
            ))
          END AS fair_multiplier
        FROM calc
      ),
      updated AS (
        UPDATE mines_rounds r
        SET
          status = CASE WHEN m.is_mine THEN 'busted' ELSE r.status END,
          "resolvedAt" = CASE WHEN m.is_mine THEN now() ELSE r."resolvedAt" END,
          "revealedTiles" = CASE WHEN m.is_mine THEN r."revealedTiles" ELSE r."revealedTiles" || to_jsonb($3::int) END,
          "multiplierBp" = CASE WHEN m.is_mine
            THEN r."multiplierBp"
            ELSE ROUND(m.fair_multiplier * (1 - $4::numeric) * 10000)::int
          END,
          "incrementBp" = 0,
          "accumulatedWinnings" = CASE WHEN m.is_mine
            THEN r."accumulatedWinnings"
            ELSE ROUND(r."betAmount" * m.fair_multiplier * (1 - $4::numeric))::bigint
          END
        FROM mult m
        WHERE r.id = m.id
        RETURNING r.*
      )
      SELECT * FROM updated;
      `,
      [roundId, userId, tileIndex, MINES_HOUSE_EDGE, MINES_TILE_COUNT],
    );

    if (rows.length === 0) {
      // Never hit on a normal successful reveal - only here to build an accurate error message
      // for the actual failure (not found / wrong user / not active / already revealed), so the
      // extra round trip doesn't matter.
      const round = await this.dataSource.manager.findOne(MinesRound, { where: { id: roundId } });
      if (!round || round.userId !== userId) {
        throw new NotFoundException('Round not found');
      }
      if (round.status !== 'active') {
        throw new BadRequestException('Round is not active');
      }
      throw new BadRequestException('Tile already revealed');
    }

    const round = rows[0];
    const isMine = (round.minePositions as number[]).includes(tileIndex);

    if (isMine) {
      return {
        result: 'bomb',
        busted: true,
        minePositions: round.minePositions,
        serverSeed: round.serverSeed,
        jackpotWon: false,
        jackpotAmount: 0,
      };
    }

    // Gema Royal: skip the jackpot row entirely (no query at all) when the in-memory cache
    // already knows it's not eligible yet - avoids an extra ~200ms round trip on every single
    // reveal for the 99%+ of the time nothing jackpot-related is happening. Only falls through
    // to the real locked check when the cache says "might be eligible" or "unknown".
    let jackpotWon = false;
    let jackpotAmount = 0;
    let winnerNick: string | null = null;
    let updatedChips: number | undefined;

    const now = new Date();
    if (this.cachedJackpotNextEligibleAt === null || this.cachedJackpotNextEligibleAt <= now) {
      await this.dataSource.transaction(async (manager) => {
        // Same "round -> jackpot -> user" lock order used everywhere else this pot is touched
        // (the round itself was already resolved above, so this transaction only ever locks
        // jackpot then user) so two players revealing a diamond at the same instant serialize on
        // this row - only whichever transaction commits first still sees potAmount > 0, the other
        // finds it already reset to 0 and wins nothing.
        const jackpot = await manager
          .createQueryBuilder(MinesJackpot, 'jackpot')
          .setLock('pessimistic_write')
          .where('jackpot.id = :id', { id: MINES_JACKPOT_ID })
          .getOne();

        if (jackpot && Number(jackpot.potAmount) > 0 && jackpot.nextEligibleAt <= now) {
          jackpotAmount = Number(jackpot.potAmount);
          jackpotWon = true;

          const winner = await manager
            .createQueryBuilder(User, 'user')
            .setLock('pessimistic_write')
            .where('user.id = :id', { id: userId })
            .getOne();
          if (winner) {
            winner.chips = (Number(winner.chips) || 0) + jackpotAmount;
            await manager.save(winner);
            updatedChips = winner.chips;
            winnerNick = winner.nick;

            await manager.save(
              manager.create(ChipsAward, {
                userId,
                amount: jackpotAmount,
                source: 'prize',
                game: 'minas',
              }),
            );
          }

          jackpot.potAmount = 0;
          jackpot.nextEligibleAt = new Date(Date.now() + MINES_JACKPOT_ELIGIBILITY_WINDOW_MS);
          jackpot.lastWinnerUserId = userId;
          jackpot.lastWinnerNick = winnerNick;
          jackpot.lastWonAmount = jackpotAmount;
          jackpot.lastWonAt = new Date();
          await manager.save(jackpot);
        }

        if (jackpot) {
          this.cachedJackpotNextEligibleAt = jackpot.nextEligibleAt;
        }
      });
    }

    if (jackpotWon) {
      await this.announceJackpotWin(winnerNick ?? 'Alguien', jackpotAmount);
    }

    return {
      result: 'diamond',
      busted: false,
      multiplier: Number(round.multiplierBp) / 10000,
      accumulatedWinnings: Number(round.accumulatedWinnings),
      jackpotWon,
      jackpotAmount,
      chips: updatedChips,
    };
  }

  /** Mirrors refreshMinasChatPresence()'s best-effort style (try/catch, only logs on failure,
   *  never throws) - a jackpot win already fully happened and committed by the time this runs, a
   *  hiccup announcing it shouldn't fail the reveal request that just paid out real chips. */
  private async announceJackpotWin(nick: string, amount: number): Promise<void> {
    try {
      const room = await this.bingoService.ensureLobbyRoom('minas', 'Minas');
      const entry = await this.bingoService.sendSystemMessage(
        room.id,
        `💎👑 ¡${nick} ganó la Gema Royal por ${amount} fichas!`,
      );
      this.bingoGateway.broadcastChatMessage(room.id, entry);
      await this.bingoGateway.broadcastRoomState(room.id);
    } catch (err: any) {
      this.logger.warn(`Could not announce Gema Royal win: ${err?.message}`);
    }
  }

  /** Current pot + when it next becomes claimable - polled by the client's Gema Royal panel. */
  async getJackpotStatus() {
    const jackpot = await this.dataSource.manager.findOne(MinesJackpot, {
      where: { id: MINES_JACKPOT_ID },
    });
    const now = new Date();

    return {
      potAmount: jackpot ? Number(jackpot.potAmount) : 0,
      nextEligibleAt: jackpot?.nextEligibleAt ?? null,
      eligible: !!jackpot && jackpot.nextEligibleAt <= now,
      lastWinner: jackpot?.lastWinnerNick
        ? {
            nick: jackpot.lastWinnerNick,
            amount: Number(jackpot.lastWonAmount ?? 0),
            wonAt: jackpot.lastWonAt,
          }
        : null,
    };
  }

  /**
   * Single round trip instead of the previous BEGIN + lock round + lock user + save user + insert
   * ChipsAward + save round + COMMIT (7 round trips - same class of fix as startRound/revealTile).
   * `resolved_round` does the WHERE-guarded status flip (active, belongs to this user, actually
   * has winnings) and is what everything else gates on via EXISTS/FROM, so an invalid cashout
   * atomically does nothing at all, exactly like the old transaction did.
   */
  async cashout(userId: string, dto: CashoutDto) {
    const { roundId } = dto;

    const [row] = await this.dataSource.query(
      `
      WITH resolved_round AS (
        UPDATE mines_rounds
        SET status = 'cashed_out', "resolvedAt" = now()
        WHERE id = $1 AND "userId" = $2 AND status = 'active' AND "accumulatedWinnings" > 0
        RETURNING "accumulatedWinnings"
      ),
      credited_user AS (
        UPDATE users
        SET chips = chips + (SELECT "accumulatedWinnings" FROM resolved_round)
        WHERE id = $2 AND EXISTS (SELECT 1 FROM resolved_round)
        RETURNING chips
      ),
      inserted_award AS (
        INSERT INTO chips_awards ("userId", amount, source, game)
        SELECT $2, "accumulatedWinnings", 'game', 'minas'
        FROM resolved_round
        RETURNING id
      )
      SELECT
        (SELECT "accumulatedWinnings" FROM resolved_round) AS "winAmount",
        (SELECT chips FROM credited_user) AS chips;
      `,
      [roundId, userId],
    );

    if (row?.winAmount == null) {
      // Never hit on a normal successful cashout - only here to build an accurate error message,
      // so the extra round trips don't matter.
      const round = await this.dataSource.manager.findOne(MinesRound, { where: { id: roundId } });
      if (!round || round.userId !== userId) {
        throw new NotFoundException('Round not found');
      }
      if (round.status !== 'active') {
        throw new BadRequestException('Round is not active');
      }
      throw new BadRequestException('Nothing to cash out yet');
    }

    // Fire-and-forget - see the same note in startRound.
    this.refreshMinasChatPresence();

    return { winAmount: Number(row.winAmount), chips: Number(row.chips) };
  }

  /**
   * Fair (0-edge) cumulative multiplier for surviving `k` reveals out of MINES_TILE_COUNT tiles
   * with `minesCount` mines is the reciprocal of the hypergeometric survival probability:
   * prod_{i=0}^{k-1} (n-i)/(s-i), where s = n - minesCount safe tiles. That product is exactly
   * what makes this a break-even game before any edge is applied - EV of "always cash out after
   * exactly k reveals" is precisely 0 at that multiplier, for every k and every minesCount (the
   * old linear formula `0.5 + (minesCount-5)*0.1` didn't have this property: it paid roughly 2x
   * fair at low mine counts, a real player-favorable bug found 2026-09-13). Multiplying by
   * (1 - MINES_HOUSE_EDGE) shifts EV to exactly -edge*bet regardless of when the player cashes
   * out - see revealTile's SQL, which computes this same formula for the live k.
   */
  private previewMultiplierBp(minesCount: number): number {
    const safeCount = MINES_TILE_COUNT - minesCount;
    const fairMultiplierForOneReveal = MINES_TILE_COUNT / safeCount;
    return Math.round(fairMultiplierForOneReveal * (1 - MINES_HOUSE_EDGE) * 10000);
  }

  /** A user's Mines round history — for the admin/mod "Actividad" view. */
  async getUserActivity(userId: string) {
    const rounds = await this.dataSource.manager.find(MinesRound, {
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const totalWagered = rounds.reduce((sum, r) => sum + Number(r.betAmount), 0);
    const totalWon = rounds
      .filter((r) => r.status === 'cashed_out')
      .reduce((sum, r) => sum + Number(r.accumulatedWinnings), 0);

    return {
      summary: { totalRounds: rounds.length, totalWagered, totalWon },
      rounds,
    };
  }

  private generateMinePositions(minesCount: number): number[] {
    const positions = new Set<number>();
    while (positions.size < minesCount) {
      positions.add(randomInt(0, MINES_TILE_COUNT));
    }
    return [...positions];
  }
}
