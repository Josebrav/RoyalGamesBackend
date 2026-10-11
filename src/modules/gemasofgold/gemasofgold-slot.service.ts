import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { GemasOfGoldRound, GemasOfGoldCell } from './entities/gemasofgold-round.entity';
import { GemasOfGoldJackpot } from './entities/gemasofgold-jackpot.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { BASE_FREE_SPINS, GRID_SIZE } from './constants/slot.constants';
import {
  GEMASOFGOLD_JACKPOT_CONTRIBUTION_RATE,
  GEMASOFGOLD_JACKPOT_ELIGIBILITY_WINDOW_MS,
  GEMASOFGOLD_JACKPOT_LAND_CHANCE,
  GEMASOFGOLD_JACKPOT_TIERS,
  GemasOfGoldJackpotTier,
} from './constants/jackpot.constants';
import { classify, countGold, freshGrid, rollRemaining, sumMultCells } from './slot-engine';

export interface SpinResult {
  phase: 'no_win' | 'win' | 'bonus_triggered' | 'bonus_spin' | 'bonus_complete';
  cells: ReturnType<typeof freshGrid>;
  chips: number;
  prize?: number;
  totalMultiplier?: number;
  goldCount?: number;
  freeSpinsRemaining?: number;
  jackpotTier?: GemasOfGoldJackpotTier;
  jackpotAmount?: number;
}

@Injectable()
export class GemasOfGoldSlotService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Punto de entrada único: si el jugador ya tiene un bonus activo, esta tirada CONTINÚA ese
   * bonus (ignora betAmount, ya se descontó al arrancar el bonus). Si no tiene uno activo, es
   * una tirada base nueva y betAmount es obligatorio. El resultado (grilla, fase, premio) lo
   * decide siempre el servidor - el cliente solo anima lo que esta respuesta le devuelve.
   */
  async spin(userId: string, betAmount?: number): Promise<SpinResult> {
    return this.dataSource.transaction(async (manager) => {
      const activeRound = await manager
        .createQueryBuilder(GemasOfGoldRound, 'r')
        .setLock('pessimistic_write')
        .where('r.userId = :userId', { userId })
        .andWhere("r.status = 'active'")
        .getOne();

      if (activeRound) {
        return this.continueBonus(manager, activeRound);
      }

      if (!betAmount || betAmount <= 0) {
        throw new BadRequestException('betAmount is required to start a spin');
      }

      const user = await manager
        .createQueryBuilder(User, 'u')
        .setLock('pessimistic_write')
        .where('u.id = :id', { id: userId })
        .getOne();
      if (!user) throw new NotFoundException('User not found');
      if (Number(user.chips) < betAmount) throw new BadRequestException('Insufficient chips');

      user.chips = Number(user.chips) - betAmount;
      await manager.save(user);
      await this.contributeToJackpots(manager, betAmount);

      const { cells } = rollRemaining(freshGrid());

      // La gema de jackpot (si sale) se ubica antes de evaluar la tirada: reemplaza lo que hubiera
      // en su casilla, así que puede "tapar" una gold o un multiplicador de esta misma tirada.
      const jackpot = await this.tryJackpot(manager, user, cells);
      const jackpotFields = jackpot ? { jackpotTier: jackpot.tier, jackpotAmount: jackpot.amount } : {};

      const { leftMult, rightMult, midGold } = classify(cells);

      // Bonus: las dos columnas laterales Y el medio trajeron algo en la misma tirada.
      if (midGold.length >= 1 && leftMult.length >= 1 && rightMult.length >= 1) {
        const round = manager.create(GemasOfGoldRound, {
          userId,
          betAmount,
          cells,
          freeSpinsRemaining: BASE_FREE_SPINS,
          goldCount: countGold(cells),
          status: 'active',
        });
        await manager.save(round);

        return {
          phase: 'bonus_triggered',
          cells,
          chips: Number(user.chips),
          goldCount: round.goldCount,
          freeSpinsRemaining: round.freeSpinsRemaining,
          ...jackpotFields,
        };
      }

      // Premio simple: gold + multiplicador de UN solo lado (si fuera de los dos, ya disparó el bonus arriba).
      if (midGold.length >= 1 && (leftMult.length >= 1 || rightMult.length >= 1)) {
        const totalMultiplier = sumMultCells(cells);
        const prize = betAmount * totalMultiplier;

        user.chips = Number(user.chips) + prize;
        await manager.save(user);
        await manager.save(
          manager.create(ChipsAward, { userId, amount: prize, source: 'game', game: 'gemasofgold' }),
        );

        return { phase: 'win', cells, chips: Number(user.chips), prize, totalMultiplier, ...jackpotFields };
      }

      return { phase: 'no_win', cells, chips: Number(user.chips), ...jackpotFields };
    });
  }

  /**
   * Gemas de jackpot: un pozo solo puede salir después de su ventana de espera (nextEligibleAt,
   * ver GEMASOFGOLD_JACKPOT_ELIGIBILITY_WINDOW_MS). Desde ese momento cada tirada base tiene
   * GEMASOFGOLD_JACKPOT_LAND_CHANCE de que caiga su gema en una casilla al azar de la grilla
   * (cualquier columna), pagando el pozo completo. A lo sumo un jackpot por tirada - se prueba del
   * más grande al más chico. Las filas de los pozos ya quedaron bloqueadas por el UPDATE de
   * contributeToJackpots en esta misma transacción, así que dos jugadores no pueden cobrar el
   * mismo pozo a la vez.
   */
  private async tryJackpot(
    manager: EntityManager,
    user: User,
    cells: GemasOfGoldCell[],
  ): Promise<{ tier: GemasOfGoldJackpotTier; amount: number } | null> {
    const now = new Date();
    const rows = await manager.find(GemasOfGoldJackpot);

    for (const tier of GEMASOFGOLD_JACKPOT_TIERS) {
      const row = rows.find((r) => r.tier === tier);
      if (!row || Number(row.potAmount) <= 0 || row.nextEligibleAt > now) continue;
      if (Math.random() >= GEMASOFGOLD_JACKPOT_LAND_CHANCE) continue;

      const amount = Number(row.potAmount);
      user.chips = Number(user.chips) + amount;
      await manager.save(user);
      await manager.save(
        manager.create(ChipsAward, { userId: user.id, amount, source: 'prize', game: 'gemasofgold' }),
      );

      row.potAmount = 0;
      row.nextEligibleAt = new Date(now.getTime() + GEMASOFGOLD_JACKPOT_ELIGIBILITY_WINDOW_MS[tier]);
      row.lastWinnerUserId = user.id;
      row.lastWinnerNick = user.nick ?? null;
      row.lastWonAmount = amount;
      row.lastWonAt = now;
      await manager.save(row);

      cells[Math.floor(Math.random() * GRID_SIZE)] = { symbol: tier, value: 0 };
      return { tier, amount };
    }

    return null;
  }

  // Cada tirada base suma un % de la apuesta a cada uno de los 4 pozos compartidos, en la misma
  // transacción que descuenta la apuesta (si la tirada falla, el aporte también se revierte).
  // Math.max(1, ...) igual que en Mines: con apuestas chicas el % redondearía a 0. Las tiradas
  // gratis del bonus no apuestan, así que no aportan.
  private async contributeToJackpots(manager: EntityManager, betAmount: number) {
    const amount = (tier: GemasOfGoldJackpotTier) =>
      Math.max(1, Math.round(betAmount * GEMASOFGOLD_JACKPOT_CONTRIBUTION_RATE[tier]));

    await manager.query(
      `
      UPDATE gemasofgold_jackpot
      SET "potAmount" = "potAmount" + CASE tier
        WHEN 'grand' THEN $1::bigint
        WHEN 'major' THEN $2::bigint
        WHEN 'minor' THEN $3::bigint
        WHEN 'mini' THEN $4::bigint
        ELSE 0
      END
      `,
      [amount('grand'), amount('major'), amount('minor'), amount('mini')],
    );
  }

  private async continueBonus(manager: any, round: GemasOfGoldRound): Promise<SpinResult> {
    const { cells, changed } = rollRemaining(round.cells, true);
    round.cells = cells;
    round.goldCount = countGold(cells);

    if (changed) {
      round.freeSpinsRemaining = BASE_FREE_SPINS;
    } else {
      round.freeSpinsRemaining -= 1;
    }

    // Termina solo cuando no cayó nada nuevo Y el contador llegó a 0 - si cayó algo, el `if`
    // de arriba ya lo renovó a BASE_FREE_SPINS y esta condición no se cumple.
    if (round.freeSpinsRemaining <= 0) {
      const totalMultiplier = sumMultCells(cells);
      // Pedido explícito del usuario (2026-10-09): el premio se paga UNA sola vez al terminar el
      // bonus, multiplicado por la cantidad total de gemas gold caídas (no un pago por cada una).
      const prize = Number(round.betAmount) * totalMultiplier * round.goldCount;

      const user = await manager
        .createQueryBuilder(User, 'u')
        .setLock('pessimistic_write')
        .where('u.id = :id', { id: round.userId })
        .getOne();
      if (user) {
        user.chips = Number(user.chips) + prize;
        await manager.save(user);
      }
      await manager.save(
        manager.create(ChipsAward, {
          userId: round.userId,
          amount: prize,
          source: 'game',
          game: 'gemasofgold',
        }),
      );

      round.status = 'completed';
      round.resolvedAt = new Date();
      await manager.save(round);

      return {
        phase: 'bonus_complete',
        cells,
        chips: Number(user?.chips ?? 0),
        prize,
        totalMultiplier,
        goldCount: round.goldCount,
        freeSpinsRemaining: 0,
      };
    }

    await manager.save(round);
    const user = await manager.findOne(User, { where: { id: round.userId } });

    return {
      phase: 'bonus_spin',
      cells,
      chips: Number(user?.chips ?? 0),
      goldCount: round.goldCount,
      freeSpinsRemaining: round.freeSpinsRemaining,
    };
  }
}
