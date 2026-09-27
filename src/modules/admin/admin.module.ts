import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Pay } from '../payments/entities/pay.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ChipsModule } from '../chips/chips.module';
import { MinesModule } from '../mines/mines.module';
import { BingoModule } from '../bingo/bingo.module';
import { CrossGameBotsModule } from '../bots/cross-game-bots.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Pay]), ChipsModule, MinesModule, BingoModule, CrossGameBotsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
