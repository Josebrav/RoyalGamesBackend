/**
 * Catálogo de paquetes de fichas. Es la única fuente de verdad de cuántas fichas
 * da cada paquete y cuánto cuesta: el front solo manda el `packageId` y el backend
 * decide fichas y precio, así nadie puede pedir más fichas de las que paga.
 *
 * Si cambiás un paquete acá, actualizá también `chipOptions` en
 * RoyalFrontNew/src/components/Buychips/buyChips.jsx (solo se usa para mostrar).
 */
export interface ChipPackage {
  id: number;
  chips: number;
  /** Precio en USD; para Mercado Pago se convierte con la tasa de cada país. */
  priceUsd: number;
  /** Precio en EUR que cobra PayPal a usuarios de España (USD × 0,9, igual que muestra el front). */
  priceEur: number;
  /** Solo se puede pagar con PayPal (Mercado Pago lo rechaza). */
  paypalOnly?: boolean;
}

export const CHIP_PACKAGES: readonly ChipPackage[] = [
  { id: 1, chips: 500_000, priceUsd: 1, priceEur: 0.9 },
  { id: 2, chips: 1_000_000, priceUsd: 2, priceEur: 1.8 },
  { id: 3, chips: 5_000_000, priceUsd: 6, priceEur: 5.4 },
  { id: 4, chips: 15_000_000, priceUsd: 15, priceEur: 13.5 },
  { id: 5, chips: 50_000_000, priceUsd: 50, priceEur: 45 },
  { id: 6, chips: 250_000_000, priceUsd: 200, priceEur: 180 },
  { id: 7, chips: 1_000_000_000, priceUsd: 500, priceEur: 450 },
  { id: 8, chips: 2_600_000_000, priceUsd: 1000, priceEur: 900 },
  // Paquete de prueba para verificar con plata real que PayPal cobra y acredita, sin gastar casi
  // nada (en la página solo lo ven los administradores). Ojo: la comisión fija de PayPal puede
  // superar los 0,10, así que no deja ganancia - es solo para probar.
  { id: 9, chips: 29, priceUsd: 0.1, priceEur: 0.1, paypalOnly: true },
];

/** Monedas en las que cobra PayPal: EUR para España, USD para el resto. */
export type PayPalCurrency = 'USD' | 'EUR';

/** Precio del paquete en la moneda dada, con 2 decimales como lo espera PayPal ("0.90"). */
export function getPayPalPrice(chipPackage: ChipPackage, currency: PayPalCurrency): string {
  return (currency === 'EUR' ? chipPackage.priceEur : chipPackage.priceUsd).toFixed(2);
}

export function findChipPackage(packageId: number): ChipPackage | undefined {
  return CHIP_PACKAGES.find((p) => p.id === packageId);
}
