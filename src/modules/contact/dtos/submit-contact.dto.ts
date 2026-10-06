import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitContactDto {
  @ApiProperty({ example: 'Juan Pérez', description: 'Nombre de quien escribe' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'juan@example.com', description: 'Email de quien escribe, para poder responderle' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Tengo una consulta sobre...', description: 'Mensaje' })
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  message: string;
}
