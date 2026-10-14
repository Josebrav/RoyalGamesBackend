import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type FreeSpinSessionStatus = 'active' | 'finished';

/**
 * Caché de resume para una ronda de tiradas gratis en curso (SCATTER o comprada), genérico por
 * juego - NO es un ledger de fichas (eso sigue siendo chips_awards) ni mueve plata por sí mismo:
 * el cliente (Unity, client-authoritative) sigue siendo dueño del RNG y el pago, esta tabla solo
 * le permite retomar exacto si se corta la conexión a mitad de ronda. Una fila por (userId, game),
 * se pisa en cada ronda nueva - igual que santawilds_jackpot_progress, sin historial.
 *
 * ownerToken: a qué ventana/pestaña pertenece la ronda ahora mismo. "resume" siempre reclama la
 * fila sin chequear el token actual (reconectar ES el evento de takeover); cualquier otra
 * escritura (extend/progress/finish) exige que el token coincida, si no se rechaza - así una
 * ventana vieja que siga mandando tiradas después de que otra más nueva tomó el control deja de
 * poder escribir, sin necesidad de una tabla de sesiones aparte.
 */
@Entity('free_spin_sessions')
@Index(['userId', 'game'], { unique: true })
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
