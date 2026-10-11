import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GemasOfGoldJackpot } from './entities/gemasofgold-jackpot.entity';
import { GEMASOFGOLD_JACKPOT_TIERS } from './constants/jackpot.constants';

@Injectable()
export class GemasOfGoldService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /** Pozos actuales de los 4 niveles, para el panel Grand/Major/Minor/Mini que muestra JackpotManager.cs. */
  async getJackpotStatus() {
    const rows = await this.dataSource.manager.find(GemasOfGoldJackpot);
    const byTier = new Map(rows.map((r) => [r.tier, r]));
    const now = new Date();

    const result: Record<string, { potAmount: number; nextEligibleAt: Date | null; eligible: boolean }> = {};
    for (const tier of GEMASOFGOLD_JACKPOT_TIERS) {
      const row = byTier.get(tier);
      result[tier] = {
        potAmount: row ? Number(row.potAmount) : 0,
        nextEligibleAt: row?.nextEligibleAt ?? null,
        eligible: !!row && row.nextEligibleAt <= now,
      };
    }

    return {
      grand: result.grand.potAmount,
      major: result.major.potAmount,
      minor: result.minor.potAmount,
      mini: result.mini.potAmount,
      detail: result,
    };
  }
}
