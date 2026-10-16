import { SantaWildsCell } from './entities/santawilds-round.entity';
import { ROWS, COLS, GRID_SIZE, PAYLINES, BASE_WEIGHTS, BONUS_WEIGHTS, PAYS } from './constants/slot.constants';

// RNG y matemática de la tirada, separado del Service para poder razonar sobre la lógica sin la
// capa de DB/transacciones alrededor. server-only - nunca se manda al cliente nada de esto, solo
// el resultado ya resuelto (ver SantaWildsSlotService), para que el cliente no pueda decidir su
// propio resultado. Puerto literal de sim_lib.js (usado para calibrar RTP/hit-frequency esta
// misma sesión) - cualquier cambio acá debe volver a validarse contra ese mismo script.

export interface WinCoord {
  row: number;
  col: number;
}

export interface WinLine {
  coords: WinCoord[];
}

export interface EvalResult {
  totalMultiples: number;
  jackpotCount: number;
  // Un elemento por línea ganadora, envuelto en {coords: [...]} en vez de un array suelto -
  // Unity (JsonUtility) no deserializa un array de arrays, pero sí un array de objetos que a su
  // vez tienen un array adentro.
  winCoords: WinLine[];
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

/** Tirada base nueva: las 15 celdas se tiran con los pesos normales, ninguna puede salir
 *  STICKY_WILD (no existe en BASE_WEIGHTS) así que todas arrancan sticky=false. */
export function freshGrid(): SantaWildsCell[] {
  return Array.from({ length: GRID_SIZE }, () => ({ symbol: weightedPick(BASE_WEIGHTS), sticky: false }));
}

/** Tirada del bono: las celdas sticky=true quedan fijas (wild pegajoso ya asentado); las demás
 *  se vuelven a tirar con los pesos del bono (JACKPOT excluido, STICKY_WILD incluido). Si una
 *  celda recién tirada sale STICKY_WILD, queda marcada sticky=true para el resto del bono. */
export function rollRemaining(existing: SantaWildsCell[]): SantaWildsCell[] {
  return existing.map((cell) => {
    if (cell.sticky) return cell;
    const symbol = weightedPick(BONUS_WEIGHTS);
    return { symbol, sticky: symbol === 'STICKY_WILD' };
  });
}

/** Completa con wilds pegajosos forzados (en celdas libres al azar) si a esta altura del bono
 *  todavía no se llegó a la cuota repartida: floor(spinNumber * minSticky / totalSpins). Así el
 *  mínimo por bono se cumple de a poco y no todo junto en la última tirada, donde no rendiría. */
export function ensureMinimumSticky(
  cells: SantaWildsCell[],
  spinNumber: number,
  totalSpins: number,
  minSticky: number,
): SantaWildsCell[] {
  const required = Math.min(Math.floor((spinNumber * minSticky) / totalSpins), minSticky);
  const result = [...cells];
  let have = result.filter((cell) => cell.sticky).length;
  while (have < required) {
    const free = result.map((cell, i) => (cell.sticky ? -1 : i)).filter((i) => i >= 0);
    if (free.length === 0) break;
    const i = free[Math.floor(Math.random() * free.length)];
    result[i] = { symbol: 'STICKY_WILD', sticky: true };
    have++;
  }
  return result;
}

/** Evalúa las 5 líneas de pago (todas las que ganen se suman) + cuenta símbolos JACKPOT (scatter,
 *  no paga por línea). WILD y STICKY_WILD sustituyen a cualquier símbolo en cualquier columna. */
export function evalGrid(cells: SantaWildsCell[]): EvalResult {
  const grid: string[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: string[] = [];
    for (let c = 0; c < COLS; c++) row.push(cells[r * COLS + c].symbol);
    grid.push(row);
  }

  let totalMultiples = 0;
  const winCoords: WinLine[] = [];

  for (const line of PAYLINES) {
    let lineBestPay = 0;
    let lineBestCoords: WinCoord[] = [];

    for (const symbol of Object.keys(PAYS)) {
      const coords: WinCoord[] = [];
      for (let c = 0; c < COLS; c++) {
        const row = line[c];
        const cell = grid[row][c];
        const isMatch = cell === symbol || cell === 'WILD' || cell === 'STICKY_WILD';
        if (isMatch) coords.push({ row, col: c });
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

  let jackpotCount = 0;
  for (const row of grid) for (const symbol of row) if (symbol === 'JACKPOT') jackpotCount++;

  return { totalMultiples, jackpotCount, winCoords };
}
