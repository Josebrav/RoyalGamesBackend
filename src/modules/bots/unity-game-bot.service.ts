import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChipsService } from '../chips/chips.service';
import { BingoRoomBot } from '../bingo/entities/bingo-room-bot.entity';
import { User } from '../users/entities/user.entity';
import { BotUnityGameConfig } from './entities/bot-unity-game-config.entity';
import { UpsertUnityBotConfigDto } from './dtos/upsert-unity-bot-config.dto';
import { UNITY_BOT_GAME_SLUGS } from './constants/unity-bot-games';
import { BotAccountService } from './bot-account.service';

/**
 * Simula actividad de fichas para bots en los 5 juegos Unity en iframe (Royal Joker, Pachinka,
 * Slots, Santa Wilds, Sugar Calavera) — esos juegos no tienen ronda real en el backend, así que
 * acá no se "juega": se llama a ChipsService.addChips/removeChips directo, exactamente el mismo
 * mecanismo que usa el cliente de Unity real vía chips/add y chips/remove, con el slug del juego
 * pasado explícito (no hay Origin de un request real del que inferirlo).
 */
@Injectable()
export class UnityGameBotService implements OnModuleInit {
  private readonly logger = new Logger(UnityGameBotService.name);
  private interval: NodeJS.Timeout;
  private locked = false;

  private static readonly TICK_MS = 20000;
  private static readonly ACTIVITY_CHANCE_PER_TICK = 0.05;
  private static readonly WIN_CHANCE = 0.6;

  constructor(
    @InjectRepository(BotUnityGameConfig) private readonly configRepository: Repository<BotUnityGameConfig>,
    @InjectRepository(BingoRoomBot) private readonly botRepository: Repository<BingoRoomBot>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly chipsService: ChipsService,
    private readonly botAccountService: BotAccountService,
  ) {}

  onModuleInit(): void {
    if ((process.env.UNITY_GAME_BOTS_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }
    this.interval = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Unity-game bot tick failed: ${(err as Error).message}`));
    }, UnityGameBotService.TICK_MS);
  }

  private randomInt(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  private async tick(): Promise<void> {
    if (this.locked) return;
    this.locked = true;
    try {
      const configs = await this.configRepository.find({ where: { enabled: true } });
      if (configs.length === 0) return;
      const bots = await this.botRepository.find({ where: { id: In(configs.map((c) => c.botId)) } });
      const botById = new Map(bots.map((b) => [b.id, b]));

      for (const config of configs) {
        const bot = botById.get(config.botId);
        if (!bot) continue;
        await this.processPair(bot, config).catch((err) =>
          this.logger.warn(`Unity-game bot ${bot.botPlayerId}/${config.gameSlug} failed: ${(err as Error).message}`),
        );
      }
    } finally {
      this.locked = false;
    }
  }

  private async processPair(bot: BingoRoomBot, config: BotUnityGameConfig): Promise<void> {
    if (Math.random() >= UnityGameBotService.ACTIVITY_CHANCE_PER_TICK) {
      return;
    }
    const amount = this.randomInt(Number(config.minAmount), Number(config.maxAmount));
    const wins = Math.random() < UnityGameBotService.WIN_CHANCE;

    if (wins) {
      await this.chipsService.addChips({ userId: bot.userId, amount }, 'game', config.gameSlug);
    } else {
      await this.botAccountService.ensureChips(bot.userId, amount, Number(bot.autoTopUpAmount));
      await this.chipsService.removeChips({ userId: bot.userId, amount }, 'game');
    }
    await this.configRepository.update(config.id, { lastActivityAt: new Date() });
  }

  // ---------------------------------------------------------------------------------------------
  // CRUD para el panel admin
  // ---------------------------------------------------------------------------------------------

  /** Una fila por bot, con un mapa `games[slug] = {enabled, minAmount, maxAmount}` (default
   *  deshabilitado para los juegos sin fila) — así el panel puede renderizar la matriz bot x juego
   *  sin necesitar un paso de "crear" para cada celda. */
  async listConfigs(): Promise<Array<Record<string, any>>> {
    const bots = await this.botRepository.find({ order: { createdAt: 'DESC' } });
    if (bots.length === 0) return [];
    const [configs, users] = await Promise.all([
      this.configRepository.find({ where: { botId: In(bots.map((b) => b.id)) } }),
      this.userRepository.find({ where: bots.map((b) => ({ id: b.userId })) }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const configsByBotId = new Map<string, BotUnityGameConfig[]>();
    for (const config of configs) {
      if (!configsByBotId.has(config.botId)) configsByBotId.set(config.botId, []);
      configsByBotId.get(config.botId)!.push(config);
    }

    return bots.map((bot) => {
      const botConfigs = configsByBotId.get(bot.id) ?? [];
      const configBySlug = new Map(botConfigs.map((c) => [c.gameSlug, c]));
      const games: Record<string, { enabled: boolean; minAmount: number; maxAmount: number }> = {};
      for (const slug of UNITY_BOT_GAME_SLUGS) {
        const c = configBySlug.get(slug);
        games[slug] = {
          enabled: c?.enabled ?? false,
          minAmount: c ? Number(c.minAmount) : 50,
          maxAmount: c ? Number(c.maxAmount) : 2000,
        };
      }
      return {
        botId: bot.id,
        nick: userById.get(bot.userId)?.nick ?? '(cuenta eliminada)',
        chips: Number(userById.get(bot.userId)?.chips ?? 0),
        games,
      };
    });
  }

  async upsertConfig(botId: string, gameSlug: string, dto: UpsertUnityBotConfigDto): Promise<BotUnityGameConfig> {
    let config = await this.configRepository.findOne({ where: { botId, gameSlug } });
    if (!config) {
      config = this.configRepository.create({ botId, gameSlug });
    }
    Object.assign(config, dto);
    return this.configRepository.save(config);
  }
}
