// Grilla 3x5 (5 rodillos x 3 filas), celdas indexadas 0-14 fila por fila (index = row*5 + col).
export const ROWS = 3;
export const COLS = 5;
export const GRID_SIZE = ROWS * COLS;

// 5 líneas de pago clásicas: 3 rectas + V + V invertida (misma forma que SlotCombinations.cs en
// el cliente, que queda deprecado por este motor).
export const PAYLINES: number[][] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];

// Pesos de aparición por símbolo (no necesitan sumar 100) - calibrados por simulación esta misma
// sesión (sim_lib.js) para hit frequency ~30% y RTP base ~70%, manteniendo el contador de JACKPOT
// en ~230 tiradas para llegar al bono. NO TOCAR sin volver a correr sim_lib.js - ver el historial
// de recalibraciones en SlotGridManager.cs del cliente (ahora deprecado, pero documenta el porqué
// de cada número).
export const BASE_WEIGHTS: Record<string, number> = {
  CANDY: 120,
  GIFT: 83,
  ELF: 50,
  REINDEER: 60,
  TREE: 26,
  SANTA: 13,
  WILD: 13,
  JACKPOT: 11,
};

// Pesos durante el bono de wild pegajoso: JACKPOT no aparece (no tiene sentido seguir sumando al
// contador estando ya adentro del bono) y se agrega STICKY_WILD con su propio peso.
export const STICKY_WILD_WEIGHT = 2;
export const BONUS_WEIGHTS: Record<string, number> = {
  ...BASE_WEIGHTS,
  JACKPOT: 0,
  STICKY_WILD: STICKY_WILD_WEIGHT,
};

// Pagos en múltiplos de la apuesta. Índices 0,1,2 no pagan; 3/4/5 = 3/4/5 en línea. WILD y
// STICKY_WILD sustituyen a cualquier símbolo pero no pagan solos; JACKPOT es scatter, no paga por
// línea (solo cuenta para el contador del bono).
export const PAYS: Record<string, number[]> = {
  CANDY: [0, 0, 0, 0.6, 1.4, 6.0],
  GIFT: [0, 0, 0, 0.9, 2.0, 8.5],
  ELF: [0, 0, 0, 1.6, 4.2, 13.0],
  REINDEER: [0, 0, 0, 2.5, 7.0, 20.0],
  TREE: [0, 0, 0, 5.0, 12.5, 36.0],
  SANTA: [0, 0, 0, 9.0, 24.0, 65.0],
};

export const JACKPOT_COUNTER_TARGET = 100;
export const STICKY_WILD_FREE_SPINS = 10;
