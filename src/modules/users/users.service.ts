import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UpdateAvatarDto } from './dtos/update-avatar.dto';
import { ManageUserDto } from './dtos/manage-user.dto';
import { AdminUserDto } from './dtos/admin-user.dto';
import { UsersRepository } from './repositories/users.repository';
import { PasswordUtils } from '../../common/utils/password.utils';
import { User } from './entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { RankTier } from '../../common/enums/rank-tier.enum';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { DEFAULT_AVATAR_BUFFER, DEFAULT_AVATAR_MIME, DEFAULT_AVATAR_DATA, DEFAULT_AVATAR_THUMB_BUFFER } from '../../common/constants/default-avatar';
import {
  DEFAULT_FEMALE_AVATAR_READY,
  DEFAULT_FEMALE_AVATAR_BUFFER,
  DEFAULT_FEMALE_AVATAR_MIME,
  DEFAULT_FEMALE_AVATAR_DATA,
  DEFAULT_FEMALE_AVATAR_THUMB_BUFFER,
} from '../../common/constants/default-female-avatar';
import { MailingService } from '../mailing/mailing.service';
import * as crypto from 'crypto';

const REFERRAL_SIGNUP_BONUS = 1000000;

@Injectable()
export class UsersService {
  constructor(
    private usersRepository: UsersRepository,
    @InjectRepository(ChipsAward)
    private chipsAwardRepository: Repository<ChipsAward>,
    private mailingService: MailingService,
  ) {}

  private async logWelcomeBonus(userId: string, amount: number): Promise<void> {
    await this.chipsAwardRepository.save(
      this.chipsAwardRepository.create({ userId, amount, source: 'welcome' }),
    );
  }

  private async generateUniqueReferralCode(): Promise<string> {
    let code: string;
    let existing: User | null;
    do {
      code = crypto.randomBytes(4).toString('hex').toUpperCase();
      existing = await this.usersRepository.findByReferralCode(code);
    } while (existing);
    return code;
  }

  async createUser(createUserDto: CreateUserDto): Promise<Partial<User> & { firstChipsReceived: boolean }> {
    const { referredByCode, ...userData } = createUserDto;

    const emailLowerCase = createUserDto.email.toLowerCase();
    const existingEmail = await this.usersRepository.findByEmail(
      emailLowerCase,
    );
    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    const existingNick = await this.usersRepository.findByNick(
      createUserDto.nick,
    );
    if (existingNick) {
      throw new ConflictException('Nick already exists');
    }

    // Nicks are always stored lowercase — display code re-capitalizes the first letter, so
    // typing "USUARIO" and "usuario" must resolve to the same stored value.
    const nickLowerCase = createUserDto.nick.toLowerCase();

    const hashedPassword = await PasswordUtils.hashPassword(
      createUserDto.password,
    );

    const referralCode = await this.generateUniqueReferralCode();

    // Invalid/unknown codes are ignored rather than rejected — a typo in a friend's code
    // shouldn't block someone from signing up.
    let referredBy: string | null = null;
    if (referredByCode) {
      const referrer = await this.usersRepository.findByReferralCode(referredByCode.trim().toUpperCase());
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    // Avatar por defecto del Bazar horneado al crear la cuenta: uno para hombre (sexo 'H') y
    // otro para mujer (sexo 'M'). El de mujer solo se aplica si ya existe el snapshot
    // (DEFAULT_FEMALE_AVATAR_READY); mientras no exista, las mujeres se crean sin avatar por
    // defecto, igual que antes.
    const isMale = userData.sexo === 'H';
    const isFemale = userData.sexo === 'M';

    const femaleDefaultReady =
      isFemale &&
      DEFAULT_FEMALE_AVATAR_READY &&
      DEFAULT_FEMALE_AVATAR_BUFFER != null &&
      DEFAULT_FEMALE_AVATAR_THUMB_BUFFER != null;

    const defaultAvatarFields = isMale
      ? {
          avatarBin: DEFAULT_AVATAR_BUFFER,
          avatarMime: DEFAULT_AVATAR_MIME,
          avatarData: DEFAULT_AVATAR_DATA,
          avatarThumbBin: DEFAULT_AVATAR_THUMB_BUFFER,
          avatarThumbMime: DEFAULT_AVATAR_MIME,
        }
      : femaleDefaultReady
        ? {
            avatarBin: DEFAULT_FEMALE_AVATAR_BUFFER as Buffer,
            avatarMime: DEFAULT_FEMALE_AVATAR_MIME,
            avatarData: DEFAULT_FEMALE_AVATAR_DATA,
            avatarThumbBin: DEFAULT_FEMALE_AVATAR_THUMB_BUFFER as Buffer,
            avatarThumbMime: DEFAULT_FEMALE_AVATAR_MIME,
          }
        : {};

    // Create user without initial chips
    const user = await this.usersRepository.create({
      ...userData,
      nick: nickLowerCase,
      email: emailLowerCase,
      password: hashedPassword,
      chips: 0,
      firstChips: false,
      ...defaultAvatarFields,
      referralCode,
      referredBy,
    });

    // Grant first chips atomically (only for first 100 users)
    const updatedUser = await this.usersRepository.giveFirstChipsAtomic(user.id, 1000000);
    const firstChipsReceived = updatedUser !== null;
    if (firstChipsReceived) {
      await this.logWelcomeBonus(user.id, 1000000);
    }

    // Separate, uncapped bonus for signing up through a valid referral code — on top of,
    // not instead of, the first-100-users welcome bonus above.
    if (referredBy) {
      await this.usersRepository.addChipsAtomic(user.id, REFERRAL_SIGNUP_BONUS);
      await this.chipsAwardRepository.save(
        this.chipsAwardRepository.create({ userId: user.id, amount: REFERRAL_SIGNUP_BONUS, source: 'referral' }),
      );
    }

    // Fetch updated user with chips
    const userToReturn = await this.usersRepository.findById(user.id);
    if (!userToReturn) {
      throw new NotFoundException('User not found');
    }
    const { password, ...userWithoutPassword } = userToReturn;
    return { ...userWithoutPassword, firstChipsReceived };
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateUserDto.email && updateUserDto.email.toLowerCase() !== user.email) {
      const emailLowerCase = updateUserDto.email.toLowerCase();
      const existingEmail = await this.usersRepository.findByEmail(
        emailLowerCase,
      );
      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
      updateUserDto.email = emailLowerCase;
    }

    if (updateUserDto.nick) {
      if (updateUserDto.nick.toLowerCase() !== user.nick.toLowerCase()) {
        const existingNick = await this.usersRepository.findByNick(
          updateUserDto.nick,
        );
        if (existingNick) {
          throw new ConflictException('Nick already exists');
        }
      }
      // Nicks are always stored lowercase — display code re-capitalizes the first letter.
      updateUserDto.nick = updateUserDto.nick.toLowerCase();
    }

    // Password changes must go through changePassword() (current-password check + hashing).
    // Silently dropping it here — instead of trusting the DTO — is what stops a raw, unhashed
    // password from ever reaching this generic profile-update path. referredByCode is a
    // signup-only field with no matching column, dropped here too so it can never leak into
    // an UPDATE statement.
    const { password: _ignoredPassword, referredByCode: _ignoredReferredByCode, ...safeUpdateDto } = updateUserDto as any;

    const updatedUser = await this.usersRepository.update(id, safeUpdateDto);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.password) {
      throw new BadRequestException('Esta cuenta inició sesión con Google y no tiene contraseña propia');
    }
    const matches = await PasswordUtils.comparePasswords(currentPassword, user.password);
    if (!matches) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    const hashedPassword = await PasswordUtils.hashPassword(newPassword);
    await this.usersRepository.update(id, { password: hashedPassword });
  }

  /**
   * Admin-initiated password reset for a user who's locked out and can't use the normal
   * forgot-password email flow (lost access to that inbox too, etc). No current-password
   * check — the admin's own auth is the gate here — but we notify the account's email so an
   * unnoticed takeover isn't silent if this wasn't actually requested by the owner.
   */
  async adminSetPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const hashedPassword = await PasswordUtils.hashPassword(newPassword);
    await this.usersRepository.update(userId, { password: hashedPassword });

    this.mailingService
      .sendMail({
        to: user.email,
        subject: 'Tu contraseña fue restablecida - RoyalGames',
        html: `<h2>Hola ${user.nick}</h2><p>Un administrador restableció la contraseña de tu cuenta. Si no lo solicitaste vos, contactá a soporte de inmediato.</p>`,
      })
      .catch(() => {});
  }

  /**
   * Admin-initiated email change, for the same lost-access scenario as adminSetPassword.
   * Notifies the NEW address (the old one may be exactly what's unreachable).
   */
  async adminSetEmail(userId: string, newEmail: string): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const emailLower = newEmail.toLowerCase();
    if (emailLower !== user.email) {
      const existing = await this.usersRepository.findByEmail(emailLower);
      if (existing) {
        throw new ConflictException('Email already exists');
      }
    }
    const updatedUser = await this.usersRepository.update(userId, { email: emailLower });
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    this.mailingService
      .sendMail({
        to: emailLower,
        subject: 'Tu correo fue actualizado - RoyalGames',
        html: `<h2>Hola ${user.nick}</h2><p>Un administrador vinculó este correo a tu cuenta de RoyalGames. Si no lo solicitaste vos, contactá a soporte de inmediato.</p>`,
      })
      .catch(() => {});

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Admin/mod editing another user's profile description (e.g. to clean up
   * inappropriate content) — separate from the self-only `actualizar-usuario` route.
   */
  async adminSetDescription(userId: string, description: string): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updatedUser = await this.usersRepository.update(userId, { description });
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.usersRepository.delete(id);
  }

  /**
   * Proyección pública de un usuario: SOLO lo que puede verse en un perfil público o
   * en un listado sin sesión. Es una allowlist a propósito (no un destructuring-omit):
   * si mañana se agrega un campo sensible a User, no se filtra por defecto.
   * Nunca incluye: email, password, googleId, referralCode, referredBy, avatarData.
   */
  private toPublicProfile(user: User): Partial<User> {
    return {
      id: user.id,
      nick: user.nick,
      image: user.image,
      rank: user.rank,
      role: user.role,
      sexo: user.sexo,
      age: user.age,
      country: user.country,
      description: user.description,
      chips: user.chips,
      totalChipsDeposited: user.totalChipsDeposited,
      banned: user.banned,
      inactive: user.inactive,
      firstChips: user.firstChips,
      lastSeen: user.lastSeen,
      currentActivity: user.currentActivity,
      createdAt: user.createdAt,
    };
  }

  // Público (sin guard): devuelve solo la proyección segura, nunca email/googleId/etc.
  async getUserById(id: string): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toPublicProfile(user);
  }

  async getUserByEmail(email: string): Promise<Partial<User>> {
    const emailLowerCase = email.toLowerCase();
    const user = await this.usersRepository.findByEmail(emailLowerCase);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Público (sin guard): devuelve solo la proyección segura. La resolución nick→email
  // para el login se hace en AuthService.login, no acá.
  async getUserByNick(nick: string): Promise<Partial<User>> {
    const user = await this.usersRepository.findByNick(nick);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toPublicProfile(user);
  }

  /**
   * Booleans-only lookup used by the signup form to check availability before the user
   * has a session. Deliberately never returns user data (unlike getUserByEmail, which is
   * kept behind JwtAuthGuard) so it can be public without exposing account details.
   */
  async checkAvailability(
    nick?: string,
    email?: string,
  ): Promise<{ nickTaken?: boolean; emailTaken?: boolean }> {
    const result: { nickTaken?: boolean; emailTaken?: boolean } = {};
    if (nick) {
      const existingNick = await this.usersRepository.findByNick(nick);
      result.nickTaken = !!existingNick;
    }
    if (email) {
      const existingEmail = await this.usersRepository.findByEmail(email.toLowerCase());
      result.emailTaken = !!existingEmail;
    }
    return result;
  }

  async getAllUsers(): Promise<Partial<User>[]> {
    const users = await this.usersRepository.findAll();
    return users.map(({ password, ...userWithoutPassword }) => userWithoutPassword);
  }

  async getUsersCount(): Promise<{ count: number }> {
    const count = await this.usersRepository.count();
    return { count };
  }

  async updateLastSeen(userId: string, currentActivity?: string | null): Promise<void> {
    await this.usersRepository.updateLastSeen(userId, currentActivity);
  }

  async getOnlineUsers(limit = 20) {
    return this.usersRepository.findOnline(limit);
  }

  async banUser(manageUserDto: ManageUserDto): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(manageUserDto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updatedUser = await this.usersRepository.update(
      manageUserDto.userId,
      { banned: manageUserDto.status },
    );
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async inactiveUser(manageUserDto: ManageUserDto): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(manageUserDto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updatedUser = await this.usersRepository.update(
      manageUserDto.userId,
      { inactive: manageUserDto.status },
    );
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async setUserAdmin(adminUserDto: AdminUserDto): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(adminUserDto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updatedUser = await this.usersRepository.update(
      adminUserDto.userId,
      { role: adminUserDto.role },
    );
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async giveFirstChips(userId: string): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const FIRST_CHIPS_AMOUNT = 1000000;
    const updatedUser = await this.usersRepository.giveFirstChipsAtomic(
      userId,
      FIRST_CHIPS_AMOUNT,
    );

    if (!updatedUser) {
      // If the user exists but no row was updated, they already received first chips
      throw new BadRequestException('User already received first chips');
    }

    await this.logWelcomeBonus(userId, FIRST_CHIPS_AMOUNT);

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }


  async updateAvatarWithFile(
    userId: string,
    file?: Express.Multer.File,
    avatarData?: any,
    thumbFile?: Express.Multer.File,
  ): Promise<Partial<User>> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const buffer = file && file.buffer ? file.buffer : undefined;
    const mime = file && file.mimetype ? file.mimetype : undefined;
    const thumbBuffer = thumbFile && thumbFile.buffer ? thumbFile.buffer : undefined;
    const thumbMime = thumbFile && thumbFile.mimetype ? thumbFile.mimetype : undefined;

    console.log('Saving avatar for user', {
      userId,
      hasFile: !!file,
      fileInfo: file ? { originalname: file.originalname, mimetype: file.mimetype, size: file.size } : null,
      hasThumbFile: !!thumbFile,
      avatarData,
    });

    const updatedUser = await this.usersRepository.updateAvatar(userId, buffer, mime, avatarData, thumbBuffer, thumbMime);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async getAvatarData(userId: string): Promise<any> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.avatarData || {};
  }

  

  async getAvatarBinary(userId: string): Promise<{ buffer?: Buffer; mime?: string } | null> {
    const user = await this.usersRepository.findByIdWithAvatarBinary(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { buffer: user.avatarBin, mime: user.avatarMime };
  }

  async getAvatarThumbnailBinary(userId: string): Promise<{ buffer?: Buffer; mime?: string } | null> {
    const user = await this.usersRepository.findByIdWithAvatarBinary(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Los avatares guardados antes de que existiera el thumbnail dedicado no tienen
    // avatar_thumb_bin todavía; se cae al avatar completo para no dejar el nav sin imagen.
    if (user.avatarThumbBin) {
      return { buffer: user.avatarThumbBin, mime: user.avatarThumbMime };
    }
    return { buffer: user.avatarBin, mime: user.avatarMime };
  }

  // Deposited-chips thresholds for each rank. 1000 chips = $1 USD is the fixed rate used
  // across the whole app (see BuyChips.jsx), so chips deposited is a currency-agnostic
  // stand-in for real money loaded, without needing to store/convert per-payment currency.
  private static readonly RANK_THRESHOLDS: [RankTier, number][] = [
    [RankTier.DIAMOND, 50000],
    [RankTier.PLATINUM, 10000],
    [RankTier.GOLD, 5000],
    [RankTier.SILVER, 1000],
    [RankTier.BRONZE, 0],
  ];

  private computeRank(totalChipsDeposited: number): RankTier {
    const found = UsersService.RANK_THRESHOLDS.find(([, min]) => totalChipsDeposited >= min);
    return found ? found[0] : RankTier.BRONZE;
  }

  /**
   * Increments the user's lifetime deposited-chips counter and recomputes their rank.
   * Must run inside the same transaction/manager that approves the deposit, so chips
   * balance and rank progression can never drift apart.
   */
  async registerDeposit(userId: string, chipsAmount: number, manager: EntityManager): Promise<void> {
    const updateResult = await manager.query(
      `UPDATE users SET "totalChipsDeposited" = "totalChipsDeposited" + $1 WHERE id = $2 RETURNING "totalChipsDeposited"`,
      [chipsAmount, userId],
    );

    let row: any = null;
    if (Array.isArray(updateResult)) {
      if (Array.isArray(updateResult[0]) && updateResult[0].length > 0) {
        row = updateResult[0][0];
      } else if (updateResult.length > 0 && typeof updateResult[0] === 'object') {
        row = updateResult[0];
      }
    }
    if (!row) {
      return;
    }

    const newTotal = Number(row.totalChipsDeposited ?? 0);
    const newRank = this.computeRank(newTotal);
    await manager.query(`UPDATE users SET rank = $1 WHERE id = $2`, [newRank, userId]);
  }
}
