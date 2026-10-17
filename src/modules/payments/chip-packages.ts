/**
 * Catálogo de paquetes de fichas. Es la única fuente de verdad de cuántas fichas
 * da cada paquete y cuánto cuesta: el front solo manda el `packageId` y el backend
 * decide fichas y precio, así nadie puede pedir más fichas de las que paga.
 *
 * Un juego de paquetes por moneda, con las fichas que se acreditan de verdad:
 * - USD: PayPal en dólares, y Mercado Pago Colombia/México (convierte el precio a COP/MXN).
 * - EUR: PayPal España.
 * - ARS: Mercado Pago Argentina.
 * La página muestra cada paquete como "fichas base + X% gratis = total" (base = 500.000 fichas por
 * dólar/euro, 500 por peso); acá solo importa el total, que es lo que se acredita.
 *
 * Si cambiás un paquete acá, actualizá también `CHIP_CATALOG` en
 * RoyalFrontNew/src/components/Buychips/buyChips.jsx (solo se usa para mostrar).
 */
export type CatalogCurrency = 'USD' | 'EUR' | 'ARS';

/** Monedas en las que cobra PayPal. */
export type PayPalCurrency = 'USD' | 'EUR';

export interface ChipPackage {
  id: number;
  currency: CatalogCurrency;
  /** Precio en `currency`. */
  price: number;
  /** Fichas que se acreditan. */
  chips: number;
  /** Solo se puede pagar con PayPal (Mercado Pago lo rechaza). */
  paypalOnly?: boolean;
}

export const CHIP_PACKAGES: readonly ChipPackage[] = [
  { id: 101, currency: 'USD', price: 1, chips: 2_500_000 },
  { id: 102, currency: 'USD', price: 5, chips: 15_000_000 },
  { id: 103, currency: 'USD', price: 10, chips: 40_000_000 },
  { id: 104, currency: 'USD', price: 50, chips: 250_000_000 },
  { id: 105, currency: 'USD', price: 100, chips: 600_000_000 },
  { id: 106, currency: 'USD', price: 200, chips: 1_500_000_000 },
  { id: 107, currency: 'USD', price: 500, chips: 7_500_000_000 },
  { id: 108, currency: 'USD', price: 1000, chips: 20_000_000_000 },

  { id: 201, currency: 'EUR', price: 1, chips: 3_000_000 },
  { id: 202, currency: 'EUR', price: 5, chips: 20_000_000 },
  { id: 203, currency: 'EUR', price: 10, chips: 50_000_000 },
  { id: 204, currency: 'EUR', price: 50, chips: 300_000_000 },
  { id: 205, currency: 'EUR', price: 100, chips: 750_000_000 },
  { id: 206, currency: 'EUR', price: 200, chips: 2_000_000_000 },
  { id: 207, currency: 'EUR', price: 500, chips: 10_000_000_000 },
  { id: 208, currency: 'EUR', price: 1000, chips: 25_000_000_000 },

  { id: 301, currency: 'ARS', price: 100, chips: 100_000 },
  { id: 302, currency: 'ARS', price: 500, chips: 750_000 },
  { id: 303, currency: 'ARS', price: 1_000, chips: 2_500_000 },
  { id: 304, currency: 'ARS', price: 5_000, chips: 15_000_000 },
  { id: 305, currency: 'ARS', price: 10_000, chips: 50_000_000 },
  { id: 306, currency: 'ARS', price: 100_000, chips: 750_000_000 },
  { id: 307, currency: 'ARS', price: 500_000, chips: 5_000_000_000 },
  { id: 308, currency: 'ARS', price: 1_000_000, chips: 15_000_000_000 },

  // Paquete de prueba para verificar con plata real que PayPal cobra y acredita, sin gastar casi
  // nada (visible para todos, solo con PayPal). Ojo: la comisión fija de PayPal puede superar los
  // 0,10, así que no deja ganancia - es solo para probar.
  { id: 901, currency: 'USD', price: 0.1, chips: 29, paypalOnly: true },
  { id: 902, currency: 'EUR', price: 0.1, chips: 29, paypalOnly: true },
];

/** Precio del paquete con 2 decimales, como lo esperan PayPal y Mercado Pago ("0.10"). */
export function packagePrice(chipPackage: ChipPackage): string {
  return chipPackage.price.toFixed(2);
}

export function isPayPalCurrency(currency: string | undefined): currency is PayPalCurrency {
  return currency === 'USD' || currency === 'EUR';
}

export function findChipPackage(packageId: number): ChipPackage | undefined {
  return CHIP_PACKAGES.find((p) => p.id === packageId);
}
