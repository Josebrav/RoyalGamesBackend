import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un bot (User + BingoPlayer reales, ver BingoBotService.createBot) es reutilizable: esta fila es
 * su identidad + configuración, y `roomId` es la sala a la que está CONECTADO ahora mismo — NULL
 * significa "desconectado" (existe, tiene su cuenta y fichas, pero no está jugando en ningún
 * lado). BingoBotService.tick solo juega a los que tienen `roomId` seteado; conectar/desconectar
 * simplemente cambia ese valor, sin tocar la cuenta ni el historial del bot.
 *
 * `roomId` con ON DELETE SET NULL (no CASCADE, a diferencia de userId/botPlayerId): si la sala se
 * borra, el bot queda desconectado en vez de desaparecer — sigue siendo reutilizable.
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
        "roomId" uuid NULL,
        "minCardsPerGame" integer NOT NULL DEFAULT 1,
        "maxCardsPerGame" integer NOT NULL DEFAULT 2,
        "autoTopUpThreshold" bigint NOT NULL DEFAULT 5000,
        "autoTopUpAmount" bigint NOT NULL DEFAULT 100000,
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
          ADD CONSTRAINT "FK_bingo_room_bots_room" FOREIGN KEY ("roomId") REFERENCES "bingo_rooms"("id") ON DELETE SET NULL;
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
