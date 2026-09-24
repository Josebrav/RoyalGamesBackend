import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una fila = "este bot juega en esta sala, con esta configuración" (BingoBotService.tick lee esta
 * tabla cada ~4s). `userId`/`botPlayerId` son el User+BingoPlayer reales creados junto con esta
 * fila (ver BingoBotService.createBot) — el bot compra cartones y gana el pozo exactamente igual
 * que un jugador real, no hay tabla de fichas separada.
 *
 * Correr con: npm run typeorm:migration:run
 */
export class CreateBingoRoomBots1790300001000 implements MigrationInterface {
  name = 'CreateBingoRoomBots1790300001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bingo_room_bots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "botPlayerId" uuid NOT NULL,
        "roomId" uuid NOT NULL,
        "minCardsPerGame" integer NOT NULL DEFAULT 1,
        "maxCardsPerGame" integer NOT NULL DEFAULT 2,
        "autoTopUpThreshold" bigint NOT NULL DEFAULT 5000,
        "autoTopUpAmount" bigint NOT NULL DEFAULT 100000,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bingo_room_bots" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_room_bots"
          ADD CONSTRAINT "FK_bingo_room_bots_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_room_bots"
          ADD CONSTRAINT "FK_bingo_room_bots_player" FOREIGN KEY ("botPlayerId") REFERENCES "bingo_players"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_room_bots"
          ADD CONSTRAINT "FK_bingo_room_bots_room" FOREIGN KEY ("roomId") REFERENCES "bingo_rooms"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bingo_room_bots_roomId" ON "bingo_room_bots" ("roomId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bingo_room_bots";`);
  }
}
