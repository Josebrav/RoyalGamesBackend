import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { DailySpinController } from './daily-spin.controller';
import { DailySpinService } from './daily-spin.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ChipsAward])],
  controllers: [DailySpinController],
  providers: [DailySpinService],
})
export class DailySpinModule {}
