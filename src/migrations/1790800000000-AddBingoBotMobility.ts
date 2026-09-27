import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `roomId` sigue siendo la sala "principal" del bot (compatibilidad total con connectBot/
 * disconnectBot ya existentes). `mobilityEnabled` habilita dos comportamientos nuevos en
 * BingoBotService: (1) comprar cartones también en las salas de `bingo_bot_extra_rooms`, además
 * de la principal, y (2) cambiar de sala principal ocasionalmente solo. Con `mobilityEnabled` en
 * false se ignoran las extra sin borrarlas (reversible).
 */
export class AddBingoBotMobility1790800000000 implements MigrationInterface {
  name = 'AddBingoBotMobility1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bingo_room_bots" ADD COLUMN IF NOT EXISTS "mobilityEnabled" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bingo_bot_extra_rooms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "botId" uuid NOT NULL,
        "roomId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bingo_bot_extra_rooms" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bingo_bot_extra_rooms" UNIQUE ("botId", "roomId")
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_bot_extra_rooms"
          ADD CONSTRAINT "FK_bingo_bot_extra_rooms_bot" FOREIGN KEY ("botId") REFERENCES "bingo_room_bots"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_bot_extra_rooms"
          ADD CONSTRAINT "FK_bingo_bot_extra_rooms_room" FOREIGN KEY ("roomId") REFERENCES "bingo_rooms"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bingo_bot_extra_rooms";`);
    await queryRunner.query(`ALTER TABLE "bingo_room_bots" DROP COLUMN IF EXISTS "mobilityEnabled"`);
  }
}
