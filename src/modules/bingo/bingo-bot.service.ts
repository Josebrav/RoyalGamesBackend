import { Injectable, Logger, OnModuleInit, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { BingoService } from './bingo.service';
import { BingoGateway } from './bingo.gateway';
import { BingoConnectionRegistry } from './ws/bingo-connection.registry';
import { BingoRoomBot } from './entities/bingo-room-bot.entity';
import { CreateBingoBotDto } from './dtos/create-bingo-bot.dto';
import { UpdateBingoBotDto } from './dtos/update-bingo-bot.dto';
import { ConnectBingoBotDto } from './dtos/connect-bingo-bot.dto';
import { User } from '../users/entities/user.entity';
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

  constructor(
    @InjectRepository(BingoRoomBot) private readonly botRepository: Repository<BingoRoomBot>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly bingoService: BingoService,
    private readonly registry: BingoConnectionRegistry,
    private readonly gateway: BingoGateway,
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
      this.refreshPresence(bots);

      // bot.roomId no puede ser null acá: el find() de arriba ya filtró por roomId IS NOT NULL.
      const byRoom = new Map<string, BingoRoomBot[]>();
      for (const bot of bots) {
        const roomId = bot.roomId as string;
        if (!byRoom.has(roomId)) byRoom.set(roomId, []);
        byRoom.get(roomId)!.push(bot);
      }

      for (const [roomId, roomBots] of byRoom) {
        await this.processRoomBots(roomId, roomBots).catch((err) =>
          this.logger.warn(`processRoomBots failed for room=${roomId}: ${(err as Error).message}`),
        );
      }
    } finally {
      this.locked = false;
    }
  }

  /** Mantiene BingoConnectionRegistry al día con qué bots están activos en cada sala, para que
   *  BingoGateway.buildPresence los muestre igual que a un jugador con socket real. */
  private refreshPresence(bots: BingoRoomBot[]): void {
    // bots ya viene filtrado a roomId IS NOT NULL por el caller (tick).
    const byRoom = new Map<string, string[]>();
    for (const bot of bots) {
      const roomId = bot.roomId as string;
      if (!byRoom.has(roomId)) byRoom.set(roomId, []);
      byRoom.get(roomId)!.push(bot.botPlayerId);
    }
    // Solo tocamos las salas que tuvieron (o tienen) bots activos en esta vuelta - no hace falta
    // recorrer todas las salas del sistema para "limpiar" las que nunca tuvieron uno.
    for (const [roomId, ids] of byRoom) {
      this.registry.setRoomBots(roomId, ids);
    }
    for (const roomId of this.roomsWithBotsLastTick) {
      if (!byRoom.has(roomId)) {
        this.registry.setRoomBots(roomId, []);
      }
    }
    this.roomsWithBotsLastTick = new Set(byRoom.keys());
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
    const user = await this.userRepository.findOne({ where: { id: bot.userId } });
    if (!user) {
      return;
    }
    if (Number(user.chips) < Number(bot.autoTopUpThreshold)) {
      await this.userRepository.update(bot.userId, { chips: Number(bot.autoTopUpAmount) as any });
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
    return this.botRepository.save(bot);
  }

  /** Saca al bot de la sala en la que esté jugando ahora, sin borrar la cuenta ni su
   *  configuración — queda listo para reconectarse a la misma sala o a otra distinta. */
  async disconnectBot(id: string): Promise<BingoRoomBot> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    const previousRoomId = bot.roomId;
    bot.roomId = null;
    const saved = await this.botRepository.save(bot);
    // Si no se hace esto, el bot sigue apareciendo en la presencia de esa sala hasta el próximo
    // tick (hasta 4s) — lo sacamos ya mismo para que el "Desconectar" se sienta instantáneo. Ojo:
    // esto solo borra a ESTE bot de esa sala si es el único ahí conectado - si hay otros bots
    // activos en la misma sala, se re-agregan solos en el próximo tick (refreshPresence corre
    // sobre TODOS los bots conectados, no reemplaza selectivamente uno).
    if (previousRoomId) {
      const stillThere = await this.botRepository.find({ where: { roomId: previousRoomId } });
      this.registry.setRoomBots(previousRoomId, stillThere.map((b) => b.botPlayerId));
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

    const [users, rooms] = await Promise.all([
      this.userRepository.find({ where: bots.map((b) => ({ id: b.userId })) }),
      this.bingoService.getRooms(),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const roomById = new Map(rooms.map((r) => [r.id, r]));

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
      createdAt: bot.createdAt,
    }));
  }

  async updateBot(id: string, dto: UpdateBingoBotDto): Promise<BingoRoomBot> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    Object.assign(bot, dto);
    return this.botRepository.save(bot);
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
    const userId = bot.userId;
    await this.botRepository.remove(bot);
    await this.userRepository.delete({ id: userId });
    if (previousRoomId) {
      const stillThere = await this.botRepository.find({ where: { roomId: previousRoomId } });
      this.registry.setRoomBots(previousRoomId, stillThere.map((b) => b.botPlayerId));
    }
    return { success: true };
  }
}
