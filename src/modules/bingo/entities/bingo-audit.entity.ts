import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BingoGame } from './bingo-game.entity';

@Entity('bingo_audit')
@Index(['entityType'])
@Index(['entityId'])
export class BingoAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  entityType: string;

  @Column({ type: 'uuid' })
  entityId: string;

  @Column({ type: 'varchar', length: 120 })
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any>;

  @Column({ type: 'uuid', nullable: true })
  performedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  // entityId es polimorfico (entityType dice a que tabla apunta: 'bingo_room', 'bingo_game',
  // etc. - ver BingoService.createAudit) - createForeignKeyConstraints:false es obligatorio aca,
  // si no un dataSource.synchronize() (el fallback de main.ts cuando fallan las migraciones)
  // vuelve a agregar una FK real a bingo_games que rompe cualquier auditoria de otro tipo de
  // entidad (ver la migracion DropBingoAuditGameForeignKey1791000000000).
  @ManyToOne(() => BingoGame, (game) => game.audits, {
    nullable: true,
    onDelete: 'SET NULL',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'entityId', referencedColumnName: 'id' })
  game: BingoGame;
}
