import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { DailyBonusController } from './daily-bonus.controller';
import { DailyBonusService } from './daily-bonus.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ChipsAward])],
  controllers: [DailyBonusController],
  providers: [DailyBonusService],
})
export class DailyBonusModule {}
