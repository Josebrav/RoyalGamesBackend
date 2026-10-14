import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FreeSpinSessionIdentityDto } from './free-spin-session-identity.dto';

export class StartFreeSpinSessionDto extends FreeSpinSessionIdentityDto {
  @ApiProperty({ example: 100, description: 'Apuesta con la que se otorgó la ronda, fija durante toda la ronda' })
  @IsInt()
  @Min(1)
  betAmount: number;

  @ApiProperty({ example: 10, description: 'Cantidad de tiradas gratis otorgadas al arrancar la ronda' })
  @IsInt()
  @Min(1)
  spinsAwarded: number;
}
