// Un bono de slot le pertenece a la pestaña/ventana que lo disparó (ownerToken = el tabId que la
// página le pasa al juego, ver GameFrame en el frontend). Sin esto, el mismo jugador con el juego
// abierto en dos pantallas veía el bono de una en la otra: cualquier tirada continuaba "el bono
// activo del jugador", sin importar desde dónde se tiraba ni con qué apuesta.

// Si la pestaña dueña se cerró o se colgó, el bono no queda trabado para siempre: pasado este
// tiempo sin tiradas, la próxima pestaña que abra el juego lo retoma (ver pickRoundToResume).
export const ORPHANED_ROUND_TAKEOVER_MS = 2 * 60 * 1000;

export interface OwnedRound {
  ownerToken: string | null;
  lastSpinAt: Date;
}

/** Ronda que esta tirada continúa, si hay. Una pestaña solo continúa su propio bono: si el bono
 *  activo es de otra, esta tirada es una tirada base normal con su propia apuesta. Clientes viejos
 *  (sin token) solo continúan rondas también sin dueño, para no meterse en las de clientes nuevos. */
export function pickRoundForSpin<T extends OwnedRound>(rounds: T[], clientToken?: string): T | undefined {
  const token = clientToken || null;
  return rounds.find((round) => round.ownerToken === token);
}

/** Ronda a retomar al cargar el juego: la propia (recarga de la misma pestaña), o una abandonada
 *  por otra pestaña hace más de ORPHANED_ROUND_TAKEOVER_MS. Nunca una que otra pestaña está jugando. */
export function pickRoundToResume<T extends OwnedRound>(
  rounds: T[],
  clientToken: string,
  now: number = Date.now(),
): T | undefined {
  return (
    rounds.find((round) => round.ownerToken === clientToken) ??
    rounds.find((round) => now - new Date(round.lastSpinAt).getTime() >= ORPHANED_ROUND_TAKEOVER_MS)
  );
}
