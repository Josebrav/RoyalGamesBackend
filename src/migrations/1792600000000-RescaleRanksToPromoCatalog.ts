import { MigrationInterface, QueryRunner } from 'typeorm';

// Recalcula el rango de todos con los umbrales del catálogo con promo (ver
// UsersService.RANK_THRESHOLDS): ahora 1 dólar da 2,5M de fichas en vez de 500.000, así que los
// umbrales anteriores (5M a 1.000M) se alcanzaban con muy poco.
export class RescaleRanksToPromoCatalog1792600000000 implements MigrationInterface {
  name = 'RescaleRanksToPromoCatalog1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "rank" = CASE
        WHEN "totalChipsDeposited" >= 7500000000 THEN 'diamond'
        WHEN "totalChipsDeposited" >= 1500000000 THEN 'platinum'
        WHEN "totalChipsDeposited" >= 250000000 THEN 'gold'
        WHEN "totalChipsDeposited" >= 15000000 THEN 'silver'
        ELSE 'bronze'
      END::"users_rank_enum";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
