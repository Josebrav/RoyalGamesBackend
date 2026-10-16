import { IsUUID, IsInt, IsOptional, Min, IsString, MaxLength, IsBoolean } from 'class-validator';

export class SpinDto {
  @IsUUID()
  jugadorId: string;

  // Requerido solo para la tirada base. Se ignora si ESTA pestaña (clientToken) tiene un bonus en
  // curso - esa tirada no vuelve a apostar, sigue su bonus.
  @IsOptional()
  @IsInt()
  @Min(1)
  betAmount?: number;

  // Pestaña desde la que se tira (tabId que la página le pasa al juego). Solo esa pestaña puede
  // continuar el bono que disparó - ver common/utils/slot-round-ownership.ts. Opcional para no
  // romper builds viejos del juego que todavía no lo mandan.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientToken?: string;

  // true cuando el juego cree estar en pleno bono: si el bono ya no es de esta pestaña, el
  // servidor responde 409 en vez de cobrarla como tirada base.
  @IsOptional()
  @IsBoolean()
  bonusSpin?: boolean;
}
