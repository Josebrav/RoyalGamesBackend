/**
 * Los 5 juegos Unity en iframe sin lógica de ronda en el backend (a diferencia de Bingo/Minas) —
 * acá un bot solo simula actividad de fichas, no "juega" de verdad. Slugs deben coincidir con
 * ORIGIN_TO_GAME_SLUG (src/common/constants/game-origins.ts) para que las ganancias queden
 * etiquetadas igual que las de un cliente real.
 */
export const UNITY_BOT_GAMES = [
  { slug: 'royal-joker', label: 'Royal Joker' },
  { slug: 'royal-pachinka', label: 'Royal Pachinka' },
  { slug: 'royalslots', label: 'Royal Slots' },
  { slug: 'santawilds', label: 'Santa Wilds' },
  { slug: 'sugarcalavera', label: 'Sugar Calavera' },
] as const;

export const UNITY_BOT_GAME_SLUGS = UNITY_BOT_GAMES.map((g) => g.slug);
