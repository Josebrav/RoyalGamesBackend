import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type ChipsAwardSource = 'admin' | 'game' | 'welcome' | 'gift' | 'prize' | 'referral' | 'daily_spin' | 'daily_bonus';

@Entity('chips_awards')
export class ChipsAward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'bigint' })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'game' })
  source: ChipsAwardSource;

  // Game slug (see gamesCatalog.js), resolved server-side from the calling origin — only
  // populated for source='game' awards. Null for admin/welcome/gift/prize entries.
  @Column({ type: 'varchar', length: 50, nullable: true })
  game: string | null;

  // Which admin/mod executed a manual panel grant/removal (source='admin' only) — lets an
  // admin audit exactly who moved chips instead of just seeing the recipient. Null for
  // game/welcome/gift/prize/referral awards, and for legacy rows from before this column existed.
  @Column({ type: 'uuid', nullable: true })
  performedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
