import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Res,
  Headers,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  CreateMercadoPagoOrderByCountryDto,
  CreatePayPalOrderDto,
  CapturePayPalOrderDto,
} from './dtos/create-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/** Solo se puede comprar para uno mismo: el userId del body tiene que ser el de la sesión. */
function assertSameUser(currentUser: any, userId: string): void {
  if (currentUser?.id !== userId) {
    throw new ForbiddenException('Cannot create or capture payments for another user');
  }
}

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) { }

  // ============= MERCADOPAGO =============
  @Post('mepago/create-order/:country')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create MercadoPago order using a country-specific seller account',
    description:
      'country debe ser ar, co o mx. Usa la cuenta vendedora de ese país y fuerza ' +
      'su moneda real (ARS/COP/MXN). El body solo trae userId y packageId: fichas y ' +
      'precio salen del catálogo del backend.',
  })
  @ApiParam({ name: 'country', description: 'ar | co | mx' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Unsupported or unconfigured country' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createMercadoPagoOrderByCountry(
    @Param('country') country: string,
    @Body() dto: CreateMercadoPagoOrderByCountryDto,
    @CurrentUser() currentUser: any,
  ) {
    assertSameUser(currentUser, dto.userId);
    return this.paymentsService.createMercadoPagoOrderForCountry(country, dto);
  }

  @Post('mepago/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'MercadoPago webhook' })
  async handleMercadoPagoWebhook(
    @Body() data: any,
    @Query() query: Record<string, any>,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    await this.paymentsService.handleMercadoPagoWebhook(
      data,
      { id: query?.id, topic: query?.topic },
      {
        signature,
        requestId,
        // Mercado Pago firma el `data.id` que manda en la query string.
        dataId: query?.['data.id'] ?? query?.data?.id ?? data?.data?.id,
      },
    );
    return { status: 'received' };
  }

  @Get('mercadopago/success')
  @ApiOperation({ summary: 'MercadoPago success redirect → frontend' })
  async mercadoPagoSuccess(@Query() query: any, @Res() res: Response) {
    // MercadoPago redirige aquí tras pago aprobado.
    // Reenviamos al frontend con los query params originales para que pueda
    // mostrar el estado del pago al usuario.
    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:3000';
    const { id, userId } = query;
    const redirectTo = id || userId
      ? `${frontendUrl}/mercadopago/success?id=${id ?? ''}&userId=${userId ?? ''}`
      : `${frontendUrl}/mercadopago/success`;
    return res.redirect(301, redirectTo);
  }

  @Get('mercadopago/failure')
  @ApiOperation({ summary: 'MercadoPago failure redirect → frontend' })
  async mercadoPagoFailure(@Query() query: any, @Res() res: Response) {
    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:3000';
    const { id, userId } = query;
    const redirectTo = id || userId
      ? `${frontendUrl}/mercadopago/failure?id=${id ?? ''}&userId=${userId ?? ''}`
      : `${frontendUrl}/mercadopago/failure`;
    return res.redirect(301, redirectTo);
  }

  @Get('mercadopago/pending')
  @ApiOperation({ summary: 'MercadoPago pending redirect → frontend' })
  async mercadoPagoPending(@Query() query: any, @Res() res: Response) {
    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:3000';
    const { id, userId } = query;
    const redirectTo = id || userId
      ? `${frontendUrl}/mercadopago/pending?id=${id ?? ''}&userId=${userId ?? ''}`
      : `${frontendUrl}/mercadopago/pending`;
    return res.redirect(301, redirectTo);
  }

  // ============= PAYPAL =============
  @Post('paypal/create-order')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create PayPal order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createPayPalOrder(
    @Body() createPayPalOrderDto: CreatePayPalOrderDto,
    @CurrentUser() currentUser: any,
  ) {
    assertSameUser(currentUser, createPayPalOrderDto.userId);
    return this.paymentsService.createPayPalOrder(createPayPalOrderDto);
  }

  @Post('capture-paypal-order')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Capture PayPal order' })
  @ApiResponse({ status: 200, description: 'Order captured successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async capturePayPalOrder(
    @Body() capturePayPalOrderDto: CapturePayPalOrderDto,
    @CurrentUser() currentUser: any,
  ) {
    assertSameUser(currentUser, capturePayPalOrderDto.userId);
    return this.paymentsService.capturePayPalOrder(capturePayPalOrderDto);
  }

  // ============= GENERAL =============
  // Global feed of every payment across every user — a platform-wide money summary, so this
  // stays admin-only. Mods needing to help ONE customer use getUserPayments below instead.
  @Get('payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all payments (Admin only)' })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully' })
  async getAllPayments() {
    return this.paymentsService.getAllPayments();
  }

  @Get('payments/user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user payments (self, admin, or mod — a support tool for one specific customer)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User payments retrieved successfully' })
  async getUserPayments(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() currentUser: any,
  ) {
    const isStaff = currentUser.role === Role.ADMIN || currentUser.role === Role.MOD;
    if (currentUser.id !== userId && !isStaff) {
      throw new ForbiddenException('Cannot view another user\'s payments');
    }
    return this.paymentsService.getUserPayments(userId);
  }
}
