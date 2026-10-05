import { PaymentsService } from './payments.service';
import { Pay } from './entities/pay.entity';
import { PaymentStatus } from './enums/payment-status.enum';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

/** Dos compras pendientes del mismo usuario; A es la más reciente. */
function buildService(mpPayment: any) {
  const user = { id: USER_ID, chips: '0' };
  const pays: any[] = [
    { id: 'pay-a', userId: USER_ID, chips: '1000000', price: '2000.00', currency: 'ARS', status: PaymentStatus.PENDING },
    { id: 'pay-b', userId: USER_ID, chips: '500000', price: '1000.00', currency: 'ARS', status: PaymentStatus.PENDING },
  ];
  const manager = {
    findOne: jest.fn(async (entity: any, opts: any) => {
      if (entity !== Pay) return user;
      const w = opts.where;
      if (w.mercadoPagoPaymentId) return null;
      if (w.id) return pays.find((p) => p.id === w.id && p.status === w.status) ?? null;
      return pays.find((p) => p.status === w.status) ?? null;
    }),
    save: jest.fn(async (_e: any, v: any) => v),
    create: jest.fn((_e: any, v: any) => v),
  };
  const service = new PaymentsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { manager: { transaction: (fn: any) => fn(manager) } } as any,
    { registerDeposit: jest.fn() } as any,
  );
  jest.spyOn(service as any, 'fetchMercadoPagoPayment').mockResolvedValue(mpPayment);
  return { service, user, pays };
}

const approved = (payId: string, amount: number) => ({
  id: 999,
  status: 'approved',
  external_reference: USER_ID,
  metadata: { chips: 500000, pay_id: payId },
  transaction_amount: amount,
  currency_id: 'ARS',
});

describe('PaymentsService webhook de Mercado Pago', () => {
  it('cierra la compra indicada en pay_id aunque haya otra pendiente más reciente', async () => {
    const { service, user, pays } = buildService(approved('pay-b', 1000));
    await service.handleMercadoPagoWebhook({ type: 'payment', data: { id: '999' } });
    expect(pays[1].status).toBe(PaymentStatus.APPROVED);
    expect(pays[0].status).toBe(PaymentStatus.PENDING);
    expect(Number(user.chips)).toBe(500000);
  });

  it('no acredita si el monto cobrado no coincide con la compra', async () => {
    const { service, user, pays } = buildService(approved('pay-b', 10));
    await service.handleMercadoPagoWebhook({ type: 'payment', data: { id: '999' } });
    expect(pays[1].status).toBe(PaymentStatus.PENDING);
    expect(Number(user.chips)).toBe(0);
  });
});
