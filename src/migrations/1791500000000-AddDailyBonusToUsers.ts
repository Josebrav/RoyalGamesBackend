import { MigrationInterface, QueryRunner } from 'typeorm';

/** Racha del Bono Diario de 7 días (ver DailyBonusModule) — mismo estilo que lastSpinAt
 *  (AddLastSpinAtToUsers1791400000000) para el Giro Diario. */
export class AddDailyBonusToUsers1791500000000 implements MigrationInterface {
  name = 'AddDailyBonusToUsers1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dailyBonusStreak" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dailyBonusLastClaimAt" TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dailyBonusLastClaimAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dailyBonusStreak"`);
  }
}
