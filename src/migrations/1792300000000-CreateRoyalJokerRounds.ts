import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoyalJokerRounds1792300000000 implements MigrationInterface {
  name = 'CreateRoyalJokerRounds1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "royaljoker_rounds" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "betAmount" BIGINT NOT NULL,
        "ownerToken" VARCHAR(64) NOT NULL,
        "bonusPending" BOOLEAN NOT NULL DEFAULT false,
        "bonusCards" JSONB NOT NULL DEFAULT '[]',
        "bonusPicks" JSONB NOT NULL DEFAULT '[]',
        "bonusPrize" BIGINT NOT NULL DEFAULT 0,
        "freeSpinsTotal" INT NOT NULL DEFAULT 0,
        "freeSpinsRemaining" INT NOT NULL DEFAULT 0,
        "freeSpinsPlayed" INT NOT NULL DEFAULT 0,
        "freeSpinsWinnings" BIGINT NOT NULL DEFAULT 0,
        "lastCells" JSONB NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "resolvedAt" TIMESTAMPTZ
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_royaljoker_rounds_userId" ON "royaljoker_rounds" ("userId");
    `);

    // Una sola ronda activa por jugador - dos tiradas concurrentes (dos ventanas, doble click)
    // no pueden crear dos bonus a la vez (mismo criterio que santawilds_rounds).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_royaljoker_rounds_active_user"
      ON "royaljoker_rounds" ("userId") WHERE "status" = 'active';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "royaljoker_rounds";`);
  }
}
