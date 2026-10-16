import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type GemasOfGoldRoundStatus = 'active' | 'completed';

export interface GemasOfGoldCell {
  // 'grand' | 'major' | 'minor' | 'mini' = gema de jackpot (solo en tiradas base, ver
  // GemasOfGoldSlotService.tryJackpot) - no cuenta para multiplicadores ni golds.
  symbol: 'mult' | 'gold' | 'grand' | 'major' | 'minor' | 'mini' | null;
  value: number | null;
}

// Una fila por bonus en curso ("hold and win"). Solo existe mientras el bonus está activo -
// una tirada base que no dispara bonus se resuelve entera en la misma request, sin persistir
// nada (ver GemasOfGoldService.spin). El grid y el conteo de oro/tiradas gratis viven acá para
// que el bonus sobreviva un refresh/reconexión del cliente a mitad de camino, mismo motivo que
// MinesRound persiste cada ronda.
@Entity('gemasofgold_rounds')
export class GemasOfGoldRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'bigint' })
  betAmount: number;

  // 9 celdas, index = row*3 + col (ver slot.constants.ts). Una vez no-nula, una celda queda
  // "pegada" para siempre dentro de este bonus - rollRemaining solo vuelve a tirar las null.
  @Column({ type: 'jsonb' })
  cells: GemasOfGoldCell[];

  @Column({ type: 'int', default: 3 })
  freeSpinsRemaining: number;

  // Cantidad total de gemas gold caídas en el bonus (incluida la de la tirada que lo disparó) -
  // el premio final se multiplica por este número, no se paga una por una (ver corrección del
  // usuario 2026-10-09: los pagos se dan todos juntos al terminar el bonus).
  @Column({ type: 'int', default: 0 })
  goldCount: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: GemasOfGoldRoundStatus;

  // Pestaña dueña del bonus (ver common/utils/slot-round-ownership.ts). Null = cliente viejo.
  @Column({ type: 'varchar', length: 64, nullable: true })
  ownerToken: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastSpinAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
