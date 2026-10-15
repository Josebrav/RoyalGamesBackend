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

// % de cada apuesta que se suma a cada pozo (2% en total, cuenta dentro del RTP de 95%). El
// más grande recibe más: cada pozo crece en proporción a lo que tarda en salir (ver
// GEMASOFGOLD_JACKPOT_ELIGIBILITY_WINDOW_MS) - con el reparto anterior (mini 1% ... grand 0.1%)
// el Grand terminaba más chico que el Major y el Minor (2026-10-14).
export const GEMASOFGOLD_JACKPOT_CONTRIBUTION_RATE: Record<GemasOfGoldJackpotTier, number> = {
  grand: 0.01,
  major: 0.0055,
  minor: 0.003,
  mini: 0.0015,
};

// Una vez habilitado un pozo (pasó su ventana de abajo), probabilidad por tirada base de que caiga
// su gema (en una casilla al azar de toda la grilla) - ~1 de cada 25 tiradas, para que llegue a
// los pocos minutos de juego sin ser predecible. Elegido por el usuario (2026-10-11).
export const GEMASOFGOLD_JACKPOT_LAND_CHANCE = 0.04;

// Ventanas de elegibilidad pedidas por el usuario (2026-10-08): mini ~1h, minor ~2-3h,
// major ~4-5h, grand ~6-7h. Se usó el punto medio de cada rango - ajustable sin migración, son
// solo el valor con el que se re-arma nextEligibleAt cada vez que un pozo se reclama.
export const GEMASOFGOLD_JACKPOT_ELIGIBILITY_WINDOW_MS: Record<GemasOfGoldJackpotTier, number> = {
  mini: 1 * 60 * 60 * 1000,
  minor: 2.5 * 60 * 60 * 1000,
  major: 4.5 * 60 * 60 * 1000,
  grand: 6.5 * 60 * 60 * 1000,
};
