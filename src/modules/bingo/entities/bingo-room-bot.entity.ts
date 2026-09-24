import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BingoPlayer } from './bingo-player.entity';
import { BingoRoom } from './bingo-room.entity';

/**
 * "Este bot juega en esta sala" — leída por BingoBotService cada ~4s. userId/botPlayerId son un
 * User + BingoPlayer reales (creados en BingoBotService.createBot), así el bot compra cartones y
 * gana el pozo pasando por el mismo BingoService.purchaseCard que usa cualquier jugador humano.
 */
@Entity('bingo_room_bots')
@Index(['roomId'])
export class BingoRoomBot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  botPlayerId: string;

  @ManyToOne(() => BingoPlayer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'botPlayerId' })
  botPlayer: BingoPlayer;

  @Column({ type: 'uuid' })
  roomId: string;

  @ManyToOne(() => BingoRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: BingoRoom;

  @Column({ type: 'int', default: 1 })
  minCardsPerGame: number;

  @Column({ type: 'int', default: 2 })
  maxCardsPerGame: number;

  /** Cuando el bot queda con menos fichas que esto, se le recargan a `autoTopUpAmount` antes de su
   *  próxima compra (fichas ficticias, sin costo real — ver la nota en el plan sobre esto). */
  @Column({ type: 'bigint', default: 5000 })
  autoTopUpThreshold: number;

  @Column({ type: 'bigint', default: 100000 })
  autoTopUpAmount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
