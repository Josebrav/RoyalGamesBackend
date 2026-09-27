import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BingoRoom } from './bingo-room.entity';
import { BingoPlayer } from './bingo-player.entity';

/**
 * Temporary chat silence in a room - an admin/mod muted this player, and until expiresAt their
 * chat_send messages are rejected (see BingoGateway.handleChatSend) instead of broadcast. Same
 * per-room, expiresAt-checked, never-deleted pattern as BingoRoomBan.
 */
@Entity('bingo_room_mutes')
@Index(['roomId', 'playerId'])
export class BingoRoomMute {
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
