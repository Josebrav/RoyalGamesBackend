import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BingoRoomBot } from './bingo-room-bot.entity';
import { BingoRoom } from './bingo-room.entity';

/** Sala adicional donde un bot con `mobilityEnabled` también compra cartones, además de su sala
 *  principal (`BingoRoomBot.roomId`) — ver BingoBotService. */
@Entity('bingo_bot_extra_rooms')
@Unique(['botId', 'roomId'])
export class BingoBotExtraRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  botId: string;

  @ManyToOne(() => BingoRoomBot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'botId' })
  bot: BingoRoomBot;

  @Column({ type: 'uuid' })
  roomId: string;

  @ManyToOne(() => BingoRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: BingoRoom;

  @CreateDateColumn()
  createdAt: Date;
}
