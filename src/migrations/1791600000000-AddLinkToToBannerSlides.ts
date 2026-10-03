import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLinkToToBannerSlides1791600000000 implements MigrationInterface {
  name = 'AddLinkToToBannerSlides1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "banner_slides" ADD COLUMN IF NOT EXISTS "linkTo" varchar NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "banner_slides" DROP COLUMN IF EXISTS "linkTo"`);
  }
}
