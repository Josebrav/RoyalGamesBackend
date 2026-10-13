import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const DOMINO_MODES = ['1v1', '1v1v1', '1v1v1v1', '2v2'] as const;
export type DominoMode = (typeof DOMINO_MODES)[number];

/** Quien hace el pedido (crear / sentarse / levantarse / listar). */
export class DominoPlayerDto {
  /** BingoPlayer.id del jugador (el mismo con el que se conecta al chat). */
  @IsString()
  @MaxLength(64)
  playerId: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;
}

export class CreateDominoTableDto extends DominoPlayerDto {
  @IsIn(DOMINO_MODES as unknown as string[])
  mode: DominoMode;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  betAmount: number;
}

export class ListDominoTablesQuery {
  /** Opcional: si viene, cuenta como "sigo aca" para los asientos de este jugador. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  playerId?: string;
}
