/**
 * Maps each external game's S3-hosted origin (see cors-origins.ts) to the game's slug in the
 * frontend catalog (src/data/gamesCatalog.js). The games call `add/chips` cross-origin with no
 * JWT and no game field in the body — the browser-sent Origin header is the only reliable signal
 * for which game a chip award came from, so we resolve it server-side instead of trusting a
 * client-supplied value.
 */
export const ORIGIN_TO_GAME_SLUG: Record<string, string> = {
  'https://royalpachinka.s3.us-east-2.amazonaws.com': 'royal-pachinka',
  'https://minasroyal.s3.us-east-2.amazonaws.com': 'minas',
  'https://minas2royal.s3.us-east-2.amazonaws.com': 'minas',
  'https://royaljoker1.s3.us-east-2.amazonaws.com': 'royal-joker',
  'https://bingoroyal.s3.us-east-2.amazonaws.com': 'bingo',
  'https://santawilds.s3.us-east-2.amazonaws.com': 'santawilds',
  'https://royalslots.s3.us-east-2.amazonaws.com': 'royalslots',
  'https://sugarcalavera.s3.us-east-1.amazonaws.com': 'sugarcalavera',
};

export function resolveGameSlugFromOrigin(origin: string | undefined | null): string | null {
  if (!origin) return null;
  return ORIGIN_TO_GAME_SLUG[origin] || null;
}
