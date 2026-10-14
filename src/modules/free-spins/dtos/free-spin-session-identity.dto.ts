import { IsUUID, IsIn, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { KNOWN_GAME_SLUGS } from '../../../common/constants/game-origins';

/** Campos comunes a toda acción sobre una sesión de tiradas gratis: quién, qué juego, qué ventana. */
export class FreeSpinSessionIdentityDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'sugarcalavera', enum: KNOWN_GAME_SLUGS })
  @IsIn(KNOWN_GAME_SLUGS)
  game: string;

  @ApiProperty({ description: 'Token generado por el cliente al cargar la página, identifica esta ventana/pestaña' })
  @IsString()
  @Length(1, 64)
  clientToken: string;
}
