import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { RoyalJokerRound } from './entities/royaljoker-round.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { BONUS_CARDS, BONUS_PICKS } from './constants/slot.constants';
import {
  evalGrid,
  freeSpinsFor,
  generateGrid,
  prizeFor,
  shuffledBonusCards,
  WinLine,
} from './slot-engine';

const GAME_SLUG = 'royal-joker';

export type RoyalJokerPhase =
  | 'no_win'
  | 'win'
  | 'bonus_triggered'
  | 'free_spins_triggered'
  | 'free_spin'
  | 'free_spins_complete';

// Todos los campos siempre presentes (con 0/false/[] cuando no aplican): el cliente es Unity
// con JsonUtility, que no distingue "ausente" de "default".
export interface RoyalJokerSpinResult {
  phase: RoyalJokerPhase;
  cells: string[];
  chips: number;
  prize: number;
  winCoords: WinLine[];
  bonusCount: number;
  freeCount: number;
  bonusTriggered: boolean;
  freeSpinsAwarded: number;
  freeSpinsTotal: number;
  freeSpinsRemaining: number;
  freeSpinsPlayed: number;
  freeSpinsWinnings: number;
}

export interface RoyalJokerCardPick {
  index: number;
  value: number;
}

export interface RoyalJokerState {
  active: boolean;
  chips: number;
  betAmount: number;
  bonusPending: boolean;
  bonusPicks: RoyalJokerCardPick[];
  bonusCardCount: number;
  bonusPicksRequired: number;
  freeSpinsTotal: number;
  freeSpinsRemaining: number;
  freeSpinsPlayed: number;
  freeSpinsWinnings: number;
  lastCells: string[];
}

export interface RoyalJokerPickResult {
  cardIndex: number;
  value: number;
  picks: RoyalJokerCardPick[];
  finished: boolean;
  cards: number[];
  totalMultiplier: number;
  prize: number;
  chips: number;
  freeSpinsTotal: number;
  freeSpinsRemaining: number;
}

@Injectable()
export class RoyalJokerSlotService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Punto único de tirada. Si el jugador tiene tiradas gratis en curso, esta tirada es la
   * siguiente tirada gratis (betAmount se ignora). Si no, es una tirada base nueva: se cobra
   * betAmount, se paga la línea y, si salen 3+ BONUS/FREE, se crea la ronda pendiente. El
   * resultado lo decide siempre el servidor - el cliente solo anima esta respuesta.
   */
  async spin(
    userId: string,
    clientToken: string,
    betAmount?: number,
  ): Promise<RoyalJokerSpinResult> {
    return this.dataSource.transaction(async (manager) => {
      const round = await this.lockActiveRound(manager, userId);

      if (round) {
        this.assertOwner(round, clientToken);
        if (round.bonusPending) {
          throw new BadRequestException('Bonus pending: play the bonus before spinning');
        }
        if (round.freeSpinsRemaining > 0) {
          return this.playFreeSpin(manager, round);
        }
        // Ronda colgada sin nada pendiente (no debería pasar): se cierra y sigue como tirada base.
        await this.completeRound(manager, round);
      }

      if (!betAmount || betAmount <= 0) {
        throw new BadRequestException('betAmount is required to start a spin');
      }

      const user = await this.lockUser(manager, userId);
      if (Number(user.chips) < betAmount) throw new BadRequestException('Insufficient chips');
      user.chips = Number(user.chips) - betAmount;

      const cells = generateGrid(false);
      const { totalMultiples, winCoords, bonusCount, freeCount } = evalGrid(cells);

      // La línea de ESTA tirada se paga siempre, active o no un bonus/tiradas gratis.
      const prize = totalMultiples > 0 ? prizeFor(totalMultiples, betAmount) : 0;
      await this.credit(manager, user, prize);

      const bonusTriggered = bonusCount >= 3;
      const freeSpinsAwarded = freeSpinsFor(freeCount);

      if (bonusTriggered || freeSpinsAwarded > 0) {
        await manager.save(
          manager.create(RoyalJokerRound, {
            userId,
            betAmount,
            ownerToken: clientToken,
            bonusPending: bonusTriggered,
            bonusCards: bonusTriggered ? shuffledBonusCards() : [],
            bonusPicks: [],
            bonusPrize: 0,
            freeSpinsTotal: freeSpinsAwarded,
            freeSpinsRemaining: freeSpinsAwarded,
            freeSpinsPlayed: 0,
            freeSpinsWinnings: 0,
            lastCells: cells,
            status: 'active',
          }),
        );
      }

      const phase: RoyalJokerPhase = bonusTriggered
        ? 'bonus_triggered'
        : freeSpinsAwarded > 0
          ? 'free_spins_triggered'
          : prize > 0
            ? 'win'
            : 'no_win';

      return {
        phase,
        cells,
        chips: Number(user.chips),
        prize,
        winCoords,
        bonusCount,
        freeCount,
        bonusTriggered,
        freeSpinsAwarded,
        freeSpinsTotal: freeSpinsAwarded,
        freeSpinsRemaining: freeSpinsAwarded,
        freeSpinsPlayed: 0,
        freeSpinsWinnings: 0,
      };
    });
  }

  private async playFreeSpin(
    manager: EntityManager,
    round: RoyalJokerRound,
  ): Promise<RoyalJokerSpinResult> {
    const betAmount = Number(round.betAmount);
    const cells = generateGrid(true);
    const { totalMultiples, winCoords, bonusCount, freeCount } = evalGrid(cells);

    const user = await this.lockUser(manager, round.userId);
    // Cada tirada gratis se acredita ya mismo: si se corta a mitad de ronda, lo ganado no se pierde.
    const prize = totalMultiples > 0 ? prizeFor(totalMultiples, betAmount) : 0;
    await this.credit(manager, user, prize);

    round.lastCells = cells;
    round.freeSpinsRemaining -= 1;
    round.freeSpinsPlayed += 1;
    round.freeSpinsWinnings = Number(round.freeSpinsWinnings) + prize;

    const finished = round.freeSpinsRemaining <= 0;
    if (finished) await this.completeRound(manager, round);
    else await manager.save(round);

    return {
      phase: finished ? 'free_spins_complete' : 'free_spin',
      cells,
      chips: Number(user.chips),
      prize,
      winCoords,
      bonusCount,
      freeCount,
      bonusTriggered: false,
      freeSpinsAwarded: 0,
      freeSpinsTotal: round.freeSpinsTotal,
      freeSpinsRemaining: Math.max(0, round.freeSpinsRemaining),
      freeSpinsPlayed: round.freeSpinsPlayed,
      freeSpinsWinnings: Number(round.freeSpinsWinnings),
    };
  }

  /** Revela una carta del bonus. Al completar BONUS_PICKS se paga la suma x apuesta. */
  async pickBonusCard(
    userId: string,
    clientToken: string,
    cardIndex: number,
  ): Promise<RoyalJokerPickResult> {
    return this.dataSource.transaction(async (manager) => {
      const round = await this.lockActiveRound(manager, userId);
      if (!round || !round.bonusPending) throw new BadRequestException('No bonus pending');
      this.assertOwner(round, clientToken);

      const cards = round.bonusCards;
      if (cardIndex < 0 || cardIndex >= cards.length) throw new BadRequestException('Invalid card');
      if (round.bonusPicks.includes(cardIndex))
        throw new BadRequestException('Card already picked');

      round.bonusPicks = [...round.bonusPicks, cardIndex];
      const picks = this.picksWithValues(round);
      const finished = round.bonusPicks.length >= BONUS_PICKS;

      const user = await this.lockUser(manager, userId);
      let totalMultiplier = 0;
      let prize = 0;

      if (finished) {
        totalMultiplier = picks.reduce((sum, p) => sum + p.value, 0);
        prize = Number(round.betAmount) * totalMultiplier;
        await this.credit(manager, user, prize);
        round.bonusPending = false;
        round.bonusPrize = prize;
      }

      if (finished && round.freeSpinsRemaining <= 0) await this.completeRound(manager, round);
      else await manager.save(round);

      return {
        cardIndex,
        value: cards[cardIndex],
        picks,
        finished,
        cards: finished ? cards : [],
        totalMultiplier,
        prize,
        chips: Number(user.chips),
        freeSpinsTotal: round.freeSpinsTotal,
        freeSpinsRemaining: round.freeSpinsRemaining,
      };
    });
  }

  /**
   * Llamado al cargar el juego. Si hay un bonus/tiradas gratis pendientes, ESTA llamada es el
   * evento de takeover: la ventana que carga reclama la ronda (recargar siempre gana) y cualquier
   * spin/pick posterior de otra ventana recibe 409.
   */
  async getState(userId: string, clientToken: string): Promise<RoyalJokerState> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      const round = await this.lockActiveRound(manager, userId);
      if (!round) {
        return {
          active: false,
          chips: Number(user.chips),
          betAmount: 0,
          bonusPending: false,
          bonusPicks: [],
          bonusCardCount: BONUS_CARDS.length,
          bonusPicksRequired: BONUS_PICKS,
          freeSpinsTotal: 0,
          freeSpinsRemaining: 0,
          freeSpinsPlayed: 0,
          freeSpinsWinnings: 0,
          lastCells: [],
        };
      }

      round.ownerToken = clientToken;
      await manager.save(round);

      return {
        active: true,
        chips: Number(user.chips),
        betAmount: Number(round.betAmount),
        bonusPending: round.bonusPending,
        bonusPicks: this.picksWithValues(round),
        bonusCardCount: BONUS_CARDS.length,
        bonusPicksRequired: BONUS_PICKS,
        freeSpinsTotal: round.freeSpinsTotal,
        freeSpinsRemaining: round.freeSpinsRemaining,
        freeSpinsPlayed: round.freeSpinsPlayed,
        freeSpinsWinnings: Number(round.freeSpinsWinnings),
        lastCells: round.lastCells,
      };
    });
  }

  private picksWithValues(round: RoyalJokerRound): RoyalJokerCardPick[] {
    return round.bonusPicks.map((index) => ({ index, value: round.bonusCards[index] }));
  }

  private lockActiveRound(manager: EntityManager, userId: string): Promise<RoyalJokerRound | null> {
    return manager
      .createQueryBuilder(RoyalJokerRound, 'r')
      .setLock('pessimistic_write')
      .where('r.userId = :userId', { userId })
      .andWhere("r.status = 'active'")
      .getOne();
  }

  private async lockUser(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager
      .createQueryBuilder(User, 'u')
      .setLock('pessimistic_write')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private assertOwner(round: RoyalJokerRound, clientToken: string) {
    if (round.ownerToken !== clientToken) {
      throw new ConflictException('Royal Joker round was taken over by another window');
    }
  }

  /** Guarda el saldo (ya descontada la apuesta, si la hubo) y acredita el premio si es > 0. */
  private async credit(manager: EntityManager, user: User, amount: number) {
    if (amount > 0) {
      user.chips = Number(user.chips) + amount;
      await manager.save(
        manager.create(ChipsAward, { userId: user.id, amount, source: 'game', game: GAME_SLUG }),
      );
    }
    await manager.save(user);
  }

  private async completeRound(manager: EntityManager, round: RoyalJokerRound) {
    round.status = 'completed';
    round.resolvedAt = new Date();
    await manager.save(round);
  }
}
