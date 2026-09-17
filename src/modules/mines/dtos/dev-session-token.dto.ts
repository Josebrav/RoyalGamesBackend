import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DevSessionTokenDto {
  @ApiProperty()
  @IsUUID()
  userId: string;
}
