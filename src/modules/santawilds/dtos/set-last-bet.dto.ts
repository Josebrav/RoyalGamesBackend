import { IsUUID, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetLastBetDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 100, description: 'Última apuesta elegida por el jugador' })
  @IsInt()
  @Min(1)
  betAmount: number;
}
