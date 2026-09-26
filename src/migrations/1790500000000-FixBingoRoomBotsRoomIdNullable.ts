import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * bingo_room_bots.roomId quedó NOT NULL en producción aunque la entidad y la migración que crea
 * la tabla (CreateBingoRoomBots) siempre lo declararon nullable — mismo patrón de esquema
 * desincronizado que AddGoogleIdToUsers1783467622917 (el fallback a dataSource.synchronize() de
 * main.ts, corrido en algún deploy pasado con la entidad en un estado previo, dejó la columna
 * como la tenía en ESE momento en vez de como la migración la pide). Esto rompía
 * BingoBotService.disconnectBot: al poner roomId = null, Postgres tiraba
 * "null value in column roomId violates not-null constraint" y el bot quedaba atascado
 * "conectado" para siempre.
 */
export class FixBingoRoomBotsRoomIdNullable1790500000000 implements MigrationInterface {
  name = 'FixBingoRoomBotsRoomIdNullable1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bingo_room_bots" ALTER COLUMN "roomId" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bingo_room_bots" ALTER COLUMN "roomId" SET NOT NULL`);
  }
}
