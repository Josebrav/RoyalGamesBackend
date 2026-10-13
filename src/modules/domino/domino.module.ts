import { Module } from '@nestjs/common';
import { DominoController } from './domino.controller';
import { DominoService } from './domino.service';

@Module({
  controllers: [DominoController],
  providers: [DominoService],
})
export class DominoModule {}
