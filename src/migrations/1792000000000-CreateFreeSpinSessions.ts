import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFreeSpinSessions1792000000000 implements MigrationInterface {
  name = 'CreateFreeSpinSessions1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "free_spin_sessions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "game" VARCHAR(50) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "betAmount" BIGINT NOT NULL,
        "spinsTotal" INT NOT NULL DEFAULT 0,
        "spinsStarted" INT NOT NULL DEFAULT 0,
        "spinsRemaining" INT NOT NULL DEFAULT 0,
        "accumulatedWinnings" BIGINT NOT NULL DEFAULT 0,
        "ownerToken" VARCHAR(64) NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Una fila por (userId, game) - se pisa en cada ronda nueva, nunca una tabla de historial.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_free_spin_sessions_user_game"
      ON "free_spin_sessions" ("userId", "game");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "free_spin_sessions";`);
  }
}
