import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Config 1:1 de "bot jugando Minas" para un bot ya existente de `bingo_room_bots` (que pasa a ser
 * el registro genérico de identidad de bots, no solo de Bingo — ver MinesBotService). Sin fila acá
 * = bot deshabilitado para Minas.
 */
export class CreateMinesBotConfigs1790600000000 implements MigrationInterface {
  name = 'CreateMinesBotConfigs1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mines_bot_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "botId" uuid NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "minBet" bigint NOT NULL DEFAULT 100,
        "maxBet" bigint NOT NULL DEFAULT 5000,
        "minMinesCount" integer NOT NULL DEFAULT 3,
        "maxMinesCount" integer NOT NULL DEFAULT 10,
        "lastRoundAt" TIMESTAMP NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mines_bot_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_mines_bot_configs_botId" UNIQUE ("botId")
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "mines_bot_configs"
          ADD CONSTRAINT "FK_mines_bot_configs_bot" FOREIGN KEY ("botId") REFERENCES "bingo_room_bots"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mines_bot_configs";`);
  }
}
