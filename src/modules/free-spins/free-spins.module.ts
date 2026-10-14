import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreeSpinsController } from './free-spins.controller';
import { FreeSpinsService } from './free-spins.service';
import { FreeSpinSession } from './entities/free-spin-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FreeSpinSession])],
  controllers: [FreeSpinsController],
  providers: [FreeSpinsService],
})
export class FreeSpinsModule {}
