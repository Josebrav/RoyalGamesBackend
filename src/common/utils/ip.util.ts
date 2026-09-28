import type { IncomingMessage } from 'http';

/**
 * Render (y la mayoría de los PaaS) ponen esta app detrás de un reverse proxy, así que la
 * conexión TCP cruda (`socket.remoteAddress`) es la IP del proxy, no la del cliente real — esa
 * aparece en X-Forwarded-For en su lugar, la entrada más cercana al cliente primero. Cae a
 * remoteAddress para conexiones locales/directas (ej. corriendo el backend en desarrollo).
 * Sirve tanto para un Request de Express como para el IncomingMessage crudo de un socket ws —
 * ambos exponen `headers`/`socket` de la misma forma en las partes que se leen acá.
 */
export function extractClientIp(request: IncomingMessage): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return request.socket?.remoteAddress ?? null;
}
