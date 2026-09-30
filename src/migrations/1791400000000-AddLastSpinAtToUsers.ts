import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastSpinAtToUsers1791400000000 implements MigrationInterface {
  name = 'AddLastSpinAtToUsers1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastSpinAt" TIMESTAMP NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "lastSpinAt";`);
  }
}
