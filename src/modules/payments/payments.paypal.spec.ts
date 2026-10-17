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

const creatingClient = () => ({ execute: jest.fn(async () => ({ result: { id: 'ORDER-1', status: 'CREATED' } })) });
const amountSent = (client: any) => (client.execute.mock.calls[0] as any[])[0].body.purchase_units[0].amount;

describe('PaymentsService.capturePayPalOrder', () => {
  it('acredita las fichas del paquete con que se creó la orden', async () => {
    const { service, user } = buildService(fakePayPalClient(order(`${USER_ID}:101`, '1.00'), '1.00'));
    await service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 101 });
    expect(Number(user.chips)).toBe(2_500_000);
  });

  it('rechaza sin capturar si se pide un paquete distinto al de la orden', async () => {
    const client = fakePayPalClient(order(`${USER_ID}:101`, '1.00'), '1.00');
    const { service, user } = buildService(client);
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 108 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.execute).toHaveBeenCalledTimes(1);
    expect(Number(user.chips)).toBe(0);
  });

  it('rechaza sin capturar si la orden es de otro usuario', async () => {
    const client = fakePayPalClient(order('otro-usuario:101', '1.00'), '1.00');
    const { service } = buildService(client);
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 101 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.execute).toHaveBeenCalledTimes(1);
  });

  it('no acredita si el monto capturado no es el precio del paquete', async () => {
    const { service, user } = buildService(fakePayPalClient(order(`${USER_ID}:101`, '1.00'), '0.50'));
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 101 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(Number(user.chips)).toBe(0);
  });
});

describe('PayPal: moneda según el paquete', () => {
  it('cobra en USD los paquetes en dólares', async () => {
    const client = creatingClient();
    const { service } = buildService(client, 'espana');
    const result = await service.createPayPalOrder({ userId: USER_ID, packageId: 103 });
    expect(amountSent(client)).toEqual({ currency_code: 'USD', value: '10.00' });
    expect(result.currency).toBe('USD');
  });

  it('cobra en EUR los paquetes en euros, sin importar el país del perfil', async () => {
    const client = creatingClient();
    const { service } = buildService(client, null);
    const result = await service.createPayPalOrder({ userId: USER_ID, packageId: 203, currency: 'EUR' });
    expect(amountSent(client)).toEqual({ currency_code: 'EUR', value: '10.00' });
    expect(result.currency).toBe('EUR');
  });

  it('rechaza un paquete en pesos (son solo de Mercado Pago)', async () => {
    const { service } = buildService(creatingClient());
    await expect(service.createPayPalOrder({ userId: USER_ID, packageId: 301 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si la moneda pedida no coincide con la del paquete', async () => {
    const { service } = buildService(creatingClient());
    await expect(
      service.createPayPalOrder({ userId: USER_ID, packageId: 101, currency: 'EUR' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no pide dirección de envío y muestra la marca en el checkout', async () => {
    const client = creatingClient();
    const { service } = buildService(client, null);
    await service.createPayPalOrder({ userId: USER_ID, packageId: 101 });
    const body = (client.execute.mock.calls[0] as any[])[0].body;
    expect(body.application_context).toMatchObject({ shipping_preference: 'NO_SHIPPING', brand_name: 'RoyalGames' });
  });

  it('paquetes de prueba: cobran 0.10 en USD o EUR y acreditan 29 fichas', async () => {
    for (const [packageId, currency] of [[901, 'USD'], [902, 'EUR']] as const) {
      const client = creatingClient();
      const { service } = buildService(client, null);
      await service.createPayPalOrder({ userId: USER_ID, packageId });
      expect(amountSent(client)).toEqual({ currency_code: currency, value: '0.10' });
    }

    const { service, user } = buildService(fakePayPalClient(order(`${USER_ID}:902`, '0.10', 'EUR'), '0.10', 'EUR'));
    await service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 902 });
    expect(Number(user.chips)).toBe(29);
  });

  it('acredita y guarda el pago en EUR cuando se cobró el precio en euros', async () => {
    const { service, user, saved } = buildService(
      fakePayPalClient(order(`${USER_ID}:201`, '1.00', 'EUR'), '1.00', 'EUR'),
    );
    await service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 201 });
    expect(Number(user.chips)).toBe(3_000_000);
    expect(saved.find((s) => s.paymentPlatform === 'paypal')).toMatchObject({ price: '1.00', currency: 'EUR' });
  });

  it('no acepta cobrar en EUR un paquete en dólares aunque el monto coincida', async () => {
    const { service, user } = buildService(fakePayPalClient(order(`${USER_ID}:101`, '1.00', 'EUR'), '1.00', 'EUR'));
    await expect(
      service.capturePayPalOrder({ orderId: 'ORDER-1', userId: USER_ID, packageId: 101 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(Number(user.chips)).toBe(0);
  });
});
