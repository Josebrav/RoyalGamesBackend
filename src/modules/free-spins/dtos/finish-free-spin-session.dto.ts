import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FreeSpinSessionIdentityDto } from './free-spin-session-identity.dto';

export class FinishFreeSpinSessionDto extends FreeSpinSessionIdentityDto {
  @ApiProperty({ example: 4500, description: 'Ganancia final acumulada durante toda la ronda' })
  @IsInt()
  @Min(0)
  accumulatedWinnings: number;
}
