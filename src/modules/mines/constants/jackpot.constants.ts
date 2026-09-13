// Single global "Gema Royal" jackpot row - see MinesJackpot entity. Fixed id so the app never
// has to find-or-create it under a race; the migration seeds this exact row.
export const MINES_JACKPOT_ID = '11111111-1111-1111-1111-111111111111';

// Confirmed with product: 1% of every bet placed feeds the pot (see MinesService.startRound).
export const MINES_JACKPOT_CONTRIBUTION_RATE = 0.01;

// TESTING: 1 minute so the "about to drop" client-side warning effect (red blink + pulsing
// number, see GemaRoyalUI.cs) can actually be watched end-to-end in a normal test session.
// Switch to `2 * 60 * 60 * 1000` (2 hours, the real target) once confirmed working.
export const MINES_JACKPOT_ELIGIBILITY_WINDOW_MS = 1 * 60 * 1000;
