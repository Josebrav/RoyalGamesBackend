import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'usuario123',
    description:
      'Nick o email del usuario. La resolución nick→email se hace en el backend, ' +
      'así el cliente nunca necesita pedir el email de una cuenta antes de loguearse.',
  })
  @IsString()
  @MinLength(3)
  identifier: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  @MinLength(6)
  password: string;
}
