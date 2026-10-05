import { IsUUID, IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para POST /mepago/create-order/:country (ar | co | mx).
 * Solo recibe el paquete: fichas, precio y moneda los decide el backend
 * (ver chip-packages.ts y MERCADOPAGO_COUNTRY_CONFIG).
 */
export class CreateMercadoPagoOrderByCountryDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 1, description: 'ID del paquete de fichas (ver chip-packages.ts)' })
  @IsInt()
  @Min(1)
  packageId: number;
}

export class CreatePayPalOrderDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 1, description: 'ID del paquete de fichas (ver chip-packages.ts)' })
  @IsInt()
  @Min(1)
  packageId: number;
}

export class CapturePayPalOrderDto {
  @ApiProperty({ example: '7KH28319VH5891231', description: 'PayPal Order ID' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 1, description: 'ID del paquete de fichas (ver chip-packages.ts)' })
  @IsInt()
  @Min(1)
  packageId: number;
}
