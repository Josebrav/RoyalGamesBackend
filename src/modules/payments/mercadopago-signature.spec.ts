import { createHmac } from 'crypto';
import { isValidMercadoPagoSignature } from './mercadopago-signature';

const SECRET = 'secreto-de-prueba';
const sign = (manifest: string, secret = SECRET) =>
  createHmac('sha256', secret).update(manifest).digest('hex');

describe('isValidMercadoPagoSignature', () => {
  const ts = '1742505638683';
  const manifest = `id:123456;request-id:req-1;ts:${ts};`;

  it('acepta una firma correcta', () => {
    expect(
      isValidMercadoPagoSignature({
        signatureHeader: `ts=${ts},v1=${sign(manifest)}`,
        requestId: 'req-1',
        dataId: '123456',
        secrets: ['otra-cuenta', SECRET],
      }),
    ).toBe(true);
  });

  it('pasa data.id alfanumérico a minúsculas', () => {
    const m = `id:abc123;request-id:req-1;ts:${ts};`;
    expect(
      isValidMercadoPagoSignature({
        signatureHeader: `ts=${ts},v1=${sign(m)}`,
        requestId: 'req-1',
        dataId: 'ABC123',
        secrets: [SECRET],
      }),
    ).toBe(true);
  });

  it('rechaza firma de otra clave, id cambiado o header ausente', () => {
    const base = { requestId: 'req-1', dataId: '123456', secrets: [SECRET] };
    expect(
      isValidMercadoPagoSignature({ ...base, signatureHeader: `ts=${ts},v1=${sign(manifest, 'x')}` }),
    ).toBe(false);
    expect(
      isValidMercadoPagoSignature({ ...base, dataId: '999', signatureHeader: `ts=${ts},v1=${sign(manifest)}` }),
    ).toBe(false);
    expect(isValidMercadoPagoSignature({ ...base, signatureHeader: undefined })).toBe(false);
    expect(isValidMercadoPagoSignature({ ...base, signatureHeader: 'basura' })).toBe(false);
  });
});
