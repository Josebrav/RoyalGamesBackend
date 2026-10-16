import {
  ROWS,
  COLS,
  GRID_SIZE,
  PAYLINES,
  FILLER_WEIGHTS,
  PAYS,
  BONUS_TRIGGER_CHANCE,
  BONUS_COUNT_WEIGHTS,
  BONUS_TEASE_COLUMN_CHANCE,
  FREE_TRIGGER_CHANCE,
  FREE_COUNT_WEIGHTS,
  FREE_TEASE_COLUMN_CHANCE,
  FREE_SPINS_AWARD,
  BONUS_CARDS,
} from './constants/slot.constants';

// RNG y matemática de la tirada, separado del Service para poder razonar sobre la lógica sin la
// capa de DB/transacciones alrededor. server-only: el cliente solo recibe el resultado resuelto.

export interface WinCoord {
  row: number;
  col: number;
}

// Envuelto en {coords: [...]} porque Unity (JsonUtility) no deserializa un array de arrays.
export interface WinLine {
  coords: WinCoord[];
}

export interface EvalResult {
  totalMultiples: number;
  winCoords: WinLine[];
  bonusCount: number;
  freeCount: number;
}

function weightedPick(weights: Record<string, number>): string {
  const symbols = Object.keys(weights);
  const total = symbols.reduce((sum, key) => sum + weights[key], 0);
  let roll = Math.random() * total;
  for (const sym of symbols) {
    roll -= weights[sym];
    if (roll < 0) return sym;
  }
  return symbols[symbols.length - 1];
}

/** Cuántos scatters salen: con triggerChance activa (3/4/5 según countWeights); si no, 0-2
 *  sueltos (1 por columna con teaseColumnChance). En tiradas gratis nunca llega a 3. */
function pickScatterCount(
  inFreeSpins: boolean,
  triggerChance: number,
  countWeights: number[],
  teaseColumnChance: number,
): number {
  if (!inFreeSpins && Math.random() < triggerChance) {
    const total = countWeights.reduce((s, w) => s + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < countWeights.length; i++) {
      roll -= countWeights[i];
      if (roll < 0) return 3 + i;
    }
    return 3;
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    let n = 0;
    for (let c = 0; c < COLS; c++) if (Math.random() < teaseColumnChance) n++;
    if (n <= 2) return n;
  }
  return 0;
}

/** Coloca `count` símbolos en columnas distintas al azar, en una fila libre de cada una. */
function placeScatter(cells: (string | null)[], symbol: string, count: number) {
  const cols = Array.from({ length: COLS }, (_, i) => i);
  for (let i = 0; i < count && i < COLS; i++) {
    const j = i + Math.floor(Math.random() * (COLS - i));
    [cols[i], cols[j]] = [cols[j], cols[i]];
    const col = cols[i];
    const freeRows: number[] = [];
    for (let r = 0; r < ROWS; r++) if (cells[r * COLS + col] === null) freeRows.push(r);
    if (freeRows.length > 0) {
      const row = freeRows[Math.floor(Math.random() * freeRows.length)];
      cells[row * COLS + col] = symbol;
    }
  }
}

/** Grilla completa de una tirada (15 símbolos, index = row*5 + col). */
export function generateGrid(inFreeSpins: boolean): string[] {
  const cells: (string | null)[] = Array(GRID_SIZE).fill(null);
  placeScatter(
    cells,
    'BONUS',
    pickScatterCount(
      inFreeSpins,
      BONUS_TRIGGER_CHANCE,
      BONUS_COUNT_WEIGHTS,
      BONUS_TEASE_COLUMN_CHANCE,
    ),
  );
  placeScatter(
    cells,
    'FREE',
    pickScatterCount(
      inFreeSpins,
      FREE_TRIGGER_CHANCE,
      FREE_COUNT_WEIGHTS,
      FREE_TEASE_COLUMN_CHANCE,
    ),
  );
  return cells.map((s) => s ?? weightedPick(FILLER_WEIGHTS));
}

/** Evalúa las 5 líneas de pago de izquierda a derecha (todas las ganadoras se suman; por línea
 *  solo cuenta el mejor símbolo) y cuenta los scatters. */
export function evalGrid(cells: string[]): EvalResult {
  const at = (row: number, col: number) => cells[row * COLS + col];

  let totalMultiples = 0;
  const winCoords: WinLine[] = [];

  for (const line of PAYLINES) {
    let lineBestPay = 0;
    let lineBestCoords: WinCoord[] = [];

    for (const symbol of Object.keys(PAYS)) {
      const coords: WinCoord[] = [];
      for (let c = 0; c < COLS; c++) {
        const row = line[c];
        const cell = at(row, c);
        if (cell === symbol || cell === 'WILD') coords.push({ row, col: c });
        else break;
      }
      if (coords.length >= 3) {
        const pay = PAYS[symbol][coords.length] ?? 0;
        if (pay > lineBestPay) {
          lineBestPay = pay;
          lineBestCoords = coords;
        }
      }
    }

    if (lineBestPay > 0) {
      totalMultiples += lineBestPay;
      winCoords.push({ coords: lineBestCoords });
    }
  }

  const bonusCount = cells.filter((s) => s === 'BONUS').length;
  const freeCount = cells.filter((s) => s === 'FREE').length;

  return { totalMultiples, winCoords, bonusCount, freeCount };
}

export function freeSpinsFor(freeCount: number): number {
  if (freeCount < 3) return 0;
  return FREE_SPINS_AWARD[Math.min(freeCount, 5)] ?? FREE_SPINS_AWARD[3];
}

export function shuffledBonusCards(): number[] {
  const cards = [...BONUS_CARDS];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// Mismo redondeo que el cliente viejo: multiplicador total a 4 decimales, después x apuesta.
export function prizeFor(totalMultiples: number, betAmount: number): number {
  const rounded = Math.round(totalMultiples * 10000) / 10000;
  return Math.round(rounded * betAmount);
}
