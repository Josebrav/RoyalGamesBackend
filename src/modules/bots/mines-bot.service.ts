import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MinesService } from '../mines/mines.service';
import { MinesRound } from '../mines/entities/mines-round.entity';
import { FIXED_BET_VALUES } from '../mines/constants/fixed-bet-values';
import { BingoRoomBot } from '../bingo/entities/bingo-room-bot.entity';
import { User } from '../users/entities/user.entity';
import { MinesBotConfig } from './entities/mines-bot-config.entity';
import { UpsertMinesBotConfigDto } from './dtos/upsert-mines-bot-config.dto';
import { BotAccountService } from './bot-account.service';

/**
 * Hace que bots ya existentes (registro genérico en `bingo_room_bots`) jueguen Minas de verdad —
 * llama a MinesService.startRound/revealTile/cashout directo, los mismos métodos que dispara un
 * cliente real, sin pasar por MinesSessionGuard (igual patrón que BingoBotService con
 * BingoService.purchaseCard). No hace falta simular pérdidas: las minas son genuinamente al azar
 * y desconocidas para el bot, así que revienta a las probabilidades reales del juego solo.
 */
@Injectable()
export class MinesBotService implements OnModuleInit {
  private readonly logger = new Logger(MinesBotService.name);
  private interval: NodeJS.Timeout;
  private locked = false;

  private static readonly TICK_MS = 5000;
  private static readonly START_CHANCE_PER_TICK = 0.12;
  private static readonly REVEAL_CHANCE_PER_TICK = 0.55;

  constructor(
    @InjectRepository(MinesBotConfig) private readonly configRepository: Repository<MinesBotConfig>,
    @InjectRepository(BingoRoomBot) private readonly botRepository: Repository<BingoRoomBot>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly minesService: MinesService,
    private readonly botAccountService: BotAccountService,
  ) {}

  onModuleInit(): void {
    if ((process.env.MINES_BOTS_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }
    this.interval = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Mines bot tick failed: ${(err as Error).message}`));
    }, MinesBotService.TICK_MS);
  }

  private randomInt(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  private pickBetAmount(minBet: number, maxBet: number): number {
    const inRange = FIXED_BET_VALUES.filter((v) => v >= Number(minBet) && v <= Number(maxBet));
    const pool = inRange.length > 0 ? inRange : FIXED_BET_VALUES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private async tick(): Promise<void> {
    if (this.locked) {
      return;
    }
    this.locked = true;
    try {
      const configs = await this.configRepository.find({ where: { enabled: true } });
      if (configs.length === 0) {
        return;
      }
      const botIds = configs.map((c) => c.botId);
      const bots = await this.botRepository.find({ where: { id: In(botIds) } });
      const botById = new Map(bots.map((b) => [b.id, b]));

      const userIds = bots.map((b) => b.userId);
      const activeRounds = await this.dataSource.manager.find(MinesRound, {
        where: { userId: In(userIds), status: 'active' },
      });
      const activeRoundByUserId = new Map(activeRounds.map((r) => [r.userId, r]));

      for (const config of configs) {
        const bot = botById.get(config.botId);
        if (!bot) continue;
        await this.processBot(bot, config, activeRoundByUserId.get(bot.userId)).catch((err) =>
          this.logger.warn(`Mines bot ${bot.botPlayerId} failed: ${(err as Error).message}`),
        );
      }
    } finally {
      this.locked = false;
    }
  }

  private async processBot(bot: BingoRoomBot, config: MinesBotConfig, activeRound?: MinesRound): Promise<void> {
    if (!activeRound) {
      if (Math.random() >= MinesBotService.START_CHANCE_PER_TICK) {
        return;
      }
      await this.botAccountService.ensureChips(bot.userId, Number(bot.autoTopUpThreshold), Number(bot.autoTopUpAmount));
      const betAmount = this.pickBetAmount(Number(config.minBet), Number(config.maxBet));
      const minesCount = this.randomInt(Number(config.minMinesCount), Number(config.maxMinesCount));
      await this.minesService.startRound(bot.userId, { betAmount, minesCount });
      await this.configRepository.update(config.id, { lastRoundAt: new Date() });
      return;
    }

    const revealed = (activeRound.revealedTiles || []).length;
    const cashoutChance = Math.min(0.08 + revealed * 0.1, 0.75);
    if (revealed > 0 && Math.random() < cashoutChance) {
      await this.minesService.cashout(bot.userId, { roundId: activeRound.id });
      return;
    }

    if (Math.random() >= MinesBotService.REVEAL_CHANCE_PER_TICK) {
      return;
    }
    const tileCount = activeRound.tileCount || 25;
    const revealedSet = new Set(activeRound.revealedTiles || []);
    const candidates = Array.from({ length: tileCount }, (_, i) => i).filter((i) => !revealedSet.has(i));
    if (candidates.length === 0) {
      return;
    }
    const tileIndex = candidates[Math.floor(Math.random() * candidates.length)];
    await this.minesService.revealTile(bot.userId, { roundId: activeRound.id, tileIndex });
  }

  // ---------------------------------------------------------------------------------------------
  // CRUD para el panel admin
  // ---------------------------------------------------------------------------------------------

  async listConfigs(): Promise<Array<Record<string, any>>> {
    const bots = await this.botRepository.find({ order: { createdAt: 'DESC' } });
    if (bots.length === 0) return [];
    const [configs, users] = await Promise.all([
      this.configRepository.find({ where: { botId: In(bots.map((b) => b.id)) } }),
      this.userRepository.find({ where: bots.map((b) => ({ id: b.userId })) }),
    ]);
    const configByBotId = new Map(configs.map((c) => [c.botId, c]));
    const userById = new Map(users.map((u) => [u.id, u]));

    return bots.map((bot) => {
      const config = configByBotId.get(bot.id);
      return {
        botId: bot.id,
        nick: userById.get(bot.userId)?.nick ?? '(cuenta eliminada)',
        chips: Number(userById.get(bot.userId)?.chips ?? 0),
        enabled: config?.enabled ?? false,
        minBet: config ? Number(config.minBet) : 100,
        maxBet: config ? Number(config.maxBet) : 5000,
        minMinesCount: config?.minMinesCount ?? 3,
        maxMinesCount: config?.maxMinesCount ?? 10,
        lastRoundAt: config?.lastRoundAt ?? null,
      };
    });
  }

  async upsertConfig(botId: string, dto: UpsertMinesBotConfigDto): Promise<MinesBotConfig> {
    let config = await this.configRepository.findOne({ where: { botId } });
    if (!config) {
      config = this.configRepository.create({ botId });
    }
    Object.assign(config, dto);
    return this.configRepository.save(config);
  }
}
