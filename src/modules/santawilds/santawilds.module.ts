import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SantaWildsController } from './santawilds.controller';
import { SantaWildsService } from './santawilds.service';
import { SantaWildsSlotService } from './santawilds-slot.service';
import { SantaWildsJackpotProgress } from './entities/jackpot-progress.entity';
import { SantaWildsPlayerSettings } from './entities/player-settings.entity';
import { SantaWildsRound } from './entities/santawilds-round.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SantaWildsJackpotProgress,
      SantaWildsPlayerSettings,
      SantaWildsRound,
      User,
      ChipsAward,
    ]),
  ],
  controllers: [SantaWildsController],
  providers: [SantaWildsService, SantaWildsSlotService],
  exports: [SantaWildsService, SantaWildsSlotService],
})
export class SantaWildsModule {}
