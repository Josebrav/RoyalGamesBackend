import { MigrationInterface, QueryRunner } from 'typeorm';

// IDs fijos por nivel (ver gemasofgold/constants/jackpot.constants.ts) - evita un find-or-create
// bajo race, mismo truco que MINES_JACKPOT_ID. "hours" es el punto medio de la ventana pedida por
// el usuario (mini ~1h, minor ~2-3h, major ~4-5h, grand ~6-7h) para sembrar nextEligibleAt inicial.
const JACKPOT_SEED: { id: string; tier: string; hours: number }[] = [
  { id: '22222222-2222-2222-2222-222222222221', tier: 'grand', hours: 6.5 },
  { id: '22222222-2222-2222-2222-222222222222', tier: 'major', hours: 4.5 },
  { id: '22222222-2222-2222-2222-222222222223', tier: 'minor', hours: 2.5 },
  { id: '22222222-2222-2222-2222-222222222224', tier: 'mini', hours: 1 },
];

export class CreateGemasOfGoldJackpot1791800000000 implements MigrationInterface {
  name = 'CreateGemasOfGoldJackpot1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TIMESTAMPTZ desde el día uno - mines_jackpot necesitó una migración de fix aparte
    // (1786900030000) por haber arrancado con TIMESTAMP a secas; no repetir ese bug acá.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gemasofgold_jackpot" (
        "id" UUID PRIMARY KEY,
        "tier" VARCHAR(10) NOT NULL,
        "potAmount" BIGINT NOT NULL DEFAULT 0,
        "nextEligibleAt" TIMESTAMPTZ NOT NULL,
        "lastWinnerUserId" UUID,
        "lastWinnerNick" VARCHAR(30),
        "lastWonAmount" BIGINT,
        "lastWonAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    for (const { id, tier, hours } of JACKPOT_SEED) {
      await queryRunner.query(
        `
        INSERT INTO "gemasofgold_jackpot" ("id", "tier", "potAmount", "nextEligibleAt")
        VALUES ($1, $2, 0, now() + ($3 || ' hours')::interval)
        ON CONFLICT ("id") DO NOTHING;
        `,
        [id, tier, hours],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gemasofgold_jackpot";`);
  }
}
