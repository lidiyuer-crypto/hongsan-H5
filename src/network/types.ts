// ===== WebSocket Message Types =====

// Client → Server
export interface ClientMessages {
  auth: { type: "auth"; token: string };
  create_room: { type: "create_room"; baseAmount: number; doubleType: string; smartShuffle: boolean; smartShuffleLevel: number; totalRounds: number; showHandCount: boolean };
  join_room: { type: "join_room"; roomCode: string };
  ready: { type: "ready" };
  start_game: { type: "start_game" };
  play_cards: { type: "play_cards"; cards: CardRef[]; isSelfChe?: boolean; cheRemainCards?: CardRef[] };
  pass: { type: "pass" };
  che_action: { type: "che_action"; cards: CardRef[] };
  decline_che: { type: "decline_che" };
  next_round: { type: "next_round" };
  leave_room: { type: "leave_room" };
  reconnect: { type: "reconnect" };
}

export type ClientMessage = ClientMessages[keyof ClientMessages];

// Server → Client
export interface CardRef {
  suit: number;
  rankValue: number;
  displayRank?: string;
  suitChar?: string;
  color?: string;
  isRed3?: boolean;
  isH4?: boolean;
}

export interface RoomPlayer {
  userId: number;
  seat: number;
  name: string;
  ready: boolean;
  isBot?: boolean;
}

export interface RoomStateData {
  players: RoomPlayer[];
  config: GameConfig;
  ownerId?: number;
}

export interface GameConfig {
  baseAmount: number;
  doubleType: "flat" | "steep";
  smartShuffle: boolean;
  smartShuffleLevel: number;
  totalRounds: number;
  showHandCount: boolean;
}

export interface PlayerView {
  id: number;
  name: string;
  hand: CardRef[];           // Only for self
  handCount: number;
  pot: number;
  finished: boolean;
  isRed3Team?: boolean;
  revealed: boolean;
  rank: number | null;
  canChe: boolean;
  isBot: boolean;
  disconnected: boolean;
}

export interface LastValidPlay {
  type: number;
  rank: number;
  level: number;
  length?: number;
  cards: CardRef[];
}

export interface GameStateData {
  gameId: number;
  currentRound: number;
  status: "playing" | "finished";
  config: GameConfig;
  players: PlayerView[];
  mySeat: number;

  turnIndex: number;
  lastValidPlay: LastValidPlay | null;
  lastPlayByPlayerId: number;
  passStatuses: boolean[];

  tableCards: CardRef[];
  historyCards: CardRef[];
  tablePotCount: number;

  isFirstTurnOfGame: boolean;
  chePhase: boolean;
  chePhaseStartedAt: number | null;
  cheTimerExpired: boolean;
  askingSourceId: number;
  roundHasCheHappened: boolean;

  pendingCollect: boolean;
  pendingPassPlayerId: number;

  isBusinessMode: boolean;
  businessPlayerId: number;

  currentFans: number;
  accumulatedScores: Record<number, number>;
}

export interface SettlementData {
  fans: number;
  bombFans: number;
  extraFans: number;
  extraFansLabel: string;
  bombDetails: BombDetail[];
  amount: number;
  results: SettlementPlayerResult[];
  victoryReason: string;
  victoryTeam: string;
  currentRound: number;
  totalRounds: number;
  isLastRound: boolean;
  accumulatedScores: Record<number, number>;
}

export interface BombDetail {
  playerId: number;
  type: string;
  fans: number;
  rank: number;
  cards: CardRef[];
}

export interface SettlementPlayerResult {
  playerId: number;
  name: string;
  isRed3Team: boolean;
  rank: number | null;
  rankName: string;
  pot: number;
  won: number;
  lost: number;
  netWon: number;
}

// Server → Client message types
export interface ServerMessages {
  auth_ok: { type: "auth_ok"; userId: number; nickname: string };
  error: { type: "error"; message: string };
  room_created: { type: "room_created"; roomCode: string };
  room_joined: { type: "room_joined"; roomCode: string; seat: number };
  room_left: { type: "room_left" };
  room_state: { type: "room_state"; players: RoomPlayer[]; config: GameConfig; ownerId?: number };
  game_start: { type: "game_start"; gameId: number; state: GameStateData };
  game_state: { type: "game_state"; state: GameStateData };
  action_result: { type: "action_result"; success: boolean; error?: string; pendingCollect?: boolean };
  settlement: { type: "settlement"; result: SettlementData };
  player_joined: { type: "player_joined"; userId: number };
  player_left: { type: "player_left"; userId: number };
  player_disconnected: { type: "player_disconnected"; userId: number };
  player_reconnected: { type: "player_reconnected"; userId: number };
}

export type ServerMessage = ServerMessages[keyof ServerMessages];
