// Single global "Gema Royal" jackpot row - see MinesJackpot entity. Fixed id so the app never
// has to find-or-create it under a race; the migration seeds this exact row.
export const MINES_JACKPOT_ID = '11111111-1111-1111-1111-111111111111';

// Confirmed with product: 1% of every bet placed feeds the pot (see MinesService.startRound).
export const MINES_JACKPOT_CONTRIBUTION_RATE = 0.01;

export const MINES_JACKPOT_ELIGIBILITY_WINDOW_MS = 24 * 60 * 60 * 1000;
