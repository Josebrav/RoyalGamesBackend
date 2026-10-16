import { IsUUID, IsInt, IsOptional, Min } from 'class-validator';

export class SpinDto {
  @IsUUID()
  jugadorId: string;

  // Requerido solo para la tirada base (sin bono activo). Se ignora si el usuario ya tiene un
  // bono en curso - esa tirada no vuelve a apostar, sigue el bono existente.
  @IsOptional()
  @IsInt()
  @Min(1)
  betAmount?: number;
}
