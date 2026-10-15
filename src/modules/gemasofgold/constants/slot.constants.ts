// Grilla 3x3 (3 rodillos x 3 filas), celdas indexadas 0-8 fila por fila (index = row*3 + col).
// Columna 0 (izq) y columna 2 (der): solo "gema común" con multiplicador x1-x20, o vacío.
// Columna 1 (medio): solo "gema gold", o vacío.
export const GRID_SIZE = 9;
export const LEFT_COL_INDEXES = [0, 3, 6];
export const MID_COL_INDEXES = [1, 4, 7];
export const RIGHT_COL_INDEXES = [2, 5, 8];

export const BASE_FREE_SPINS = 3;

// Calibrado por simulación Monte Carlo (20M tiradas, 2026-10-14) para RTP total de 95%:
// la slot devuelve ~93% y el 2% restante va a los jackpots (ver
// GEMASOFGOLD_JACKPOT_CONTRIBUTION_RATE), que también vuelve a los jugadores al ganarse.
// Resultado de la simulación con estos valores:
//   - premio (cualquiera) en ~22% de las tiradas
//   - bonus 1 de cada ~40 tiradas (el usuario lo pidió más seguido y que pague menos), paga en
//     promedio ~15x la apuesta (~40% del RTP)
//   - premio máximo observado ~180x
// Si se toca CUALQUIERA de estos valores o la lógica de slot-engine.ts, hay que volver a
// simular: el RTP es muy sensible a ellos (con los placeholders anteriores daba 1428%).
//
// - *_SIDE_GEM_LAND_CHANCE: probabilidad de que UNA celda vacía de columna 0 o 2 caiga con gema
//   común, evaluada independientemente por celda.
// - *_MIDDLE_GOLD_LAND_CHANCE: probabilidad de que caiga UNA gema gold en la tirada (a lo sumo
//   una por tirada), repartida entre las celdas del medio todavía vacías.
// La tirada base y el bonus usan probabilidades distintas: en el bonus son más altas para que
// las casillas libres se vayan llenando.
export const SIDE_GEM_LAND_CHANCE = 0.0732;
export const MIDDLE_GOLD_LAND_CHANCE = 0.6;
export const BONUS_SIDE_GEM_LAND_CHANCE = 0.104;
export const BONUS_MIDDLE_GOLD_LAND_CHANCE = 0.07;

// Valores de multiplicador posibles y su peso relativo (más alto = más común): peso 1/v^1.8,
// x1 es el más frecuente y x20 el más raro (multiplicador promedio ~2.7).
export const MULTIPLIER_VALUES: number[] = Array.from({ length: 20 }, (_, i) => i + 1);
export const MULTIPLIER_WEIGHTS: number[] = MULTIPLIER_VALUES.map((v) => 1 / Math.pow(v, 1.8));
