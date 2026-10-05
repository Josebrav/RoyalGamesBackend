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
}

export const CHIP_PACKAGES: readonly ChipPackage[] = [
  { id: 1, chips: 500_000, priceUsd: 1 },
  { id: 2, chips: 1_000_000, priceUsd: 2 },
  { id: 3, chips: 5_000_000, priceUsd: 6 },
  { id: 4, chips: 15_000_000, priceUsd: 15 },
  { id: 5, chips: 50_000_000, priceUsd: 50 },
  { id: 6, chips: 250_000_000, priceUsd: 200 },
  { id: 7, chips: 1_000_000_000, priceUsd: 500 },
  { id: 8, chips: 2_600_000_000, priceUsd: 1000 },
];

export function findChipPackage(packageId: number): ChipPackage | undefined {
  return CHIP_PACKAGES.find((p) => p.id === packageId);
}
