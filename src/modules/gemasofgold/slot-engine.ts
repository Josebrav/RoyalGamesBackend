import { GemasOfGoldCell } from './entities/gemasofgold-round.entity';
import {
  GRID_SIZE,
  LEFT_COL_INDEXES,
  MID_COL_INDEXES,
  RIGHT_COL_INDEXES,
  SIDE_GEM_LAND_CHANCE,
  MIDDLE_GOLD_LAND_CHANCE,
  MULTIPLIER_VALUES,
  MULTIPLIER_WEIGHTS,
} from './constants/slot.constants';

// RNG y matemática de la tirada, separado del Service para poder razonar sobre la lógica sin la
// capa de DB/transacciones alrededor. server-only - nunca se manda al cliente nada de esto, solo
// el resultado ya resuelto (ver GemasOfGoldService), para que el cliente no pueda decidir su
// propio resultado.
// value siempre es un número (0 para celdas vacías o gold, nunca null) - simplifica el parseo
// del lado de Unity, donde JsonUtility no maneja bien `null` en un campo numérico.
export function emptyCell(): GemasOfGoldCell {
  return { symbol: null, value: 0 };
}

function rollMultiplierValue(): number {
  const totalWeight = MULTIPLIER_WEIGHTS.reduce((s, w) => s + w, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < MULTIPLIER_VALUES.length; i++) {
    roll -= MULTIPLIER_WEIGHTS[i];
    if (roll <= 0) return MULTIPLIER_VALUES[i];
  }
  return MULTIPLIER_VALUES[MULTIPLIER_VALUES.length - 1];
}

// Vuelve a tirar solo las celdas que todavía están en null dentro de `existing` (vacío significa
// "sin resolver", no "bloqueada") - las que ya tienen símbolo quedan pegadas tal cual. Con
// `existing` todo en null (grilla nueva) esto mismo sirve para la tirada base, no hace falta una
// función separada para eso.
export function rollRemaining(existing: GemasOfGoldCell[]): { cells: GemasOfGoldCell[]; changed: boolean } {
  const cells = existing.map((c) => ({ ...c }));
  let changed = false;

  for (const idx of [...LEFT_COL_INDEXES, ...RIGHT_COL_INDEXES]) {
    if (cells[idx].symbol === null && Math.random() < SIDE_GEM_LAND_CHANCE) {
      cells[idx] = { symbol: 'mult', value: rollMultiplierValue() };
      changed = true;
    }
  }

  // A lo sumo UNA gema gold nueva por tirada (pedido explícito del usuario) - se sortea una sola
  // vez si cae o no, y si cae se reparte entre las celdas del medio todavía vacías.
  const blankMidIndexes = MID_COL_INDEXES.filter((idx) => cells[idx].symbol === null);
  if (blankMidIndexes.length > 0 && Math.random() < MIDDLE_GOLD_LAND_CHANCE) {
    const pick = blankMidIndexes[Math.floor(Math.random() * blankMidIndexes.length)];
    cells[pick] = { symbol: 'gold', value: 0 };
    changed = true;
  }

  return { cells, changed };
}

export function freshGrid(): GemasOfGoldCell[] {
  return Array.from({ length: GRID_SIZE }, emptyCell);
}

export function classify(cells: GemasOfGoldCell[]) {
  const leftMult = LEFT_COL_INDEXES.map((i) => cells[i]).filter((c) => c.symbol === 'mult');
  const rightMult = RIGHT_COL_INDEXES.map((i) => cells[i]).filter((c) => c.symbol === 'mult');
  const midGold = MID_COL_INDEXES.map((i) => cells[i]).filter((c) => c.symbol === 'gold');
  return { leftMult, rightMult, midGold };
}

export function sumMultCells(cells: GemasOfGoldCell[]): number {
  return cells
    .filter((c) => c.symbol === 'mult')
    .reduce((sum, c) => sum + (c.value ?? 0), 0);
}

export function countGold(cells: GemasOfGoldCell[]): number {
  return cells.filter((c) => c.symbol === 'gold').length;
}
