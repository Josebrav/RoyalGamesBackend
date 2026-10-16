import { IsUUID, IsString, MaxLength, MinLength } from 'class-validator';

export class ResumeDto {
  @IsUUID()
  jugadorId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  clientToken: string;
}
