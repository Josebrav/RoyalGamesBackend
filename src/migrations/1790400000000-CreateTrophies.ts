import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trofeos de torneo: una imagen única (trofeo + avatar del ganador, compuesta aparte por el
 * admin) que se le asigna a un usuario y se muestra en su perfil. Mismo patrón que
 * banner_slides (imagen en Cloudinary, solo se guarda la URL + el publicId acá) — ver
 * TrophiesService.
 *
 * Correr con: npm run typeorm:migration:run
 */
export class CreateTrophies1790400000000 implements MigrationInterface {
  name = 'CreateTrophies1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trophies" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "title" VARCHAR NOT NULL,
        "description" VARCHAR NULL,
        "imageUrl" VARCHAR NOT NULL,
        "imagePublicId" VARCHAR NOT NULL,
        "awardedBy" UUID NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_trophies_user'
        ) THEN
          ALTER TABLE "trophies"
            ADD CONSTRAINT "FK_trophies_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_trophies_awarded_by'
        ) THEN
          ALTER TABLE "trophies"
            ADD CONSTRAINT "FK_trophies_awarded_by"
            FOREIGN KEY ("awardedBy") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_trophies_userId" ON "trophies" ("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "trophies";`);
  }
}
