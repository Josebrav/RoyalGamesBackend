import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validación del header `x-signature` de los webhooks de Mercado Pago.
 * https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 *
 * El header trae `ts=<timestamp>,v1=<hmac>`; el HMAC-SHA256 se calcula con la
 * clave secreta del webhook (panel de Mercado Pago → Tus integraciones → Webhooks)
 * sobre el manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, omitiendo
 * las partes que no vengan en la notificación.
 */
export function isValidMercadoPagoSignature(params: {
  signatureHeader?: string;
  requestId?: string;
  dataId?: string;
  secrets: string[];
}): boolean {
  const { signatureHeader, requestId, dataId, secrets } = params;
  if (!signatureHeader || secrets.length === 0) return false;

  const parts: Record<string, string> = {};
  for (const piece of signatureHeader.split(',')) {
    const [key, value] = piece.split('=').map((s) => s?.trim());
    if (key && value) parts[key] = value;
  }
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  // Mercado Pago pide pasar data.id a minúsculas cuando es alfanumérico.
  const normalizedId = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = '';
  if (normalizedId) manifest += `id:${normalizedId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const received = Buffer.from(v1, 'hex');
  return secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(manifest).digest();
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}
