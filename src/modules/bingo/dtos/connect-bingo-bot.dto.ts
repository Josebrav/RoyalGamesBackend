import { IsUUID } from 'class-validator';

export class ConnectBingoBotDto {
  @IsUUID()
  roomId: string;
}
