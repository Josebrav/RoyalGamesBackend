// Must stay in sync with `fixedBetValues` in Assets/BetManager.cs on the Unity client.
// Kept here (not just validated as a range) so a tampered client can't send an
// off-ladder bet amount - the server is the source of truth for what's a legal bet.
export const FIXED_BET_VALUES = [
  10, 50, 100, 250, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
  2000000, 5000000, 10000000, 25000000, 50000000, 100000000,
];

export const MIN_MINES_COUNT = 1;
export const MAX_MINES_COUNT = 24;
export const MINES_TILE_COUNT = 25;

// House edge applied on top of the fair (0-edge) hypergeometric odds for revealing K safe tiles
// out of MINES_TILE_COUNT with minesCount mines - see MinesService.fairMultiplierBp. Confirmed
// with product: 5%. Keeping this separate from MINES_JACKPOT_CONTRIBUTION_RATE (jackpot.constants.ts)
// on purpose - they're two independent cuts, not additive on top of each other.
export const MINES_HOUSE_EDGE = 0.05;
