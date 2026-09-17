import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as paypalCheckoutServerSdk from '@paypal/checkout-server-sdk';
import MercadoPagoConfig, { Payment } from 'mercadopago';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Pay } from './entities/pay.entity';
import {
  CreateMercadoPagoOrderByCountryDto,
  CreatePayPalOrderDto,
  CapturePayPalOrderDto,
} from './dtos/create-payment.dto';
import { PaymentsRepository } from './repositories/payments.repository';
import { MercadoPagoRepository } from './repositories/mercadopago.repository';
import { PaymentStatus } from './enums/payment-status.enum';
import { UsersService } from '../users/users.service';

export type MercadoPagoCountry = 'ar' | 'co' | 'mx';

/** Una cuenta vendedora de MercadoPago por país; cada una solo liquida en su propia moneda. */
const MERCADOPAGO_COUNTRY_CONFIG: Record<MercadoPagoCountry, { currency: string; envVar: string }> = {
  ar: { currency: 'ARS', envVar: 'MERCADOPAGO_ACCESS_TOKEN_AR' },
  co: { currency: 'COP', envVar: 'MERCADOPAGO_ACCESS_TOKEN_CO' },
  mx: { currency: 'MXN', envVar: 'MERCADOPAGO_ACCESS_TOKEN_MX' },
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private paymentsRepository: PaymentsRepository,
    private mercadoPagoRepository: MercadoPagoRepository,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Pay)
    private payRepository: Repository<Pay>,
    @InjectDataSource()
    private dataSource: DataSource,
    private usersService: UsersService,
  ) {}

  // ============= MERCADOPAGO =============

  /** Crea la preferencia en MercadoPago y el registro PENDIENTE en BD. */
  private async buildAndPersistMercadoPagoOrder(params: {
    userId: string;
    chips: number;
    price: string;
    currency: string;
    accessToken?: string;
  }): Promise<{ orderId: string; initPoint: string }> {
    const user = await this.usersRepository.findOne({ where: { id: params.userId } });
    if (!user) throw new NotFoundException('User not found');

    const preference = await this.mercadoPagoRepository.createPreference({
      itemId: `${params.userId}-${Date.now()}`,
      title: `Royal Games - ${params.chips} Chips`,
      unitPrice: parseFloat(params.price),
      quantity: 1,
      currencyId: params.currency,
      userId: params.userId,
      chips: params.chips,
      accessToken: params.accessToken,
    });

    // Crear registro de pago PENDIENTE con preferenceId
    const pagoDb = this.payRepository.create({
      userId: params.userId,
      chips: params.chips,
      price: params.price,
      currency: params.currency,
      paymentPlatform: 'mepago',
      mercadoPagoPreferenceId: preference.preferenceId,
      status: PaymentStatus.PENDING,
      date: new Date().toISOString(),
    });
    await this.paymentsRepository.create(pagoDb);

    // MercadoPago ya no separa "sandbox" de "producción" por URL: lo que determina
    // si una transacción es real o de prueba es el access token usado para crear
    // la preferencia (cuenta de prueba vs. cuenta real). `sandbox_init_point`
    // apunta a un dominio legacy que MercadoPago ya no mantiene en paridad con la API
    // normal (ver merchant_orders 403), así que siempre usamos `init_point`.
    return {
      orderId: preference.preferenceId,
      initPoint: preference.initPoint,
    };
  }

  /**
   * Ruta: POST /mepago/create-order/:country (ar | co | mx)
   * Usa la cuenta vendedora del país y fuerza su moneda real — el cliente no
   * puede pedir una moneda que no corresponda a la cuenta que va a cobrar.
   */
  async createMercadoPagoOrderForCountry(
    country: string,
    dto: CreateMercadoPagoOrderByCountryDto,
  ): Promise<any> {
    const config = MERCADOPAGO_COUNTRY_CONFIG[country as MercadoPagoCountry];
    if (!config) {
      throw new BadRequestException(
        `País de MercadoPago no soportado: "${country}". Usá ar, co o mx.`,
      );
    }

    const accessToken = process.env[config.envVar];
    if (!accessToken || accessToken.startsWith('REEMPLAZAR_')) {
      throw new BadRequestException(
        `La cuenta de MercadoPago para "${country}" todavía no está configurada.`,
      );
    }

    return this.buildAndPersistMercadoPagoOrder({
      userId: dto.userId,
      chips: dto.chips,
      price: dto.price,
      currency: config.currency,
      accessToken,
    });
  }

  async handleMercadoPagoWebhook(data: any, queryParams?: any): Promise<void> {
    try {
      // Manejo de payment webhook estilo IPN legacy (query params: ?id=&topic=payment).
      // MercadoPago sigue mandando este formato en paralelo al de webhooks v2 (JSON body).
      if (queryParams?.topic === 'payment' && queryParams?.id) {
        this.logger.debug(`Payment IPN webhook received: ${queryParams.id}`);
        await this.processMercadoPagoPayment(queryParams.id);
        return;
      }

      // Manejo de payment webhook (JSON body, formato webhooks v2)
      if (!data || !data.type || data.type !== 'payment') {
        this.logger.warn(`Invalid webhook data format. Expected type=payment, got: ${data?.type}`);
        return;
      }

      if (!data.data || !data.data.id) {
        this.logger.warn('Missing payment ID in webhook');
        return;
      }

      await this.processMercadoPagoPayment(data.data.id);
    } catch (error) {
      this.logger.error('MercadoPago Webhook Error:', error);
      throw error;
    }
  }

  /**
   * Access tokens de MercadoPago configurados (cuenta genérica + una por país),
   * sin los que todavía quedan con el placeholder sin reemplazar.
   */
  private getConfiguredMercadoPagoTokens(): string[] {
    const candidates = [
      process.env.MERCADOPAGO_ACCESS_TOKEN,
      ...Object.values(MERCADOPAGO_COUNTRY_CONFIG).map((c) => process.env[c.envVar]),
    ];
    const valid = candidates.filter(
      (token): token is string => !!token && !token.startsWith('REEMPLAZAR_'),
    );
    return Array.from(new Set(valid));
  }

  /**
   * Busca un pago en MercadoPago probando cada cuenta configurada hasta que una
   * lo reconozca. No sabemos de antemano qué cuenta (genérica, AR, CO o MX)
   * generó un `paymentId` dado, así que probamos todas — cada cuenta solo puede
   * ver sus propios pagos, así que las que no son dueñas simplemente fallan.
   */
  private async fetchMercadoPagoPayment(paymentId: string): Promise<any> {
    const tokens = this.getConfiguredMercadoPagoTokens();
    let lastError: unknown;
    for (const accessToken of tokens) {
      try {
        const mpClient = new MercadoPagoConfig({ accessToken });
        return await new Payment(mpClient).get({ id: paymentId });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error('No hay ninguna cuenta de MercadoPago configurada');
  }

  /**
   * Procesa un pago de MercadoPago por su ID (sea que haya llegado vía IPN
   * legacy `topic=payment` o vía webhooks v2 `type=payment` en el body).
   */
  private async processMercadoPagoPayment(paymentId: string): Promise<void> {
    let payment: any;
    try {
      payment = await this.fetchMercadoPagoPayment(paymentId);
    } catch (mpError) {
      this.logger.error('Error querying MercadoPago API:', mpError);
      throw mpError;
    }

    if (!payment) {
      this.logger.error('Payment not found in MercadoPago');
      return;
    }

    try {
      // Usar transacción para garantizar consistencia
      return await this.dataSource.manager.transaction(async (manager) => {
        const userId = payment.external_reference;
        const chips = payment.metadata?.chips || 0;
        const preferenceId = payment.order?.id || payment.preference_id;

        if (!userId || !chips) {
          this.logger.warn('Missing userId or chips in payment metadata');
          return;
        }

        const user = await manager.findOne(User, { where: { id: userId } });
        if (!user) {
          this.logger.error(`User not found: ${userId}`);
          return;
        }

        // Buscar pago existente por mercadoPagoPaymentId (para evitar duplicados)
        const existingPaymentByPaymentId = await manager.findOne(Pay, {
          where: { mercadoPagoPaymentId: payment.id },
        });

        if (existingPaymentByPaymentId) {
          // Pago ya fue procesado
          this.logger.debug(`Payment ${payment.id} already processed`);
          return;
        }

        // Buscar pago PENDIENTE por userId + preferenceId para actualizar
        const pendingPayment = await manager.findOne(Pay, {
          where: {
            userId,
            status: PaymentStatus.PENDING,
          },
          order: { createdAt: 'DESC' }, // Obtener el más reciente
        });

        if (payment.status === 'approved') {
          // Actualizar usuario con chips. `chips` es una columna bigint: TypeORM la
          // devuelve como string, así que hay que castear antes de sumar (si no,
          // `(user.chips || 0) + chips` concatena strings en vez de sumar).
          user.chips = Number(user.chips || 0) + chips;
          await manager.save(User, user);
          await this.usersService.registerDeposit(userId, chips, manager);

          if (pendingPayment) {
            // Actualizar orden pendiente existente
            pendingPayment.status = PaymentStatus.APPROVED;
            pendingPayment.mercadoPagoPaymentId = payment.id;
            pendingPayment.date = new Date().toISOString();
            // Red de seguridad para pendientes creados antes de este fix (sin
            // currency todavía): MercadoPago siempre trae la moneda real usada.
            pendingPayment.currency = pendingPayment.currency || payment.currency_id || null;
            await manager.save(Pay, pendingPayment);

            this.logger.log(`Payment approved for user ${userId}: +${chips} chips`);
          } else {
            // Si no hay pendiente, crear uno nuevo (por si llega webhook de payment sin crear orden primero)
            const newPayment = manager.create(Pay, {
              userId,
              chips,
              price: payment.transaction_amount?.toString() || '0',
              currency: payment.currency_id || null,
              paymentPlatform: 'mepago',
              mercadoPagoPaymentId: payment.id,
              mercadoPagoPreferenceId: preferenceId || payment.id,
              status: PaymentStatus.APPROVED,
              date: new Date().toISOString(),
            });
            await manager.save(Pay, newPayment);

            this.logger.log(
              `Payment approved for user ${userId}: +${chips} chips (created new record)`,
            );
          }
        } else if (payment.status === 'rejected') {
          // Actualizar estado a rechazado
          if (pendingPayment) {
            pendingPayment.status = PaymentStatus.REJECTED;
            pendingPayment.mercadoPagoPaymentId = payment.id;
            await manager.save(Pay, pendingPayment);
          }
          this.logger.warn(`Payment rejected for user ${userId}`);
        } else if (payment.status === 'cancelled') {
          // Actualizar estado a cancelado
          if (pendingPayment) {
            pendingPayment.status = PaymentStatus.CANCELLED;
            pendingPayment.mercadoPagoPaymentId = payment.id;
            await manager.save(Pay, pendingPayment);
          }
          this.logger.warn(`Payment cancelled for user ${userId}`);
        }
      });
    } catch (error) {
      this.logger.error('MercadoPago Webhook Error:', error);
      throw error;
    }
  }

  // ============= PAYPAL =============
  /** Cliente de PayPal (sandbox) compartido por creación y captura de órdenes. */
  private getPayPalClient(): InstanceType<typeof paypalCheckoutServerSdk.core.PayPalHttpClient> {
    const environment = new paypalCheckoutServerSdk.core.SandboxEnvironment(
      process.env.PAYPAL_CLIENT_ID,
      process.env.PAYPAL_CLIENT_SECRET,
    );
    return new paypalCheckoutServerSdk.core.PayPalHttpClient(environment);
  }

  async createPayPalOrder(createPayPalOrderDto: CreatePayPalOrderDto): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: { id: createPayPalOrderDto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      const client = this.getPayPalClient();
      const request = new paypalCheckoutServerSdk.orders.OrdersCreateRequest();

      request.prefer('return=representation');
      request.body = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: createPayPalOrderDto.price,
            },
            description: `Royal Games - ${createPayPalOrderDto.chips} Chips`,
            custom_id: createPayPalOrderDto.userId,
          },
        ],
        application_context: {
          return_url: process.env.PAYPAL_SUCCESS_URL,
          cancel_url: process.env.PAYPAL_CANCEL_URL,
        },
      };

      const response = await client.execute(request);
      return {
        orderId: response.result.id,
        status: response.result.status,
      };
    } catch (error) {
      this.logger.error('PayPal Order Creation Error:', error);
      throw new BadRequestException('Failed to create PayPal order');
    }
  }

  async capturePayPalOrder(capturePayPalOrderDto: CapturePayPalOrderDto): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: { id: capturePayPalOrderDto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      const client = this.getPayPalClient();
      const request = new paypalCheckoutServerSdk.orders.OrdersCaptureRequest(
        capturePayPalOrderDto.orderId,
      );

      const response = await client.execute(request);

      if (response.result.status === 'COMPLETED') {
        const paymentId = response.result.id;

        // Usar transacción para actualizar usuario y crear pago
        return await this.dataSource.manager.transaction(async (manager) => {
          // Idempotencia: PayPal puede devolver COMPLETED más de una vez para la misma
          // orden (doble click, reintento de red, StrictMode en dev) sin volver a cobrarle
          // al comprador — si ya acreditamos este orderId antes, no sumar chips de nuevo.
          const existingPayment = await manager.findOne(Pay, {
            where: { mercadoPagoPaymentId: paymentId },
          });

          if (existingPayment) {
            this.logger.debug(`PayPal order ${paymentId} already captured, skipping`);
            return response.result;
          }

          const transactionUser = await manager.findOne(User, {
            where: { id: capturePayPalOrderDto.userId },
          });

          if (transactionUser) {
            transactionUser.chips = Number(transactionUser.chips || 0) + capturePayPalOrderDto.chips;
            await manager.save(User, transactionUser);
            await this.usersService.registerDeposit(
              capturePayPalOrderDto.userId,
              capturePayPalOrderDto.chips,
              manager,
            );
          }

          await manager.save(
            Pay,
            manager.create(Pay, {
              userId: capturePayPalOrderDto.userId,
              chips: capturePayPalOrderDto.chips,
              price: capturePayPalOrderDto.price,
              currency: 'USD', // PayPal siempre cobra en USD en este flujo (ver createPayPalOrder)
              paymentPlatform: 'paypal',
              mercadoPagoPaymentId: paymentId,
              status: PaymentStatus.APPROVED,
              date: new Date().toISOString(),
            }),
          );

          this.logger.log(`PayPal payment captured for user ${capturePayPalOrderDto.userId}: +${capturePayPalOrderDto.chips} chips`);
          return response.result;
        });
      }

      return response.result;
    } catch (error) {
      this.logger.error('PayPal Capture Error:', error);
      throw new BadRequestException('Failed to capture PayPal order');
    }
  }

  // ============= GENERAL PAYMENT METHODS =============
  async getAllPayments(): Promise<Pay[]> {
    return this.paymentsRepository.findAll();
  }

  async getUserPayments(userId: string): Promise<Pay[]> {
    return this.paymentsRepository.findByUserId(userId);
  }
}
