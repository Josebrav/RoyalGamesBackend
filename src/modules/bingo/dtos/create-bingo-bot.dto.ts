import { IsString, IsUUID, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateBingoBotDto {
  @IsString()
  nick: string;

  @IsIn(['H', 'M'])
  sexo: string;

  // Opcional: si se omite, el bot se crea desconectado (reutilizable después con /connect).
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialChips?: number;

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
