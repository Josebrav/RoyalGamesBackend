import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// Single global row (see MINES_JACKPOT_ID) - the shared "Gema Royal" pot. Lives independently of
// any MinesRound/session so it keeps accumulating even when nobody is in the room, and survives
// server restarts (see MinesService.startRound/revealTile for the contribution/claim logic).
@Entity('mines_jackpot')
export class MinesJackpot {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'bigint', default: 0 })
  potAmount: number;

  // Once now() passes this, the jackpot is "armed": the next diamond reveal (from anyone,
  // anywhere, mid-round or not) claims the pot. Pushed forward by MINES_JACKPOT_ELIGIBILITY_WINDOW_MS
  // every time it's claimed.
  //
  // timestamptz, not timestamp: node-postgres parses a bare "timestamp without time zone" value
  // using the Node process's own local OS time zone instead of UTC, silently shifting every read
  // by that offset (confirmed directly - see migration 1786900030000). timestamptz carries an
  // explicit UTC offset on the wire, so it's parsed unambiguously no matter the host's time zone.
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
