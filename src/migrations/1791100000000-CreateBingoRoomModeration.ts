import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kick ("expulsar de la sala") y silenciar desde el chat - ver BingoRoomBan/BingoRoomMute y
 * BingoGateway.handleModeratePlayer. Ambas son temporales (expiresAt), nunca se borran las filas
 * vencidas - queda como historial de moderación consultable.
 */
export class CreateBingoRoomModeration1791100000000 implements MigrationInterface {
  name = 'CreateBingoRoomModeration1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bingo_room_bans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "roomId" uuid NOT NULL,
        "playerId" uuid NOT NULL,
        "actedByPlayerId" uuid,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bingo_room_bans" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "IDX_bingo_room_bans_room_player" ON "bingo_room_bans"("roomId", "playerId");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bingo_room_mutes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "roomId" uuid NOT NULL,
        "playerId" uuid NOT NULL,
        "actedByPlayerId" uuid,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bingo_room_mutes" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "IDX_bingo_room_mutes_room_player" ON "bingo_room_mutes"("roomId", "playerId");
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bingo_room_bans"
          ADD CONSTRAINT "FK_bingo_room_bans_room" FOREIGN KEY ("roomId") REFERENCES "bingo_rooms"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "bingo_room_bans"
          ADD CONSTRAINT "FK_bingo_room_bans_player" FOREIGN KEY ("playerId") REFERENCES "bingo_players"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "bingo_room_mutes"
          ADD CONSTRAINT "FK_bingo_room_mutes_room" FOREIGN KEY ("roomId") REFERENCES "bingo_rooms"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "bingo_room_mutes"
          ADD CONSTRAINT "FK_bingo_room_mutes_player" FOREIGN KEY ("playerId") REFERENCES "bingo_players"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bingo_room_bans";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bingo_room_mutes";`);
  }
}
