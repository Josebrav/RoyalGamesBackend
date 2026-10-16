import { IsUUID, IsInt, IsOptional, IsString, Length, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Quién y desde qué ventana (token generado por el cliente al cargar la página). */
export class RoyalJokerIdentityDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  jugadorId: string;

  @ApiProperty({ description: 'Token de esta ventana/pestaña, generado por el cliente al cargar' })
  @IsString()
  @Length(1, 64)
  clientToken: string;
}

export class RoyalJokerSpinDto extends RoyalJokerIdentityDto {
  // Requerido solo para la tirada base. Se ignora durante tiradas gratis. Min(0) porque Unity
  // (JsonUtility) siempre manda el campo: 0 = "no aplica".
  @ApiProperty({ example: 100, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  betAmount?: number;
}

export class RoyalJokerBonusPickDto extends RoyalJokerIdentityDto {
  @ApiProperty({ example: 2, description: 'Índice de la carta elegida (0-4)' })
  @IsInt()
  @Min(0)
  @Max(4)
  cardIndex: number;
}

export class RoyalJokerStateDto extends RoyalJokerIdentityDto {}
