import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BingoService } from './bingo.service';
import { BingoGateway } from './bingo.gateway';
import { BingoRoomBot } from './entities/bingo-room-bot.entity';
import { BingoBotExtraRoom } from './entities/bingo-bot-extra-room.entity';
import { BingoBotPhraseLog } from './entities/bingo-bot-phrase-log.entity';
import { BOT_CHAT_PHRASES, BotChatCategory } from './constants/bot-chat-phrases';

/**
 * Comentarios de chat "humanos" para bots con `chattyEnabled` — reusa el pipeline real de chat
 * (BingoService.sendChatMessage + BingoGateway.broadcastChatMessage, el mismo que dispara un
 * chat_send real, mismo patrón cross-módulo que MinesService.announceJackpotWin ya usa) en vez de
 * inventar uno nuevo. Dos cosas evitan que se note que son bots: nunca repite la misma frase el
 * mismo día por bot (BingoBotPhraseLog), y cada bot tiene un orden de preferencia propio y estable
 * sobre el mismo pool (hash bot+frase) en vez de que todos elijan lo mismo.
 */
@Injectable()
export class BingoBotChatService {
  private readonly logger = new Logger(BingoBotChatService.name);
  // Cooldown en memoria (no necesita sobrevivir un reinicio) para que un bot no salude, reaccione
  // y festeje todo en la misma ventana de unos segundos por rolls independientes que coinciden.
  private readonly nextAllowedAt = new Map<string, number>();

  constructor(
    @InjectRepository(BingoRoomBot) private readonly botRepository: Repository<BingoRoomBot>,
    @InjectRepository(BingoBotExtraRoom) private readonly extraRoomRepository: Repository<BingoBotExtraRoom>,
    @InjectRepository(BingoBotPhraseLog) private readonly phraseLogRepository: Repository<BingoBotPhraseLog>,
    private readonly bingoService: BingoService,
    private readonly gateway: BingoGateway,
  ) {}

  private todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private hash(input: string): number {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (h * 31 + input.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  private isOnCooldown(botId: string): boolean {
    const until = this.nextAllowedAt.get(botId);
    return !!until && Date.now() < until;
  }

  private startCooldown(botId: string): void {
    const cooldownMs = 60_000 + Math.floor(Math.random() * 240_000); // 60-300s
    this.nextAllowedAt.set(botId, Date.now() + cooldownMs);
  }

  private async trySay(bot: BingoRoomBot, roomId: string, category: BotChatCategory): Promise<void> {
    try {
      if (this.isOnCooldown(bot.id)) return;

      const today = this.todayDateString();
      const usedToday = await this.phraseLogRepository.find({ where: { botId: bot.id, usedOnDate: today } });
      const usedKeys = new Set(usedToday.map((u) => u.phraseKey));

      const candidates = BOT_CHAT_PHRASES[category].filter((p) => !usedKeys.has(p.key));
      if (candidates.length === 0) return;

      const ordered = [...candidates].sort(
        (a, b) => this.hash(bot.id + a.key) - this.hash(bot.id + b.key),
      );
      const pick = ordered[Math.floor(Math.random() * Math.min(3, ordered.length))];

      try {
        await this.phraseLogRepository.save(
          this.phraseLogRepository.create({ botId: bot.id, phraseKey: pick.key, usedOnDate: today }),
        );
      } catch {
        // Unique violation (otro tick ganó la carrera) - no decir nada esta vez, no es grave.
        return;
      }

      this.startCooldown(bot.id);
      const entry = await this.bingoService.sendChatMessage(roomId, bot.botPlayerId, pick.text);
      this.gateway.broadcastChatMessage(roomId, entry);
    } catch (err) {
      this.logger.warn(`Bot chat failed for bot=${bot.id} room=${roomId}: ${(err as Error).message}`);
    }
  }

  async maybeGreet(bot: BingoRoomBot, roomId: string, chance = 0.3): Promise<void> {
    if (!bot.chattyEnabled || Math.random() >= chance) return;
    await this.trySay(bot, roomId, 'greeting');
  }

  async maybeReact(bot: BingoRoomBot, roomId: string, chance = 0.02): Promise<void> {
    if (!bot.chattyEnabled || Math.random() >= chance) return;
    await this.trySay(bot, roomId, 'reaction');
  }

  /** Bots `chattyEnabled` presentes en una sala ahora mismo (principal o, si mobilityEnabled,
   *  también por sala extra) - independiente del tick de BingoBotService para poder llamarse desde
   *  cualquier lado (ej. justo después de un anuncio de ganador). */
  private async chattyBotsInRoom(roomId: string): Promise<BingoRoomBot[]> {
    const [primary, viaExtra] = await Promise.all([
      this.botRepository.find({ where: { roomId, chattyEnabled: true } }),
      this.extraRoomRepository.find({ where: { roomId }, relations: ['bot'] }),
    ]);
    const byId = new Map<string, BingoRoomBot>();
    for (const bot of primary) byId.set(bot.id, bot);
    for (const extra of viaExtra) {
      if (extra.bot?.chattyEnabled && extra.bot.mobilityEnabled) {
        byId.set(extra.bot.id, extra.bot);
      }
    }
    return Array.from(byId.values());
  }

  /** Como máximo 1-2 bots reaccionan por vez (no todos a la vez) - para no delatarse. Best-effort,
   *  nunca debe poder romper el flujo de anuncio de premio del que cuelga. */
  async reactToPrize(roomId: string): Promise<void> {
    try {
      const bots = await this.chattyBotsInRoom(roomId);
      if (bots.length === 0) return;
      const shuffled = [...bots].sort(() => Math.random() - 0.5);
      const chosen = shuffled.slice(0, Math.min(2, shuffled.length));
      for (const bot of chosen) {
        await this.trySay(bot, roomId, 'postPrize');
      }
    } catch (err) {
      this.logger.warn(`reactToPrize failed for room=${roomId}: ${(err as Error).message}`);
    }
  }
}
