// Grilla 3x5 (5 rodillos x 3 filas), celdas indexadas 0-14 fila por fila (index = row*5 + col).
// Puerto literal de la configuración que tenía el cliente Unity (SlotGridManager.cs +
// SlotCombinations.cs de RoyalsJoker) al pasar la slot a server-authoritative (2026-10-16): mismos
// pesos, misma paytable, mismas frecuencias de BONUS/FREE. Cualquier cambio acá cambia el RTP.
export const ROWS = 3;
export const COLS = 5;
export const GRID_SIZE = ROWS * COLS;

// 5 líneas de pago clásicas: 3 rectas + V + V invertida.
export const PAYLINES: number[][] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];

// Pesos de los símbolos normales. BONUS y FREE NO salen por peso: se colocan aparte (ver
// generateGrid en slot-engine.ts), así su frecuencia se fija directamente.
export const FILLER_WEIGHTS: Record<string, number> = {
  '10': 340,
  J: 220,
  Q: 130,
  K: 60,
  A: 26,
  WILD: 13,
};

// Pagos en múltiplos de la apuesta. Índices 0,1,2 no pagan; 3/4/5 = 3/4/5 en línea. WILD
// sustituye a cualquier símbolo (también en el primer rodillo) pero no paga solo.
// Bajados ~11% el 2026-10-16 para RTP total ~94,6% (simulado, 2M tiradas): líneas ~63,7%,
// tiradas gratis ~8,8%, bonus de cartas ~22%. Con los valores anteriores daba ~103,75%.
export const PAYS: Record<string, number[]> = {
  '10': [0, 0, 0, 0.55, 1.2, 3.5],
  J: [0, 0, 0, 0.8, 1.75, 5.0],
  Q: [0, 0, 0, 1.45, 3.55, 7.2],
  K: [0, 0, 0, 2.15, 5.8, 11.5],
  A: [0, 0, 0, 4.25, 10.0, 21.5],
};

// Scatters (máximo 1 por columna). triggerChance = probabilidad de que una tirada base active
// (3+); countWeights = reparto 3/4/5 cuando activa; teaseColumnChance = FREE/BONUS sueltos (1 o 2)
// en tiradas que no activan, para conservar los "casi". Durante tiradas gratis nunca se llega a 3.
export const BONUS_TRIGGER_CHANCE = 0.0091; // ~1 de cada 110
export const BONUS_COUNT_WEIGHTS = [85, 12, 3];
export const BONUS_TEASE_COLUMN_CHANCE = 0.0861;

export const FREE_TRIGGER_CHANCE = 0.0119; // ~1 de cada 84
export const FREE_COUNT_WEIGHTS = [75, 20, 5];
export const FREE_TEASE_COLUMN_CHANCE = 0.1125;

export const FREE_SPINS_AWARD: Record<number, number> = { 3: 10, 4: 15, 5: 20 };

// Bonus de cartas: se barajan al activarse y el jugador elige BONUS_PICKS de ellas; paga la
// suma de los multiplicadores elegidos x la apuesta.
export const BONUS_CARDS = [5, 5, 10, 20, 20];
export const BONUS_PICKS = 2;
