import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';

// Índice 0 = Día 1. Debe coincidir con las 7 imágenes del frontend (dia1.png..dia7.png, ver
// DailyBonusModal) tanto en cantidad como en orden.
export const DAILY_BONUS_AMOUNTS = [2500, 5000, 10000, 15000, 25000, 35000, 50000];
const CYCLE_LENGTH = DAILY_BONUS_AMOUNTS.length;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isSameUtcDay(date: Date): boolean {
  return date.toISOString().slice(0, 10) === todayUtc();
}

function isYesterdayUtc(date: Date): boolean {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

function nextUtcMidnight(): string {
  return new Date(new Date(`${todayUtc()}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Día del ciclo (1-7) que corresponde HOY, y si todavía hay que otorgarlo o ya se reclamó.
 * - Nunca reclamó (lastClaimAt null) -> día 1, se puede reclamar.
 * - Ya reclamó hoy -> mismo `streak` de siempre (lo que ya tiene), no se puede reclamar de nuevo.
 * - Reclamó ayer -> avanza un día y cicla (día 7 -> vuelve a 1), se puede reclamar.
 * - Reclamó antes de ayer (se saltó un día) -> racha perdida, vuelve a día 1, se puede reclamar.
 */
function resolveDay(streak: number, lastClaimAt: Date | null): { day: number; canClaim: boolean } {
  if (!lastClaimAt) {
    return { day: 1, canClaim: true };
  }
  if (isSameUtcDay(lastClaimAt)) {
    return { day: streak || 1, canClaim: false };
  }
  if (isYesterdayUtc(lastClaimAt)) {
    return { day: (streak % CYCLE_LENGTH) + 1, canClaim: true };
  }
  return { day: 1, canClaim: true };
}

@Injectable()
export class DailyBonusService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async getStatus(
    userId: string,
  ): Promise<{ canClaim: boolean; day: number; amount: number; nextAvailableAt: string | null }> {
    const user = await this.dataSource.manager.findOne(User, { where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { day, canClaim } = resolveDay(
      user.dailyBonusStreak,
      user.dailyBonusLastClaimAt ? new Date(user.dailyBonusLastClaimAt) : null,
    );

    return {
      canClaim,
      day,
      amount: DAILY_BONUS_AMOUNTS[day - 1],
      nextAvailableAt: canClaim ? null : nextUtcMidnight(),
    };
  }

  /**
   * Recalcula la elegibilidad server-side (nunca confiar en qué día dice el cliente que le toca)
   * dentro de una transacción con lock pesimista sobre la fila del usuario — mismo patrón que
   * DailySpinService.claim, evita que un doble click / doble request acredite dos veces.
   */
  async claim(userId: string): Promise<{ day: number; amount: number; chips: number }> {
    return this.dataSource.manager.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const { day, canClaim } = resolveDay(
        user.dailyBonusStreak,
        user.dailyBonusLastClaimAt ? new Date(user.dailyBonusLastClaimAt) : null,
      );
      if (!canClaim) {
        throw new BadRequestException('Ya reclamaste tu bono de hoy');
      }

      const amount = DAILY_BONUS_AMOUNTS[day - 1];
      user.chips = (Number(user.chips) || 0) + amount;
      user.dailyBonusStreak = day;
      user.dailyBonusLastClaimAt = new Date();
      await manager.save(user);

      await manager.save(
        ChipsAward,
        manager.create(ChipsAward, { userId, amount, source: 'daily_bonus' }),
      );

      return { day, amount, chips: user.chips };
    });
  }
}
