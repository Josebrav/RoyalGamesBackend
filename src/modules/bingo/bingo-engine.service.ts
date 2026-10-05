import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BingoService } from './bingo.service';
import { BingoGateway } from './bingo.gateway';
import { BingoBotChatService } from './bingo-bot-chat.service';
import { BingoGame, BingoGameState } from './entities/bingo-game.entity';
import { BingoWinner } from './entities/bingo-winner.entity';
import { deriveGameProgress, getPurchaseWindowRemaining } from './bingo-time.util';

/**
 * Owns the room ticker. Unlike the old engine, this no longer draws one ball per second into the
 * DB — the whole draw is precomputed once in `BingoService.startGame`. All this loop does is
 * notice the two state transitions (waiting -> running, running -> finished) and broadcast them;
 * "where the game is right now" is always derived from time, not from how often this tick fires.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

@Injectable()
export class BingoEngineService implements OnModuleInit {
  private readonly logger = new Logger(BingoEngineService.name);
  private interval: NodeJS.Timeout;
  private locked = false;
  private static readonly ROOM_TICK_TIMEOUT_MS = 12000;

  constructor(
    private readonly bingoService: BingoService,
    private readonly gateway: BingoGateway,
    private readonly botChatService: BingoBotChatService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bingoService.ensureDefaultRooms();
    await this.bingoService.ensureLobbyRoom();

    // Emergency kill switch: if the engine ever needs to be stopped in production without a
    // redeploy (e.g. while diagnosing a DB issue), set BINGO_ENGINE_ENABLED=false in Render's
    // environment variables and restart the service. Rooms simply stop advancing; nothing else
    // in the app (users, chips, other games) depends on this loop.
    if ((process.env.BINGO_ENGINE_ENABLED ?? 'true').toLowerCase() === 'false') {
      this.logger.warn('BingoEngineService disabled via BINGO_ENGINE_ENABLED=false - rooms will not advance.');
      return;
    }

    this.interval = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Engine tick failed: ${err.message}`));
    }, 3000);
  }

  private async tick(): Promise<void> {
    if (this.locked) {
      return;
    }
    this.locked = true;
    try {
      const rooms = await this.bingoService.getRooms();
      const now = new Date();

      for (const room of rooms) {
        // Deliberately NOT gated on "is anyone connected right now": that used an in-memory
        // connection count that can desync from reality (a room with real purchases and an
        // expired countdown got silently skipped forever). A handful of cheap SELECTs per room
        // every 3s is fine - `processRoom` itself already no-ops immediately for rooms with no
        // purchase in progress, so idle rooms cost almost nothing anyway.
        try {
          await withTimeout(
            this.processRoom(room.id, now),
            BingoEngineService.ROOM_TICK_TIMEOUT_MS,
            `Room ${room.id} tick`,
          );
        } catch (roomError) {
          this.logger.warn(`Room ${room.id} tick error: ${(roomError as Error).message}`);
        }
      }
    } finally {
      this.locked = false;
    }
  }

  /**
   * A room can have one WAITING (open for purchases, ej. "next round") and one RUNNING (ball draw
   * in progress) game at the same time now - so both get checked independently every tick, instead
   * of assuming there's only ever one active game to look at.
   */
  private async processRoom(roomId: string, now: Date): Promise<void> {
    const { waiting, running } = await this.bingoService.getRoomActiveGames(roomId);

    if (running) {
      await this.processRunningGame(roomId, running, now);
    }

    if (waiting) {
      // The WAITING game's countdown only gets EVALUATED for expiry while nothing is RUNNING -
      // ensurePurchaseWindowStarted already refuses to even START it otherwise (it can't legally
      // transition to RUNNING while another game already is - see
      // AllowConcurrentWaitingAndRunningGame), this is just the matching guard on the expiry side.
      if (!running) {
        await this.processWaitingGame(roomId, waiting, now);
      }
    } else if (!running) {
      // Defensive: a room should always have at least a WAITING game (ensureDefaultRooms/
      // createGame/startGame all keep one around), but if this room somehow has neither, create
      // one instead of leaving it stuck with nothing purchasable.
      await this.bingoService.createGame({ roomId, config: {} }).catch((err) =>
        this.logger.warn(`processRoom: failed to create a fallback waiting game for room=${roomId}: ${(err as Error).message}`),
      );
    }
  }

  private async processWaitingGame(roomId: string, game: BingoGame, now: Date): Promise<void> {
    const purchaseStartedAt = game.persistedSnapshot?.purchaseStartedAt ?? null;
    const remaining = getPurchaseWindowRemaining(purchaseStartedAt, this.bingoService.purchaseWindowSeconds, now);

    if (remaining === null) {
      // purchaseStartedAt was never set - normally that happens the instant the previous game
      // finishes (BingoEngineService.processRunningGame -> gateway.ensureTimerIfRoomOccupied) or
      // the moment someone connects/buys into this one (BingoGateway.handleConnection /
      // BingoService.purchaseCardTransaction). If whatever was supposed to trigger that never
      // fired or threw partway through, nothing else in this tick loop ever retried it - the room
      // would otherwise sit frozen forever (no countdown, can't buy) until a NEW connection
      // happened to land here by chance. Safe to call unconditionally: ensurePurchaseWindowStarted
      // already no-ops if it's already started or a running game still legitimately blocks it.
      await this.bingoService.ensurePurchaseWindowStarted(game.id);
      await this.gateway.broadcastRoomState(roomId);
      return;
    }

    if (remaining !== 0) {
      return;
    }

    const cardsCount = await this.bingoService.countCardsForGame(game.id);
    if (cardsCount === 0) {
      // Nothing to start - loop the countdown instead of leaving it stuck at 0 forever.
      await this.bingoService.restartPurchaseWindow(game.id);
      await this.gateway.broadcastRoomState(roomId);
      return;
    }

    const ownerIds = await this.bingoService.getCardOwnerIds(game.id);
    if (ownerIds.length < this.bingoService.minPlayersToStart) {
      // Not enough DISTINCT players yet - one player buying every cartón in the room doesn't
      // count as multiple players. Same "loop the countdown" treatment as the 0-cards case above,
      // so the room keeps giving people a chance to join instead of starting short-handed.
      await this.bingoService.restartPurchaseWindow(game.id);
      await this.gateway.broadcastRoomState(roomId);
      return;
    }

    const started = await this.bingoService.startGame(game.id);
    if (started.state === BingoGameState.RUNNING) {
      await this.gateway.broadcastGameStarted(roomId, started.id);
      // startGame() just pre-created this room's NEXT waiting game (see its own comment) - a
      // follow-up room_state is what actually delivers that as `nextGame` to everyone, so
      // whoever has no cards in what just started running can immediately buy into it.
      await this.gateway.broadcastRoomState(roomId);

      // The first ball just became known for the first time (it didn't exist while this game was
      // still WAITING) - this is the earliest point anyone's "guess the first number" can be
      // resolved. Best-effort: a failure here shouldn't be able to take down the room's tick.
      const guessAnnouncements = await this.bingoService.announceNumberGuessWinners(started.id).catch((err) => {
        this.logger.warn(`announceNumberGuessWinners failed for game=${started.id}: ${(err as Error).message}`);
        return [];
      });
      for (const entry of guessAnnouncements) {
        this.gateway.broadcastChatMessage(roomId, entry);
      }
    }
  }

  private async processRunningGame(roomId: string, game: BingoGame, now: Date): Promise<void> {
    const progress = deriveGameProgress(game, now);

    // Announces winners live, in step with the same currentRound clock the client's own ball
    // animation uses - checked every tick (including the one where the game turns out to be
    // finished below, so the final bingo still gets announced before its BingoWinner row is
    // deleted as part of finishing).
    const announced = await this.bingoService.announceDueWinners(game, progress.currentRound);
    for (const entry of announced) {
      this.gateway.broadcastChatMessage(roomId, entry);
    }
    if (announced.length > 0) {
      // announceDueWinners just credited chips for whoever won (see BingoService.announceWinners)
      // - a fresh room_state is what actually delivers those updated balances to everyone's chat
      // player list (presence.chips), not just the chat message announcing it.
      await this.gateway.broadcastRoomState(roomId);
      // Best-effort: algún bot chattyEnabled de la sala festeja el premio (ver
      // BingoBotChatService.reactToPrize) - nunca debe poder frenar el anuncio real si falla.
      this.botChatService.reactToPrize(roomId).catch((err) =>
        this.logger.warn(`Bot reactToPrize failed for room=${roomId}: ${(err as Error).message}`),
      );
    }

    if (!progress.isFinished) {
      return;
    }

    const result = await this.bingoService.finishGameAutomatically(game.id);
    const pool = await this.bingoService.getOrCreateSuperbingoForRoom(roomId);
    await this.gateway.broadcastGameFinished(roomId, {
      gameId: game.id,
      resultSummary: result.game.resultSummary ?? {},
      winners: result.winners.map((w: BingoWinner) => ({
        playerId: w.playerId,
        cardId: w.cardId,
        winType: w.winType,
        prizeAmount: Number(w.prizeAmount),
        roundNumber: w.roundNumber,
      })),
      superbingo: {
        poolAmount: Number(pool.amount),
        thresholdBall: pool.thresholdBall,
      },
      nextGameId: result.nextGame.id,
    });
    await this.gateway.ensureTimerIfRoomOccupied(roomId, result.nextGame.id);
    await this.gateway.broadcastRoomState(roomId);
  }
}
