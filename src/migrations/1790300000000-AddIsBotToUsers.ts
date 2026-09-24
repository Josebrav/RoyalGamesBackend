import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca de cuenta-bot para el sistema de bots de Bingo (ver BingoBotService). Un bot es un `User`
 * real (mismo flujo de fichas, mismo `BingoPlayer` linkeado) para que `purchaseCard` funcione sin
 * tocar el motor del juego — esta columna es solo para poder EXCLUIRLO de todo lo que cuenta
 * jugadores reales (ranking, "conectados ahora", totales del panel admin) sin tocar esa lógica,
 * agregando nada más un `WHERE "isBot" = false`.
 *
 * Correr con: npm run typeorm:migration:run
 */
export class AddIsBotToUsers1790300000000 implements MigrationInterface {
  name = 'AddIsBotToUsers1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isBot" BOOLEAN NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "isBot";`);
  }
}
