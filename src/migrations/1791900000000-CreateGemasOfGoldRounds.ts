import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGemasOfGoldRounds1791900000000 implements MigrationInterface {
  name = 'CreateGemasOfGoldRounds1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gemasofgold_rounds" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "betAmount" BIGINT NOT NULL,
        "cells" JSONB NOT NULL,
        "freeSpinsRemaining" INT NOT NULL DEFAULT 3,
        "goldCount" INT NOT NULL DEFAULT 0,
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "resolvedAt" TIMESTAMPTZ
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gemasofgold_rounds_userId" ON "gemasofgold_rounds" ("userId");
    `);

    // Un solo bonus activo por jugador a la vez - evita que dos tiradas concurrentes del mismo
    // usuario pisen el mismo round (mismo criterio que el índice parcial de mines_rounds).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_gemasofgold_rounds_active_user"
      ON "gemasofgold_rounds" ("userId") WHERE "status" = 'active';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gemasofgold_rounds";`);
  }
}
