import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GemasOfGoldJackpot } from './entities/gemasofgold-jackpot.entity';
import { GemasOfGoldController } from './gemasofgold.controller';
import { GemasOfGoldService } from './gemasofgold.service';

@Module({
  imports: [TypeOrmModule.forFeature([GemasOfGoldJackpot])],
  controllers: [GemasOfGoldController],
  providers: [GemasOfGoldService],
  exports: [GemasOfGoldService],
})
export class GemasOfGoldModule {}
