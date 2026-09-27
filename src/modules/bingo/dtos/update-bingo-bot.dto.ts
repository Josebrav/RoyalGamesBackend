import { IsOptional, IsInt, IsBoolean, IsUUID, Min, Max } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  mobilityEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  chattyEnabled?: boolean;

  /** Salas ADICIONALES a la principal (roomId) donde el bot también compra cartones cuando
   *  mobilityEnabled=true — reemplaza el set completo de salas extra del bot. */
  @IsOptional()
  @IsUUID('4', { each: true })
  extraRoomIds?: string[];
}
