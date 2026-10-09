import { IsUUID, IsInt, IsOptional, Min } from 'class-validator';

export class SpinDto {
  @IsUUID()
  jugadorId: string;

  // Requerido solo para la tirada base (sin bonus activo). Se ignora si el usuario ya tiene un
  // bonus en curso - esa tirada no vuelve a apostar, sigue el bonus existente.
  @IsOptional()
  @IsInt()
  @Min(1)
  betAmount?: number;
}
