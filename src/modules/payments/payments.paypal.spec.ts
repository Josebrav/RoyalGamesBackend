import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

/** Cliente PayPal falso: responde la orden pedida y una captura del monto dado. */
function fakePayPalClient(order: any, capturedValue: string, capturedCurrency = 'USD') {
  return {
    execute: jest.fn(async (request: any) => {
      if (request.constructor.name === 'OrdersGetRequest') return { result: order };
      return {
        result: {
          id: 'ORDER-1',
          status: 'COMPLETED',
          purchase_units: [
            { payments: { captures: [{ amount: { currency_code: capturedCurrency, value: capturedValue } }] } },
          ],
        },
      };
    }),
  };
}

function buildService(client: any, country: string | null = null) {
  const user = { id: USER_ID, chips: '0', country };
  const saved: any[] = [];
  const manager = {
    findOne: jest.fn(async (entity: any) => (entity.name === 'User' ? user : null)),
    save: jest.fn(async (_entity: any, value: any) => saved.push(value)),
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
  jest.spyOn(service as any, 'getPayPalClient').mockReturnValue(client);
  return { service, user, client, saved };
}

const order = (customId: string, value: string, currency = 'USD') => ({
  purchase_units: [{ custom_id: customId, amount: { currency_code: currency, value } }],
});

describe('PaymentsService.capturePayPalOrder', () => {
  it('acredita las fichas del paquete con que se creó la orden', async () => {
    const { service, user } = buildService(fakePayPalClient(order(`${USER_ID}:1`, '1.00'), '1.00'));
    await service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 1 });
    expect(Number(user.chips)).toBe(500_000);
  });

  it('rechaza sin capturar si se pide un paquete distinto al de la orden', async () => {
    const client = fakePayPalClient(order(`${USER_ID}:1`, '1.00'), '1.00');
    const { service, user } = buildService(client);
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 8 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.execute).toHaveBeenCalledTimes(1);
    expect(Number(user.chips)).toBe(0);
  });

  it('rechaza sin capturar si la orden es de otro usuario', async () => {
    const client = fakePayPalClient(order('otro-usuario:1', '1.00'), '1.00');
    const { service } = buildService(client);
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.execute).toHaveBeenCalledTimes(1);
  });

  it('no acredita si el monto capturado no es el precio del paquete', async () => {
    const { service, user } = buildService(fakePayPalClient(order(`${USER_ID}:1`, '1.00'), '0.50'));
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(Number(user.chips)).toBe(0);
  });
});

describe('PayPal en euros', () => {
  it('crea la orden en EUR con el precio en euros para un usuario de España', async () => {
    const client = { execute: jest.fn(async () => ({ result: { id: 'ORDER-1', status: 'CREATED' } })) };
    const { service } = buildService(client, 'espana');
    const result = await service.createPayPalOrder({ userId: USER_ID, packageId: 3 });
    const body = (client.execute.mock.calls[0] as any[])[0].body;
    expect(body.purchase_units[0].amount).toEqual({ currency_code: 'EUR', value: '5.40' });
    expect(result.currency).toBe('EUR');
  });

  it('crea la orden en USD para usuarios de otros países o sin país', async () => {
    const client = { execute: jest.fn(async () => ({ result: { id: 'ORDER-1', status: 'CREATED' } })) };
    const { service } = buildService(client, 'argentina');
    await service.createPayPalOrder({ userId: USER_ID, packageId: 3 });
    const body = (client.execute.mock.calls[0] as any[])[0].body;
    expect(body.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '6.00' });
  });

  it('usa la moneda elegida en la página aunque el perfil diga otro país (o ninguno)', async () => {
    const client = { execute: jest.fn(async () => ({ result: { id: 'ORDER-1', status: 'CREATED' } })) };
    const { service } = buildService(client, null);
    const result = await service.createPayPalOrder({ userId: USER_ID, packageId: 2, currency: 'EUR' });
    const body = (client.execute.mock.calls[0] as any[])[0].body;
    expect(body.purchase_units[0].amount).toEqual({ currency_code: 'EUR', value: '1.80' });
    expect(result.currency).toBe('EUR');
  });

  it('acredita y guarda el pago en EUR cuando se cobró el precio en euros', async () => {
    const { service, user, saved } = buildService(
      fakePayPalClient(order(`${USER_ID}:1`, '0.90', 'EUR'), '0.90', 'EUR'),
      'espana',
    );
    await service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 1 });
    expect(Number(user.chips)).toBe(500_000);
    expect(saved.find((s) => s.paymentPlatform === 'paypal')).toMatchObject({ price: '0.90', currency: 'EUR' });
  });

  it('no acepta el precio en dólares con moneda EUR', async () => {
    const { service, user } = buildService(
      fakePayPalClient(order(`${USER_ID}:1`, '1.00', 'EUR'), '1.00', 'EUR'),
      'espana',
    );
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(Number(user.chips)).toBe(0);
  });
});
