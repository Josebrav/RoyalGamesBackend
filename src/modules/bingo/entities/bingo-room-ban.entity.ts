import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BingoRoom } from './bingo-room.entity';
import { BingoPlayer } from './bingo-player.entity';

/**
 * Temporary "expulsión" from a room - an admin/mod kicked this player out, and until expiresAt
 * they can't reconnect to THIS room (see BingoGateway.handleConnection). Scoped per-room, not
 * global - being kicked from one room says nothing about any other. Rows aren't deleted when they
 * expire, just ignored by the `expiresAt > now()` check - a full history of past kicks stays
 * queryable for moderation review.
 */
@Entity('bingo_room_bans')
@Index(['roomId', 'playerId'])
export class BingoRoomBan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  roomId: string;

  @ManyToOne(() => BingoRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: BingoRoom;

  @Column({ type: 'uuid' })
  playerId: string;

  @ManyToOne(() => BingoPlayer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'playerId' })
  player: BingoPlayer;

  @Column({ type: 'uuid', nullable: true })
  actedByPlayerId: string | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
