import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BingoRoomBot } from './bingo-room-bot.entity';

/** Qué `phraseKey` ya usó un bot en qué día — así BingoBotChatService nunca repite la misma frase
 *  dos veces el mismo día para el mismo bot. Se guarda la clave, no el texto, para poder retocar
 *  la redacción del pool sin "desbloquear" nada ya usado. */
@Entity('bingo_bot_phrase_log')
@Unique(['botId', 'phraseKey', 'usedOnDate'])
export class BingoBotPhraseLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  botId: string;

  @ManyToOne(() => BingoRoomBot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'botId' })
  bot: BingoRoomBot;

  @Column({ type: 'varchar', length: 80 })
  phraseKey: string;

  @Column({ type: 'date' })
  usedOnDate: string;

  @CreateDateColumn()
  createdAt: Date;
}
