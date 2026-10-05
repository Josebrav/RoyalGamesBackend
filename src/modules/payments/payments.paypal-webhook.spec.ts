import { PaymentsService } from './payments.service';
import { Pay } from './entities/pay.entity';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

function completedOrder(customId: string, value: string) {
  return {
    id: 'ORDER-1',
    status: 'COMPLETED',
    purchase_units: [
      {
        custom_id: customId,
        amount: { currency_code: 'USD', value },
        payments: { captures: [{ status: 'COMPLETED', amount: { currency_code: 'USD', value } }] },
      },
    ],
  };
}

function buildService(order: any) {
  const user = { id: USER_ID, chips: '0' };
  const pays: any[] = [];
  const manager = {
    findOne: jest.fn(async (entity: any, opts: any) =>
      entity === Pay
        ? pays.find((p) => p.mercadoPagoPaymentId === opts.where.mercadoPagoPaymentId) ?? null
        : user,
    ),
    save: jest.fn(async (entity: any, value: any) => {
      if (entity === Pay) pays.push(value);
      return value;
    }),
    create: jest.fn((_entity: any, value: any) => value),
  };
  const service = new PaymentsService(
    {} as any,
    {} as any,
    { findOne: jest.fn(async () => user) } as any,
    {} as any,
    { manager: { transaction: (fn: any) => fn(manager) } } as any,
    { registerDeposit: jest.fn() } as any,
  );
  const client = {
    execute: jest.fn(async () => ({ result: order })),
  };
  jest.spyOn(service as any, 'getPayPalClient').mockReturnValue(client);
  return { service, user, pays };
}

const event = {
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: { supplementary_data: { related_ids: { order_id: 'ORDER-1' } } },
};

describe('PaymentsService.handlePayPalWebhook', () => {
  it('acredita una orden cobrada que el front no llegó a confirmar', async () => {
    const { service, user, pays } = buildService(completedOrder(`${USER_ID}:2`, '2.00'));
    await service.handlePayPalWebhook(event);
    expect(Number(user.chips)).toBe(1_000_000);
    expect(pays).toHaveLength(1);
  });

  it('no acredita dos veces si llegan la captura del front y el webhook', async () => {
    const { service, user, pays } = buildService(completedOrder(`${USER_ID}:2`, '2.00'));
    await service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 2 });
    await service.handlePayPalWebhook(event);
    expect(Number(user.chips)).toBe(1_000_000);
    expect(pays).toHaveLength(1);
  });

  it('ignora otros eventos y órdenes con monto distinto al del paquete', async () => {
    const { service, user } = buildService(completedOrder(`${USER_ID}:2`, '0.50'));
    await service.handlePayPalWebhook({ ...event, event_type: 'CHECKOUT.ORDER.APPROVED' });
    await service.handlePayPalWebhook(event);
    expect(Number(user.chips)).toBe(0);
  });
});
