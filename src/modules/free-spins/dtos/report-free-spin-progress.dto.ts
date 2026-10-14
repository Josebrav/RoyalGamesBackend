import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FreeSpinSessionIdentityDto } from './free-spin-session-identity.dto';

/** El cliente manda el estado absoluto ya calculado (no un delta), igual que SetJackpotProgressDto. */
export class ReportFreeSpinProgressDto extends FreeSpinSessionIdentityDto {
  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  spinsTotal: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(0)
  spinsStarted: number;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(0)
  spinsRemaining: number;

  @ApiProperty({ example: 4500 })
  @IsInt()
  @Min(0)
  accumulatedWinnings: number;
}
