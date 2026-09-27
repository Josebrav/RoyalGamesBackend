import { Injectable, Logger, OnModuleInit, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, In, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { BingoService } from './bingo.service';
import { BingoGateway } from './bingo.gateway';
import { BingoBotChatService } from './bingo-bot-chat.service';
import { BingoConnectionRegistry } from './ws/bingo-connection.registry';
import { BingoRoomBot } from './entities/bingo-room-bot.entity';
import { BingoBotExtraRoom } from './entities/bingo-bot-extra-room.entity';
import { CreateBingoBotDto } from './dtos/create-bingo-bot.dto';
import { UpdateBingoBotDto } from './dtos/update-bingo-bot.dto';
import { ConnectBingoBotDto } from './dtos/connect-bingo-bot.dto';
import { User } from '../users/entities/user.entity';
import { BotAccountService } from '../bots/bot-account.service';
import { PasswordUtils } from '../../common/utils/password.utils';
import { DEFAULT_AVATAR_BUFFER, DEFAULT_AVATAR_MIME, DEFAULT_AVATAR_DATA, DEFAULT_AVATAR_THUMB_BUFFER } from '../../common/constants/default-avatar';
import {
  DEFAULT_FEMALE_AVATAR_READY,
  DEFAULT_FEMALE_AVATAR_BUFFER,
  DEFAULT_FEMALE_AVATAR_MIME,
  DEFAULT_FEMALE_AVATAR_DATA,
  DEFAULT_FEMALE_AVATAR_THUMB_BUFFER,
} from '../../common/constants/default-female-avatar';

/**
 * Bots de Bingo: cuentas reales (User + BingoPlayer, ver createBot) asignadas a una sala
 * específica (bingo_room_bots) que compran cartones solas para que la sala se vea activa. Juegan
 * pasando por BingoService.purchaseCard exactamente igual que un cliente real — no hay ninguna
 * lógica de juego duplicada acá, solo cuándo y cuánto comprar.
 *
 * A propósito NO reusa UsersService.createUser: ese método le da a cada cuenta nueva la bonificación
 * de "primeros 100 usuarios" (ver UsersRepository.giveFirstChipsAtomic) y el bono de referido — un
 * bot no puede consumir esos cupos, son para jugadores reales.
 */
@Injectable()
export class BingoBotService implements OnModuleInit {
  private readonly logger = new Logger(BingoBotService.name);
  private interval: NodeJS.Timeout;
  private locked = false;
  private roomsWithBotsLastTick = new Set<string>();

  // Probabilidad de que un bot compre en un tick dado (~cada 4s) mientras todavía no compró en la
  // partida actual — reparte las compras a lo largo de la ventana de 30s en vez de que todos los
  // bots de una sala compren en el mismo instante.
  private static readonly BUY_CHANCE_PER_TICK = 0.35;
  private static readonly TICK_MS = 4000;
  // Solo para bots con mobilityEnabled: probabilidad, por tick, de cambiar la sala PRINCIPAL a
  // otra al azar - "cambien de sala ocasionalmente", separado de "compren en varias salas a la
  // vez" (eso es extraRoomIds, siempre activo mientras mobilityEnabled esté prendido).
  private static readonly ROOM_SWITCH_CHANCE_PER_TICK = 0.02;
  private static readonly REACT_CHANCE_PER_TICK = 0.02;

  constructor(
    @InjectRepository(BingoRoomBot) private readonly botRepository: Repository<BingoRoomBot>,
    @InjectRepository(BingoBotExtraRoom) private readonly extraRoomRepository: Repository<BingoBotExtraRoom>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly bingoService: BingoService,
    private readonly registry: BingoConnectionRegistry,
    private readonly gateway: BingoGateway,
    private readonly botAccountService: BotAccountService,
    private readonly botChatService: BingoBotChatService,
  ) {}

  onModuleInit(): void {
    if ((process.env.BINGO_ENGINE_ENABLED ?? 'true').toLowerCase() === 'false') {
      // Mismo interruptor de emergencia que BingoEngineService: si el motor de Bingo está
      // apagado, no tiene sentido que los bots sigan intentando comprar cartones.
      return;
    }
    this.interval = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Bot tick failed: ${(err as Error).message}`));
    }, BingoBotService.TICK_MS);
  }

  // ---------------------------------------------------------------------------------------------
  // Tick: juega a los bots
  // ---------------------------------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.locked) {
      return;
    }
    this.locked = true;
    try {
      const bots = await this.botRepository.find({ where: { roomId: Not(IsNull()) } });
      if (bots.length === 0) {
        this.refreshPresence(new Map());
        return;
      }

      const mobileBotIds = bots.filter((b) => b.mobilityEnabled).map((b) => b.id);
      const extraRooms = mobileBotIds.length
        ? await this.extraRoomRepository.find({ where: { botId: In(mobileBotIds) } })
        : [];
      const extraRoomsByBotId = new Map<string, string[]>();
      for (const extra of extraRooms) {
        if (!extraRoomsByBotId.has(extra.botId)) extraRoomsByBotId.set(extra.botId, []);
        extraRoomsByBotId.get(extra.botId)!.push(extra.roomId);
      }

      // Set efectivo de salas de cada bot: la principal siempre, + las extra solo si
      // mobilityEnabled (así apagar el toggle vuelve al comportamiento de antes sin borrar nada).
      const byRoom = new Map<string, BingoRoomBot[]>();
      for (const bot of bots) {
        const roomIds = [bot.roomId as string, ...(bot.mobilityEnabled ? extraRoomsByBotId.get(bot.id) ?? [] : [])];
        for (const roomId of new Set(roomIds)) {
          if (!byRoom.has(roomId)) byRoom.set(roomId, []);
          byRoom.get(roomId)!.push(bot);
        }
      }

      this.refreshPresence(byRoom);

      for (const [roomId, roomBots] of byRoom) {
        await this.processRoomBots(roomId, roomBots).catch((err) =>
          this.logger.warn(`processRoomBots failed for room=${roomId}: ${(err as Error).message}`),
        );
      }

      await this.maybeSwitchPrimaryRoom(bots.filter((b) => b.mobilityEnabled));
    } finally {
      this.locked = false;
    }
  }

  /** Mantiene BingoConnectionRegistry al día con qué bots están activos en cada sala (set efectivo
   *  ya resuelto por el caller), para que BingoGateway.buildPresence los muestre igual que a un
   *  jugador con socket real. */
  private refreshPresence(byRoom: Map<string, BingoRoomBot[]>): void {
    for (const [roomId, roomBots] of byRoom) {
      this.registry.setRoomBots(roomId, roomBots.map((b) => b.botPlayerId));
    }
    // Solo tocamos las salas que tuvieron (o tienen) bots activos en esta vuelta - no hace falta
    // recorrer todas las salas del sistema para "limpiar" las que nunca tuvieron uno.
    for (const roomId of this.roomsWithBotsLastTick) {
      if (!byRoom.has(roomId)) {
        this.registry.setRoomBots(roomId, []);
      }
    }
    this.roomsWithBotsLastTick = new Set(byRoom.keys());
  }

  /** "Cambien de sala ocasionalmente": como mucho un bot mobile cambia de sala principal por tick,
   *  para que no se sienta artificial que varios salten a la vez. */
  private async maybeSwitchPrimaryRoom(mobileBots: BingoRoomBot[]): Promise<void> {
    if (mobileBots.length === 0 || Math.random() >= BingoBotService.ROOM_SWITCH_CHANCE_PER_TICK) {
      return;
    }
    const bot = mobileBots[Math.floor(Math.random() * mobileBots.length)];
    try {
      const rooms = (await this.bingoService.getRooms()).filter((r) => !r.isLobby && r.id !== bot.roomId);
      if (rooms.length === 0) return;
      const newRoom = rooms[Math.floor(Math.random() * rooms.length)];
      await this.botRepository.update(bot.id, { roomId: newRoom.id });
      await this.botChatService.maybeGreet(bot, newRoom.id);
    } catch (err) {
      this.logger.warn(`Room switch failed for bot=${bot.id}: ${(err as Error).message}`);
    }
  }

  private async processRoomBots(roomId: string, roomBots: BingoRoomBot[]): Promise<void> {
    const { waiting } = await this.bingoService.getRoomActiveGames(roomId);
    if (!waiting) {
      return;
    }

    // Mismo paso que hace BingoGateway.handleConnection para un cliente real: si nadie arrancó
    // todavía la cuenta regresiva de esta partida, no arranca sola (ver bingo.service.ts
    // ensurePurchaseWindowStarted / getPurchaseWindowRemaining).
    await this.bingoService.ensurePurchaseWindowStarted(waiting.id);

    const ownerIds = new Set(await this.bingoService.getCardOwnerIds(waiting.id));
    let boughtSomething = false;

    for (const bot of roomBots) {
      await this.botChatService.maybeReact(bot, roomId, BingoBotService.REACT_CHANCE_PER_TICK);

      if (ownerIds.has(bot.botPlayerId)) {
        continue; // ya compró en esta partida
      }
      if (Math.random() > BingoBotService.BUY_CHANCE_PER_TICK) {
        continue; // este tick le "tocó" esperar - se reintenta en el próximo
      }

      try {
        await this.ensureChips(bot);
        const quantity = this.randomInt(bot.minCardsPerGame, bot.maxCardsPerGame);
        await this.bingoService.purchaseCard(waiting.id, bot.botPlayerId, { playerId: bot.botPlayerId, quantity });
        boughtSomething = true;
      } catch (err) {
        this.logger.warn(`Bot ${bot.botPlayerId} failed to buy in room=${roomId}: ${(err as Error).message}`);
      }
    }

    if (boughtSomething) {
      await this.gateway.broadcastRoomState(roomId);
    }
  }

  private async ensureChips(bot: BingoRoomBot): Promise<void> {
    const toppedUp = await this.botAccountService.ensureChips(
      bot.userId,
      Number(bot.autoTopUpThreshold),
      Number(bot.autoTopUpAmount),
    );
    if (toppedUp) {
      this.logger.log(`Bot ${bot.botPlayerId}: recargado a ${bot.autoTopUpAmount} fichas (estaba por debajo de ${bot.autoTopUpThreshold})`);
    }
  }

  private randomInt(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  // ---------------------------------------------------------------------------------------------
  // CRUD para el panel admin
  // ---------------------------------------------------------------------------------------------

  private async generateUniqueReferralCode(): Promise<string> {
    let code: string;
    let existing: User | null;
    do {
      code = crypto.randomBytes(4).toString('hex').toUpperCase();
      existing = await this.userRepository.findOne({ where: { referralCode: code } });
    } while (existing);
    return code;
  }

  async createBot(dto: CreateBingoBotDto): Promise<BingoRoomBot> {
    const nickLowerCase = dto.nick.toLowerCase();
    const existingNick = await this.userRepository.findOne({ where: { nick: nickLowerCase } });
    if (existingNick) {
      throw new ConflictException('Ya existe un usuario (o bot) con ese nick');
    }

    const isFemale = dto.sexo === 'M';
    const femaleDefaultReady = isFemale && DEFAULT_FEMALE_AVATAR_READY && DEFAULT_FEMALE_AVATAR_BUFFER != null && DEFAULT_FEMALE_AVATAR_THUMB_BUFFER != null;
    const defaultAvatarFields = !isFemale
      ? {
          avatarBin: DEFAULT_AVATAR_BUFFER,
          avatarMime: DEFAULT_AVATAR_MIME,
          avatarData: DEFAULT_AVATAR_DATA,
          avatarThumbBin: DEFAULT_AVATAR_THUMB_BUFFER,
          avatarThumbMime: DEFAULT_AVATAR_MIME,
        }
      : femaleDefaultReady
        ? {
            avatarBin: DEFAULT_FEMALE_AVATAR_BUFFER as Buffer,
            avatarMime: DEFAULT_FEMALE_AVATAR_MIME,
            avatarData: DEFAULT_FEMALE_AVATAR_DATA,
            avatarThumbBin: DEFAULT_FEMALE_AVATAR_THUMB_BUFFER as Buffer,
            avatarThumbMime: DEFAULT_FEMALE_AVATAR_MIME,
          }
        : {};

    // Password real (hasheada) y email interno único solo para satisfacer las columnas NOT NULL/
    // unique de `users` — este email nunca recibe correo (MailingService no se llama acá) y nadie
    // necesita loguearse con esta cuenta para que funcione.
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hashedPassword = await PasswordUtils.hashPassword(randomPassword);
    const internalEmail = `bot-${nickLowerCase}-${crypto.randomBytes(3).toString('hex')}@bots.royalgames.internal`;
    const referralCode = await this.generateUniqueReferralCode();

    const user = await this.userRepository.save(
      this.userRepository.create({
        nick: nickLowerCase,
        email: internalEmail,
        password: hashedPassword,
        sexo: dto.sexo,
        chips: dto.initialChips ?? 100000,
        // true a propósito: nunca debe disparar el chequeo de "primeros 100 usuarios" ni el
        // popup de regalo de bienvenida (App.jsx los gatea con !currentUser.firstChips).
        firstChips: true,
        isBot: true,
        referralCode,
        ...defaultAvatarFields,
      }),
    );

    const player = await this.bingoService.createPlayer({ username: nickLowerCase, userId: user.id, displayName: dto.nick });

    return this.botRepository.save(
      this.botRepository.create({
        userId: user.id,
        botPlayerId: player.id,
        // undefined -> el bot queda desconectado (reutilizable después con connectBot).
        roomId: dto.roomId ?? null,
        minCardsPerGame: dto.minCardsPerGame ?? 1,
        maxCardsPerGame: dto.maxCardsPerGame ?? 2,
        autoTopUpThreshold: dto.autoTopUpThreshold ?? 5000,
        autoTopUpAmount: dto.autoTopUpAmount ?? 100000,
      }),
    );
  }

  /** Conecta un bot ya existente a una sala (la misma en la que estaba, o una distinta) — es lo
   *  que hace reutilizable a un bot en vez de tener que crear uno nuevo cada vez. */
  async connectBot(id: string, dto: ConnectBingoBotDto): Promise<BingoRoomBot> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    bot.roomId = dto.roomId;
    const saved = await this.botRepository.save(bot);
    await this.botChatService.maybeGreet(saved, dto.roomId);
    return saved;
  }

  /** Recalcula qué bots están realmente presentes en una sala ahora mismo (principal, o vía sala
   *  extra si mobilityEnabled) y actualiza el registry — usado tras desconectar/borrar un bot para
   *  que "Desconectar" se sienta instantáneo en TODAS las salas afectadas, no solo la principal. */
  private async recomputeRoomPresence(roomId: string): Promise<void> {
    const [primary, viaExtra] = await Promise.all([
      this.botRepository.find({ where: { roomId } }),
      this.extraRoomRepository.find({ where: { roomId }, relations: ['bot'] }),
    ]);
    const ids = new Set<string>();
    for (const bot of primary) ids.add(bot.botPlayerId);
    for (const extra of viaExtra) {
      if (extra.bot && extra.bot.roomId != null && extra.bot.mobilityEnabled) {
        ids.add(extra.bot.botPlayerId);
      }
    }
    this.registry.setRoomBots(roomId, Array.from(ids));
  }

  /** Saca al bot de la sala en la que esté jugando ahora (principal y, si mobilityEnabled, también
   *  sus salas extra), sin borrar la cuenta ni su configuración — queda listo para reconectarse a
   *  la misma sala o a otra distinta. Las salas extra configuradas NO se borran (reversible). */
  async disconnectBot(id: string): Promise<BingoRoomBot> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    const previousRoomId = bot.roomId;
    const extraRooms = previousRoomId ? await this.extraRoomRepository.find({ where: { botId: id } }) : [];
    bot.roomId = null;
    const saved = await this.botRepository.save(bot);
    if (previousRoomId) {
      const affectedRooms = new Set([previousRoomId, ...extraRooms.map((e) => e.roomId)]);
      for (const roomId of affectedRooms) {
        await this.recomputeRoomPresence(roomId);
      }
    }
    return saved;
  }

  /** Lista para la tabla del panel admin: nombre de sala + saldo de fichas en vivo, además de la
   *  config guardada en bingo_room_bots. */
  async listBots(): Promise<Array<Record<string, any>>> {
    const bots = await this.botRepository.find({ order: { createdAt: 'DESC' } });
    if (bots.length === 0) {
      return [];
    }

    const [users, rooms, extraRooms] = await Promise.all([
      this.userRepository.find({ where: bots.map((b) => ({ id: b.userId })) }),
      this.bingoService.getRooms(),
      this.extraRoomRepository.find({ where: { botId: In(bots.map((b) => b.id)) } }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const extraRoomIdsByBotId = new Map<string, string[]>();
    for (const extra of extraRooms) {
      if (!extraRoomIdsByBotId.has(extra.botId)) extraRoomIdsByBotId.set(extra.botId, []);
      extraRoomIdsByBotId.get(extra.botId)!.push(extra.roomId);
    }

    return bots.map((bot) => ({
      id: bot.id,
      nick: userById.get(bot.userId)?.nick ?? '(cuenta eliminada)',
      chips: Number(userById.get(bot.userId)?.chips ?? 0),
      roomId: bot.roomId,
      roomName: bot.roomId ? (roomById.get(bot.roomId)?.name ?? '(sala eliminada)') : null,
      connected: bot.roomId != null,
      minCardsPerGame: bot.minCardsPerGame,
      maxCardsPerGame: bot.maxCardsPerGame,
      autoTopUpThreshold: Number(bot.autoTopUpThreshold),
      autoTopUpAmount: Number(bot.autoTopUpAmount),
      mobilityEnabled: bot.mobilityEnabled,
      chattyEnabled: bot.chattyEnabled,
      extraRoomIds: extraRoomIdsByBotId.get(bot.id) ?? [],
      createdAt: bot.createdAt,
    }));
  }

  async updateBot(id: string, dto: UpdateBingoBotDto): Promise<BingoRoomBot> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    const { extraRoomIds, ...rest } = dto;
    Object.assign(bot, rest);
    const saved = await this.botRepository.save(bot);

    if (extraRoomIds !== undefined) {
      await this.extraRoomRepository.delete({ botId: id });
      if (extraRoomIds.length > 0) {
        await this.extraRoomRepository.save(
          extraRoomIds.map((roomId) => this.extraRoomRepository.create({ botId: id, roomId })),
        );
      }
    }
    return saved;
  }

  /** Borrado definitivo de la cuenta del bot — no es "sacarlo de la sala" (eso es disconnectBot,
   *  que no borra nada y lo deja reutilizable). Esto es para cuando el bot ya no hace falta nunca
   *  más. El BingoPlayer y su historial de partidas/premios quedan (igual que si se borrara la
   *  cuenta de un jugador real), solo pierden el link al User borrado. */
  async deleteBot(id: string): Promise<{ success: boolean }> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    const previousRoomId = bot.roomId;
    const extraRooms = previousRoomId ? await this.extraRoomRepository.find({ where: { botId: id } }) : [];
    const userId = bot.userId;
    await this.botRepository.remove(bot);
    await this.userRepository.delete({ id: userId });
    if (previousRoomId) {
      const affectedRooms = new Set([previousRoomId, ...extraRooms.map((e) => e.roomId)]);
      for (const roomId of affectedRooms) {
        await this.recomputeRoomPresence(roomId);
      }
    }
    return { success: true };
  }
}
