import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { BingoPlayer, BingoPlayerStatus } from './entities/bingo-player.entity';
import { BingoRoom, BingoRoomType } from './entities/bingo-room.entity';
import { BingoGame, BingoGameState } from './entities/bingo-game.entity';
import { BingoTicket } from './entities/bingo-ticket.entity';
import { BingoCard } from './entities/bingo-card.entity';
import { BingoRound } from './entities/bingo-round.entity';
import { BingoSuperBingoPool } from './entities/bingo-super-bingo-pool.entity';
import { BingoWinner, BingoWinType } from './entities/bingo-winner.entity';
import { BingoAudit } from './entities/bingo-audit.entity';
import { BingoChatMessage, BingoChatMessageType } from './entities/bingo-chat-message.entity';
import { BingoGiftedCardCredit } from './entities/bingo-gifted-card-credit.entity';
import { BingoNumberGuess } from './entities/bingo-number-guess.entity';
import { BingoAutoBuySubscription } from './entities/bingo-auto-buy-subscription.entity';
import { User } from '../users/entities/user.entity';
import { CreatePlayerDto } from './dtos/create-player.dto';
import { CreateRoomDto } from './dtos/create-room.dto';
import { CreateGameDto } from './dtos/create-game.dto';
import { CreateCardDto } from './dtos/create-card.dto';
import { UpdateCardMarksDto } from './dtos/update-card-marks.dto';
import {
  deriveGameProgress,
  getPurchaseWindowRemaining,
  SUPERBINGO_BASE_THRESHOLD,
} from './bingo-time.util';
import {
  GameSnapshotPayload,
  CardSummary,
  PlayerSummary,
  WinnerSummary,
  ChatMessageEntry,
} from './ws/ws-message.types';

interface PlannedWinnerEvent {
  playerId: string;
  cardId: string;
  winType: BingoWinType;
  prizeAmount: number;
  roundNumber: number;
}

@Injectable()
export class BingoService {
  private readonly logger = new Logger(BingoService.name);
  readonly purchaseWindowSeconds = 30;

  constructor(
    @InjectRepository(BingoPlayer)
    private readonly playerRepository: Repository<BingoPlayer>,
    @InjectRepository(BingoRoom)
    private readonly roomRepository: Repository<BingoRoom>,
    @InjectRepository(BingoGame)
    private readonly gameRepository: Repository<BingoGame>,
    @InjectRepository(BingoTicket)
    private readonly ticketRepository: Repository<BingoTicket>,
    @InjectRepository(BingoCard)
    private readonly cardRepository: Repository<BingoCard>,
    @InjectRepository(BingoRound)
    private readonly roundRepository: Repository<BingoRound>,
    @InjectRepository(BingoSuperBingoPool)
    private readonly superbingoPoolRepository: Repository<BingoSuperBingoPool>,
    @InjectRepository(BingoWinner)
    private readonly winnerRepository: Repository<BingoWinner>,
    @InjectRepository(BingoAudit)
    private readonly auditRepository: Repository<BingoAudit>,
    @InjectRepository(BingoChatMessage)
    private readonly chatMessageRepository: Repository<BingoChatMessage>,
    @InjectRepository(BingoGiftedCardCredit)
    private readonly giftedCardCreditRepository: Repository<BingoGiftedCardCredit>,
    @InjectRepository(BingoNumberGuess)
    private readonly numberGuessRepository: Repository<BingoNumberGuess>,
    @InjectRepository(BingoAutoBuySubscription)
    private readonly autoBuySubscriptionRepository: Repository<BingoAutoBuySubscription>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private static readonly CHAT_MESSAGE_MAX_LENGTH = 500;
  private static readonly CHAT_HISTORY_LIMIT = 50;
  private static readonly MAX_PLAYER_LEVEL = 500;

  /** Cumulative lifetime cards needed to REACH `level` (level 1 needs 0 - everyone starts there).
   *  Each level costs a bit more than the last to reach: level N->N+1 alone needs 5 + 7*(N-1)
   *  cards (5, then 12, then 19, then 26...) - easy at first, a little harder every level, but
   *  linear rather than quadratic/geometric so level 500 stays a real long-term target instead of
   *  either trivial or practically unreachable. */
  private static cardsNeededForLevel(level: number): number {
    const steps = level - 1;
    if (steps <= 0) {
      return 0;
    }
    return steps * 5 + (7 * (steps * (steps - 1))) / 2;
  }

  private static computeLevelFromTotalCards(totalCards: number): number {
    let level = 1;
    while (level < BingoService.MAX_PLAYER_LEVEL && BingoService.cardsNeededForLevel(level + 1) <= totalCards) {
      level++;
    }
    return level;
  }

  // ---------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------

  async createPlayer(dto: CreatePlayerDto): Promise<BingoPlayer> {
    if (dto.userId) {
      const existingByUser = await this.playerRepository.findOne({ where: { userId: dto.userId } });
      if (existingByUser) {
        existingByUser.displayName = dto.displayName ?? existingByUser.displayName;
        existingByUser.avatarUrl = dto.avatarUrl ?? existingByUser.avatarUrl;
        existingByUser.status = BingoPlayerStatus.ONLINE;
        return this.playerRepository.save(existingByUser);
      }
    }

    const existingByUsername = await this.playerRepository.findOne({ where: { username: dto.username } });
    if (existingByUsername) {
      if (dto.userId && !existingByUsername.userId) {
        existingByUsername.userId = dto.userId;
        return this.playerRepository.save(existingByUsername);
      }
      throw new ConflictException('Player username already exists');
    }

    const player = this.playerRepository.create({
      username: dto.username,
      displayName: dto.displayName ?? dto.username,
      avatarUrl: dto.avatarUrl,
      userId: dto.userId ?? null,
      chips: dto.chips ?? 0,
      status: BingoPlayerStatus.ONLINE,
      meta: {},
    });

    return this.playerRepository.save(player);
  }

  async getPlayer(id: string): Promise<BingoPlayer> {
    const player = await this.playerRepository.findOne({ where: { id } });
    if (!player) {
      throw new NotFoundException('Player not found');
    }
    return player;
  }

  async getPlayersByIds(ids: string[]): Promise<BingoPlayer[]> {
    if (ids.length === 0) {
      return [];
    }
    // `relations: ['user']` so callers (e.g. presence) can read the linked User.role without a
    // second round trip - a player's admin/mod badge lives on their site account, not on BingoPlayer.
    return this.playerRepository.find({ where: { id: In(ids) }, relations: ['user'] });
  }

  async updatePlayer(id: string, partial: Partial<BingoPlayer>): Promise<BingoPlayer> {
    const player = await this.getPlayer(id);
    Object.assign(player, partial);
    return this.playerRepository.save(player);
  }

  async getPlayerByUsername(username: string): Promise<BingoPlayer> {
    const player = await this.playerRepository.findOne({ where: { username } });
    if (!player) {
      throw new NotFoundException('Player not found');
    }
    return player;
  }

  // ---------------------------------------------------------------------
  // Rooms
  // ---------------------------------------------------------------------

  async getRooms(): Promise<BingoRoom[]> {
    return this.roomRepository.find({ where: { isActive: true } });
  }

  async createRoom(dto: CreateRoomDto): Promise<BingoRoom> {
    const existing = await this.roomRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('Room already exists');
    }

    const room = this.roomRepository.create({
      name: dto.name,
      type: dto.type ?? BingoRoomType.PUBLIC,
      betAmount: dto.betAmount ?? 0,
      maxPlayers: dto.maxPlayers ?? 100,
      isActive: true,
      config: dto.config ?? {},
    });

    return this.roomRepository.save(room);
  }

  async ensureDefaultRooms(): Promise<BingoRoom[]> {
    // superbingoBaseAmount: the pool's floor value for this room, restored every time the pool
    // resets after being awarded. Scaled to the room's stakes (30x the card price) so a 10-chip
    // room and a 250000-chip room don't share the same base pot.
    const withSuperbingoBase = (betAmount: number) => ({ mode: 'classic', chipsRequired: betAmount, superbingoBaseAmount: betAmount * 30 });
    // Two rooms per price tier - `name` has to be unique (that's what dedupes this seed on every
    // boot), the " (2)" suffix is what tells them apart; betAmount is what actually matters for
    // gameplay/pricing and is identical between the two. See RoomDefinition.FormatRoomName on the
    // Unity side, which preserves this suffix after collapsing the number to "250k" etc., so the
    // two show up as "Sala 250k" and "Sala 250k (2)" instead of two identical-looking cards.
    const tiers = [250000, 100000, 50000, 10000, 5000, 1000, 100, 25, 10];
    const defaultRooms = tiers.flatMap((betAmount) => [
      { name: `Sala ${betAmount}`, type: BingoRoomType.PUBLIC, betAmount, maxPlayers: 100, config: withSuperbingoBase(betAmount) },
      { name: `Sala ${betAmount} (2)`, type: BingoRoomType.PUBLIC, betAmount, maxPlayers: 100, config: withSuperbingoBase(betAmount) },
    ]);

    const created: BingoRoom[] = [];

    for (const roomData of defaultRooms) {
      const existing = await this.roomRepository.findOne({ where: { name: roomData.name } });
      if (!existing) {
        const room = this.roomRepository.create({
          name: roomData.name,
          type: roomData.type,
          betAmount: roomData.betAmount,
          maxPlayers: roomData.maxPlayers,
          isActive: true,
          config: roomData.config,
        });
        created.push(await this.roomRepository.save(room));
      }
    }

    return created;
  }

  /** A virtual, chat/presence-only room - isActive stays false so it never shows up in
   *  getRooms() (the "Salas disponibles" list) or in the engine's tick loop, it only exists as a
   *  target for chat_send/presence over the WS. `lobbyKey` distinguishes separate pseudo-rooms
   *  (the main-menu panel uses 'bingo'; other games can get their own isolated channel by passing
   *  a different key - ej. Minas passes 'minas'). Defaulting to 'bingo' keeps every existing
   *  zero-argument call site (ej. bingo-engine.service.ts at boot) resolving to the exact same
   *  row it always has. */
  async ensureLobbyRoom(lobbyKey = 'bingo', name?: string): Promise<BingoRoom> {
    const existing = await this.roomRepository.findOne({ where: { isLobby: true, lobbyKey } });
    if (existing) {
      return existing;
    }

    const room = this.roomRepository.create({
      name: name || (lobbyKey === 'bingo' ? 'Lobby' : lobbyKey),
      type: BingoRoomType.PUBLIC,
      betAmount: 0,
      maxPlayers: 100000,
      isActive: false,
      isLobby: true,
      lobbyKey,
      config: {},
    });

    return this.roomRepository.save(room);
  }

  async getLobbyRoom(lobbyKey = 'bingo'): Promise<BingoRoom> {
    const room = await this.roomRepository.findOne({ where: { isLobby: true, lobbyKey } });
    if (!room) {
      throw new NotFoundException('Lobby room not initialized');
    }
    return room;
  }

  async getRoom(id: string): Promise<BingoRoom> {
    const room = await this.roomRepository.findOne({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  // ---------------------------------------------------------------------
  // Games: lifecycle (waiting -> running -> finished)
  // ---------------------------------------------------------------------

  /** Ensures this room has a WAITING game, creating one if it doesn't - independent of whether a
   *  RUNNING game also exists (a room can have one of each at the same time now, see
   *  AllowConcurrentWaitingAndRunningGame). A legitimately-started RUNNING game always has at
   *  least one card by construction (startGameTransaction refuses to start otherwise), so it never
   *  needs to be "reclaimed" as a stand-in for a missing WAITING game the way it used to. */
  async createGame(dto: CreateGameDto & { roomId: string }): Promise<BingoGame> {
    const room = await this.getRoom(dto.roomId);

    const existing = await this.gameRepository.findOne({
      where: { roomId: room.id, state: BingoGameState.WAITING },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      return existing;
    }

    const game = this.gameRepository.create({
      roomId: room.id,
      state: BingoGameState.WAITING,
      currentRound: 0,
      resultSummary: { line: 0, doubleLine: 0, bingo: 0, superbingo: 0 },
      persistedSnapshot: { state: BingoGameState.WAITING, purchaseStartedAt: null },
    });

    let saved: BingoGame;
    try {
      saved = await this.gameRepository.save(game);
    } catch (err) {
      // Race: someone else (a concurrent request, or the engine's own tick) created this room's
      // active game between our check above and this insert - the DB-level unique index
      // (UQ_bingo_games_active_room) is what actually prevents two WAITING/RUNNING games for the
      // same room; fall back to whichever one won instead of erroring out.
      if ((err as { code?: string }).code === '23505') {
        const winner = await this.gameRepository.findOne({
          where: [
            { roomId: room.id, state: BingoGameState.WAITING },
            { roomId: room.id, state: BingoGameState.RUNNING },
          ],
          order: { createdAt: 'DESC' },
        });
        if (winner) {
          return winner;
        }
      }
      throw err;
    }

    await this.reservePoolForGame(saved.id, room.id).catch(() => undefined);

    // Every caller that creates a genuinely NEW waiting game funnels through here (startGame's
    // next-round pre-creation, finishGameTransaction, the engine's defensive fallback) - hooking
    // it in this one place means "compra automática" runs for every one of them without having to
    // remember to call it at each call site. Best-effort: a failure here must never break game
    // creation itself.
    await this.processAutoBuyForNewGame(saved).catch((err) =>
      this.logger.warn(`processAutoBuyForNewGame failed for game=${saved.id}: ${(err as Error).message}`),
    );

    return this.getGame(saved.id);
  }

  async getGame(id: string): Promise<BingoGame> {
    const game = await this.gameRepository.findOne({ where: { id } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    return game;
  }

  async joinGame(gameId: string, playerId: string): Promise<{ ticket: BingoTicket; cards: BingoCard[] }> {
    const game = await this.getGame(gameId);
    const player = await this.getPlayer(playerId);

    if (game.state !== BingoGameState.WAITING) {
      throw new BadRequestException('Game is not accepting new players');
    }

    const existingTicket = await this.ticketRepository.findOne({ where: { gameId: game.id, playerId: player.id } });
    if (existingTicket) {
      const existingCards = await this.cardRepository.find({ where: { gameId: game.id, ownerId: player.id } });
      return { ticket: existingTicket, cards: existingCards };
    }

    const ticket = this.ticketRepository.create({
      gameId: game.id,
      playerId: player.id,
      cardIds: [],
      cost: 0,
    });

    const savedTicket = await this.ticketRepository.save(ticket);
    return { ticket: savedTicket, cards: [] };
  }

  async getRoomCurrentGame(roomId: string): Promise<BingoGame> {
    const waitingGames = await this.gameRepository.find({
      where: { roomId, state: BingoGameState.WAITING },
      order: { createdAt: 'DESC' },
    });

    if (waitingGames.length > 0) {
      return waitingGames[0];
    }

    const runningGames = await this.gameRepository.find({
      where: { roomId, state: BingoGameState.RUNNING },
      order: { createdAt: 'DESC' },
    });

    if (runningGames.length > 0) {
      const hasActivity = await this.hasGameActivity(runningGames[0].id);
      if (!hasActivity) {
        await this.resetGameToWaiting(runningGames[0]);
        return this.createGame({ roomId, config: {} });
      }
      return runningGames[0];
    }

    return this.createGame({ roomId, config: {} });
  }

  /** Both of a room's active games independently - a room can have at most one WAITING (open for
   *  purchases, ej. "next round") and at most one RUNNING (ball draw in progress) at the same time
   *  now (see AllowConcurrentWaitingAndRunningGame). Used by BingoEngineService.processRoom (has
   *  to progress both independently) and buildRoomStatePayload (sends both to clients) - anything
   *  that only ever cared about ONE game (ej. a player buying in from the lobby) should keep using
   *  getRoomCurrentGame above instead, which already resolves to "whichever one you'd want to buy
   *  into" (WAITING first).
   */
  async getRoomActiveGames(roomId: string): Promise<{ waiting: BingoGame | null; running: BingoGame | null }> {
    const [waitingGames, runningGames] = await Promise.all([
      this.gameRepository.find({ where: { roomId, state: BingoGameState.WAITING }, order: { createdAt: 'DESC' }, take: 1 }),
      this.gameRepository.find({ where: { roomId, state: BingoGameState.RUNNING }, order: { createdAt: 'DESC' }, take: 1 }),
    ]);

    return {
      waiting: waitingGames[0] ?? null,
      running: runningGames[0] ?? null,
    };
  }

  /**
   * Starts a WAITING game's purchase-window countdown the moment someone is actually present to
   * see it (a player connecting to the room), not only once a card is bought - an empty room with
   * nobody watching has no reason to be counting down. No-ops if it's already started (first
   * arrival wins) or if the game isn't WAITING.
   */
  async ensurePurchaseWindowStarted(gameId: string): Promise<void> {
    const game = await this.gameRepository.findOne({ where: { id: gameId, state: BingoGameState.WAITING } });
    if (!game || game.persistedSnapshot?.purchaseStartedAt) {
      return;
    }

    // Don't start the countdown for a "next round" game while this room's CURRENT game is still
    // running - it can't transition to RUNNING until that one finishes anyway (a room only ever
    // has one RUNNING game at a time, see AllowConcurrentWaitingAndRunningGame), so counting down
    // now would just expire pointlessly. Gets started for real once the running game finishes
    // (processRoom calls this again then, via ensureTimerIfRoomOccupied).
    const runningGame = await this.gameRepository.findOne({ where: { roomId: game.roomId, state: BingoGameState.RUNNING } });
    if (runningGame) {
      return;
    }

    game.persistedSnapshot = { ...game.persistedSnapshot, purchaseStartedAt: new Date().toISOString() };
    await this.gameRepository.save(game);
  }

  async countCardsForGame(gameId: string): Promise<number> {
    return this.cardRepository.count({ where: { gameId } });
  }

  /** Distinct player ids that own at least one card in this game - "actually playing" vs. just present. */
  async getCardOwnerIds(gameId: string): Promise<string[]> {
    const cards = await this.cardRepository.find({ where: { gameId }, select: ['ownerId'] });
    return Array.from(new Set(cards.map((c) => c.ownerId)));
  }

  /**
   * The countdown reached zero but nobody bought a card - there's nothing to start. Loops the
   * countdown back to a fresh 10s instead of leaving it stuck at 0 forever (which is what
   * happened before: the engine kept calling startGame(), which kept throwing "no cards", every
   * tick, forever).
   */
  async restartPurchaseWindow(gameId: string): Promise<void> {
    const game = await this.gameRepository.findOne({ where: { id: gameId, state: BingoGameState.WAITING } });
    if (!game) {
      return;
    }
    game.persistedSnapshot = { ...game.persistedSnapshot, purchaseStartedAt: new Date().toISOString() };
    await this.gameRepository.save(game);
  }

  private async hasGameActivity(gameId: string): Promise<boolean> {
    const [cards, tickets, rounds] = await Promise.all([
      this.cardRepository.count({ where: { gameId } }),
      this.ticketRepository.count({ where: { gameId } }),
      this.roundRepository.count({ where: { gameId } }),
    ]);

    return cards > 0 || tickets > 0 || rounds > 0;
  }

  async getRoomState(roomId: string): Promise<Record<string, any>> {
    const game = await this.getRoomCurrentGame(roomId);
    const snapshot = await this.buildGameSnapshot(game);
    return { roomId, game: snapshot, status: snapshot.state, nextAction: snapshot.state === 'running' ? 'sync' : 'start' };
  }

  async prepareNextRound(roomId: string): Promise<Record<string, any>> {
    const game = await this.gameRepository.findOne({
      where: { roomId, state: BingoGameState.WAITING },
      order: { createdAt: 'DESC' },
    });

    if (!game) {
      const created = await this.createGame({ roomId, config: {} });
      return { roomId, game: created, status: 'waiting', nextAction: 'start' };
    }

    return { roomId, game, status: 'waiting', nextAction: 'start' };
  }

  async refreshNextGame(roomId: string): Promise<Record<string, any>> {
    const game = await this.getRoomCurrentGame(roomId);
    return {
      roomId,
      game,
      status: game.state,
      nextAction: game.state === BingoGameState.RUNNING ? 'sync' : 'start',
      purchaseStartedAt: game.persistedSnapshot?.purchaseStartedAt ?? null,
    };
  }

  /**
   * Transitions a WAITING game to RUNNING: computes the entire draw + winner plan up front
   * (server-authoritative, "pre-scripted") and persists it in one shot, so any observer can
   * derive "where the game is right now" from `startAt` alone (see bingo-time.util.ts).
   * Uses an optimistic row lock (`UPDATE ... WHERE state = 'waiting'`) so two concurrent callers
   * (e.g. the engine tick firing twice) can't both start the same game.
   */
  async startGame(gameId: string): Promise<BingoGame> {
    const startedAt = Date.now();
    this.logger.log(`startGame:begin gameId=${gameId}`);
    try {
      const result = await this.startGameTransaction(gameId);

      // Lets players who missed this round buy in for the NEXT one immediately, instead of
      // waiting for this one to finish - see AllowConcurrentWaitingAndRunningGame. No-ops if one
      // already exists (ej. this call is a retry, or the engine ticked twice in a row).
      if (result.state === BingoGameState.RUNNING) {
        await this.createGame({ roomId: result.roomId, config: {} }).catch((err) =>
          this.logger.warn(`startGame: failed to pre-create next waiting game for room=${result.roomId}: ${(err as Error).message}`),
        );
      }

      this.logger.log(`startGame:done gameId=${gameId} tookMs=${Date.now() - startedAt} state=${result.state}`);
      return result;
    } catch (err) {
      this.logger.error(`startGame:failed gameId=${gameId} tookMs=${Date.now() - startedAt} error=${(err as Error).message}`);
      throw err;
    }
  }

  private async startGameTransaction(gameId: string): Promise<BingoGame> {
    return this.dataSource.transaction(async (manager) => {
      const claimed = await manager.update(
        BingoGame,
        { id: gameId, state: BingoGameState.WAITING },
        { state: BingoGameState.RUNNING, startAt: new Date() },
      );

      if (claimed.affected === 0) {
        return manager.findOneOrFail(BingoGame, { where: { id: gameId } });
      }

      const cards = await manager.find(BingoCard, { where: { gameId } });
      if (cards.length === 0) {
        await manager.update(BingoGame, { id: gameId }, { state: BingoGameState.WAITING, startAt: null as any });
        throw new BadRequestException('Cannot start a game without purchased cards');
      }

      const game = await manager.findOneOrFail(BingoGame, { where: { id: gameId } });
      const room = await manager.findOneOrFail(BingoRoom, { where: { id: game.roomId } });
      const unitCost = Number(room.config?.chipsRequired ?? room.betAmount ?? 0);
      const pool = await this.getOrCreateSuperbingoForRoom(game.roomId, manager);

      const plannedDraws = this.generateRandomSequence(90);
      const { plannedEndRound, plannedWinnerEvents } = this.planWinnerEvents(
        cards,
        plannedDraws,
        pool.thresholdBall,
        Number(pool.amount),
        unitCost,
      );
      const prizeAmounts = this.calculatePrizeAmounts(cards.length, unitCost);

      game.persistedSnapshot = {
        ...game.persistedSnapshot,
        state: BingoGameState.RUNNING,
        plannedDraws,
        plannedEndRound,
        plannedPrizeAmounts: prizeAmounts,
        superbingoThreshold: pool.thresholdBall,
      };
      await manager.save(game);

      const rounds = plannedDraws.map((drawnNumber, index) =>
        manager.create(BingoRound, {
          gameId,
          roundNumber: index + 1,
          drawnNumber,
          drawnAt: new Date(game.startAt.getTime() + index * 1000),
        }),
      );
      await manager.save(rounds);

      if (plannedWinnerEvents.length > 0) {
        const winners = plannedWinnerEvents.map((event) =>
          manager.create(BingoWinner, {
            gameId,
            playerId: event.playerId,
            cardId: event.cardId,
            winType: event.winType,
            prizeAmount: event.prizeAmount,
            roundNumber: event.roundNumber,
          }),
        );
        await manager.save(winners);
      }

      return manager.findOneOrFail(BingoGame, { where: { id: gameId } });
    });
  }

  /**
   * Transitions a RUNNING game to FINISHED once `deriveGameProgress` says the plan is exhausted.
   * Awards every precomputed winner's prize to their linked User.chips, rolls the superbingo pool
   * (grow-or-reset), cleans up the finished game's live data, and immediately queues the next
   * waiting game for the room so the loop continues on its own.
   */
  async finishGameAutomatically(gameId: string): Promise<Record<string, any>> {
    const startedAt = Date.now();
    this.logger.log(`finishGameAutomatically:begin gameId=${gameId}`);
    try {
      const outcome = await this.finishGameTransaction(gameId);
      this.logger.log(`finishGameAutomatically:done gameId=${gameId} tookMs=${Date.now() - startedAt}`);
      return outcome;
    } catch (err) {
      this.logger.error(`finishGameAutomatically:failed gameId=${gameId} tookMs=${Date.now() - startedAt} error=${(err as Error).message}`);
      throw err;
    }
  }

  private async finishGameTransaction(gameId: string): Promise<Record<string, any>> {
    const result = await this.dataSource.transaction(async (manager) => {
      const claimed = await manager.update(
        BingoGame,
        { id: gameId, state: BingoGameState.RUNNING },
        { state: BingoGameState.FINISHED, endAt: new Date() },
      );

      if (claimed.affected === 0) {
        const existing = await manager.findOneOrFail(BingoGame, { where: { id: gameId } });
        return { game: existing, winners: [] as BingoWinner[], skipped: true };
      }

      const game = await manager.findOneOrFail(BingoGame, { where: { id: gameId } });
      const winners = await manager.find(BingoWinner, { where: { gameId } });

      // Chips themselves are NOT credited here anymore - announceWinners() does that the instant
      // each winner is actually announced (in real time, mid-game, via BingoEngineService's tick),
      // instead of everyone's balance jumping all at once only once the whole game ends. The call
      // to announceWinners() below (a safety net for anything a tick somehow missed) still catches
      // - and credits - any winner that slipped through uncredited by the time we get here.

      const superbingoWinner = winners.find((w) => w.winType === BingoWinType.SUPERBINGO);
      await this.finalizeSuperbingoPool(manager, game, !!superbingoWinner);

      // Room list cards show "how much the last bingo here paid" - persisted on the room itself
      // since BingoWinner rows for this game are about to get deleted a few lines down.
      const bingoWinner = winners.find((w) => w.winType === BingoWinType.BINGO);
      if (bingoWinner) {
        await manager.update(BingoRoom, { id: game.roomId }, { lastBingoPrizeAmount: bingoWinner.prizeAmount });
      }

      game.resultSummary = {
        ...game.persistedSnapshot?.plannedPrizeAmounts,
        superbingo: superbingoWinner?.prizeAmount ?? 0,
      };
      game.persistedSnapshot = { ...game.persistedSnapshot, state: BingoGameState.FINISHED };
      await manager.save(game);

      // Capture who was actually playing THIS game before its cards get deleted below - needed
      // right after to resolve auto-buy for the next round now that this one is really over (see
      // processAutoBuyForFinishedGame - deliberately NOT done back when this game started, so
      // cancelling auto-buy mid-round still has an effect instead of the purchase having already
      // fired the instant this round began).
      const cardsInFinishedGame = await manager.find(BingoCard, { where: { gameId }, select: ['ownerId'] });
      const playerIdsInFinishedGame = Array.from(new Set(cardsInFinishedGame.map((c) => c.ownerId)));

      await manager.delete(BingoCard, { gameId });
      await manager.delete(BingoTicket, { gameId });
      await manager.delete(BingoRound, { gameId });
      await manager.delete(BingoWinner, { gameId });

      return { game, winners, skipped: false, playerIdsInFinishedGame };
    });

    const nextGame = await this.createGame({ roomId: result.game.roomId, config: {} });

    if (!result.skipped) {
      // Safety net only - by now, every winner up to plannedEndRound should already have been
      // announced live by announceDueWinners() on a prior engine tick (processRoom checks that
      // BEFORE deciding a game is finished). announceWinners() is idempotent, so this is a no-op
      // unless a tick was somehow missed.
      await this.announceWinners(result.game, result.winners).catch((err) =>
        this.logger.warn(`announceWinners failed for game=${result.game.id}: ${(err as Error).message}`),
      );

      await this.processAutoBuyForFinishedGame(result.game.roomId, result.playerIdsInFinishedGame ?? []).catch((err) =>
        this.logger.warn(`processAutoBuyForFinishedGame failed for room=${result.game.roomId}: ${(err as Error).message}`),
      );
    }

    return { game: result.game, winners: result.winners, nextGame };
  }

  // ---------------------------------------------------------------------
  // Cards / purchases
  // ---------------------------------------------------------------------

  async getPlayerGameInfo(gameId: string, playerId: string): Promise<Record<string, any>> {
    await this.cleanupInvalidCards(gameId);
    const game = await this.getGame(gameId);
    const ticket = await this.ticketRepository.findOne({ where: { gameId, playerId } });
    const cards = await this.cardRepository.find({ where: { gameId, ownerId: playerId } });

    return {
      game,
      ticket,
      cards,
      rounds: await this.roundRepository.find({ where: { gameId } }),
      winners: await this.winnerRepository.find({ where: { gameId } }),
    };
  }

  /**
   * Charges the player's linked User.chips atomically and creates their card(s) in the same
   * transaction. The client never decides the amount charged: it's always `room price * quantity`,
   * validated and applied server-side.
   */
  async purchaseCard(gameId: string, playerId: string, dto: CreateCardDto): Promise<{ ticket: BingoTicket; cards: BingoCard[] }> {
    const startedAt = Date.now();
    this.logger.log(`purchaseCard:begin gameId=${gameId} playerId=${playerId} quantity=${dto.quantity ?? 1}`);
    try {
      const result = await this.purchaseCardTransaction(gameId, playerId, dto);
      this.logger.log(`purchaseCard:done gameId=${gameId} playerId=${playerId} tookMs=${Date.now() - startedAt} cards=${result.cards.length}`);
      return result;
    } catch (err) {
      this.logger.warn(`purchaseCard:failed gameId=${gameId} playerId=${playerId} tookMs=${Date.now() - startedAt} error=${(err as Error).message}`);
      throw err;
    }
  }

  private async purchaseCardTransaction(gameId: string, playerId: string, dto: CreateCardDto): Promise<{ ticket: BingoTicket; cards: BingoCard[] }> {
    return this.dataSource.transaction(async (manager) => {
      const game = await manager.findOne(BingoGame, { where: { id: gameId } });
      if (!game) {
        throw new NotFoundException('Game not found');
      }
      if (game.state !== BingoGameState.WAITING) {
        throw new BadRequestException('Cannot purchase card after game has started');
      }

      const player = await manager.findOne(BingoPlayer, { where: { id: playerId } });
      if (!player) {
        throw new NotFoundException('Player not found');
      }
      if (!player.userId) {
        throw new BadRequestException('Player not linked to a user, cannot charge chips');
      }

      const room = await manager.findOne(BingoRoom, { where: { id: game.roomId } });
      if (!room) {
        throw new NotFoundException('Room not found');
      }

      // Auto-join: games cycle continuously (a new WAITING game is created every time one
      // finishes), and a player connected to the room has no explicit "join" step for each new
      // one - buying a card already implies joining, so create the ticket here if it's missing
      // instead of rejecting the purchase.
      let existingTicket = await manager.findOne(BingoTicket, { where: { gameId, playerId } });
      if (!existingTicket) {
        existingTicket = await manager.save(
          manager.create(BingoTicket, { gameId, playerId, cardIds: [], cost: 0 }),
        );
      }

      const quantity = dto.quantity ?? 1;
      const existingCount = (existingTicket.cardIds || []).length;
      if (existingCount + quantity > 24) {
        throw new BadRequestException('Maximum 24 cards per player per game');
      }

      const existingCards = await manager.find(BingoCard, { where: { gameId: game.id, ownerId: player.id } });
      const existingCardKeys = new Set(existingCards.map((card) => [...card.numbers].sort((a, b) => a - b).join(',')));

      if (dto.numbers && quantity > 1) {
        throw new BadRequestException('Cannot request multiple cards with custom numbers');
      }

      const unitCost = Number(room.config?.chipsRequired ?? room.betAmount ?? 0);

      // Redeem any pending gifted-card credits for this room's price tier before charging chips -
      // a gifted card is a "free card" credit scoped to a betAmount tier, redeemable whenever the
      // recipient wants, in any room at that same tier (see BingoService.giftCards).
      const availableCredits = await manager.find(BingoGiftedCardCredit, {
        where: { recipientPlayerId: playerId, betAmount: unitCost, redeemedAt: IsNull() },
        order: { createdAt: 'ASC' },
        take: quantity,
      });
      const chargeableQuantity = quantity - availableCredits.length;
      const totalCost = unitCost * chargeableQuantity;

      if (totalCost > 0) {
        const user = await manager
          .createQueryBuilder(User, 'user')
          .setLock('pessimistic_write')
          .where('user.id = :id', { id: player.userId })
          .getOne();

        if (!user) {
          throw new NotFoundException('Linked user not found');
        }
        if (Number(user.chips) < totalCost) {
          throw new BadRequestException('INSUFFICIENT_CHIPS');
        }
        user.chips = Number(user.chips) - totalCost;
        await manager.save(user);
      }

      if (availableCredits.length > 0) {
        const now = new Date();
        for (const credit of availableCredits) {
          credit.redeemedAt = now;
          credit.redeemedGameId = game.id;
        }
        await manager.save(availableCredits);
      }

      const toCreate: BingoCard[] = [];
      for (let i = 0; i < quantity; i++) {
        const numbers = dto.numbers
          ? this.validateCustomCardNumbers(dto.numbers, existingCardKeys)
          : this.generateUniqueCardNumbers(existingCardKeys);
        toCreate.push(
          manager.create(BingoCard, {
            gameId: game.id,
            ownerId: player.id,
            numbers,
            marks: {},
            isWinning: false,
            claimedLines: [],
          }),
        );
      }

      const savedCards = await manager.save(toCreate);
      existingTicket.cardIds = [...(existingTicket.cardIds || []), ...savedCards.map((c) => c.id)];
      existingTicket.cost = Number(existingTicket.cost) + totalCost;
      await manager.save(existingTicket);

      // Level is lifetime-cumulative and counts every card ever bought, across every room -
      // recomputed from the running total rather than just bumped by one, so it stays correct
      // even if the curve (BingoService.cardsNeededForLevel) ever changes later.
      player.totalCardsPurchased = Number(player.totalCardsPurchased) + quantity;
      const newLevel = BingoService.computeLevelFromTotalCards(player.totalCardsPurchased);
      if (newLevel !== player.level) {
        player.level = newLevel;
      }
      await manager.save(player);

      // The superbingo pool grows in real time as cards actually enter play, on top of its
      // room-specific base value (e.g. base 30000, a 1000-chip card -> pool becomes 30100 = +10%
      // of its cost) - based on the FULL quantity, not just totalCost/chargeableQuantity, so
      // cards covered by a previously-gifted credit grow the pool too. Gifting itself does NOT
      // grow it (see giftCardsTransaction) - only actually playing a card should, whether it was
      // paid for just now or was a gift redeemed just now.
      if (quantity > 0) {
        const pool = await this.getOrCreateSuperbingoForRoom(game.roomId, manager);
        pool.amount = Number(pool.amount) + Math.round(unitCost * quantity * 0.1);
        pool.lastUpdatedAt = new Date();
        if (!game.superbingoPoolId) {
          game.superbingoPoolId = pool.id;
        }
        await manager.save(pool);
      }

      // Same guard as ensurePurchaseWindowStarted: don't start THIS game's 30s countdown while
      // the room's CURRENT game is still RUNNING - it can't transition to RUNNING itself until
      // that one finishes anyway, so counting down now would silently burn through the window in
      // the background (ej. buying ahead into the pre-created next round, or an auto-buy
      // subscription firing the instant that next round gets created) - by the time the running
      // game actually finishes, this one would already read as "expired" and skip the wait
      // entirely instead of giving players a real 30s purchase window.
      if (!game.persistedSnapshot?.purchaseStartedAt) {
        const runningGame = await manager.findOne(BingoGame, { where: { roomId: game.roomId, state: BingoGameState.RUNNING } });
        if (!runningGame) {
          game.persistedSnapshot = {
            ...game.persistedSnapshot,
            purchaseStartedAt: new Date().toISOString(),
          };
          await manager.save(game);
        }
      }

      return { ticket: existingTicket, cards: savedCards };
    });
  }

  // ---------------------------------------------------------------------
  // Auto-buy ("compra automática") - commits to buying `cardsPerGame` cards, in THIS room, for
  // the next `totalGames` rounds, entirely server-side so it keeps running even if the player
  // disconnects or closes the app - see processAutoBuyForNewGame, hooked into createGame().
  // ---------------------------------------------------------------------

  private static readonly AUTO_BUY_MAX_CARDS_PER_GAME = 24;
  private static readonly AUTO_BUY_MAX_GAMES = 100;

  async setAutoBuy(playerId: string, roomId: string, cardsPerGame: number, totalGames: number): Promise<BingoAutoBuySubscription> {
    if (!Number.isInteger(cardsPerGame) || cardsPerGame < 1 || cardsPerGame > BingoService.AUTO_BUY_MAX_CARDS_PER_GAME) {
      throw new BadRequestException(`cardsPerGame must be between 1 and ${BingoService.AUTO_BUY_MAX_CARDS_PER_GAME}`);
    }
    if (!Number.isInteger(totalGames) || totalGames < 1 || totalGames > BingoService.AUTO_BUY_MAX_GAMES) {
      throw new BadRequestException(`totalGames must be between 1 and ${BingoService.AUTO_BUY_MAX_GAMES}`);
    }

    await this.getPlayer(playerId);
    await this.getRoom(roomId);

    // One active subscription per player per room (see the partial unique index in the
    // migration) - replace whatever was configured before instead of stacking a second one.
    const existing = await this.autoBuySubscriptionRepository.findOne({ where: { playerId, roomId, active: true } });
    let subscription: BingoAutoBuySubscription;
    if (existing) {
      existing.cardsPerGame = cardsPerGame;
      existing.remainingGames = totalGames;
      subscription = await this.autoBuySubscriptionRepository.save(existing);
    } else {
      const created = this.autoBuySubscriptionRepository.create({ playerId, roomId, cardsPerGame, remainingGames: totalGames, active: true });
      subscription = await this.autoBuySubscriptionRepository.save(created);
    }

    // If this room already has a WAITING game open right now, buy into THAT round immediately
    // too - not just the ones created from here on. processAutoBuyForNewGame only fires when a
    // NEW game gets created (see createGame), so without this, the round the player is actually
    // looking at when they set this up would just sit there untouched until the NEXT one starts.
    const { waiting } = await this.getRoomActiveGames(roomId);
    if (waiting && subscription.active) {
      const result = await this.runAutoBuySubscription(subscription, waiting);
      if (!result.success) {
        // The subscription itself is already saved (deactivated) at this point - this throw is
        // just so the player finds out INSTANTLY, over the socket, instead of only via the system
        // chat message (which they may not be looking at) or the status panel silently vanishing.
        throw new BadRequestException(result.errorMessage ?? 'AUTO_BUY_FAILED');
      }
    }

    return subscription;
  }

  async cancelAutoBuy(playerId: string, roomId: string): Promise<void> {
    await this.autoBuySubscriptionRepository.update({ playerId, roomId, active: true }, { active: false });
  }

  /** Always returns a well-formed object (never null) so the client can parse it without special
   *  casing an empty body - active:false + zeros just means there's nothing running right now. */
  async getAutoBuyStatus(playerId: string, roomId: string): Promise<{ active: boolean; cardsPerGame: number; remainingGames: number }> {
    const subscription = await this.autoBuySubscriptionRepository.findOne({ where: { playerId, roomId, active: true } });
    if (!subscription) {
      return { active: false, cardsPerGame: 0, remainingGames: 0 };
    }
    return { active: true, cardsPerGame: subscription.cardsPerGame, remainingGames: subscription.remainingGames };
  }

  /**
   * Called right after a NEW waiting game is created for a room (see createGame) - buys each
   * active subscriber their configured quantity for THIS round, through the exact same
   * purchaseCard() path a manual purchase uses (same chip debit, 24-card cap, level progress,
   * superbingo growth). A failed attempt (ej. insufficient chips) deactivates the subscription
   * immediately instead of silently retrying forever every round - the player finds out either
   * way, via a system chat message.
   *
   * A subscriber currently PLAYING the room's RUNNING game (if any) is skipped here on purpose -
   * `game` was just pre-created by startGame() the INSTANT that running game started, so buying
   * into it right now would mean cancelling auto-buy anytime during that round has no effect (the
   * purchase already happened before the round they're watching even got going). Those subscribers
   * get resolved instead once the running game actually finishes - see
   * processAutoBuyForFinishedGame - giving them the whole round to cancel if they want to.
   */
  private async processAutoBuyForNewGame(game: BingoGame): Promise<void> {
    const subscriptions = await this.autoBuySubscriptionRepository.find({ where: { roomId: game.roomId, active: true } });
    if (subscriptions.length === 0) {
      return;
    }

    const runningGame = await this.gameRepository.findOne({ where: { roomId: game.roomId, state: BingoGameState.RUNNING } });

    for (const subscription of subscriptions) {
      if (runningGame) {
        const cardsInRunningGame = await this.cardRepository.count({ where: { gameId: runningGame.id, ownerId: subscription.playerId } });
        if (cardsInRunningGame > 0) {
          continue;
        }
      }

      await this.runAutoBuySubscription(subscription, game);
    }
  }

  /**
   * Companion to processAutoBuyForNewGame - resolves auto-buy for whoever was actually playing
   * the game that just finished (that method deliberately skipped them). By now the room's next
   * WAITING game already exists (createGame(), called just before this in finishGameTransaction)
   * - `playerIdsInFinishedGame` has to be passed in rather than looked up here, since the
   * finished game's BingoCard rows are already deleted by the time this runs.
   */
  private async processAutoBuyForFinishedGame(roomId: string, playerIdsInFinishedGame: string[]): Promise<void> {
    if (playerIdsInFinishedGame.length === 0) {
      return;
    }

    const subscriptions = await this.autoBuySubscriptionRepository.find({
      where: { roomId, active: true, playerId: In(playerIdsInFinishedGame) },
    });
    if (subscriptions.length === 0) {
      return;
    }

    const { waiting } = await this.getRoomActiveGames(roomId);
    if (!waiting) {
      return;
    }

    for (const subscription of subscriptions) {
      await this.runAutoBuySubscription(subscription, waiting);
    }
  }

  /** Buys `subscription.cardsPerGame` cards into `game` for one auto-buy subscription, through
   *  the exact same purchaseCard() path a manual purchase uses (same chip debit, 24-card cap,
   *  level progress, superbingo growth). A failed attempt (ej. insufficient chips) deactivates
   *  the subscription immediately instead of silently retrying forever every round - the player
   *  finds out either way, via a system chat message. Shared by processAutoBuyForNewGame (every
   *  future round) and setAutoBuy (the round already open right when they set this up) - the
   *  latter uses the returned result to also surface the failure directly over the socket. */
  private async runAutoBuySubscription(subscription: BingoAutoBuySubscription, game: BingoGame): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      await this.purchaseCard(game.id, subscription.playerId, {
        playerId: subscription.playerId,
        quantity: subscription.cardsPerGame,
      });

      subscription.remainingGames -= 1;
      subscription.active = subscription.remainingGames > 0;
      await this.autoBuySubscriptionRepository.save(subscription);

      if (!subscription.active) {
        await this.notifyAutoBuyEnded(subscription, 'se completó tu compra automática en esta sala.');
      }
      return { success: true };
    } catch (err) {
      subscription.active = false;
      await this.autoBuySubscriptionRepository.save(subscription);
      const message = (err as Error).message;
      const reason = message === 'INSUFFICIENT_CHIPS' ? 'no te alcanzaron las fichas' : 'ocurrió un error';
      await this.notifyAutoBuyEnded(subscription, `tu compra automática en esta sala se detuvo: ${reason}.`);
      this.logger.warn(`runAutoBuySubscription: subscription=${subscription.id} failed and was deactivated: ${message}`);
      return { success: false, errorMessage: message };
    }
  }

  private async notifyAutoBuyEnded(subscription: BingoAutoBuySubscription, message: string): Promise<void> {
    const player = await this.playerRepository.findOne({ where: { id: subscription.playerId } });
    const name = player?.displayName ?? player?.username ?? 'Jugador';
    await this.sendSystemMessage(subscription.roomId, `${name}: ${message}`).catch(() => undefined);
  }

  // ---------------------------------------------------------------------
  // Gifted cards (player-to-player) and gifted card CREDITS (the number-guessing mini-game's
  // reward) both land as BingoGiftedCardCredit rows, redeemed the same way - the "usar cartones
  // gratis" button or a normal purchase, whenever the recipient gets around to it (see
  // purchaseCardTransaction, which auto-redeems these before charging chips). A gift must NOT turn
  // into real BingoCards the instant it's sent: the recipient might already be sitting at (or
  // close to) the 24-card cap for the currently open round, and there's no such thing as "too many
  // pending credits" the way there's a hard 24-per-game ceiling on actual purchased cards.
  // ---------------------------------------------------------------------

  async giftCards(fromPlayerId: string, toPlayerId: string, roomId: string, quantity: number): Promise<{ cardsCreated: number; chatEntry: ChatMessageEntry }> {
    const startedAt = Date.now();
    this.logger.log(`giftCards:begin from=${fromPlayerId} to=${toPlayerId} roomId=${roomId} quantity=${quantity}`);
    try {
      const result = await this.giftCardsTransaction(fromPlayerId, toPlayerId, roomId, quantity);
      const cardWord = result.cardsCreated === 1 ? 'cartón' : 'cartones';
      const chatEntry = await this.sendSystemMessage(
        roomId,
        `${result.fromDisplayName} le regaló ${result.cardsCreated} ${cardWord} a ${result.toDisplayName}.`,
      );
      this.logger.log(`giftCards:done from=${fromPlayerId} to=${toPlayerId} tookMs=${Date.now() - startedAt}`);
      return { cardsCreated: result.cardsCreated, chatEntry };
    } catch (err) {
      this.logger.warn(`giftCards:failed from=${fromPlayerId} to=${toPlayerId} tookMs=${Date.now() - startedAt} error=${(err as Error).message}`);
      throw err;
    }
  }

  private async giftCardsTransaction(
    fromPlayerId: string,
    toPlayerId: string,
    roomId: string,
    quantity: number,
  ): Promise<{ cardsCreated: number; fromDisplayName: string; toDisplayName: string }> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
    if (fromPlayerId === toPlayerId) {
      throw new BadRequestException('Cannot gift cards to yourself');
    }

    return this.dataSource.transaction(async (manager) => {
      const fromPlayer = await manager.findOne(BingoPlayer, { where: { id: fromPlayerId } });
      if (!fromPlayer) {
        throw new NotFoundException('Player not found');
      }
      if (!fromPlayer.userId) {
        throw new BadRequestException('Player not linked to a user, cannot charge chips');
      }

      const toPlayer = await manager.findOne(BingoPlayer, { where: { id: toPlayerId } });
      if (!toPlayer) {
        throw new NotFoundException('Recipient player not found');
      }

      const room = await manager.findOne(BingoRoom, { where: { id: roomId } });
      if (!room) {
        throw new NotFoundException('Room not found');
      }

      const unitCost = Number(room.config?.chipsRequired ?? room.betAmount ?? 0);
      const totalCost = unitCost * quantity;

      if (totalCost > 0) {
        const user = await manager
          .createQueryBuilder(User, 'user')
          .setLock('pessimistic_write')
          .where('user.id = :id', { id: fromPlayer.userId })
          .getOne();

        if (!user) {
          throw new NotFoundException('Linked user not found');
        }
        if (Number(user.chips) < totalCost) {
          throw new BadRequestException('INSUFFICIENT_CHIPS');
        }
        user.chips = Number(user.chips) - totalCost;
        await manager.save(user);
      }

      // Land as pending credits, exactly like a "guess the first number" reward (see
      // announceNumberGuessWinners) - NOT real cards. The recipient sees these in their "cartones
      // regalados"/free-cards panel right away (BingoGateway pushes a targeted refresh signal
      // below) and only actually becomes the owner of real BingoCards once they hit "usar", which
      // routes through the normal purchaseCardTransaction - the same 24-per-game cap and pool
      // growth rules as any other purchase apply there, unconditionally on gift size.
      const creditsToCreate = Array.from({ length: quantity }, () =>
        manager.create(BingoGiftedCardCredit, {
          recipientPlayerId: toPlayer.id,
          betAmount: unitCost,
          giftedByPlayerId: fromPlayer.id,
          giftedByDisplayName: fromPlayer.displayName ?? fromPlayer.username,
        }),
      );
      await manager.save(creditsToCreate);

      // performedBy is the sender's real User.id (not the BingoPlayer id) so an admin can later
      // query "cards this user gifted" directly against chips_awards-style userId filters.
      await this.createAudit(
        'bingo_room',
        roomId,
        'gift_cards',
        { fromPlayerId, toPlayerId, toUserId: toPlayer.userId ?? null, quantity, roomId, unitCost, totalCost },
        fromPlayer.userId,
        manager,
      );

      return {
        cardsCreated: creditsToCreate.length,
        fromDisplayName: fromPlayer.displayName ?? fromPlayer.username,
        toDisplayName: toPlayer.displayName ?? toPlayer.username,
      };
    });
  }

  /** Generic system chat message (ej. gift announcements, MinesService's Gema Royal winner
   *  announcement) - distinct from announceWinners' more specific winner-formatted messages,
   *  though both end up as the same BingoChatMessageType.SYSTEM row. Public: MinesService calls
   *  this directly (it already injects BingoService/BingoGateway for the same reason
   *  refreshMinasChatPresence does). */
  async sendSystemMessage(roomId: string, message: string): Promise<ChatMessageEntry> {
    const entity = this.chatMessageRepository.create({
      roomId,
      playerId: null,
      userId: null,
      displayName: 'Sistema',
      role: null,
      message,
      type: BingoChatMessageType.SYSTEM,
      createdAt: new Date(),
    });
    const saved = await this.chatMessageRepository.save(entity);
    return this.toChatMessageEntry(saved);
  }

  /** Grouped by price tier so the client can show "tenés 3 cartones gratis para esta sala" per
   *  room without having to fetch/filter the raw list itself. */
  async getPendingGiftedCreditsSummary(playerId: string): Promise<{ betAmount: number; count: number }[]> {
    const pending = await this.giftedCardCreditRepository.find({
      where: { recipientPlayerId: playerId, redeemedAt: IsNull() },
    });

    const countByTier = new Map<number, number>();
    for (const credit of pending) {
      const tier = Number(credit.betAmount);
      countByTier.set(tier, (countByTier.get(tier) ?? 0) + 1);
    }

    return Array.from(countByTier.entries()).map(([betAmount, count]) => ({ betAmount, count }));
  }

  // ---------------------------------------------------------------------
  // "Guess the first number" mini-game
  // ---------------------------------------------------------------------

  private static readonly NUMBER_GUESS_REWARD_CARDS = 6;

  /** One guess per player per round, enforced here (fast, friendly error) AND by a DB unique
   *  index (the real guard against a race between two concurrent submits). A second unique index
   *  on (gameId, ipAddress) blocks a second guess from the same connection's IP in the same round
   *  - a lightweight defense against one person covering more numbers with throwaway accounts.
   *  Only allowed while the game is still WAITING: the draw itself doesn't exist yet at that point
   *  (see startGameTransaction), so there's no way for anyone - including this server - to know
   *  the answer in advance. */
  async submitNumberGuess(gameId: string, playerId: string, ipAddress: string | null, guessedNumber: number): Promise<void> {
    if (!gameId) {
      throw new BadRequestException('gameId is required');
    }
    if (!Number.isInteger(guessedNumber) || guessedNumber < 1 || guessedNumber > 90) {
      throw new BadRequestException('Number must be between 1 and 90');
    }

    const game = await this.gameRepository.findOne({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    if (game.state !== BingoGameState.WAITING) {
      throw new BadRequestException('Guessing is closed for this round');
    }

    const existingByPlayer = await this.numberGuessRepository.findOne({ where: { gameId, playerId } });
    if (existingByPlayer) {
      throw new BadRequestException('ALREADY_GUESSED');
    }

    if (ipAddress) {
      const existingByIp = await this.numberGuessRepository.findOne({ where: { gameId, ipAddress } });
      if (existingByIp) {
        throw new BadRequestException('DUPLICATE_IP');
      }
    }

    try {
      await this.numberGuessRepository.save(
        this.numberGuessRepository.create({ gameId, playerId, guessedNumber, ipAddress }),
      );
    } catch {
      // Two guesses racing past the checks above land here - the DB's unique indexes are the real
      // guard, the checks above just make the common case fail fast with a friendly message.
      throw new BadRequestException('ALREADY_GUESSED');
    }
  }

  /**
   * Resolves every guess made for `gameId` against the number that just turned out to be first in
   * its freshly-generated draw plan - called once, right after that game transitions waiting ->
   * running (see BingoEngineService), the earliest point the answer exists at all. Rewards go out
   * as gifted-card credits (same mechanic GiftCardsPanelUI uses), redeemable the same way - via
   * the "usar cartones gratis" button or a normal purchase in a room at this price tier. Returns
   * 0 or 1 chat entries (mirrors announceDueWinners' array contract) for the caller to broadcast.
   */
  async announceNumberGuessWinners(gameId: string): Promise<ChatMessageEntry[]> {
    const guesses = await this.numberGuessRepository.find({ where: { gameId } });
    // A gameId is only ever WAITING once - nothing left to check these against after this point,
    // so clear them now regardless of outcome instead of letting the table grow forever.
    if (guesses.length > 0) {
      await this.numberGuessRepository.delete({ gameId });
    }
    if (guesses.length === 0) {
      return [];
    }

    const game = await this.gameRepository.findOne({ where: { id: gameId } });
    const firstNumber: number | undefined = game?.persistedSnapshot?.plannedDraws?.[0];
    if (!game || firstNumber == null) {
      return [];
    }

    const winners = guesses.filter((g) => g.guessedNumber === firstNumber);
    if (winners.length === 0) {
      return [];
    }

    const room = await this.roomRepository.findOne({ where: { id: game.roomId } });
    const unitCost = Number(room?.config?.chipsRequired ?? room?.betAmount ?? 0);
    const reward = BingoService.NUMBER_GUESS_REWARD_CARDS;

    const creditsToCreate: BingoGiftedCardCredit[] = [];
    for (const winner of winners) {
      for (let i = 0; i < reward; i++) {
        creditsToCreate.push(
          this.giftedCardCreditRepository.create({
            recipientPlayerId: winner.playerId,
            betAmount: unitCost,
            giftedByPlayerId: null,
            giftedByDisplayName: 'Sistema',
          }),
        );
      }
    }
    await this.giftedCardCreditRepository.save(creditsToCreate);

    const players = await this.playerRepository.find({ where: { id: In(winners.map((w) => w.playerId)) } });
    const nameById = new Map(players.map((p) => [p.id, p.displayName ?? p.username]));
    const names = winners.map((w) => nameById.get(w.playerId) ?? 'Jugador').join(', ');
    const verb = winners.length === 1 ? 'adivinó' : 'adivinaron';
    const won = winners.length === 1 ? 'ganó' : 'ganaron';

    const chatEntry = await this.sendSystemMessage(
      game.roomId,
      `🎉 ¡${names} ${verb} que el ${firstNumber} sería el primer número y ${won} ${reward} cartones gratis!`,
    );
    return [chatEntry];
  }

  private async cleanupInvalidCards(gameId: string): Promise<void> {
    const cards = await this.cardRepository.find({ where: { gameId } });
    const invalidCardIds = cards
      .filter((card) => !Array.isArray(card.numbers) || card.numbers.length !== 15 || card.numbers.some((n) => typeof n !== 'number' || n < 1 || n > 90))
      .map((card) => card.id);

    if (invalidCardIds.length === 0) {
      return;
    }

    const tickets = await this.ticketRepository.find({ where: { gameId } });
    for (const ticket of tickets) {
      ticket.cardIds = (ticket.cardIds || []).filter((cardId) => !invalidCardIds.includes(cardId));
    }
    await this.ticketRepository.save(tickets);
    await this.cardRepository.delete(invalidCardIds);
  }

  /** Prize pools scale with how much was actually collected (cards sold * card price), not a flat
   *  per-card amount - línea gets 10% of that revenue, doble línea 25%, bingo 45% (the remaining
   *  20% is the house's - superbingo is funded separately, see getOrCreateSuperbingoForRoom). */
  private calculatePrizeAmounts(totalCards: number, unitCost: number): { line: number; doubleLine: number; bingo: number } {
    const totalRevenue = totalCards * unitCost;
    return {
      line: Math.round(totalRevenue * 0.1),
      doubleLine: Math.round(totalRevenue * 0.25),
      bingo: Math.round(totalRevenue * 0.45),
    };
  }

  private async resetGameToWaiting(game: BingoGame): Promise<BingoGame> {
    await this.cardRepository.delete({ gameId: game.id });
    await this.ticketRepository.delete({ gameId: game.id });
    await this.roundRepository.delete({ gameId: game.id });
    await this.winnerRepository.delete({ gameId: game.id });

    game.state = BingoGameState.WAITING;
    game.currentRound = 0;
    game.startAt = undefined as unknown as Date;
    game.endAt = undefined as unknown as Date;
    game.resultSummary = { line: 0, doubleLine: 0, bingo: 0, superbingo: 0 };
    game.persistedSnapshot = {
      ...(game.persistedSnapshot ?? {}),
      state: BingoGameState.WAITING,
      purchaseStartedAt: null,
    };

    return this.gameRepository.save(game);
  }

  private generateRandomSequence(count = 90): number[] {
    const pool = Array.from({ length: count }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool;
  }

  /**
   * Splits a card's 15 (sorted) numbers into the 3 rows the PLAYER actually sees on screen.
   * Mirrors CartonManager.BuildCardNumbers()/GetBestRow() on the Unity client exactly: bucket by
   * column (ranges of 10: 1-10, 11-20, ..., 81-90), then greedily assign each number to
   * whichever row currently has the fewest numbers (ties favor the lowest row index). Card
   * generation (generateStructuredCardNumbers) guarantees no column has more than 3 numbers, so
   * this always converges to exactly 5-5-5, the same result the client's rendering produces.
   *
   * Line/double-line detection MUST use this, not an arbitrary slice of the sorted array
   * (numbers[0:5]/[5:10]/[10:15]) - that grouping has nothing to do with which row a number is
   * drawn in, so a row that's visually complete on screen could go completely unrecognized (or a
   * "line" could fire for numbers scattered across different visual rows).
   */
  private computeVisualRows(numbers: number[]): number[][] {
    const columns: number[][] = Array.from({ length: 9 }, () => []);
    for (const n of numbers) {
      const columnIndex = n === 90 ? 8 : Math.floor((n - 1) / 10);
      columns[columnIndex].push(n);
    }
    for (const column of columns) {
      column.sort((a, b) => a - b);
    }

    const rows: number[][] = [[], [], []];
    const rowCounts = [0, 0, 0];
    for (const column of columns) {
      for (const number of column) {
        let bestRow = 0;
        let bestCount = Infinity;
        for (let r = 0; r < 3; r++) {
          if (rowCounts[r] < 5 && rowCounts[r] < bestCount) {
            bestRow = r;
            bestCount = rowCounts[r];
          }
        }
        rows[bestRow].push(number);
        rowCounts[bestRow]++;
      }
    }
    return rows;
  }

  /**
   * Computes, purely from the (already random) draw order, exactly which round each card
   * completes a line / double line / bingo. Every prize type is awarded to whichever card(s)
   * reach it FIRST across the WHOLE GAME, not once per card - a card that completes its own line
   * two rounds after another card already claimed the line prize does not get a second payout for
   * the same line. (Bingo/superbingo already worked this way; line/double-line did not - every
   * card that ever completed a line got its own separate line prize, which is also what let stale
   * winner labels keep changing after the "real" line was already won.) The game itself still ends
   * at the EARLIEST bingo round across all cards (`plannedEndRound`).
   */
  private planWinnerEvents(
    cards: BingoCard[],
    plannedDraws: number[],
    superbingoThreshold: number,
    superbingoPoolAmount: number,
    unitCost: number,
  ): { plannedEndRound: number; plannedWinnerEvents: PlannedWinnerEvent[] } {
    const drawPosition = new Map<number, number>();
    plannedDraws.forEach((value, index) => drawPosition.set(value, index + 1));
    const prizeAmounts = this.calculatePrizeAmounts(cards.length, unitCost);

    const perCard = cards.map((card) => {
      const rows = this.computeVisualRows(card.numbers);
      const rowRounds = rows.map((row) => Math.max(...row.map((num) => drawPosition.get(num) ?? 90)));
      const sortedRowRounds = [...rowRounds].sort((a, b) => a - b);
      return {
        card,
        lineRound: sortedRowRounds[0],
        doubleLineRound: sortedRowRounds[1] ?? 90,
        bingoRound: Math.max(...rowRounds),
      };
    });

    const plannedEndRound = Math.min(90, ...perCard.map((c) => c.bingoRound));
    const globalLineRound = Math.min(...perCard.map((c) => c.lineRound));
    const globalDoubleLineRound = Math.min(...perCard.map((c) => c.doubleLineRound));
    const plannedWinnerEvents: PlannedWinnerEvent[] = [];

    // Ties (2+ cards - one player's own multiple cards, or different players - reaching the same
    // prize on the exact same round) SPLIT that category's fixed pool instead of each card getting
    // the full amount; every tied card used to be pushed with the whole `prizeAmounts.line` (etc.),
    // which multiplied the total payout instead of dividing it among the winners.
    const lineWinners = perCard.filter((c) => c.lineRound === globalLineRound && c.lineRound <= plannedEndRound);
    const lineShares = this.splitPrizeEvenly(prizeAmounts.line, lineWinners.length);

    const doubleLineWinners = perCard.filter(
      (c) => c.doubleLineRound === globalDoubleLineRound && c.doubleLineRound <= plannedEndRound,
    );
    const doubleLineShares = this.splitPrizeEvenly(prizeAmounts.doubleLine, doubleLineWinners.length);

    const bingoWinners = perCard.filter((c) => c.bingoRound === plannedEndRound);
    const bingoShares = this.splitPrizeEvenly(prizeAmounts.bingo, bingoWinners.length);
    const superbingoEligible = bingoWinners.filter((c) => c.bingoRound <= superbingoThreshold);
    const superbingoShares = this.splitPrizeEvenly(superbingoPoolAmount, superbingoEligible.length);

    lineWinners.forEach(({ card, lineRound }, index) => {
      plannedWinnerEvents.push({
        playerId: card.ownerId,
        cardId: card.id,
        winType: BingoWinType.LINE,
        prizeAmount: lineShares[index],
        roundNumber: lineRound,
      });
    });

    doubleLineWinners.forEach(({ card, doubleLineRound }, index) => {
      plannedWinnerEvents.push({
        playerId: card.ownerId,
        cardId: card.id,
        winType: BingoWinType.DOUBLE_LINE,
        prizeAmount: doubleLineShares[index],
        roundNumber: doubleLineRound,
      });
    });

    bingoWinners.forEach(({ card, bingoRound }, index) => {
      plannedWinnerEvents.push({
        playerId: card.ownerId,
        cardId: card.id,
        winType: BingoWinType.BINGO,
        prizeAmount: bingoShares[index],
        roundNumber: bingoRound,
      });
    });

    superbingoEligible.forEach(({ card, bingoRound }, index) => {
      plannedWinnerEvents.push({
        playerId: card.ownerId,
        cardId: card.id,
        winType: BingoWinType.SUPERBINGO,
        prizeAmount: superbingoShares[index],
        roundNumber: bingoRound,
      });
    });

    return { plannedEndRound, plannedWinnerEvents };
  }

  /** Splits an integer pool evenly across `winnerCount` winners with no leftover/lost chips: the
   *  remainder from integer division goes one-each to the first few winners (order doesn't matter,
   *  ties are already simultaneous) instead of being rounded away or left uncredited. */
  private splitPrizeEvenly(totalAmount: number, winnerCount: number): number[] {
    if (winnerCount <= 0) {
      return [];
    }
    const base = Math.floor(totalAmount / winnerCount);
    const remainder = totalAmount - base * winnerCount;
    return Array.from({ length: winnerCount }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  private validateCustomCardNumbers(numbers: number[], existingCardKeys: Set<string>): number[] {
    if (!Array.isArray(numbers) || numbers.length !== 15) {
      throw new BadRequestException('Custom card must contain exactly 15 numbers');
    }

    const uniqueNumbers = new Set(numbers);
    if (uniqueNumbers.size !== numbers.length) {
      throw new BadRequestException('Custom card numbers must be unique');
    }

    if (numbers.some((n) => typeof n !== 'number' || n < 1 || n > 90)) {
      throw new BadRequestException('Custom card numbers must be between 1 and 90');
    }

    const sorted = [...numbers].sort((a, b) => a - b);
    const key = sorted.join(',');
    if (existingCardKeys.has(key)) {
      throw new BadRequestException('Custom card numbers duplicate an existing card');
    }

    existingCardKeys.add(key);
    return sorted;
  }

  /**
   * Generates 15 numbers that form a VALID traditional bingo card: 9 columns of 10 numbers each
   * (1-10, 11-20, ..., 81-90 - matching the column formula the Unity client uses to rebuild the
   * 3x9 grid from this flat sorted array), each column holding 1-3 numbers, and exactly 5 numbers
   * per row. A flat "any 15 unique numbers 1-90" pick (the previous implementation) can easily put
   * 4+ numbers in the same column, which the client has nowhere valid to place - it silently drops
   * the extra one, so cards would render with fewer than 15 numbers.
   */
  private generateUniqueCardNumbers(existingCardKeys: Set<string>, count = 15): number[] {
    const numbers = this.generateStructuredCardNumbers();
    const key = numbers.join(',');
    if (existingCardKeys.has(key)) {
      return this.generateUniqueCardNumbers(existingCardKeys, count);
    }

    existingCardKeys.add(key);
    return numbers;
  }

  private generateStructuredCardNumbers(): number[] {
    const columns = 9;
    const rows = 3;
    const numbersPerRow = 5;

    for (let attempt = 0; attempt < 200; attempt++) {
      const columnCounts = new Array(columns).fill(1);
      // Total numbers needed (rows * numbersPerRow = 15) minus the 1 already given to each
      // column = how many more to hand out (6). This used to read `columns * numbersPerRow`
      // (36) instead of `rows * numbersPerRow` (15), demanding far more extras than the 9
      // columns have room for (max 3 each) - the while loop below could never satisfy that and
      // spun forever, freezing the whole Node process (not just a DB connection) on every
      // successful card purchase.
      let extras = rows * numbersPerRow - columns; // 15 - 9 = 6
      let safety = 0;
      while (extras > 0) {
        if (++safety > 10000) {
          throw new Error('generateStructuredCardNumbers: extras distribution did not converge');
        }
        const col = Math.floor(Math.random() * columns);
        if (columnCounts[col] < rows) {
          columnCounts[col]++;
          extras--;
        }
      }

      const rowRemaining = new Array(rows).fill(numbersPerRow);
      const columnRows: number[][] = [];
      let valid = true;

      for (let col = 0; col < columns; col++) {
        const available = [0, 1, 2].filter((row) => rowRemaining[row] > 0);
        if (available.length < columnCounts[col]) {
          valid = false;
          break;
        }
        this.shuffleInPlace(available);
        const chosenRows = available.slice(0, columnCounts[col]).sort((a, b) => a - b);
        columnRows.push(chosenRows);
        for (const row of chosenRows) {
          rowRemaining[row]--;
        }
      }

      if (!valid || rowRemaining.some((remaining) => remaining !== 0)) {
        continue;
      }

      const numbers: number[] = [];
      for (let col = 0; col < columns; col++) {
        const rangeStart = col * 10 + 1;
        const rangeEnd = col * 10 + 10;
        const pool: number[] = [];
        for (let n = rangeStart; n <= rangeEnd; n++) pool.push(n);
        this.shuffleInPlace(pool);
        numbers.push(...pool.slice(0, columnCounts[col]));
      }

      return numbers.sort((a, b) => a - b);
    }

    throw new Error('Unable to generate a structured bingo card after 200 attempts');
  }

  private shuffleInPlace<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }

  async updateCardMarks(gameId: string, cardId: string, dto: UpdateCardMarksDto): Promise<BingoCard> {
    const card = await this.cardRepository.findOne({ where: { id: cardId, gameId } });
    if (!card) {
      throw new NotFoundException('Card not found');
    }

    card.marks = dto.marks;
    return this.cardRepository.save(card);
  }

  // ---------------------------------------------------------------------
  // Snapshot builder (shared by the WS gateway's room_state/game_started and REST fallback)
  // ---------------------------------------------------------------------

  async buildGameSnapshot(game: BingoGame): Promise<GameSnapshotPayload> {
    await this.cleanupInvalidCards(game.id);
    const now = new Date();
    const progress = deriveGameProgress(game, now);

    const [cards, winners, pool, room] = await Promise.all([
      this.cardRepository.find({ where: { gameId: game.id } }),
      this.winnerRepository.find({ where: { gameId: game.id } }),
      game.superbingoPoolId
        ? this.superbingoPoolRepository.findOne({ where: { id: game.superbingoPoolId } })
        : this.getOrCreateSuperbingoForRoom(game.roomId),
      this.roomRepository.findOne({ where: { id: game.roomId } }),
    ]);

    // Players list is derived from CARDS (who actually bought something), not from tickets (which
    // are created the moment someone joins the room, before buying anything) - otherwise the
    // player count would show people who are merely present, before any purchase happened.
    const playersById = new Map<string, PlayerSummary>();
    for (const card of cards) {
      if (!playersById.has(card.ownerId)) {
        playersById.set(card.ownerId, { playerId: card.ownerId, displayName: '', cardIds: [] });
      }
      playersById.get(card.ownerId)!.cardIds.push(card.id);
    }
    if (playersById.size > 0) {
      const players = await this.playerRepository.find({ where: { id: In(Array.from(playersById.keys())) } });
      for (const player of players) {
        const entry = playersById.get(player.id);
        if (entry) entry.displayName = player.displayName ?? player.username;
      }
    }

    const cardSummaries: CardSummary[] = cards.map((card) => ({
      id: card.id,
      ownerId: card.ownerId,
      numbers: card.numbers,
      marks: card.marks ?? {},
    }));

    // Full plan (not just "so far"): the client receives every ball and every winner event for the
    // whole game in one shot and animates locally against `startAt` + `currentRound`, instead of
    // polling for the next ball. `currentRound` is the pointer telling the client how many of these
    // are already "revealed" as of `serverTime`; the rest keep animating client-side in real time.
    const fullDrawnNumbers: number[] = game.state === BingoGameState.WAITING
      ? []
      : (game.persistedSnapshot?.plannedDraws ?? []).slice(0, progress.plannedEndRound);

    const allWinners: WinnerSummary[] = game.state === BingoGameState.WAITING
      ? []
      : winners.map((w) => ({
          playerId: w.playerId,
          cardId: w.cardId,
          winType: w.winType,
          prizeAmount: Number(w.prizeAmount),
          roundNumber: w.roundNumber,
        }));

    const unitCost = Number(room?.config?.chipsRequired ?? room?.betAmount ?? 0);
    const prizeTable = game.persistedSnapshot?.plannedPrizeAmounts ?? this.calculatePrizeAmounts(cards.length, unitCost);
    const purchaseStartedAt = game.persistedSnapshot?.purchaseStartedAt ?? null;

    return {
      id: game.id,
      state: game.state as 'waiting' | 'running' | 'finished',
      purchaseStartedAt,
      purchaseWindowSeconds: this.purchaseWindowSeconds,
      waitingSecondsRemaining:
        game.state === BingoGameState.WAITING
          ? getPurchaseWindowRemaining(purchaseStartedAt, this.purchaseWindowSeconds, now)
          : null,
      startAt: game.startAt ? new Date(game.startAt).toISOString() : null,
      currentRound: progress.currentRound,
      plannedEndRound: progress.plannedEndRound,
      drawnNumbers: fullDrawnNumbers,
      players: Array.from(playersById.values()),
      cards: cardSummaries,
      winnersSoFar: allWinners,
      prizeTable: { line: prizeTable.line ?? 0, doubleLine: prizeTable.doubleLine ?? 0, bingo: prizeTable.bingo ?? 0 },
      superbingo: {
        poolAmount: pool ? Number(pool.amount) : 0,
        thresholdBall: pool ? pool.thresholdBall : SUPERBINGO_BASE_THRESHOLD,
      },
    };
  }

  async getGameState(gameId: string, playerId?: string): Promise<Record<string, any>> {
    const game = await this.getGame(gameId);
    const snapshot = await this.buildGameSnapshot(game);

    let ticket: BingoTicket | null = null;
    let cards: BingoCard[] = [];
    if (playerId) {
      ticket = await this.ticketRepository.findOne({ where: { gameId, playerId } });
      cards = await this.cardRepository.find({ where: { gameId, ownerId: playerId } });
    }

    return {
      game: snapshot,
      ticket: ticket ? { playerId: ticket.playerId, cardIds: ticket.cardIds } : null,
      cards: cards.map((card) => ({ id: card.id, numbers: card.numbers, marks: card.marks, claimedLines: card.claimedLines, isWinning: card.isWinning })),
      winners: snapshot.winnersSoFar,
      finalResult: snapshot.state === 'finished' ? snapshot : null,
    };
  }

  async getGameHistory(gameId: string): Promise<Record<string, any>> {
    return this.getGameState(gameId);
  }

  // ---------------------------------------------------------------------
  // Superbingo pool
  // ---------------------------------------------------------------------

  async getSuperbingo(): Promise<BingoSuperBingoPool[]> {
    return this.superbingoPoolRepository.find();
  }

  async getSuperbingoForRoom(roomId: string): Promise<BingoSuperBingoPool> {
    const pool = await this.superbingoPoolRepository.findOne({ where: { roomId }, order: { updatedAt: 'DESC' } });
    if (!pool) {
      throw new NotFoundException('Superbingo pool not found for room');
    }
    return pool;
  }

  async getOrCreateSuperbingoForRoom(roomId: string, manager?: EntityManager): Promise<BingoSuperBingoPool> {
    const repo = manager ? manager.getRepository(BingoSuperBingoPool) : this.superbingoPoolRepository;
    let pool = await repo.findOne({ where: { roomId }, order: { updatedAt: 'DESC' } });
    if (pool) {
      return pool;
    }

    try {
      const roomRepo = manager ? manager.getRepository(BingoRoom) : this.roomRepository;
      const room = await roomRepo.findOne({ where: { id: roomId } });
      const baseAmount = Number(room?.config?.superbingoBaseAmount ?? 0);
      pool = repo.create({ roomId, amount: baseAmount, resetBaseAmount: baseAmount, lastUpdatedAt: new Date() });
      return await repo.save(pool);
    } catch (err) {
      // Same concurrent-creation race as BingoService.createGame: the DB-level unique index
      // (UQ_bingo_super_bingo_pools_room) is the real guard, this just falls back gracefully.
      if ((err as { code?: string }).code === '23505') {
        const winner = await repo.findOne({ where: { roomId }, order: { updatedAt: 'DESC' } });
        if (winner) {
          return winner;
        }
      }
      throw err;
    }
  }

  async topupSuperbingo(amount: number, roomId?: string): Promise<BingoSuperBingoPool> {
    if (roomId) {
      const pool = await this.getOrCreateSuperbingoForRoom(roomId);
      pool.amount = Number(pool.amount) + Number(amount);
      pool.lastUpdatedAt = new Date();
      return this.superbingoPoolRepository.save(pool);
    }

    const pool = this.superbingoPoolRepository.create({
      amount,
      lastUpdatedAt: new Date(),
    });
    return this.superbingoPoolRepository.save(pool);
  }

  async reservePoolForGame(gameId: string, roomId: string): Promise<BingoSuperBingoPool> {
    const pool = await this.getOrCreateSuperbingoForRoom(roomId);
    pool.reservedForGameId = gameId;
    pool.lastUpdatedAt = new Date();
    const saved = await this.superbingoPoolRepository.save(pool);
    const game = await this.getGame(gameId);
    game.superbingoPoolId = saved.id;
    await this.gameRepository.save(game);
    return saved;
  }

  /**
   * Rolls the room's superbingo pool at the end of a game. The pool AMOUNT already grew in real
   * time as cards were bought (see purchaseCardTransaction) - this only handles the threshold
   * ball (+1 per game nobody hits superbingo) and the full reset (both back to the room's base
   * values) when someone does.
   */
  private async finalizeSuperbingoPool(
    manager: EntityManager,
    game: BingoGame,
    hadSuperbingoWinner: boolean,
  ): Promise<void> {
    if (!game.superbingoPoolId) {
      return;
    }
    const pool = await manager
      .createQueryBuilder(BingoSuperBingoPool, 'pool')
      .setLock('pessimistic_write')
      .where('pool.id = :id', { id: game.superbingoPoolId })
      .getOne();
    if (!pool) {
      return;
    }

    if (hadSuperbingoWinner) {
      pool.amount = pool.resetBaseAmount;
      pool.thresholdBall = SUPERBINGO_BASE_THRESHOLD;
    } else {
      pool.thresholdBall = Math.min(90, pool.thresholdBall + 1);
    }
    pool.reservedForGameId = null;
    pool.lastUpdatedAt = new Date();
    await manager.save(pool);
  }

  async createAudit(
    entityType: string,
    entityId: string,
    action: string,
    payload: Record<string, any>,
    performedBy?: string,
    manager?: EntityManager,
  ): Promise<BingoAudit> {
    const repo = manager ? manager.getRepository(BingoAudit) : this.auditRepository;
    const audit = repo.create({
      entityType,
      entityId,
      action,
      payload,
      performedBy,
    });
    return repo.save(audit);
  }

  /** A user's bingo activity (winnings + cards gifted, both ways) — for the admin/mod "Actividad" view. */
  async getUserBingoActivity(userId: string) {
    const players = await this.playerRepository.find({ where: { userId } });
    const playerIds = players.map((p) => p.id);

    const winnings = playerIds.length
      ? await this.winnerRepository.find({ where: { playerId: In(playerIds) }, order: { createdAt: 'DESC' }, take: 200 })
      : [];

    const giftsSent = await this.auditRepository
      .createQueryBuilder('a')
      .where('a.action = :action AND a.performedBy = :userId', { action: 'gift_cards', userId })
      .orderBy('a.createdAt', 'DESC')
      .take(200)
      .getMany();

    const giftsReceived = await this.auditRepository
      .createQueryBuilder('a')
      .where("a.action = :action AND a.payload->>'toUserId' = :userId", { action: 'gift_cards', userId })
      .orderBy('a.createdAt', 'DESC')
      .take(200)
      .getMany();

    const totalWon = winnings.reduce((sum, w) => sum + Number(w.prizeAmount), 0);
    const cardsGiftedSent = giftsSent.reduce((sum, a) => sum + Number(a.payload?.quantity || 0), 0);
    const cardsGiftedReceived = giftsReceived.reduce((sum, a) => sum + Number(a.payload?.quantity || 0), 0);

    return {
      summary: { totalWon, cardsGiftedSent, cardsGiftedReceived, winCount: winnings.length },
      winnings,
      giftsSent,
      giftsReceived,
    };
  }

  /** Bingo card gifts a specific admin/mod made themselves — for the admin-only mod-audit view. */
  async getAuditsByPerformer(modId: string, action: string, limit = 200) {
    return this.auditRepository.find({
      where: { performedBy: modId, action },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ---------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------

  async sendChatMessage(roomId: string, playerId: string, rawMessage: string): Promise<ChatMessageEntry> {
    const message = (rawMessage ?? '').trim().slice(0, BingoService.CHAT_MESSAGE_MAX_LENGTH);
    if (!message) {
      throw new BadRequestException('Message cannot be empty');
    }

    const player = await this.getPlayer(playerId);
    const role = player.userId ? (await this.userRoleFor(player.userId)) : null;

    const entity = this.chatMessageRepository.create({
      roomId,
      playerId: player.id,
      userId: player.userId,
      displayName: player.displayName ?? player.username,
      role,
      message,
      type: BingoChatMessageType.CHAT,
      createdAt: new Date(),
    });
    const saved = await this.chatMessageRepository.save(entity);
    return this.toChatMessageEntry(saved);
  }

  async getChatHistory(roomId: string): Promise<ChatMessageEntry[]> {
    const messages = await this.chatMessageRepository.find({
      where: { roomId },
      order: { createdAt: 'DESC' },
      take: BingoService.CHAT_HISTORY_LIMIT,
    });
    return messages.reverse().map((m) => this.toChatMessageEntry(m));
  }

  private async userRoleFor(userId: string): Promise<string | null> {
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    return user?.role ?? null;
  }

  private toChatMessageEntry(entity: BingoChatMessage): ChatMessageEntry {
    return {
      id: entity.id,
      playerId: entity.playerId,
      userId: entity.userId,
      displayName: entity.displayName,
      role: entity.role,
      message: entity.message,
      type: entity.type as 'chat' | 'system',
      createdAt: new Date(entity.createdAt).toISOString(),
    };
  }

  private static readonly WIN_TYPE_LABELS: Record<string, string> = {
    [BingoWinType.LINE]: 'línea',
    [BingoWinType.DOUBLE_LINE]: 'doble línea',
    [BingoWinType.BINGO]: 'bingo',
    [BingoWinType.SUPERBINGO]: 'superbingo',
  };

  // línea/doble línea son femeninas ("la línea"), bingo/superbingo son masculinos ("el bingo") -
  // sin esto el mensaje quedaría gramaticalmente mal para la mitad de los tipos de premio.
  private static readonly WIN_TYPE_ARTICLES: Record<string, string> = {
    [BingoWinType.LINE]: 'la',
    [BingoWinType.DOUBLE_LINE]: 'la',
    [BingoWinType.BINGO]: 'el',
    [BingoWinType.SUPERBINGO]: 'el',
  };

  private buildSystemWinnerMessageEntity(game: BingoGame, winner: BingoWinner, nick: string, createdAt: Date): BingoChatMessage {
    const label = BingoService.WIN_TYPE_LABELS[winner.winType] ?? winner.winType;
    const article = BingoService.WIN_TYPE_ARTICLES[winner.winType] ?? 'el';
    const message = `¡Felicitaciones ${nick}, has ganado ${article} ${label}!!! Premio de ${Number(winner.prizeAmount)} fichas en la bola ${winner.roundNumber}`;
    return this.chatMessageRepository.create({
      roomId: game.roomId,
      playerId: winner.playerId,
      displayName: nick,
      role: null,
      message,
      type: BingoChatMessageType.SYSTEM,
      createdAt,
    });
  }

  /**
   * Builds + saves one system chat message per winner ("Han cantado línea en la bola 31. Kinora
   * ha ganado 729000 fichas por Línea."), skipping anyone whose chatAnnouncedAt is already set -
   * idempotent, so it's safe to call both from the real-time per-tick check (announceDueWinners)
   * AND once more as a safety net right at game finish (finishGameTransaction) without risking a
   * duplicate announcement for the same win.
   */
  private async announceWinners(game: BingoGame, winners: BingoWinner[]): Promise<ChatMessageEntry[]> {
    const pending = winners.filter((w) => !w.chatAnnouncedAt && w.roundNumber !== null);
    if (pending.length === 0) {
      return [];
    }

    const playerIds = Array.from(new Set(pending.map((w) => w.playerId)));
    const players = await this.getPlayersByIds(playerIds);
    const nameById = new Map(players.map((p) => [p.id, p.displayName ?? p.username]));
    const userIdByPlayerId = new Map(players.map((p) => [p.id, p.userId]));

    const now = new Date();
    const entities = pending.map((w) => this.buildSystemWinnerMessageEntity(game, w, nameById.get(w.playerId) ?? 'Jugador', now));

    const saved = await this.dataSource.transaction(async (manager) => {
      // Credit each winner's real chip balance THE INSTANT their win is announced - whether
      // that's live mid-game (the common case) or via finishGameTransaction's safety net - instead
      // of batching every prize from the whole game into one lump credit only once it ends. Lets
      // the nav bar and the chat's player list reflect each prize as it actually happens.
      const totalsByPlayer = new Map<string, number>();
      for (const winner of pending) {
        totalsByPlayer.set(winner.playerId, (totalsByPlayer.get(winner.playerId) ?? 0) + Number(winner.prizeAmount));
      }
      for (const [playerId, amount] of totalsByPlayer) {
        if (amount <= 0) continue;
        const userId = userIdByPlayerId.get(playerId);
        if (userId) {
          await manager.increment(User, { id: userId }, 'chips', amount);
        }
      }

      const savedMessages = await manager.save(entities);

      for (const winner of pending) {
        winner.chatAnnouncedAt = now;
      }
      await manager.save(pending);

      return savedMessages;
    });

    return saved.map((m) => this.toChatMessageEntry(m));
  }

  /**
   * Called every engine tick while a game is RUNNING (see BingoEngineService.processRoom) -
   * announces, in near-real-time, any winner whose round the client would already be revealing
   * (matched via deriveGameProgress's currentRound, the same clock the client's own ball animation
   * uses). Returns the newly-created chat entries so the gateway can broadcast them live - this
   * replaces the old version of this feature, which silently backdated everything into history
   * only once the game finished, so nobody connected actually saw it happen in the chat feed.
   */
  async announceDueWinners(game: BingoGame, currentRound: number): Promise<ChatMessageEntry[]> {
    const winners = await this.winnerRepository.find({ where: { gameId: game.id, chatAnnouncedAt: IsNull() } });
    const due = winners.filter((w) => w.roundNumber !== null && (w.roundNumber as number) <= currentRound);
    return this.announceWinners(game, due);
  }
}
