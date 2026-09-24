import { IsUUID, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateTrophyDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
