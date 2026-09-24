import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BingoPlayer } from './bingo-player.entity';
import { BingoRoom } from './bingo-room.entity';

/**
 * Un bot reutilizable — userId/botPlayerId son un User + BingoPlayer reales (creados en
 * BingoBotService.createBot) que persisten sin importar a qué sala esté conectado. `roomId` es la
 * sala a la que está CONECTADO ahora mismo; null = desconectado (existe, tiene fichas, no juega en
 * ningún lado). Conectar/desconectar solo cambia este campo — BingoBotService.tick juega a los que
 * tienen `roomId` seteado, pasando por el mismo BingoService.purchaseCard que usa un humano.
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

  // Sala a la que está conectado ahora - null = desconectado (ver comentario de la clase).
  // ON DELETE SET NULL (no CASCADE): si la sala se borra, el bot queda desconectado en vez de
  // desaparecer, sigue siendo reutilizable.
  @Column({ type: 'uuid', nullable: true })
  roomId: string | null;

  @ManyToOne(() => BingoRoom, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'roomId' })
  room: BingoRoom | null;

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

  @CreateDateColumn()
  createdAt: Date;
}
