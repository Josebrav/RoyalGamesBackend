import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type SantaWildsRoundStatus = 'active' | 'completed';

export interface SantaWildsCell {
  symbol: string;
  sticky: boolean;
}

/**
 * Una fila por bono de wild pegajoso en curso. Solo existe mientras el bono está activo - una
 * tirada base que no dispara bono se resuelve entera en la misma request, sin persistir nada
 * (ver SantaWildsSlotService.spin). El grid vive acá (15 celdas planas, index = row*5+col) para
 * que el bono sobreviva un refresh/reconexión a mitad de camino - mismo motivo que
 * GemasOfGoldRound. Una celda con sticky=true queda fija para el resto del bono; rollRemaining
 * (slot-engine.ts) solo vuelve a tirar las sticky=false.
 */
@Entity('santawilds_rounds')
export class SantaWildsRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'bigint' })
  betAmount: number;

  @Column({ type: 'jsonb' })
  cells: SantaWildsCell[];

  @Column({ type: 'int', default: 10 })
  freeSpinsRemaining: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: SantaWildsRoundStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
