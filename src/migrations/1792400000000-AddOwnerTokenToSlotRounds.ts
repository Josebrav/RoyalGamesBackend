import { MigrationInterface, QueryRunner } from 'typeorm';

// Bonos por pestaña en vez de por jugador (ver common/utils/slot-round-ownership.ts): cada ronda
// guarda qué pestaña la disparó y cuándo tiró por última vez. El índice único pasa de "un bono
// activo por jugador" a "uno por jugador y pestaña" - dos pestañas pueden tener cada una el suyo.
// COALESCE deja a las rondas sin dueño (clientes viejos) con el límite de antes: una por jugador.
const TABLES = ['santawilds_rounds', 'gemasofgold_rounds'];

export class AddOwnerTokenToSlotRounds1792400000000 implements MigrationInterface {
  name = 'AddOwnerTokenToSlotRounds1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "ownerToken" VARCHAR(64) NULL,
          ADD COLUMN IF NOT EXISTS "lastSpinAt" TIMESTAMPTZ NOT NULL DEFAULT now();
      `);
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${table}_active_user";`);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_${table}_active_user_owner"
        ON "${table}" ("userId", COALESCE("ownerToken", '')) WHERE "status" = 'active';
      `);
    }

    // Mismo cambio para las tiradas gratis genéricas (Sugar Calavera): una fila por pestaña.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_free_spin_sessions_user_game";`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_free_spin_sessions_user_game_owner"
      ON "free_spin_sessions" ("userId", "game", "ownerToken");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_free_spin_sessions_user_game_owner";`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_free_spin_sessions_user_game"
      ON "free_spin_sessions" ("userId", "game");
    `);

    for (const table of TABLES) {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${table}_active_user_owner";`);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_${table}_active_user"
        ON "${table}" ("userId") WHERE "status" = 'active';
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}" DROP COLUMN IF EXISTS "lastSpinAt", DROP COLUMN IF EXISTS "ownerToken";
      `);
    }
  }
}
