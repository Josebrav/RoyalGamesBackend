import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La restricción original era por bot (`botId`+`phraseKey`+`usedOnDate`), así que dos bots
 * distintos podían decir la misma frase el mismo día sin chocar entre sí — con varios bots
 * chatty activos eso se notaba (dos "holaaa" el mismo día en salas distintas). Pasa a ser única
 * por `phraseKey`+`usedOnDate` sin importar qué bot la dijo: una frase usada por CUALQUIER bot
 * en el día queda excluida para todos - ver BingoBotChatService.trySay.
 */
export class MakeBingoBotPhraseLogGlobal1791200000000 implements MigrationInterface {
  name = 'MakeBingoBotPhraseLogGlobal1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bingo_bot_phrase_log" DROP CONSTRAINT IF EXISTS "UQ_bingo_bot_phrase_log"`,
    );
    // Bajo la restricción vieja (por bot), distintos bots ya habían usado la misma frase el mismo
    // día muchas veces — eso es justo lo que esta migración vino a evitar, pero significa que ya
    // hay filas duplicadas para (phraseKey, usedOnDate) que romperían el ADD CONSTRAINT de abajo.
    // Nos quedamos con una fila por combinación (la más vieja) y borramos el resto antes de agregar
    // la restricción global.
    await queryRunner.query(`
      DELETE FROM "bingo_bot_phrase_log" a USING "bingo_bot_phrase_log" b
      WHERE a."phraseKey" = b."phraseKey"
        AND a."usedOnDate" = b."usedOnDate"
        AND a."id" > b."id"
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_bot_phrase_log"
          ADD CONSTRAINT "UQ_bingo_bot_phrase_log_global" UNIQUE ("phraseKey", "usedOnDate");
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bingo_bot_phrase_log" DROP CONSTRAINT IF EXISTS "UQ_bingo_bot_phrase_log_global"`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_bot_phrase_log"
          ADD CONSTRAINT "UQ_bingo_bot_phrase_log" UNIQUE ("botId", "phraseKey", "usedOnDate");
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }
}
