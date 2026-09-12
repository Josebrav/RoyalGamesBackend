import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes, randomInt, createHash } from 'crypto';
import { MinesRound } from './entities/mines-round.entity';
import { MinesJackpot } from './entities/mines-jackpot.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { StartRoundDto } from './dtos/start-round.dto';
import { RevealTileDto } from './dtos/reveal-tile.dto';
import { CashoutDto } from './dtos/cashout.dto';
import { MINES_TILE_COUNT } from './constants/fixed-bet-values';
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

  async startRound(userId: string, dto: StartRoundDto) {
    const { betAmount, minesCount } = dto;

    const existingActive = await this.dataSource.manager.findOne(MinesRound, {
      where: { userId, status: 'active' },
    });
    if (existingActive) {
      throw new ConflictException('You already have an active Mines round');
    }

    const minePositions = this.generateMinePositions(minesCount);
    const serverSeed = randomBytes(32).toString('hex');
    const serverSeedHash = createHash('sha256').update(serverSeed).digest('hex');
    const multiplierBp = this.baseMultiplierBp(minesCount);
    const incrementBp = Math.round(multiplierBp / 2);

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const user = await manager
          .createQueryBuilder(User, 'user')
          .setLock('pessimistic_write')
          .where('user.id = :id', { id: userId })
          .getOne();
        if (!user) {
          throw new NotFoundException('User not found');
        }

        const currentChips = Number(user.chips) || 0;
        if (currentChips < betAmount) {
          throw new BadRequestException('Insufficient chips');
        }
        user.chips = currentChips - betAmount;
        await manager.save(user);

        // Every bet feeds the Gema Royal pot - Math.max(1, ...) is deliberate: the smallest bet
        // tier (10 chips, see FIXED_BET_VALUES) would round 1% down to 0 and never contribute
        // otherwise.
        const jackpotContribution = Math.max(
          1,
          Math.round(betAmount * MINES_JACKPOT_CONTRIBUTION_RATE),
        );
        const jackpot = await manager
          .createQueryBuilder(MinesJackpot, 'jackpot')
          .setLock('pessimistic_write')
          .where('jackpot.id = :id', { id: MINES_JACKPOT_ID })
          .getOne();
        if (jackpot) {
          jackpot.potAmount = (Number(jackpot.potAmount) || 0) + jackpotContribution;
          await manager.save(jackpot);
        }

        const round = manager.create(MinesRound, {
          userId,
          betAmount,
          minesCount,
          tileCount: MINES_TILE_COUNT,
          minePositions,
          revealedTiles: [],
          multiplierBp,
          incrementBp,
          accumulatedWinnings: 0,
          status: 'active',
          serverSeed,
          serverSeedHash,
        });
        await manager.save(round);

        return {
          roundId: round.id,
          serverSeedHash,
          multiplier: multiplierBp / 10000,
          chips: user.chips,
        };
      });

      await this.refreshMinasChatPresence();
      return result;
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('You already have an active Mines round');
      }
      throw err;
    }
  }

  async revealTile(userId: string, dto: RevealTileDto): Promise<RevealTileResult> {
    const { roundId, tileIndex } = dto;

    let winnerNick: string | null = null;

    const result = await this.dataSource.transaction<RevealTileResult>(async (manager) => {
      const round = await manager
        .createQueryBuilder(MinesRound, 'round')
        .setLock('pessimistic_write')
        .where('round.id = :id', { id: roundId })
        .getOne();

      if (!round || round.userId !== userId) {
        throw new NotFoundException('Round not found');
      }
      if (round.status !== 'active') {
        throw new BadRequestException('Round is not active');
      }
      if (round.revealedTiles.includes(tileIndex)) {
        throw new BadRequestException('Tile already revealed');
      }

      const isMine = round.minePositions.includes(tileIndex);

      if (isMine) {
        round.status = 'busted';
        round.resolvedAt = new Date();
        await manager.save(round);

        return {
          result: 'bomb',
          busted: true,
          minePositions: round.minePositions,
          serverSeed: round.serverSeed,
          jackpotWon: false,
          jackpotAmount: 0,
        };
      }

      round.revealedTiles = [...round.revealedTiles, tileIndex];
      const winThisStep = Math.round((round.betAmount * round.multiplierBp) / 10000);
      round.accumulatedWinnings = (Number(round.accumulatedWinnings) || 0) + winThisStep;
      round.multiplierBp += round.incrementBp;
      await manager.save(round);

      // Gema Royal: the jackpot row is locked here (same transaction, same "round -> jackpot ->
      // user" lock order used everywhere else this pot is touched) so two players revealing a
      // diamond at the same instant serialize on this row - only whichever transaction commits
      // first still sees potAmount > 0, the other finds it already reset to 0 and wins nothing.
      let jackpotWon = false;
      let jackpotAmount = 0;
      let updatedChips: number | undefined;

      const jackpot = await manager
        .createQueryBuilder(MinesJackpot, 'jackpot')
        .setLock('pessimistic_write')
        .where('jackpot.id = :id', { id: MINES_JACKPOT_ID })
        .getOne();

      if (jackpot && Number(jackpot.potAmount) > 0 && jackpot.nextEligibleAt <= new Date()) {
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

      return {
        result: 'diamond',
        busted: false,
        multiplier: round.multiplierBp / 10000,
        accumulatedWinnings: round.accumulatedWinnings,
        jackpotWon,
        jackpotAmount,
        chips: updatedChips,
      };
    });

    if (result.jackpotWon) {
      await this.announceJackpotWin(winnerNick ?? 'Alguien', result.jackpotAmount);
    }

    return result;
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

  async cashout(userId: string, dto: CashoutDto) {
    const { roundId } = dto;

    const result = await this.dataSource.transaction(async (manager) => {
      const round = await manager
        .createQueryBuilder(MinesRound, 'round')
        .setLock('pessimistic_write')
        .where('round.id = :id', { id: roundId })
        .getOne();

      if (!round || round.userId !== userId) {
        throw new NotFoundException('Round not found');
      }
      if (round.status !== 'active') {
        throw new BadRequestException('Round is not active');
      }

      const winAmount = Number(round.accumulatedWinnings) || 0;
      if (winAmount <= 0) {
        throw new BadRequestException('Nothing to cash out yet');
      }

      const user = await manager
        .createQueryBuilder(User, 'user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: userId })
        .getOne();
      if (!user) {
        throw new NotFoundException('User not found');
      }

      user.chips = (Number(user.chips) || 0) + winAmount;
      await manager.save(user);

      await manager.save(
        manager.create(ChipsAward, {
          userId,
          amount: winAmount,
          source: 'game',
          game: 'minas',
        }),
      );

      round.status = 'cashed_out';
      round.resolvedAt = new Date();
      await manager.save(round);

      return { winAmount, chips: user.chips };
    });

    await this.refreshMinasChatPresence();
    return result;
  }

  // Mirrors BetManager.cs CalcularMultiplicador(): 0.5 + (minesCount - 5) * 0.1, in basis
  // points (always a multiple of 1000, so halving it for the increment is exact - no rounding).
  private baseMultiplierBp(minesCount: number): number {
    return 5000 + (minesCount - 5) * 1000;
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
