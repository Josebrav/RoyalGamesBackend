import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

/** Cliente PayPal falso: responde la orden pedida y una captura del monto dado. */
function fakePayPalClient(order: any, capturedValue: string) {
  return {
    execute: jest.fn(async (request: any) => {
      if (request.constructor.name === 'OrdersGetRequest') return { result: order };
      return {
        result: {
          id: 'ORDER-1',
          status: 'COMPLETED',
          purchase_units: [
            { payments: { captures: [{ amount: { currency_code: 'USD', value: capturedValue } }] } },
          ],
        },
      };
    }),
  };
}

function buildService(client: any) {
  const user = { id: USER_ID, chips: '0' };
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
  return { service, user, client };
}

const order = (customId: string, value: string) => ({
  purchase_units: [{ custom_id: customId, amount: { currency_code: 'USD', value } }],
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
