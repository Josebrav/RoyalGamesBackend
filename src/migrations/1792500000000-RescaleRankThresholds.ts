import { MigrationInterface, QueryRunner } from 'typeorm';

// Recalcula el rango de todos los usuarios con los umbrales nuevos (ver
// UsersService.RANK_THRESHOLDS): los viejos (1.000 a 50.000 fichas) eran de cuando 1.000 fichas
// valían $1, y con los paquetes actuales cualquier compra llevaba directo a Diamante.
export class RescaleRankThresholds1792500000000 implements MigrationInterface {
  name = 'RescaleRankThresholds1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "rank" = CASE
        WHEN "totalChipsDeposited" >= 1000000000 THEN 'diamond'
        WHEN "totalChipsDeposited" >= 250000000 THEN 'platinum'
        WHEN "totalChipsDeposited" >= 50000000 THEN 'gold'
        WHEN "totalChipsDeposited" >= 5000000 THEN 'silver'
        ELSE 'bronze'
      END::"users_rank_enum";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "rank" = CASE
        WHEN "totalChipsDeposited" >= 50000 THEN 'diamond'
        WHEN "totalChipsDeposited" >= 10000 THEN 'platinum'
        WHEN "totalChipsDeposited" >= 5000 THEN 'gold'
        WHEN "totalChipsDeposited" >= 1000 THEN 'silver'
        ELSE 'bronze'
      END::"users_rank_enum";
    `);
  }
}
