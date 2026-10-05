import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import MercadoPagoConfig, { Preference } from 'mercadopago';

// ─── Input / Output types ────────────────────────────────────────────────────

export interface MpPreferenceInput {
  /** ID único del ítem (puede ser userId+timestamp u otro identificador) */
  itemId: string;
  /** Título que mostrará MercadoPago al comprador */
  title: string;
  /** Precio unitario en la moneda indicada */
  unitPrice: number;
  /** Cantidad de ítems (generalmente 1) */
  quantity: number;
  /** Código de moneda ISO 4217: COP, ARS, MXN, BRL, USD, EUR, etc. */
  currencyId: string;
  /** UUID del usuario en RoyalBack — se usa como external_reference */
  userId: string;
  /** Chips a acreditar; se incluye en metadata para el webhook */
  chips?: number;
  /** ID del registro `pays` pendiente; va en metadata para que el webhook lo encuentre */
  payId?: string;
  /** URLs de retorno opcionales; si no se pasan se usan las del .env */
  successUrl?: string;
  failureUrl?: string;
  pendingUrl?: string;
  notificationUrl?: string;
  /** Access token a usar para esta preferencia; por defecto MERCADOPAGO_ACCESS_TOKEN */
  accessToken?: string;
}

export interface MpPreferenceResult {
  preferenceId: string;
  /** URL de pago para producción */
  initPoint: string;
  /** URL de pago para sandbox */
  sandboxInitPoint: string;
}

// ─── Repository ──────────────────────────────────────────────────────────────

@Injectable()
export class MercadoPagoRepository {
  private readonly logger = new Logger(MercadoPagoRepository.name);

  private readonly supportedCurrencies = [
    'COP', 'MXN', 'USD', 'ARS', 'BRL', 'EUR', 'CLP', 'PEN', 'UYU',
  ];

  /**
   * Crea una preferencia de pago en la API de MercadoPago.
   *
   * - Sin campo `payer` explícito → compatible con cuentas sandbox de prueba
   *   (igual que el proyecto de referencia El_Gaalpon_de_Jose).
   * - Las back_urls se omiten si apuntan a localhost/127.0.0.1.
   * - La notification_url se incluye solo si está definida en el .env.
   * - Los secrets nunca se hardcodean; se leen de process.env.
   */
  async createPreference(input: MpPreferenceInput): Promise<MpPreferenceResult> {
    const client = new MercadoPagoConfig({
      accessToken: input.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN,
    });
    const preferenceClient = new Preference(client);

    const currencyId = input.currencyId.toUpperCase();
    if (!this.supportedCurrencies.includes(currencyId)) {
      throw new BadRequestException(
        `Unsupported MercadoPago currency: ${currencyId}`,
      );
    }

    // Resolver URLs: priorizar las pasadas en el input, luego las del .env
    const successUrl =
      input.successUrl ?? process.env.MERCADOPAGO_SUCCESS_URL ?? '';
    const failureUrl =
      input.failureUrl ?? process.env.MERCADOPAGO_FAILURE_URL ?? '';
    const pendingUrl =
      input.pendingUrl ?? process.env.MERCADOPAGO_PENDING_URL ?? '';
    const notificationUrl =
      input.notificationUrl ?? process.env.MERCADOPAGO_NOTIFICATION_URL;

    // Solo incluir back_urls si son URLs públicas (ngrok, producción, etc.)
    const hasValidBackUrls =
      !!successUrl &&
      !successUrl.includes('localhost') &&
      !successUrl.includes('127.0.0.1');

    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      this.logger.debug(
        `MP back_urls — Success: ${successUrl} | Notification: ${notificationUrl}`,
      );
      this.logger.warn(
        '⚠️  DEVELOPMENT MODE: Para usar back_urls y webhooks ejecutá ngrok http 3001 ' +
          'y actualizá MERCADOPAGO_SUCCESS_URL / MERCADOPAGO_NOTIFICATION_URL en .env',
      );
    }

    try {
      const response = await preferenceClient.create({
        body: {
          items: [
            {
              id: input.itemId,
              title: input.title,
              unit_price: input.unitPrice,
              quantity: input.quantity,
              currency_id: currencyId,
            },
          ],
          // Sin campo payer explícito → pruebas sandbox sin restricciones de cuenta
          payment_methods: {
            excluded_payment_types: [
              { id: 'digital_currency' },
              { id: 'digital_wallet' },
            ],
            installments: 1,
          },
          ...(hasValidBackUrls
            ? {
                back_urls: {
                  success: successUrl,
                  failure: failureUrl,
                  pending: pendingUrl,
                },
                auto_return: 'approved',
              }
            : {}),
          external_reference: input.userId,
          ...(notificationUrl ? { notification_url: notificationUrl } : {}),
          ...(input.chips !== undefined || input.payId
            ? {
                metadata: {
                  ...(input.chips !== undefined ? { chips: input.chips } : {}),
                  ...(input.payId ? { pay_id: input.payId } : {}),
                },
              }
            : {}),
        },
      });

      return {
        preferenceId: response.id,
        initPoint: response.init_point,
        sandboxInitPoint: response.sandbox_init_point,
      };
    } catch (error: any) {
      const msg =
        error?.response?.body?.message ??
        error?.message ??
        'Unknown MercadoPago error';
      this.logger.error('MercadoPago Preference Creation Error:', msg);
      throw new BadRequestException('Failed to create MercadoPago preference');
    }
  }
}
