import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';

// Debe coincidir exactamente (cantidad, orden y valores) con `prizeValues`/`prizeWeights` en
// DailySpinWheel.cs (proyecto Unity RuletaDiaria) — el indice devuelto por claim() le dice a
// Unity en que sector de la rueda debe frenar, asi que si esto cambia hay que cambiar los dos
// lados a la vez.
const PRIZE_VALUES = [1000, 2000, 3000, 5000, 8000, 12000, 20000, 35000, 60000, 100000];
const PRIZE_WEIGHTS = [24, 20, 15, 12, 10, 8, 5, 3, 2, 1];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickWeightedIndex(): number {
  const total = PRIZE_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < PRIZE_WEIGHTS.length; i++) {
    r -= PRIZE_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return PRIZE_WEIGHTS.length - 1;
}

/** true si `date` cae en el mismo dia calendario UTC que ahora mismo. */
function isSameUtcDay(date: Date): boolean {
  return date.toISOString().slice(0, 10) === todayUtc();
}

function nextUtcMidnight(): string {
  return new Date(new Date(`${todayUtc()}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

@Injectable()
export class DailySpinService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async getStatus(userId: string): Promise<{ canSpin: boolean; lastSpinAt: Date | null; nextAvailableAt: string | null }> {
    const user = await this.dataSource.manager.findOne(User, { where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const canSpin = !user.lastSpinAt || !isSameUtcDay(new Date(user.lastSpinAt));
    const nextAvailableAt = canSpin ? null : nextUtcMidnight();

    return { canSpin, lastSpinAt: user.lastSpinAt, nextAvailableAt };
  }

  /**
   * Valida elegibilidad, elige el premio (server-side, para que no se pueda manipular desde el
   * cliente) y lo acredita, todo dentro de una transaccion con lock sobre la fila del usuario —
   * evita que un doble click / doble request otorgue el premio dos veces.
   */
  async claim(userId: string): Promise<{ segmentIndex: number; amount: number; chips: number }> {
    return this.dataSource.manager.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }
      if (user.lastSpinAt && isSameUtcDay(new Date(user.lastSpinAt))) {
        throw new BadRequestException('Ya reclamaste tu giro diario hoy');
      }

      const segmentIndex = pickWeightedIndex();
      const amount = PRIZE_VALUES[segmentIndex];

      user.chips = (Number(user.chips) || 0) + amount;
      user.lastSpinAt = new Date();
      await manager.save(user);

      await manager.save(
        ChipsAward,
        manager.create(ChipsAward, { userId, amount, source: 'daily_spin' }),
      );

      return { segmentIndex, amount, chips: user.chips };
    });
  }
}
