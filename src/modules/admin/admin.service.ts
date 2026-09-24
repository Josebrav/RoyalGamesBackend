import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Pay } from '../payments/entities/pay.entity';
import { Role } from '../../common/enums/role.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { ChipsService } from '../chips/chips.service';
import { MinesService } from '../mines/mines.service';
import { BingoService } from '../bingo/bingo.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Pay)
    private paysRepository: Repository<Pay>,
    private chipsService: ChipsService,
    private minesService: MinesService,
    private bingoService: BingoService,
  ) {}

  async getOverview(callerRole?: Role) {
    const [
      totalUsers,
      bannedUsers,
      inactiveUsers,
      adminCount,
      modCount,
      onlineResult,
      circulationResult,
      depositedResult,
      todayResult,
      signupsTodayResult,
      topByChips,
      recentPayments,
    ] = await Promise.all([
      this.usersRepository.count({ where: { isBot: false } }),
      this.usersRepository.count({ where: { banned: true } }),
      this.usersRepository.count({ where: { inactive: true } }),
      this.usersRepository.count({ where: { role: Role.ADMIN } }),
      this.usersRepository.count({ where: { role: Role.MOD } }),
      this.usersRepository.query(
        `SELECT COUNT(*)::int AS count FROM users WHERE "lastSeen" > now() - interval '5 minutes' AND "isBot" = false`,
      ),
      // Excluye fichas de bots (BingoBotService las recarga gratis - no son parte real de la
      // economía) para que este total no quede inflado artificialmente.
      this.usersRepository.query(`SELECT COALESCE(SUM(chips), 0)::bigint AS total FROM users WHERE "isBot" = false`),
      this.paysRepository.query(
        `SELECT COALESCE(SUM(chips), 0)::bigint AS total FROM pays WHERE status = $1`,
        [PaymentStatus.APPROVED],
      ),
      this.paysRepository.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(chips), 0)::bigint AS chips
         FROM pays WHERE status = $1 AND "createdAt" >= date_trunc('day', now())`,
        [PaymentStatus.APPROVED],
      ),
      this.usersRepository.query(
        `SELECT COUNT(*)::int AS count FROM users WHERE "createdAt" >= date_trunc('day', now()) AND "isBot" = false`,
      ),
      this.usersRepository.query(
        `SELECT id, nick, chips, rank FROM users WHERE "isBot" = false ORDER BY chips DESC LIMIT 10`,
      ),
      this.paysRepository.query(
        `SELECT u.nick AS nick, p.chips AS chips, p.price AS price, p."paymentPlatform" AS "paymentPlatform", p."createdAt" AS "createdAt"
         FROM pays p
         JOIN users u ON u.id = p."userId"
         WHERE p.status = $1
         ORDER BY p."createdAt" DESC
         LIMIT 10`,
        [PaymentStatus.APPROVED],
      ),
    ]);

    const overview = {
      totalUsers,
      bannedUsers,
      inactiveUsers,
      adminCount,
      modCount,
      onlineUsers: Number(onlineResult?.[0]?.count ?? 0),
      totalChipsInCirculation: Number(circulationResult?.[0]?.total ?? 0),
      totalChipsDeposited: Number(depositedResult?.[0]?.total ?? 0),
      depositsTodayCount: Number(todayResult?.[0]?.count ?? 0),
      depositsTodayChips: Number(todayResult?.[0]?.chips ?? 0),
      newSignupsToday: Number(signupsTodayResult?.[0]?.count ?? 0),
      topByChips,
      recentPayments,
    };

    // Mods get full operational visibility (users, online, signups, top players) but not
    // platform-wide money figures — those stay admin-only per the owner's explicit request.
    if (callerRole === Role.MOD) {
      const { totalChipsInCirculation, totalChipsDeposited, depositsTodayChips, recentPayments: _rp, ...modSafe } = overview;
      return modSafe;
    }

    return overview;
  }

  /**
   * Cheap, count-only activity snapshot for a single user — drives the collapsed accordion
   * headers in the admin/mod "Actividad" view without paying for full row lists up front.
   */
  async getUserActivitySummary(userId: string) {
    const [chipsHistory, minesActivity, bingoActivity, paymentsCount] = await Promise.all([
      this.chipsService.getHistory(userId),
      this.minesService.getUserActivity(userId),
      this.bingoService.getUserBingoActivity(userId),
      this.paysRepository.count({ where: { userId } }),
    ]);

    return {
      chipsMovements: chipsHistory.length,
      mines: minesActivity.summary,
      bingo: bingoActivity.summary,
      paymentsCount,
    };
  }

  /**
   * What a given mod personally did: chip grants/removals from the admin panel, chips they
   * gifted themselves as a player, and bingo cards they gifted — for the admin-only audit view.
   */
  async getModAudit(modId: string) {
    const [panelGrants, selfGifts, cardGifts] = await Promise.all([
      this.chipsService.getAwardsPerformedBy(modId),
      this.chipsService.getOutgoingGifts(modId),
      this.bingoService.getAuditsByPerformer(modId, 'gift_cards'),
    ]);

    return { panelGrants, selfGifts, cardGifts };
  }

  /**
   * Referral tracking for the admin: who referred whom, and whether/how much the referred
   * user has deposited so far. Rewards to the referrer are NOT automatic (could be a real
   * payment for an employee, etc.) — this is purely the record an admin needs to decide and
   * pay them manually.
   */
  async getReferrals() {
    return this.usersRepository.query(`
      SELECT
        ref.nick AS "referrerNick",
        ref."referralCode" AS "referrerCode",
        u.id AS "referredId",
        u.nick AS "referredNick",
        u."createdAt" AS "referredSignupAt",
        first_dep."createdAt" AS "firstDepositAt",
        first_dep.chips AS "firstDepositChips"
      FROM users u
      JOIN users ref ON ref.id = u."referredBy"
      LEFT JOIN LATERAL (
        SELECT p.chips, p."createdAt"
        FROM pays p
        WHERE p."userId" = u.id AND p.status = 'approved'
        ORDER BY p."createdAt" ASC
        LIMIT 1
      ) first_dep ON true
      ORDER BY u."createdAt" DESC
    `);
  }

  /** Full deposit log for the admin panel: every payment record, any status, all users. */
  async getDeposits(limit = 200) {
    return this.paysRepository.query(
      `
      SELECT p.id, u.nick AS "userNick", p."userId", p.price, p.chips, p."paymentPlatform",
             p.status, p."createdAt"
      FROM pays p
      JOIN users u ON u.id = p."userId"
      ORDER BY p."createdAt" DESC
      LIMIT $1
      `,
      [limit],
    );
  }
}
