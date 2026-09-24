import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
