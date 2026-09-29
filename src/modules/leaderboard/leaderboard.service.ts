import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChipsAward } from '../chips/entities/chips-award.entity';

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(ChipsAward)
    private chipsAwardRepository: Repository<ChipsAward>,
  ) {}

  /**
   * Top players by chips actually won in the games (source='game'), not deposits or
   * admin-granted chips. Only reflects awards logged since the chips_awards ledger was
   * introduced — there's no historical record from before that.
   */
  async getTopWinners(limit = 10) {
    return this.chipsAwardRepository.query(
      `
      SELECT u.id, u.nick, u.rank, SUM(ca.amount)::bigint AS "totalWon"
      FROM chips_awards ca
      JOIN users u ON u.id = ca."userId"
      WHERE ca.source = 'game'
      GROUP BY u.id, u.nick, u.rank
      ORDER BY "totalWon" DESC
      LIMIT $1;
      `,
      [limit],
    );
  }

  /**
   * Same idea as getTopWinners but scoped to a single game (see game-origins.ts for how the
   * game gets tagged on each award). Only awards logged after the `game` column was added
   * carry this tag, so per-game rankings start from that point, not from the game's launch.
   */
  async getTopWinnersByGame(gameSlug: string, limit = 10) {
    return this.chipsAwardRepository.query(
      `
      SELECT u.id, u.nick, u.rank, SUM(ca.amount)::bigint AS "totalWon"
      FROM chips_awards ca
      JOIN users u ON u.id = ca."userId"
      WHERE ca.source = 'game' AND ca.game = $2
      GROUP BY u.id, u.nick, u.rank
      ORDER BY "totalWon" DESC
      LIMIT $1;
      `,
      [limit, gameSlug],
    );
  }

  /**
   * Top players by chips won in a rolling window (last 7 or 30 days), for the lobby's
   * ranking panel (weekly/monthly tabs). Rolling window, not calendar week/month, to keep
   * the query simple — "last 7 days" rather than "this ISO week".
   *
   * `chips` comes back from Postgres as a string for SUM(...)::bigint (pg doesn't parse
   * int8 to a JS number by default), so it's explicitly converted here — otherwise it'd
   * reach clients as a quoted JSON string instead of a number.
   */
  async getTopWinnersByPeriod(period: 'weekly' | 'monthly', limit = 10) {
    const since = new Date();
    since.setDate(since.getDate() - (period === 'weekly' ? 7 : 30));

    const rows = await this.chipsAwardRepository.query(
      `
      SELECT u.id AS "userId", u.nick, SUM(ca.amount)::bigint AS "chips"
      FROM chips_awards ca
      JOIN users u ON u.id = ca."userId"
      WHERE ca.source = 'game' AND ca."createdAt" >= $2
      GROUP BY u.id, u.nick
      ORDER BY SUM(ca.amount) DESC
      LIMIT $1;
      `,
      [limit, since],
    );

    return rows.map((row: any, index: number) => ({
      userId: row.userId,
      nick: row.nick,
      chips: Number(row.chips),
      position: index + 1,
    }));
  }

  /**
   * Individual recent wins (not aggregated per player) for the public "live winners" ticker
   * on the guest landing page. `game` is the slug from gamesCatalog.js — the frontend resolves
   * it to a display name.
   */
  async getRecentWins(limit = 10) {
    return this.chipsAwardRepository.query(
      `
      SELECT ca.id, u.nick, ca.amount, ca.game, ca."createdAt"
      FROM chips_awards ca
      JOIN users u ON u.id = ca."userId"
      WHERE ca.source = 'game' AND ca.amount > 0
      ORDER BY ca."createdAt" DESC
      LIMIT $1;
      `,
      [limit],
    );
  }
}
