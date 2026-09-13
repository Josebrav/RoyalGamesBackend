import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * mines_jackpot's timestamp columns were created as TIMESTAMP (no time zone) in
 * 1786900028000-CreateMinesJackpot. node-postgres parses a "timestamp without time zone" value
 * using the Node process's OWN local OS time zone instead of UTC - on a host set to e.g.
 * Argentina time (UTC-3), a column genuinely holding a UTC wall-clock value gets misread as if it
 * were already in UTC-3, silently shifting every read by 3 hours (confirmed directly: a fresh
 * `now() + interval` computed correctly in pure SQL still came back shifted by exactly 3h the
 * moment it round-tripped through this column type). This is why "Gema Royal" never became
 * eligible even after its window had genuinely passed - the app was comparing real time against a
 * timestamp that looked 3 hours further in the future than it actually was.
 *
 * TIMESTAMPTZ carries an explicit UTC offset on the wire, so node-postgres parses it unambiguously
 * regardless of the host's local time zone - the correct fix, not a workaround. The DB session's
 * own time zone is confirmed UTC (`SHOW timezone`), so the existing naive values already represent
 * the intended UTC instants - `AT TIME ZONE 'UTC'` on the way in preserves them exactly instead of
 * reinterpreting them.
 */
export class FixMinesJackpotTimestampTimezone1786900030000 implements MigrationInterface {
  name = 'FixMinesJackpotTimestampTimezone1786900030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mines_jackpot"
        ALTER COLUMN "nextEligibleAt" TYPE TIMESTAMPTZ USING "nextEligibleAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "nextEligibleAt" SET DEFAULT (now() + interval '24 hours'),
        ALTER COLUMN "lastWonAt" TYPE TIMESTAMPTZ USING "lastWonAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "updatedAt" SET DEFAULT now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mines_jackpot"
        ALTER COLUMN "nextEligibleAt" TYPE TIMESTAMP USING "nextEligibleAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "nextEligibleAt" SET DEFAULT (now() + interval '24 hours'),
        ALTER COLUMN "lastWonAt" TYPE TIMESTAMP USING "lastWonAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "updatedAt" SET DEFAULT now();
    `);
  }
}
