// gemasofgold.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GemasOfGoldJackpot } from './entities/gemasofgold-jackpot.entity';
import { GemasOfGoldRound } from './entities/gemasofgold-round.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { GemasOfGoldController } from './gemasofgold.controller';
import { GemasOfGoldService } from './gemasofgold.service';
import { GemasOfGoldSlotService } from './gemasofgold-slot.service';

@Module({
  imports: [TypeOrmModule.forFeature([GemasOfGoldJackpot, GemasOfGoldRound, User, ChipsAward])],
  controllers: [GemasOfGoldController],
  providers: [GemasOfGoldService, GemasOfGoldSlotService],
  exports: [GemasOfGoldService, GemasOfGoldSlotService],
})
export class GemasOfGoldModule {}
