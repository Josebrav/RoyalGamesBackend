import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix #1 del plan de pasarelas de pago: la tabla `pays` no guardaba en qué
 * moneda pagó cada usuario, solo el monto (`price`). Sin esto es imposible
 * saber si un pago fue en ARS, COP, MXN o USD una vez sumemos más monedas
 * (Pix en BRL, Paysafecard en EUR, etc.).
 *
 * Columna NULLABLE a propósito: los pagos que ya existen en producción no
 * tienen esta información y no se puede reconstruir con certeza. El único
 * backfill seguro es el de PayPal, porque ese flujo siempre cobró en USD
 * (ver `createPayPalOrder`/`capturePayPalOrder` en payments.service.ts) —
 * los de MercadoPago ('mepago') se quedan en NULL en vez de adivinar.
 *
 * Correr con: npm run typeorm:migration:run
 */
export class AddCurrencyToPays1789700000000 implements MigrationInterface {
  name = 'AddCurrencyToPays1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pays" ADD COLUMN IF NOT EXISTS "currency" VARCHAR NULL;
    `);

    // Backfill seguro: todo pago histórico de PayPal fue en USD.
    await queryRunner.query(`
      UPDATE "pays" SET "currency" = 'USD'
      WHERE "paymentPlatform" = 'paypal' AND "currency" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pays" DROP COLUMN IF EXISTS "currency";`);
  }
}
