import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type FreeSpinSessionStatus = 'active' | 'finished';

/**
 * Caché de resume para una ronda de tiradas gratis en curso (SCATTER o comprada), genérico por
 * juego - NO es un ledger de fichas (eso sigue siendo chips_awards) ni mueve plata por sí mismo:
 * el cliente (Unity, client-authoritative) sigue siendo dueño del RNG y el pago, esta tabla solo
 * le permite retomar exacto si se corta la conexión a mitad de ronda. Una fila por (userId, game,
 * ownerToken): cada pestaña tiene su propia ronda y no ve la de otra (ver
 * common/utils/slot-round-ownership.ts).
 *
 * ownerToken: pestaña dueña de la ronda (tabId que la página le pasa al juego, estable al recargar
 * esa misma pestaña). extend/progress/finish solo tocan la fila propia; "resume" retoma la propia o
 * una abandonada por otra pestaña hace más de ORPHANED_ROUND_TAKEOVER_MS, nunca una en juego.
 */
@Entity('free_spin_sessions')
@Index(['userId', 'game', 'ownerToken'], { unique: true })
export class FreeSpinSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  // Slug de juego (ver game-origins.ts / KNOWN_GAME_SLUGS), no FK a la tabla games - mismo
  // criterio que ChipsAward.game.
  @Column({ type: 'varchar', length: 50 })
  game: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: FreeSpinSessionStatus;

  // Apuesta con la que se otorgó la ronda - fija durante toda la ronda, incluso si el jugador
  // podría cambiar de apuesta en la UI (no debería poder mientras hay tiradas gratis).
  @Column({ type: 'bigint' })
  betAmount: number;

  @Column({ type: 'int', default: 0 })
  spinsTotal: number;

  @Column({ type: 'int', default: 0 })
  spinsStarted: number;

  @Column({ type: 'int', default: 0 })
  spinsRemaining: number;

  @Column({ type: 'bigint', default: 0 })
  accumulatedWinnings: number;

  @Column({ type: 'varchar', length: 64 })
  ownerToken: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
