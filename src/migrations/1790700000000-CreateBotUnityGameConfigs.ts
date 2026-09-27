import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Config de "bot simulando actividad" para uno de los 5 juegos Unity (Royal Joker, Pachinka,
 * Slots, Santa Wilds, Sugar Calavera) — esos juegos no tienen ronda/apuesta real en el backend
 * (el cliente de Unity solo llama chips/add y chips/remove), así que acá un bot no "juega", solo
 * gana/pierde fichas de a poco con el mismo mecanismo que usa el juego real. Una fila por
 * (bot, juego); sin fila = deshabilitado para ese juego.
 */
export class CreateBotUnityGameConfigs1790700000000 implements MigrationInterface {
  name = 'CreateBotUnityGameConfigs1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bot_unity_game_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "botId" uuid NOT NULL,
        "gameSlug" character varying(50) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "minAmount" bigint NOT NULL DEFAULT 50,
        "maxAmount" bigint NOT NULL DEFAULT 2000,
        "lastActivityAt" TIMESTAMP NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_unity_game_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bot_unity_game_configs_bot_game" UNIQUE ("botId", "gameSlug")
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bot_unity_game_configs"
          ADD CONSTRAINT "FK_bot_unity_game_configs_bot" FOREIGN KEY ("botId") REFERENCES "bingo_room_bots"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_unity_game_configs";`);
  }
}
