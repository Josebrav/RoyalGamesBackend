import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { SantaWildsRound, SantaWildsCell } from './entities/santawilds-round.entity';
import { SantaWildsJackpotProgress } from './entities/jackpot-progress.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { JACKPOT_COUNTER_TARGET, STICKY_WILD_FREE_SPINS, MIN_STICKY_WILDS_PER_BONUS } from './constants/slot.constants';
import { freshGrid, rollRemaining, ensureMinimumSticky, evalGrid, WinLine } from './slot-engine';
import { pickRoundForSpin, pickRoundToResume } from '../../common/utils/slot-round-ownership';

export interface SpinResult {
  phase: 'no_win' | 'win' | 'bonus_triggered' | 'bonus_spin' | 'bonus_complete';
  cells: SantaWildsCell[];
  chips: number;
  prize?: number;
  jackpotProgress?: number;
  jackpotTarget?: number;
  freeSpinsRemaining?: number;
  winCoords?: WinLine[];
}

// Redondea igual que el cliente viejo (SlotGridManager.ProcessResults): primero el multiplicador
// total a 4 decimales (evita artefactos de punto flotante al sumar varias líneas), después el
// producto final contra la apuesta.
function prizeFor(totalMultiples: number, betAmount: number): number {
  const rounded = Math.round(totalMultiples * 10000) / 10000;
  return Math.round(rounded * betAmount);
}

@Injectable()
export class SantaWildsSlotService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Punto de entrada único: si ESTA pestaña (clientToken) tiene un bono activo, esta tirada lo
   * CONTINÚA (ignora betAmount, ya se descontó al arrancar el bono). Si no, es una tirada base
   * nueva y betAmount es obligatorio - aunque otra pestaña del mismo jugador esté en pleno bono,
   * que sigue intacto para ella. El resultado (grilla, fase, premio) lo decide siempre el
   * servidor - el cliente solo anima lo que esta respuesta le devuelve.
   */
  async spin(userId: string, betAmount?: number, clientToken?: string, bonusSpin?: boolean): Promise<SpinResult> {
    return this.dataSource.transaction(async (manager) => {
      const activeRound = pickRoundForSpin(await this.lockActiveRounds(manager, userId), clientToken);

      if (activeRound) {
        return this.continueBonus(manager, activeRound);
      }

      // La pestaña cree estar en pleno bono pero ya no es suya (otra lo retomó tras dejarla
      // abandonada, ver pickRoundToResume): no se cobra como tirada base - el juego sale del bono.
      if (bonusSpin) {
        throw new ConflictException('This window no longer owns an active bonus');
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

      const cells = freshGrid();
      const { totalMultiples, jackpotCount, winCoords } = evalGrid(cells);

      // Contador de JACKPOT por tier de apuesta, bloqueado+leído/creado en ESTA MISMA
      // transacción: dos tiradas concurrentes del mismo jugador (dos pestañas, doble click) no
      // pueden pisarse el conteo ni completar el bono dos veces - esto es lo que cierra el hueco
      // de seguridad original (antes el conteo vivía en el cliente).
      let progressRow = await manager
        .createQueryBuilder(SantaWildsJackpotProgress, 'p')
        .setLock('pessimistic_write')
        .where('p.userId = :userId', { userId })
        .andWhere('p.betAmount = :betAmount', { betAmount })
        .getOne();

      if (!progressRow) {
        progressRow = manager.create(SantaWildsJackpotProgress, { userId, betAmount, progress: 0 });
      }

      let progress = progressRow.progress + jackpotCount;
      const bonusTriggered = progress >= JACKPOT_COUNTER_TARGET;
      if (bonusTriggered) progress = 0;

      progressRow.progress = progress;
      await manager.save(progressRow);

      // Premio de línea de ESTA tirada (si lo hay) se acredita siempre, dispare o no el bono -
      // un jugador que completa el contador Y tiene una línea ganadora en la misma tirada cobra
      // las dos cosas, nunca pierde el premio de línea por pasar al bono.
      let prize: number | undefined;
      if (totalMultiples > 0) {
        prize = prizeFor(totalMultiples, betAmount);
        user.chips = Number(user.chips) + prize;
        await manager.save(user);
        await manager.save(
          manager.create(ChipsAward, { userId, amount: prize, source: 'game', game: 'santawilds' }),
        );
      }

      if (bonusTriggered) {
        const round = manager.create(SantaWildsRound, {
          userId,
          betAmount,
          cells,
          freeSpinsRemaining: STICKY_WILD_FREE_SPINS,
          status: 'active',
          ownerToken: clientToken || null,
          lastSpinAt: new Date(),
        });
        await manager.save(round);

        return {
          phase: 'bonus_triggered',
          cells,
          chips: Number(user.chips),
          prize,
          jackpotProgress: 0,
          jackpotTarget: JACKPOT_COUNTER_TARGET,
          freeSpinsRemaining: round.freeSpinsRemaining,
          winCoords,
        };
      }

      return {
        phase: prize ? 'win' : 'no_win',
        cells,
        chips: Number(user.chips),
        prize,
        jackpotProgress: progress,
        jackpotTarget: JACKPOT_COUNTER_TARGET,
        winCoords,
      };
    });
  }

  /**
   * Llamado por el juego al cargar: si esta pestaña tiene un bono a medias (recargó la página) o
   * hay uno abandonado por otra pestaña hace rato, lo reclama para esta pestaña y devuelve su
   * estado para entrar directo al modo bono. Nunca toma un bono que otra pestaña está jugando.
   */
  async resume(userId: string, clientToken: string): Promise<{ active: false } | ({ active: true } & SpinResult)> {
    return this.dataSource.transaction(async (manager) => {
      const round = pickRoundToResume(await this.lockActiveRounds(manager, userId), clientToken);
      if (!round) return { active: false };

      round.ownerToken = clientToken;
      round.lastSpinAt = new Date();
      await manager.save(round);

      const user = await manager.findOne(User, { where: { id: userId } });
      return {
        active: true,
        phase: 'bonus_spin',
        cells: round.cells,
        chips: Number(user?.chips ?? 0),
        freeSpinsRemaining: round.freeSpinsRemaining,
        winCoords: [],
      };
    });
  }

  private lockActiveRounds(manager: EntityManager, userId: string): Promise<SantaWildsRound[]> {
    return manager
      .createQueryBuilder(SantaWildsRound, 'r')
      .setLock('pessimistic_write')
      .where('r.userId = :userId', { userId })
      .andWhere("r.status = 'active'")
      .getMany();
  }

  private async continueBonus(manager: EntityManager, round: SantaWildsRound): Promise<SpinResult> {
    const spinNumber = STICKY_WILD_FREE_SPINS - round.freeSpinsRemaining + 1;
    const cells = ensureMinimumSticky(
      rollRemaining(round.cells),
      spinNumber,
      STICKY_WILD_FREE_SPINS,
      MIN_STICKY_WILDS_PER_BONUS,
    );
    const { totalMultiples, winCoords } = evalGrid(cells);

    round.cells = cells;
    round.freeSpinsRemaining -= 1;
    round.lastSpinAt = new Date();

    const user = await manager
      .createQueryBuilder(User, 'u')
      .setLock('pessimistic_write')
      .where('u.id = :id', { id: round.userId })
      .getOne();

    // El premio de CADA tirada gratis se acredita ya mismo, no en un pago único al terminar el
    // bono - así, si se corta la conexión a mitad del bono, lo ya ganado no queda flotando sin
    // cobrar (solo recuperable mientras el round siga vivo).
    let prize: number | undefined;
    if (totalMultiples > 0 && user) {
      prize = prizeFor(totalMultiples, Number(round.betAmount));
      user.chips = Number(user.chips) + prize;
      await manager.save(user);
      await manager.save(
        manager.create(ChipsAward, { userId: round.userId, amount: prize, source: 'game', game: 'santawilds' }),
      );
    }

    if (round.freeSpinsRemaining <= 0) {
      round.status = 'completed';
      round.resolvedAt = new Date();
      await manager.save(round);

      return {
        phase: 'bonus_complete',
        cells,
        chips: Number(user?.chips ?? 0),
        prize,
        freeSpinsRemaining: 0,
        winCoords,
      };
    }

    await manager.save(round);

    return {
      phase: 'bonus_spin',
      cells,
      chips: Number(user?.chips ?? 0),
      prize,
      freeSpinsRemaining: round.freeSpinsRemaining,
      winCoords,
    };
  }
}
