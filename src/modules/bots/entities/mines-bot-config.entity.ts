import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BingoRoomBot } from '../../bingo/entities/bingo-room-bot.entity';

/** Config 1:1 de "bot jugando Minas" — sin fila para un bot = deshabilitado. Ver MinesBotService. */
@Entity('mines_bot_configs')
export class MinesBotConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  botId: string;

  @ManyToOne(() => BingoRoomBot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'botId' })
  bot: BingoRoomBot;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'bigint', default: 100 })
  minBet: number;

  @Column({ type: 'bigint', default: 5000 })
  maxBet: number;

  @Column({ type: 'int', default: 3 })
  minMinesCount: number;

  @Column({ type: 'int', default: 10 })
  maxMinesCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastRoundAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
