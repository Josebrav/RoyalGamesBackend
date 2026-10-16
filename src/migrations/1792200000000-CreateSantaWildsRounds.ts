import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSantaWildsRounds1792200000000 implements MigrationInterface {
  name = 'CreateSantaWildsRounds1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "santawilds_rounds" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "betAmount" BIGINT NOT NULL,
        "cells" JSONB NOT NULL,
        "freeSpinsRemaining" INT NOT NULL DEFAULT 10,
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "resolvedAt" TIMESTAMPTZ
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_santawilds_rounds_userId" ON "santawilds_rounds" ("userId");
    `);

    // Un solo bono activo por jugador a la vez - evita que dos tiradas concurrentes del mismo
    // usuario pisen el mismo round (mismo criterio que gemasofgold_rounds/mines_rounds).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_santawilds_rounds_active_user"
      ON "santawilds_rounds" ("userId") WHERE "status" = 'active';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "santawilds_rounds";`);
  }
}
