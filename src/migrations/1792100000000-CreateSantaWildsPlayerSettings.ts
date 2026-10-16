import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSantaWildsPlayerSettings1792100000000 implements MigrationInterface {
  name = 'CreateSantaWildsPlayerSettings1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "santawilds_player_settings" (
        "userId" UUID PRIMARY KEY,
        "lastBetAmount" BIGINT NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_santawilds_player_settings_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "santawilds_player_settings";`);
  }
}
