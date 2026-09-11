import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailingModule } from '../mailing/mailing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PasswordResetToken, RefreshToken]),
    PassportModule,
    JwtModule.register({
      // Sin fallback a propósito: si JWT_SECRET no está o es débil, el boot debe
      // fallar (main.ts lo valida antes de levantar el server).
      secret: process.env.JWT_SECRET,
      // Access token de vida corta — la sesión larga la sostiene el refresh token
      // (httpOnly cookie, ver AuthService.issueTokens / AuthController.refresh).
      // Default transicional 6h mientras el frontend nuevo (refresh en memoria) se
      // termina de desplegar; bajar a algo como 20m una vez confirmado en producción.
      signOptions: { expiresIn: (process.env.ACCESS_TOKEN_TTL || '6h') as any },
    }),
    MailingModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
