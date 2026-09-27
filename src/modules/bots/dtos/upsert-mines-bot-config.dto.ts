import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FIXED_BET_VALUES, MAX_MINES_COUNT, MIN_MINES_COUNT } from '../../mines/constants/fixed-bet-values';

export class UpsertMinesBotConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Debe ser un valor de la escalera de apuestas fija de Minas' })
  @IsOptional()
  @IsIn(FIXED_BET_VALUES)
  minBet?: number;

  @ApiPropertyOptional({ description: 'Debe ser un valor de la escalera de apuestas fija de Minas' })
  @IsOptional()
  @IsIn(FIXED_BET_VALUES)
  maxBet?: number;

  @ApiPropertyOptional({ minimum: MIN_MINES_COUNT, maximum: MAX_MINES_COUNT })
  @IsOptional()
  @IsInt()
  @Min(MIN_MINES_COUNT)
  @Max(MAX_MINES_COUNT)
  minMinesCount?: number;

  @ApiPropertyOptional({ minimum: MIN_MINES_COUNT, maximum: MAX_MINES_COUNT })
  @IsOptional()
  @IsInt()
  @Min(MIN_MINES_COUNT)
  @Max(MAX_MINES_COUNT)
  maxMinesCount?: number;
}
