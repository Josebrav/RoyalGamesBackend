import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class UpdateBingoBotDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  minCardsPerGame?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxCardsPerGame?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  autoTopUpThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  autoTopUpAmount?: number;
}
