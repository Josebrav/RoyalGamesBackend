import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * bingo_audit.entityId es polimórfico a propósito (entityType dice qué tabla referencia:
 * 'bingo_room', 'bingo_game', etc. - ver BingoService.createAudit) y la migración original
 * (CreateBingoEntities) lo crea como un UUID simple sin ninguna foreign key. Pero
 * BingoAudit.game (@ManyToOne a BingoGame con @JoinColumn en entityId) hizo que en algún deploy
 * pasado el fallback a dataSource.synchronize() de main.ts (mismo patrón que
 * FixBingoRoomBotsRoomIdNullable1790500000000 y AddGoogleIdToUsers1783467622917) agregara una
 * foreign key real entityId -> bingo_games.id en producción, algo que la entidad nunca debió
 * generar como constraint de base de datos.
 *
 * Resultado: CUALQUIER auditoría cuyo entityId no sea un bingo_games.id real (ej. 'gift_cards'
 * con entityId = roomId, ver BingoService.giftCardsTransaction) rompe con
 * "violates foreign key constraint" - y como createAudit corre dentro de la misma transacción
 * que el regalo, el regalo entero se revierte. Esto es lo que hacía fallar "regalar cartones"
 * en producción con un error que no tenía nada que ver con el saldo del jugador.
 */
export class DropBingoAuditGameForeignKey1791000000000 implements MigrationInterface {
  name = 'DropBingoAuditGameForeignKey1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const constraints: Array<{ conname: string }> = await queryRunner.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = '"bingo_audit"'::regclass AND contype = 'f'
    `);
    for (const { conname } of constraints) {
      await queryRunner.query(`ALTER TABLE "bingo_audit" DROP CONSTRAINT "${conname}"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Deliberately not restored - this FK never belonged here (see comment above).
  }
}
