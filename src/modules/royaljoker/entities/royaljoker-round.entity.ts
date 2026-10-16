import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type RoyalJokerRoundStatus = 'active' | 'completed';

/**
 * Una fila por bonus de cartas y/o ronda de tiradas gratis en curso. Solo existe mientras hay
 * algo pendiente: una tirada base que no activa nada se resuelve entera en la misma request sin
 * persistir nada (ver RoyalJokerSlotService.spin). Vive acá para que, si se cierra la ventana o
 * se corta la conexión con un bonus/tiradas gratis pendientes, al volver se retome exacto.
 *
 * Si en la misma tirada salen BONUS y FREE, primero se juega el bonus (bonusPending) y después
 * las tiradas gratis (freeSpinsRemaining) sobre la misma fila.
 *
 * ownerToken: qué ventana controla la ronda. /state (al cargar el juego) la reclama siempre;
 * spin y bonus/pick exigen que coincida, si no 409 - así una ventana vieja/duplicada deja de
 * poder jugar la ronda apenas otra la toma (mismo criterio que free_spin_sessions).
 */
@Entity('royaljoker_rounds')
export class RoyalJokerRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'bigint' })
  betAmount: number;

  @Column({ type: 'varchar', length: 64 })
  ownerToken: string;

  @Column({ type: 'boolean', default: false })
  bonusPending: boolean;

  // Multiplicadores ya barajados al activarse el bonus (decididos acá, nunca en el cliente).
  @Column({ type: 'jsonb', default: () => "'[]'" })
  bonusCards: number[];

  // Índices de carta ya elegidos, en orden.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  bonusPicks: number[];

  @Column({ type: 'bigint', default: 0 })
  bonusPrize: number;

  @Column({ type: 'int', default: 0 })
  freeSpinsTotal: number;

  @Column({ type: 'int', default: 0 })
  freeSpinsRemaining: number;

  @Column({ type: 'int', default: 0 })
  freeSpinsPlayed: number;

  @Column({ type: 'bigint', default: 0 })
  freeSpinsWinnings: number;

  // Grilla de la última tirada, para volver a mostrarla al retomar.
  @Column({ type: 'jsonb' })
  lastCells: string[];

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: RoyalJokerRoundStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
