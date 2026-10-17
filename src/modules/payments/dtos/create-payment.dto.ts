import { IsUUID, IsInt, IsString, Min, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PayPalCurrency } from '../chip-packages';

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

  // País de pago elegido en la página de compra (EUR = España). Si no viene, se decide por el país
  // del perfil. El precio sale igual del catálogo para esa moneda: el cliente no puede inventarlo.
  @ApiProperty({ required: false, enum: ['USD', 'EUR'] })
  @IsOptional()
  @IsIn(['USD', 'EUR'])
  currency?: PayPalCurrency;
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
