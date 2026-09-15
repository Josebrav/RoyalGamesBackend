import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// 'abandoned': auto-resuelto por startRound cuando encuentra una ronda activa vieja sin ningún
// diamante revelado (apuesta reembolsada) - separado de 'cashed_out' para no confundirlo con un
// cobro real del jugador en vistas de actividad/admin. Ver MinesService.resolveStaleActiveRound.
export type MinesRoundStatus = 'active' | 'busted' | 'cashed_out' | 'abandoned';

// One row per Mines round. Mine layout and payout math live here and are computed
// server-side (see MinesService) so the client can never dictate its own outcome or
// chip award the way the old client-authoritative build did.
@Entity('mines_rounds')
export class MinesRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'bigint' })
  betAmount: number;

  @Column({ type: 'int' })
  minesCount: number;

  @Column({ type: 'int', default: 25 })
  tileCount: number;

  // Server-only secret: never sent to the client until a tile in it is revealed (bust) or
  // the round is over. Populated once at start and never mutated afterwards.
  @Column({ type: 'jsonb' })
  minePositions: number[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  revealedTiles: number[];

  // Basis points (10000 = x1.00). Integer fixed-point so repeated reveals never drift the
  // way repeated floating point additions would.
  @Column({ type: 'int' })
  multiplierBp: number;

  // Constant per round (derived from minesCount at start) - added to multiplierBp after
  // every safe reveal, mirroring the client's old CalcularIncremento().
  @Column({ type: 'int' })
  incrementBp: number;

  // Running sum of what each successful reveal was worth at the time (mirrors the old
  // client's `winnings` accumulator) - this, not betAmount * multiplierBp, is what cashout pays.
  @Column({ type: 'bigint', default: 0 })
  accumulatedWinnings: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: MinesRoundStatus;

  @Column({ type: 'varchar' })
  serverSeed: string;

  @Column({ type: 'varchar' })
  serverSeedHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
