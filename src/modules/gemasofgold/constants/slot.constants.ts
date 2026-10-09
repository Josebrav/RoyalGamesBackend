// Grilla 3x3 (3 rodillos x 3 filas), celdas indexadas 0-8 fila por fila (index = row*3 + col).
// Columna 0 (izq) y columna 2 (der): solo "gema común" con multiplicador x1-x20, o vacío.
// Columna 1 (medio): solo "gema gold", o vacío.
export const GRID_SIZE = 9;
export const LEFT_COL_INDEXES = [0, 3, 6];
export const MID_COL_INDEXES = [1, 4, 7];
export const RIGHT_COL_INDEXES = [2, 5, 8];

export const BASE_FREE_SPINS = 3;

// PLACEHOLDERS - nadie confirmó todavía el RTP/economía real de esta slot (a diferencia del 1%
// de Mines, que sí está confirmado). Ajustar antes de ir a producción:
// - SIDE_GEM_LAND_CHANCE: probabilidad de que UNA celda de columna 0 o 2 caiga con gema común
//   (si no, vacía), evaluada independientemente por celda.
// - MIDDLE_GOLD_LAND_CHANCE: probabilidad de que caiga UNA gema gold en la tirada (a lo sumo una
//   por tirada, nunca más - ver SlotEngine.rollMiddle), repartida entre las celdas del medio que
//   todavía estén vacías.
export const SIDE_GEM_LAND_CHANCE = 0.35;
export const MIDDLE_GOLD_LAND_CHANCE = 0.25;

// Valores de multiplicador posibles y su peso relativo (más alto = más común). Peso lineal
// decreciente (21 - valor) para que x1 sea el más frecuente y x20 el más raro - placeholder,
// mismo criterio que las probabilidades de arriba.
export const MULTIPLIER_VALUES: number[] = Array.from({ length: 20 }, (_, i) => i + 1);
export const MULTIPLIER_WEIGHTS: number[] = MULTIPLIER_VALUES.map((v) => 21 - v);
