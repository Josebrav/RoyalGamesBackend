import { Injectable } from '@nestjs/common';
import { Repository, Raw } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private repository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  // avatarBin/avatarThumbBin son select:false (ver user.entity.ts) para no traerlos en cada
  // findById normal; este método los pide explícitamente para los endpoints que sirven la
  // imagen/thumbnail.
  async findByIdWithAvatarBinary(id: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect(['user.avatarBin', 'user.avatarThumbBin'])
      .where('user.id = :id', { id })
      .getOne();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  async findByNick(nick: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        nick: Raw((alias) => `LOWER(${alias}) = LOWER(:nick)`, { nick }),
      },
    });
  }

  async findByReferralCode(code: string): Promise<User | null> {
    return this.repository.findOne({ where: { referralCode: code } });
  }

  async findAll(): Promise<User[]> {
    return this.repository.find();
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async updateLastSeen(id: string, currentActivity?: string | null): Promise<void> {
    await this.repository.query(
      `UPDATE users SET "lastSeen" = now(), "currentActivity" = $2 WHERE id = $1`,
      [id, currentActivity ?? null],
    );
  }

  /** Users active in the last 5 minutes, most recent first. */
  async findOnline(limit = 20): Promise<Array<Pick<User, 'id' | 'nick' | 'rank' | 'currentActivity'>>> {
    return this.repository.query(
      `SELECT id, nick, rank, "currentActivity"
       FROM users
       WHERE "lastSeen" > now() - interval '5 minutes'
       ORDER BY "lastSeen" DESC
       LIMIT $1`,
      [limit],
    );
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.repository.create(userData);
    return this.repository.save(user);
  }

  async update(id: string, updateData: Partial<User>): Promise<User | null> {
    await this.repository.update(id, updateData);
    return this.findById(id);
  }

  async updateAvatar(
    id: string,
    buffer?: Buffer,
    mime?: string,
    avatarData?: any,
    thumbBuffer?: Buffer,
    thumbMime?: string,
  ): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;
    if (buffer !== undefined) user.avatarBin = buffer;
    if (mime !== undefined) user.avatarMime = mime;
    if (avatarData !== undefined) user.avatarData = avatarData;
    if (thumbBuffer !== undefined) user.avatarThumbBin = thumbBuffer;
    if (thumbMime !== undefined) user.avatarThumbMime = thumbMime;
    console.log('Repository updateAvatar', {
      id,
      hasBuffer: !!buffer,
      mime,
      hasAvatarData: avatarData !== undefined,
      hasThumbBuffer: !!thumbBuffer,
    });
    return this.repository.save(user);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async findWithGames(id: string): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['games'],
    });
  }

  async findWithPayments(id: string): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['payments'],
    });
  }

  /** Straight atomic increment, used for the one-time referral signup bonus. */
  async addChipsAtomic(userId: string, amount: number): Promise<User | null> {
    const result = await this.repository.query(
      `UPDATE users SET chips = chips + $1 WHERE id = $2 RETURNING *`,
      [amount, userId],
    );
    let row: any = null;
    if (Array.isArray(result)) {
      if (Array.isArray(result[0]) && result[0].length > 0) {
        row = result[0][0];
      } else if (result.length > 0 && typeof result[0] === 'object' && !Array.isArray(result[0]) && Object.keys(result[0]).length > 0) {
        row = result[0];
      }
    }
    return (row && row.id) ? (row as User) : null;
  }

  /**
   * Atomically grants first chips only if:
   * 1. The user hasn't received them yet
   * 2. Less than 100 users have received first chips
   * 3. That IP hasn't already claimed this bonus on a different account (see
   *    first_chips_ip_claims — UNIQUE on ipAddress makes this the actual race-safe guard, the
   *    slot-count check above just gates whether the claim insert is even attempted)
   * A null ipAddress (should basically never happen - every real request has a socket
   * remoteAddress) fails closed: no claim row, no chips, rather than let an untraceable request
   * bypass the per-IP limit. Returns the updated user or null if the row wasn't updated.
   */
  async giveFirstChipsAtomic(userId: string, amount: number, ipAddress: string | null): Promise<User | null> {
    const result = await this.repository.query(
      `WITH claim AS (
         INSERT INTO first_chips_ip_claims ("ipAddress", "userId")
         SELECT $3::varchar, $2
         WHERE $3::varchar IS NOT NULL
           AND (SELECT COUNT(*) FROM users WHERE "firstChips" = true) < 100
         ON CONFLICT ("ipAddress") DO NOTHING
         RETURNING 1
       )
       UPDATE users SET chips = chips + $1, "firstChips" = true
       WHERE id = $2
       AND ("firstChips" = false OR "firstChips" IS NULL)
       AND EXISTS (SELECT 1 FROM claim)
       RETURNING *`,
      [amount, userId, ipAddress],
    );
    
    let row: any = null;
    if (Array.isArray(result)) {
      if (Array.isArray(result[0]) && result[0].length > 0) {
        row = result[0][0];
      } else if (result.length > 0 && typeof result[0] === 'object' && !Array.isArray(result[0]) && Object.keys(result[0]).length > 0) {
        row = result[0];
      }
    }
    return (row && row.id) ? (row as User) : null;
  }

}
