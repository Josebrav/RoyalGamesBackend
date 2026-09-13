import { MigrationInterface, QueryRunner } from 'typeorm';

// Enforces "one active Mines round per user" at the DB level - MinesService.startRound relies on
// this unique_violation (see the PG_UNIQUE_VIOLATION catch there) to safely reject a second
// concurrent start instead of the app-level pre-check it used to depend on alone, which could
// race under truly concurrent requests. Filters status='active' since a user legitimately has
// many non-active (busted/cashed_out) rounds over time - only one ACTIVE one is ever valid.
export class AddUniqueActiveMinesRoundIndex1786900029000 implements MigrationInterface {
  name = 'AddUniqueActiveMinesRoundIndex1786900029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_mines_rounds_active_user"
      ON "mines_rounds" ("userId")
      WHERE status = 'active';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_mines_rounds_active_user";`);
  }
}
