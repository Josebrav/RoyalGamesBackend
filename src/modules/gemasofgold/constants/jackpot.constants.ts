// 4 pozos globales compartidos entre TODOS los jugadores (Grand/Major/Minor/Mini), mismo patrón
// que mines/constants/jackpot.constants.ts (un solo pot por nivel, id fijo para no tener que
// hacer find-or-create bajo una race - la migración siembra las 4 filas).
export const GEMASOFGOLD_JACKPOT_TIERS = ['grand', 'major', 'minor', 'mini'] as const;
export type GemasOfGoldJackpotTier = (typeof GEMASOFGOLD_JACKPOT_TIERS)[number];

export const GEMASOFGOLD_JACKPOT_IDS: Record<GemasOfGoldJackpotTier, string> = {
  grand: '22222222-2222-2222-2222-222222222221',
  major: '22222222-2222-2222-2222-222222222222',
  minor: '22222222-2222-2222-2222-222222222223',
  mini: '22222222-2222-2222-2222-222222222224',
};

// PLACEHOLDER - a diferencia de MINES_JACKPOT_CONTRIBUTION_RATE (1%, confirmado con producto),
// estos % todavía no están confirmados. Ajustar antes de ir a producción. Pensados como % de cada
// apuesta que se suma a cada pozo (el más caro/raro recibe menos para que tarde más en vaciarse).
export const GEMASOFGOLD_JACKPOT_CONTRIBUTION_RATE: Record<GemasOfGoldJackpotTier, number> = {
  grand: 0.001,
  major: 0.003,
  minor: 0.006,
  mini: 0.01,
};

// Ventanas de elegibilidad pedidas por el usuario (2026-10-08): mini ~1h, minor ~2-3h,
// major ~4-5h, grand ~6-7h. Se usó el punto medio de cada rango - ajustable sin migración, son
// solo el valor con el que se re-arma nextEligibleAt cada vez que un pozo se reclama.
export const GEMASOFGOLD_JACKPOT_ELIGIBILITY_WINDOW_MS: Record<GemasOfGoldJackpotTier, number> = {
  mini: 1 * 60 * 60 * 1000,
  minor: 2.5 * 60 * 60 * 1000,
  major: 4.5 * 60 * 60 * 1000,
  grand: 6.5 * 60 * 60 * 1000,
};
