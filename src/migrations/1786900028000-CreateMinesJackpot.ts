import { MigrationInterface, QueryRunner } from 'typeorm';

const MINES_JACKPOT_ID = '11111111-1111-1111-1111-111111111111';

export class CreateMinesJackpot1786900028000 implements MigrationInterface {
  name = 'CreateMinesJackpot1786900028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mines_jackpot" (
        "id" UUID PRIMARY KEY,
        "potAmount" BIGINT NOT NULL DEFAULT 0,
        "nextEligibleAt" TIMESTAMP NOT NULL DEFAULT (now() + interval '24 hours'),
        "lastWinnerUserId" UUID,
        "lastWinnerNick" VARCHAR(30),
        "lastWonAmount" BIGINT,
        "lastWonAt" TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Single global pot row, fixed id so the app never has to "find or create" it under a race.
    await queryRunner.query(`
      INSERT INTO "mines_jackpot" ("id", "potAmount", "nextEligibleAt")
      VALUES ('${MINES_JACKPOT_ID}', 0, now() + interval '24 hours')
      ON CONFLICT ("id") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mines_jackpot";`);
  }
}
