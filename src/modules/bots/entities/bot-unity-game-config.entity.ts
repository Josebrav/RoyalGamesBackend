import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BingoRoomBot } from '../../bingo/entities/bingo-room-bot.entity';

/** Config de "bot simulando actividad" para un (bot, juego Unity) — ver UnityGameBotService. */
@Entity('bot_unity_game_configs')
export class BotUnityGameConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  botId: string;

  @ManyToOne(() => BingoRoomBot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'botId' })
  bot: BingoRoomBot;

  @Column({ type: 'varchar', length: 50 })
  gameSlug: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'bigint', default: 50 })
  minAmount: number;

  @Column({ type: 'bigint', default: 2000 })
  maxAmount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
