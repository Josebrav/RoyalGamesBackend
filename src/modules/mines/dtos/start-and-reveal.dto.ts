import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  FIXED_BET_VALUES,
  MAX_MINES_COUNT,
  MIN_MINES_COUNT,
  MINES_TILE_COUNT,
} from '../constants/fixed-bet-values';

// Same fields as StartRoundDto + RevealTileDto's tileIndex, minus roundId (this creates it).
export class StartAndRevealDto {
  @ApiProperty({ example: 250, description: 'Must be one of the fixed bet ladder values' })
  @IsIn(FIXED_BET_VALUES)
  betAmount: number;

  @ApiProperty({ example: 5, minimum: MIN_MINES_COUNT, maximum: MAX_MINES_COUNT })
  @IsInt()
  @Min(MIN_MINES_COUNT)
  @Max(MAX_MINES_COUNT)
  minesCount: number;

  @ApiProperty({ minimum: 0, maximum: MINES_TILE_COUNT - 1 })
  @IsInt()
  @Min(0)
  @Max(MINES_TILE_COUNT - 1)
  tileIndex: number;
}
