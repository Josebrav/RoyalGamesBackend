export interface WsEnvelope<T = unknown> {
  type: string;
  payload: T;
}

// ---- Client -> Server ----

export interface BuyCardsMessage {
  gameId: string;
  quantity?: number;
  numbers?: number[];
}

export interface UpdateMarksMessage {
  gameId: string;
  cardId: string;
  marks: Record<string, boolean>;
}

export interface ChatSendMessage {
  message: string;
}

/** Gifts `quantity` free-card credits (scoped to this room's price tier) to another player in
 *  the room - see BingoService.giftCards. Not tied to any specific game. */
export interface GiftCardsMessage {
  targetPlayerId: string;
  quantity: number;
}

/** Guesses which number will be drawn first once `gameId` (a WAITING game) starts - see
 *  BingoService.submitNumberGuess. Only valid while that game is still WAITING; one guess per
 *  player per game, enforced both in code and by a DB unique index. */
export interface GuessNumberMessage {
  gameId: string;
  number: number;
}

/** Sets up (or replaces) "compra automática" for the room the sender is currently connected to -
 *  see BingoService.setAutoBuy. Runs server-side every new round regardless of whether the player
 *  is still connected - see BingoService.processAutoBuyForNewGame. */
export interface SetAutoBuyMessage {
  cardsPerGame: number;
  totalGames: number;
}

/** "Añadir amigo" desde el menú de un nick en el chat - ver BingoService.sendFriendRequestFromPlayer. */
export interface AddFriendMessage {
  targetPlayerId: string;
}

/** "Expulsar de la sala" o "silenciar" desde el menú de un nick - solo admin/mod, ver
 *  BingoService.moderatePlayer. */
export interface ModeratePlayerMessage {
  targetPlayerId: string;
  action: 'kick' | 'mute';
}

// ---- Server -> Client ----

export interface PlayerSummary {
  playerId: string;
  displayName: string;
  cardIds: string[];
}

export interface CardSummary {
  id: string;
  ownerId: string;
  numbers: number[];
  marks: Record<string, boolean>;
}

export interface WinnerSummary {
  playerId: string;
  cardId: string | null;
  winType: string;
  prizeAmount: number;
  roundNumber: number | null;
}

export interface PrizeTable {
  line: number;
  doubleLine: number;
  bingo: number;
}

export interface SuperbingoSummary {
  poolAmount: number;
  thresholdBall: number;
}

export interface GameSnapshotPayload {
  id: string;
  state: 'waiting' | 'running' | 'finished';
  purchaseStartedAt: string | null;
  purchaseWindowSeconds: number;
  waitingSecondsRemaining: number | null;
  startAt: string | null;
  /** How many of `drawnNumbers`/`winnersSoFar` are already "revealed" as of `serverTime`. */
  currentRound: number;
  plannedEndRound: number;
  /** ALL balls for the whole game (running/finished), not just the ones drawn so far -
   *  the client animates locally from `startAt`, it never has to ask for the next ball. */
  drawnNumbers: number[];
  players: PlayerSummary[];
  cards: CardSummary[];
  /** ALL winner events for the whole game plan, each carrying its own `roundNumber` -
   *  the client reveals each one locally once its animation reaches that round. */
  winnersSoFar: WinnerSummary[];
  prizeTable: PrizeTable;
  superbingo: SuperbingoSummary;
}

/** Who is actually sitting in the room right now (socket connected), independent of whether
 *  they've bought any cards yet - drives the room's avatar row and the player list panel. */
export interface PresenceEntry {
  playerId: string;
  userId: string | null;
  displayName: string;
  level: number;
  /** 'admin' | 'mod' | 'user' | null - null when the player has no linked site account. */
  role: string | null;
  /** Has at least one card in the room's CURRENT game - "jugando" vs. just sitting in the room. */
  isPlaying: boolean;
  /** Real wallet balance (User.chips) - 0 when the player has no linked site account. */
  chips: number;
  /** 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' - null when the player has no linked
   *  site account (User.rank only exists on real accounts). */
  rank: string | null;
}

export interface ChatMessageEntry {
  id: string;
  playerId: string | null;
  /** null for system messages and for players with no linked site account - no avatar to fetch. */
  userId: string | null;
  displayName: string;
  role: string | null;
  message: string;
  type: 'chat' | 'system';
  createdAt: string;
}

export interface RoomStatePayload {
  serverTime: string;
  room: { id: string; name: string; betAmount: number; maxPlayers: number };
  /** null for the Lobby pseudo-room - no bingo game ever runs there. Otherwise the RUNNING game if
   *  one exists, else the WAITING one - same "whichever one you'd want to look at" priority
   *  getRoomCurrentGame uses. */
  game: GameSnapshotPayload | null;
  /** The room's WAITING "next round" game, ONLY populated when `game` above is RUNNING - that's
   *  the only time there's a second, separate game worth showing (open for purchases while the
   *  other one's ball draw is in progress). Null the rest of the time, including when `game`
   *  itself IS the waiting one. */
  nextGame: GameSnapshotPayload | null;
  presence: PresenceEntry[];
  /** Last N messages (chat + system) for this room, oldest first - lets someone who just
   *  connected (or reconnected) catch up on the conversation. */
  chatHistory: ChatMessageEntry[];
}

export interface GameFinishedPayload {
  gameId: string;
  resultSummary: Record<string, number>;
  winners: WinnerSummary[];
  superbingo: SuperbingoSummary;
  nextGameId: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}
