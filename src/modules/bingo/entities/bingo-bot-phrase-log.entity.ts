import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BingoRoomBot } from './bingo-room-bot.entity';

/** Qué `phraseKey` ya se usó en qué día — GLOBAL, no por bot: así BingoBotChatService nunca repite
 *  la misma frase dos veces el mismo día sin importar qué bot la diga (con varios bots activos,
 *  una restricción por-bot dejaba que dos bots distintos dijeran lo mismo el mismo día y se
 *  notara). `botId` queda solo a fines de registro/debug, no participa de la restricción única.
 *  Se guarda la clave, no el texto, para poder retocar la redacción del pool sin "desbloquear"
 *  nada ya usado. */
@Entity('bingo_bot_phrase_log')
@Unique(['phraseKey', 'usedOnDate'])
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
