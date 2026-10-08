import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// 4 filas fijas (una por nivel: grand/major/minor/mini, ver GEMASOFGOLD_JACKPOT_IDS), cada una un
// pozo global independiente del resto - mismo shape que MinesJackpot, con "tier" agregado. Viven
// aparte de cualquier ronda/sesión de juego para seguir acumulando aunque no haya nadie jugando.
@Entity('gemasofgold_jackpot')
export class GemasOfGoldJackpot {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 10 })
  tier: string;

  @Column({ type: 'bigint', default: 0 })
  potAmount: number;

  // timestamptz desde el día uno (no timestamp) - ver la nota de FixMinesJackpotTimestampTimezone
  // en mines-jackpot.entity.ts: node-postgres parsea "timestamp without time zone" con la zona
  // horaria local del proceso, no UTC, y desfasa silenciosamente cada lectura.
  @Column({ type: 'timestamptz' })
  nextEligibleAt: Date;

  @Column({ type: 'uuid', nullable: true })
  lastWinnerUserId: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  lastWinnerNick: string | null;

  @Column({ type: 'bigint', nullable: true })
  lastWonAmount: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastWonAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
