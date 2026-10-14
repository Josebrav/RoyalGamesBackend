import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FreeSpinSessionIdentityDto } from './free-spin-session-identity.dto';

export class ExtendFreeSpinSessionDto extends FreeSpinSessionIdentityDto {
  @ApiProperty({ example: 5, description: 'Tiradas gratis adicionales otorgadas por un retrigger dentro de la misma ronda' })
  @IsInt()
  @Min(1)
  spinsAwarded: number;
}
