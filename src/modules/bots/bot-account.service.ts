import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

/**
 * Recarga de fichas gratis compartida por cualquier bot que juegue en cualquier juego (Bingo,
 * Minas, los de Unity) — antes vivía solo dentro de BingoBotService, extraída acá para que los
 * bots de otros juegos usen exactamente la misma lógica en vez de reimplementarla.
 */
@Injectable()
export class BotAccountService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  /** Si el saldo del bot cayó debajo de `threshold`, lo recarga a `amount`. Devuelve true si recargó. */
  async ensureChips(userId: string, threshold: number, amount: number): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return false;
    }
    if (Number(user.chips) < threshold) {
      await this.userRepository.update(userId, { chips: amount as any });
      return true;
    }
    return false;
  }
}
