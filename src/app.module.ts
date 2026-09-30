import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import typeOrmConfig from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GamesModule } from './modules/games/games.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ChipsModule } from './modules/chips/chips.module';
import { MailingModule } from './modules/mailing/mailing.module';
import { BingoModule } from './modules/bingo/bingo.module';
import { FriendsModule } from './modules/friends/friends.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AdminModule } from './modules/admin/admin.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { SupportModule } from './modules/support/support.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { PrizesModule } from './modules/prizes/prizes.module';
import { CareersModule } from './modules/careers/careers.module';
import { MinesModule } from './modules/mines/mines.module';
import { SiteContentModule } from './modules/site-content/site-content.module';
import { NewsModule } from './modules/news/news.module';
import { BannerSlidesModule } from './modules/banner-slides/banner-slides.module';
import { TrophiesModule } from './modules/trophies/trophies.module';
import { SantaWildsModule } from './modules/santawilds/santawilds.module';
import { DailySpinModule } from './modules/daily-spin/daily-spin.module';
import { DailyBonusModule } from './modules/daily-bonus/daily-bonus.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [typeOrmConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const typeormConfig = configService.get('typeorm');
        if (!typeormConfig) {
          throw new Error('TypeORM configuration is not defined');
        }
        return typeormConfig;
      },
    }),
    // Global rate limiting (ver Trello "Rate Limiting y Protección de Endpoints"): 100 peticiones
    // por minuto por IP para cualquier endpoint. Login/registro/pagos pisan este límite a 5/min
    // con @Throttle({ default: { limit: 5, ttl: 60000 } }) en cada controller puntual — un solo
    // throttler nombrado 'default' en vez de uno nuevo "strict", porque con más de un throttler
    // nombrado acá los dos se aplicarían a la vez a TODAS las rutas (el guard chequea todos los
    // configurados salvo que se salteen con @SkipThrottle), no es una alternativa por ruta.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    AuthModule,
    UsersModule,
    GamesModule,
    PaymentsModule,
    ChipsModule,
    MailingModule,
    BingoModule,
    FriendsModule,
    MessagesModule,
    AdminModule,
    LeaderboardModule,
    SupportModule,
    BlocksModule,
    PrizesModule,
    CareersModule,
    MinesModule,
    SiteContentModule,
    NewsModule,
    BannerSlidesModule,
    TrophiesModule,
    SantaWildsModule,
    DailySpinModule,
    DailyBonusModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
