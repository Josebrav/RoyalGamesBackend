import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GemasOfGoldRound } from './entities/gemasofgold-round.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { BASE_FREE_SPINS } from './constants/slot.constants';
import { classify, countGold, freshGrid, rollRemaining, sumMultCells } from './slot-engine';

export interface SpinResult {
  phase: 'no_win' | 'win' | 'bonus_triggered' | 'bonus_spin' | 'bonus_complete';
  cells: ReturnType<typeof freshGrid>;
  chips: number;
  prize?: number;
  totalMultiplier?: number;
  goldCount?: number;
  freeSpinsRemaining?: number;
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

      const { cells } = rollRemaining(freshGrid());
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

        return { phase: 'win', cells, chips: Number(user.chips), prize, totalMultiplier };
      }

      return { phase: 'no_win', cells, chips: Number(user.chips) };
    });
  }

  private async continueBonus(manager: any, round: GemasOfGoldRound): Promise<SpinResult> {
    const { cells, changed } = rollRemaining(round.cells);
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
