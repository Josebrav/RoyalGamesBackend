import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoyalJokerController } from './royaljoker.controller';
import { RoyalJokerSlotService } from './royaljoker-slot.service';
import { RoyalJokerRound } from './entities/royaljoker-round.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RoyalJokerRound, User, ChipsAward])],
  controllers: [RoyalJokerController],
  providers: [RoyalJokerSlotService],
})
export class RoyalJokerModule {}
