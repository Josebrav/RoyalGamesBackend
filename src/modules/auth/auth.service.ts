import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordUtils } from '../../common/utils/password.utils';
import { LoginDto } from './dtos/login.dto';
import { MailingService } from '../mailing/mailing.service';
import { DEFAULT_AVATAR_BUFFER, DEFAULT_AVATAR_MIME, DEFAULT_AVATAR_DATA } from '../../common/constants/default-avatar';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://royalgames.lat';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private resetTokenRepository: Repository<PasswordResetToken>,
    private jwtService: JwtService,
    private mailingService: MailingService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async login(loginDto: LoginDto) {
    const emailLowerCase = loginDto.email.toLowerCase();
    const user = await this.usersRepository.findOne({
      where: { email: emailLowerCase },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Esta cuenta fue creada con Google. Por favor inicia sesión con Google.',
      );
    }

    const passwordMatch = await PasswordUtils.comparePasswords(
      loginDto.password,
      user.password,
    );

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      nick: user.nick,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        nick: user.nick,
        role: user.role,
      },
    };
  }

  async loginWithGoogle(idToken: string) {
    // 1. Verificar el id_token con Google
    let payload: any;
    let firstChipsReceived = false;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      throw new UnauthorizedException('Token de Google inválido o expirado');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('No se pudo obtener el email de Google');
    }

    const { sub: googleId, email, name, picture } = payload;
    const emailLower = email.toLowerCase();

    // 2. Buscar usuario existente por email
    let user = await this.usersRepository.findOne({
      where: { email: emailLower },
    });

    if (user) {
      // Usuario ya registrado que ahora entra con Google: completar lo que falte.
      const patch: Partial<User> = {};
      if (!user.googleId) patch.googleId = googleId;
      if (!user.image && picture) patch.image = picture;

      // Backfill del avatar: si no tiene binario propio y Google dio foto, la bajamos
      // una vez. Sin esto, /user/:id/avatar-image le responde 403 para siempre.
      // Chequeo barato de existencia (avatarBin es select:false, no viene en el findOne).
      if (picture) {
        const [row] = await this.usersRepository.query(
          'SELECT avatar_bin IS NOT NULL AS "hasAvatar" FROM users WHERE id = $1',
          [user.id],
        );
        if (row && row.hasAvatar === false) {
          const googleAvatar = await this.fetchGoogleAvatar(picture);
          if (googleAvatar) {
            patch.avatarBin = googleAvatar.buffer;
            patch.avatarMime = googleAvatar.mime;
          }
        }
      }

      if (Object.keys(patch).length > 0) {
        await this.usersRepository.update(user.id, patch);
        Object.assign(user, patch);
      }
    } else {
      // 3. Crear usuario nuevo (registro via Google)
      // Generar un nick único a partir del nombre de Google
      let baseNick = (name || email.split('@')[0])
        .replace(/[^a-zA-Z0-9_]/g, '')
        .substring(0, 20)
        .toLowerCase();
      if (!baseNick) baseNick = 'user';

      // Asegurarse de que el nick sea único
      let nick = baseNick;
      let counter = 1;
      while (await this.usersRepository.findOne({ where: { nick } })) {
        nick = `${baseNick}${counter}`;
        counter++;
      }

      // Todo usuario necesita su propio código para poder referir a otros, incluidos
      // los que se registran con Google (que no pasan por UsersService.createUser).
      let referralCode: string;
      do {
        referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      } while (await this.usersRepository.findOne({ where: { referralCode } }));

      // Avatar: si Google mandó foto, la bajamos una vez y la guardamos como avatar
      // propio (así /user/:id/avatar-image no responde 403). Si falla la descarga o no
      // hay foto, cae al avatar por defecto horneado.
      const googleAvatar = picture ? await this.fetchGoogleAvatar(picture) : null;
      const avatarFields = googleAvatar
        ? { avatarBin: googleAvatar.buffer, avatarMime: googleAvatar.mime }
        : {
            avatarBin: DEFAULT_AVATAR_BUFFER,
            avatarMime: DEFAULT_AVATAR_MIME,
            avatarData: DEFAULT_AVATAR_DATA,
          };

      user = this.usersRepository.create({
        email: emailLower,
        nick,
        password: undefined,
        googleId,
        image: picture || undefined,
        chips: 0,
        firstChips: false,
        referralCode,
        ...avatarFields,
      });

      user = await this.usersRepository.save(user);

      // Otorgar fichas iniciales atómicamente (solo a los primeros 100 usuarios)
      const updated = await this.usersRepository.query(
        `UPDATE users SET chips = chips + $1, "firstChips" = true
         WHERE id = $2
         AND ("firstChips" = false OR "firstChips" IS NULL)
         AND (SELECT COUNT(*) FROM users WHERE "firstChips" = true) < 100
         RETURNING *`,
        [1000000, user.id],
      );

      let updatedUserRow: any = null;
      if (Array.isArray(updated)) {
        if (Array.isArray(updated[0]) && updated[0].length > 0) {
          updatedUserRow = updated[0][0];
        } else if (updated.length > 0 && typeof updated[0] === 'object' && !Array.isArray(updated[0]) && Object.keys(updated[0]).length > 0) {
          updatedUserRow = updated[0];
        }
      }

      if (updatedUserRow && updatedUserRow.id) {
        user = updatedUserRow as User;
        firstChipsReceived = true;
      }


    }

    // 4. Generar JWT propio de Royal Games
    const jwtPayload = {
      sub: user.id,
      email: user.email,
      nick: user.nick,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(jwtPayload),
      firstChipsReceived,
      user: {
        id: user.id,
        email: user.email,
        nick: user.nick,
        role: user.role,
        image: user.image,
      },
    };
  }

  /**
   * Baja la foto de perfil de Google una sola vez para guardarla como avatar propio
   * (avatarBin). Si no se puede (timeout, no es una imagen, respuesta muy grande, etc.)
   * devuelve null y el caller cae al avatar por defecto. Nunca lanza: un fallo acá no
   * debe romper el login con Google.
   */
  private async fetchGoogleAvatar(
    pictureUrl: string,
  ): Promise<{ buffer: Buffer; mime: string } | null> {
    try {
      // Google manda =s96-c (96px) por defecto; pedimos una resolución más útil.
      const url = pictureUrl.replace(/=s\d+(-c)?$/, '=s512$1');
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 3000,
        maxContentLength: 5 * 1024 * 1024,
      });
      const mime = String(res.headers['content-type'] || '')
        .split(';')[0]
        .trim();
      if (!mime.startsWith('image/')) {
        this.logger.warn(`Avatar de Google no es una imagen (content-type: ${mime})`);
        return null;
      }
      return { buffer: Buffer.from(res.data), mime };
    } catch (err: any) {
      this.logger.warn(
        `No se pudo descargar el avatar de Google: ${err?.message || err}`,
      );
      return null;
    }
  }

  async validateUser(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Always resolves to a generic success — never reveals whether the email exists, to avoid
   * account enumeration. If the account exists and has a password, emails a reset link; if it's
   * a Google-only account, emails a nudge to use Google login instead; if it doesn't exist, does
   * nothing.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericResult = {
      message: 'Si el correo existe en nuestra plataforma, vas a recibir un email con instrucciones.',
    };

    const emailLower = email.toLowerCase();
    const user = await this.usersRepository.findOne({ where: { email: emailLower } });
    if (!user) {
      return genericResult;
    }

    if (!user.password) {
      this.mailingService
        .sendMail({
          to: user.email,
          subject: 'Recuperar contraseña - RoyalGames',
          html: `
            <h2>Hola ${user.nick}</h2>
            <p>Tu cuenta de RoyalGames fue creada con Google, así que no tiene una contraseña propia.</p>
            <p>Iniciá sesión usando el botón "Continuar con Google".</p>
          `,
        })
        .catch((err) => this.logger.error('Failed to send Google-account notice email', err));
      return genericResult;
    }

    // Invalidate any previous outstanding tokens for this user before issuing a new one.
    await this.resetTokenRepository.delete({ userId: user.id, used: false });

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.resetTokenRepository.save(
      this.resetTokenRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      }),
    );

    const resetLink = `${FRONTEND_URL}/restablecer-contrasena?token=${rawToken}`;
    this.mailingService
      .sendMail({
        to: user.email,
        subject: 'Recuperar contraseña - RoyalGames',
        html: `
          <h2>Hola ${user.nick}</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña. Si fuiste vos, hacé clic en el siguiente enlace (válido por 1 hora):</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>Si no fuiste vos, podés ignorar este correo.</p>
        `,
      })
      .catch((err) => this.logger.error('Failed to send password reset email', err));

    return genericResult;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);
    const resetToken = await this.resetTokenRepository.findOne({ where: { tokenHash, used: false } });

    if (!resetToken || resetToken.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('El enlace es inválido o expiró. Solicitá uno nuevo.');
    }

    const user = await this.usersRepository.findOne({ where: { id: resetToken.userId } });
    if (!user) {
      throw new BadRequestException('El enlace es inválido o expiró. Solicitá uno nuevo.');
    }

    user.password = await PasswordUtils.hashPassword(newPassword);
    await this.usersRepository.save(user);

    resetToken.used = true;
    await this.resetTokenRepository.save(resetToken);
    // Any other outstanding tokens for this user are now moot.
    await this.resetTokenRepository.delete({ userId: user.id, used: false });

    this.mailingService
      .sendMail({
        to: user.email,
        subject: 'Tu contraseña fue actualizada - RoyalGames',
        html: `<h2>Hola ${user.nick}</h2><p>Tu contraseña se cambió correctamente. Si no fuiste vos, contactá a soporte de inmediato.</p>`,
      })
      .catch((err) => this.logger.error('Failed to send password-changed confirmation email', err));

    return { message: 'Tu contraseña fue actualizada correctamente.' };
  }
}
