import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registra qué IP ya reclamó el regalo de "primeros 100 usuarios" — antes solo se limitaba por
 * cuenta (firstChips=false), así que crear varias cuentas desde la misma conexión permitía cobrar
 * el bono repetidas veces. `ipAddress` es UNIQUE: una vez usada, ninguna otra cuenta puede volver a
 * cobrar desde ahí, sin importar si la cuenta original se borra después (por eso `userId` es
 * nullable con ON DELETE SET NULL, no CASCADE — el registro de la IP tiene que sobrevivir al borrado
 * de la cuenta para seguir bloqueando esa IP).
 */
export class CreateFirstChipsIpClaims1791300000000 implements MigrationInterface {
  name = 'CreateFirstChipsIpClaims1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "first_chips_ip_claims" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ipAddress" character varying(64) NOT NULL,
        "userId" uuid NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_first_chips_ip_claims" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_first_chips_ip_claims_ip" UNIQUE ("ipAddress")
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "first_chips_ip_claims"
          ADD CONSTRAINT "FK_first_chips_ip_claims_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "first_chips_ip_claims";`);
  }
}
