import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `chattyEnabled` prende los comentarios random de un bot (ver BingoBotChatService). El pool de
 * frases vive en código (bot-chat-phrases.ts), no en esta tabla — acá solo se registra qué
 * `phraseKey` ya usó cada bot en qué día, para no repetir la misma frase dos veces en el mismo día.
 */
export class AddBingoBotChat1790900000000 implements MigrationInterface {
  name = 'AddBingoBotChat1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bingo_room_bots" ADD COLUMN IF NOT EXISTS "chattyEnabled" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bingo_bot_phrase_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "botId" uuid NOT NULL,
        "phraseKey" character varying(80) NOT NULL,
        "usedOnDate" DATE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bingo_bot_phrase_log" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bingo_bot_phrase_log" UNIQUE ("botId", "phraseKey", "usedOnDate")
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_bot_phrase_log"
          ADD CONSTRAINT "FK_bingo_bot_phrase_log_bot" FOREIGN KEY ("botId") REFERENCES "bingo_room_bots"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bingo_bot_phrase_log";`);
    await queryRunner.query(`ALTER TABLE "bingo_room_bots" DROP COLUMN IF EXISTS "chattyEnabled"`);
  }
}
