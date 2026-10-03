import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLinkToToSiteContentBlocks1791700000000 implements MigrationInterface {
  name = 'AddLinkToToSiteContentBlocks1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_content_blocks" ADD COLUMN IF NOT EXISTS "linkTo" varchar NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "site_content_blocks" DROP COLUMN IF EXISTS "linkTo"`);
  }
}
