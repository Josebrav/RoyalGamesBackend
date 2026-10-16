import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SantaWildsJackpotProgress } from './entities/jackpot-progress.entity';
import { SantaWildsPlayerSettings } from './entities/player-settings.entity';
import { SetJackpotProgressDto } from './dtos/set-jackpot-progress.dto';
import { SetLastBetDto } from './dtos/set-last-bet.dto';

@Injectable()
export class SantaWildsService {
  constructor(
    @InjectRepository(SantaWildsJackpotProgress)
    private readonly jackpotProgressRepository: Repository<SantaWildsJackpotProgress>,
    @InjectRepository(SantaWildsPlayerSettings)
    private readonly playerSettingsRepository: Repository<SantaWildsPlayerSettings>,
  ) {}

  /** Todos los contadores de JACKPOT de este jugador, uno por precio de apuesta. */
  async getJackpotProgress(userId: string): Promise<{ betAmount: number; progress: number }[]> {
    const rows = await this.jackpotProgressRepository.find({ where: { userId } });
    return rows.map((row) => ({ betAmount: Number(row.betAmount), progress: row.progress }));
  }

  /** El cliente manda el valor absoluto ya calculado (no un delta) - upsert simple sobre el par
   *  (userId, betAmount) único. Se llama cada vez que cambia el progreso de ese tier: al caer un
   *  símbolo JACKPOT, o al resetear a 0 cuando se completa el bonus. */
  async setJackpotProgress(dto: SetJackpotProgressDto): Promise<{ betAmount: number; progress: number }> {
    const existing = await this.jackpotProgressRepository.findOne({
      where: { userId: dto.userId, betAmount: dto.betAmount },
    });

    if (existing) {
      existing.progress = dto.progress;
      await this.jackpotProgressRepository.save(existing);
    } else {
      const created = this.jackpotProgressRepository.create({
        userId: dto.userId,
        betAmount: dto.betAmount,
        progress: dto.progress,
      });
      await this.jackpotProgressRepository.save(created);
    }

    return { betAmount: dto.betAmount, progress: dto.progress };
  }

  /** Última apuesta elegida por el jugador, o null si nunca jugó (cliente usa su fallback
   *  basado en saldo solo en ese caso - ver ChipManager.Start). */
  async getLastBet(userId: string): Promise<{ betAmount: number } | null> {
    const row = await this.playerSettingsRepository.findOne({ where: { userId } });
    return row ? { betAmount: Number(row.lastBetAmount) } : null;
  }

  async setLastBet(dto: SetLastBetDto): Promise<{ betAmount: number }> {
    const existing = await this.playerSettingsRepository.findOne({ where: { userId: dto.userId } });

    if (existing) {
      existing.lastBetAmount = dto.betAmount;
      await this.playerSettingsRepository.save(existing);
    } else {
      const created = this.playerSettingsRepository.create({
        userId: dto.userId,
        lastBetAmount: dto.betAmount,
      });
      await this.playerSettingsRepository.save(created);
    }

    return { betAmount: dto.betAmount };
  }
}
