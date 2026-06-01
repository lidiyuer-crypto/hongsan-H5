// Pure game state functions — single source of truth for game rules
// Used by both server (GameRoom) and can be used by future client-side validation

import type { Card } from './card';
import { Card as CardClass } from './card';
import type { PlayInfo } from './analyzer';
import { HAND_TYPES, POWER_LEVEL } from './constants';

// ===== Types =====

export interface RoomConfig {
  baseAmount: number;
  doubleType: 'flat' | 'steep';
  smartShuffle: boolean;
  smartShuffleLevel: number;
  totalRounds: number;
  showHandCount: boolean;
}

export interface GamePlayer {
  id: number;           // seat 0-3
  userId: number;        // database user id
  name: string;
  hand: Card[];
  pot: number;           // cards won from pots
  finished: boolean;
  isRed3Team: boolean;
  revealed: boolean;
  rank: number | null;
  canChe: boolean;
  isBot: boolean;
  disconnected: boolean;
}

export interface GameStateData {
  gameId: number;
  players: GamePlayer[];
  config: RoomConfig;
  currentRound: number;
  status: 'playing' | 'finished';

  // Turn state
  turnIndex: number;
  lastValidPlay: PlayInfo | null;
  lastPlayByPlayerId: number;
  passCount: number;
  passStatuses: boolean[];

  // Table
  tableCards: Card[];
  historyCards: Card[];

  // First turn
  isFirstTurnOfGame: boolean;

  // Che phase
  chePhase: boolean;
  chePhaseStartedAt: number | null;
  cheTimerExpired: boolean;
  askingSourceId: number;
  roundHasCheHappened: boolean;

  // Business mode
  isBusinessMode: boolean;
  businessPlayerId: number;

  // Trackers
  roundHistory: { playerId: number; type: number; rank: number; cards: Card[] }[];
  rankCounter: number;
  red3CountByPlayer: Record<number, number>;

  // Victory
  victoryReason: string | null;
  victoryTeam: string | null;

  // Pots
  pendingCollect: boolean;
  pendingPassPlayerId: number;
  teamPotBonus: Record<string, number> | null;
  tributeProcessed: boolean;

  // Accumulated
  accumulatedScores: Record<number, number>;
  _scoresStored: boolean;
}

// ===== Factory =====

export function createInitialGameState(
  gamePlayers: GamePlayer[],
  config: RoomConfig,
  isBusinessMode: boolean,
  businessPlayerId: number,
  firstPlayer: number,
  currentRound: number = 1,
  accumulatedScores: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 },
): GameStateData {
  const gameId = Date.now();

  return {
    gameId,
    players: gamePlayers,
    config,
    currentRound,
    status: 'playing',

    turnIndex: firstPlayer,
    lastValidPlay: null,
    lastPlayByPlayerId: -1,
    passCount: 0,
    passStatuses: [false, false, false, false],

    tableCards: [],
    historyCards: [],

    isFirstTurnOfGame: true,

    chePhase: false,
    chePhaseStartedAt: null,
    cheTimerExpired: false,
    askingSourceId: -1,
    roundHasCheHappened: false,

    isBusinessMode,
    businessPlayerId,

    roundHistory: [],
    rankCounter: 0,
    red3CountByPlayer: {},

    victoryReason: null,
    victoryTeam: null,

    pendingCollect: false,
    pendingPassPlayerId: -1,
    teamPotBonus: null,
    tributeProcessed: false,

    accumulatedScores,
    _scoresStored: false,
  };
}

// ===== Pure Game Logic Functions =====

/**
 * Find the next active player clockwise from fromId.
 * Pure function — no side effects.
 */
export function findNextPlayer(state: GameStateData, fromId: number): number {
  let next = (fromId - 1 + 4) % 4; // clockwise
  for (let i = 0; i < 4; i++) {
    if (!state.players[next].finished) return next;
    next = (next - 1 + 4) % 4;
  }
  return next;
}

/**
 * Execute a play action — removes cards from hand, updates table, records history.
 * Mutates state in-place (matches original engine pattern).
 */
export function executePlay(
  state: GameStateData,
  playerId: number,
  cards: Card[],
  playInfo: PlayInfo,
  isSelfChe: boolean,
  cheRemainCards?: { suit: number; rankValue: number }[],
): void {
  const player = state.players[playerId];

  // Remove cards from hand
  cards.forEach(c => {
    const idx = player.hand.findIndex(h => h.suit === c.suit && h.rankValue === c.rankValue);
    if (idx >= 0) player.hand.splice(idx, 1);
  });

  // Self-che: remove remaining che cards from hand too
  if (isSelfChe) {
    state.roundHasCheHappened = true;
    if (cheRemainCards) {
      cheRemainCards.forEach(c => {
        const idx = player.hand.findIndex(h => h.suit === c.suit && h.rankValue === c.rankValue);
        if (idx >= 0) player.hand.splice(idx, 1);
      });
    }
  }

  // Add to table (old tableCards → history, new cards → table)
  if (state.tableCards.length > 0) {
    state.historyCards.push(...state.tableCards);
  }
  state.tableCards = [...cards];

  // Update game state
  state.lastValidPlay = playInfo;
  state.lastPlayByPlayerId = playerId;
  state.isFirstTurnOfGame = false;
  state.passStatuses = [false, false, false, false];
  state.passCount = 0;

  // Self-che: mark last play as che type
  if (isSelfChe) {
    state.lastValidPlay = { ...playInfo, type: HAND_TYPES.CHE } as PlayInfo;
    if (cheRemainCards && cheRemainCards.length > 0) {
      state.historyCards.push(...state.tableCards);
      state.tableCards = cheRemainCards.map(c => new CardClass(c.suit, c.rankValue));
    }
  }

  state.roundHistory.push({
    playerId,
    type: playInfo.type,
    rank: playInfo.rank,
    cards,
  });

  // Check red3 count for reveal
  const red3Count = cards.filter(c => c.isRed3).length;
  if (red3Count > 0) {
    state.red3CountByPlayer[playerId] = (state.red3CountByPlayer[playerId] || 0) + red3Count;
    updateRevealed(state);
  }
}

/**
 * Activate the che (扯牌) phase after a single card is played.
 */
export function activateChePhase(state: GameStateData, sourcePlayerId: number, rankValue: number): boolean {
  state.chePhase = true;
  state.chePhaseStartedAt = Date.now();
  state.cheTimerExpired = false;
  state.askingSourceId = sourcePlayerId;

  let anyHumanCanChe = false;
  state.players.forEach(p => {
    if (p.id !== sourcePlayerId && !p.finished) {
      const count = p.hand.filter(c => c.rankValue === rankValue).length;
      p.canChe = count >= 2;
      if (p.canChe && !p.isBot) anyHumanCanChe = true;
    }
  });

  return anyHumanCanChe; // caller uses this to set appropriate timeout
}

/**
 * End the che phase — all che flags reset, advance turn.
 */
export function endChePhase(state: GameStateData): void {
  state.chePhase = false;
  state.cheTimerExpired = true;
  state.roundHasCheHappened = true;
  state.players.forEach(p => { p.canChe = false; });
}

/**
 * Collect pot — winner gets all table + history cards.
 * Returns the winner's player id.
 */
export function collectPot(state: GameStateData): number {
  const winnerId = state.lastPlayByPlayerId;
  const winner = state.players[winnerId];
  winner.pot += state.tableCards.length + state.historyCards.length;
  state.tableCards = [];
  state.historyCards = [];
  state.lastValidPlay = null;
  state.pendingCollect = false;
  state.passStatuses = [false, false, false, false];
  state.passCount = 0;
  state.roundHasCheHappened = false;
  state.turnIndex = winnerId;
  return winnerId;
}

/**
 * Update player identity reveal status based on red 3 plays.
 * 5-condition reveal logic for business mode.
 */
export function updateRevealed(state: GameStateData): void {
  // Business mode: the business player knows all identities from the start
  const player0 = state.players[0];
  const player0IsBusiness = player0 && player0.id === state.businessPlayerId;

  if (player0IsBusiness) {
    state.players.forEach(p => { if (p.id !== 0) p.revealed = true; });
    return;
  }

  if (state.isBusinessMode) {
    const bpRed3 = state.red3CountByPlayer[state.businessPlayerId] || 0;
    if (bpRed3 === 1) {
      state.players.forEach(p => { p.revealed = p.id === state.businessPlayerId; });
    } else if (bpRed3 >= 2) {
      state.players.forEach(p => { p.revealed = true; });
    } else {
      state.players.forEach(p => { p.revealed = false; });
    }
    return;
  }

  // Normal mode: reveal Red 3 team players who have played Red 3s
  let revealedCount = 0;
  for (let i = 1; i < 4; i++) {
    const p = state.players[i];
    if (p.isRed3Team && (state.red3CountByPlayer[i] || 0) > 0) {
      p.revealed = true;
      revealedCount++;
    }
  }
  if (revealedCount >= 1 && player0 && player0.isRed3Team) {
    // If P0 is also red team and at least 1 teammate revealed → all revealed
    state.players.forEach(p => { if (p.id !== 0) p.revealed = true; });
  } else if (revealedCount >= 2) {
    // 2+ non-P0 red team revealed → all revealed
    state.players.forEach(p => { p.revealed = true; });
  }
}

/**
 * Check if the current round has ended via team victory.
 * Mutates state.status, state.victoryReason, state.victoryTeam if victory found.
 * Returns true if victory was detected.
 */
export function checkTeamVictory(state: GameStateData): boolean {
  const finished = state.players.filter(p => p.finished && p.rank !== null);

  // Business mode
  if (state.isBusinessMode) {
    const bp = state.players[state.businessPlayerId];
    if (bp && bp.finished && bp.rank !== null && bp.rank <= 3) {
      state.status = 'finished';
      state.victoryReason = '业务胜利';
      state.victoryTeam = 'business';
      return true;
    }
    if (bp && (!bp.finished || bp.rank === 4)) {
      const nonBP = finished.filter(p => p.id !== state.businessPlayerId);
      if (nonBP.length === 3) {
        const ranks = nonBP.map(p => p.rank);
        if (ranks.includes(1) && ranks.includes(2) && ranks.includes(3)) {
          state.status = 'finished';
          state.victoryReason = '非业务玩家胜利';
          state.victoryTeam = bp.isRed3Team ? 'black' : 'red';
          return true;
        }
      }
    }
  }

  if (finished.length < 2) return false;

  const ranks: Record<number, any> = {};
  finished.forEach(p => { ranks[p.rank!] = p; });

  // Double lock
  if (!state.isBusinessMode && ranks[1] && ranks[2]) {
    const p1 = ranks[1], p2 = ranks[2];
    if (p1.isRed3Team === p2.isRed3Team) {
      state.status = 'finished';
      state.victoryReason = '双关';
      state.victoryTeam = p1.isRed3Team ? 'red' : 'black';
      return true;
    }
  }

  // Tribute logic: 1-3 same team → winning team +5, 2-4 same team → winning team +5
  if (!state.tributeProcessed) {
    if (ranks[1] && ranks[3]) {
      const p1 = ranks[1], p3 = ranks[3];
      if (p1.isRed3Team === p3.isRed3Team) {
        const winningTeam = p1.isRed3Team ? 'red' : 'black';
        if (!state.teamPotBonus) state.teamPotBonus = { red_team: 0, black_team: 0 };
        state.teamPotBonus[winningTeam === 'red' ? 'red_team' : 'black_team'] += 5;
        state.tributeProcessed = true;
      }
    }
    if (ranks[2] && ranks[4]) {
      const p2 = ranks[2], p4 = ranks[4];
      if (p2.isRed3Team === p4.isRed3Team) {
        const winningTeam = p2.isRed3Team ? 'black' : 'red'; // 2-4: opposite of 1-3
        if (!state.teamPotBonus) state.teamPotBonus = { red_team: 0, black_team: 0 };
        state.teamPotBonus[winningTeam === 'red' ? 'red_team' : 'black_team'] += 5;
        state.tributeProcessed = true;
      }
    }
  }

  return false;
}

/**
 * Check if only 1 player remains — assign rank 4 to last player, give their cards to winner.
 * Mutates state in-place.
 */
export function checkGameOver(state: GameStateData): void {
  const activePlayers = state.players.filter(p => !p.finished);
  if (activePlayers.length === 1) {
    const lastPlayer = activePlayers[0]!;
    // Assign rank if not already assigned
    if (lastPlayer.rank === null) {
      state.rankCounter++;
      lastPlayer.rank = state.rankCounter;
    }
    lastPlayer.finished = true;

    // Give winner the last player's hand + table/history cards as bonus
    const winnerId = state.lastPlayByPlayerId >= 0
      ? state.lastPlayByPlayerId
      : (state.players.find(p => p.rank === 1)?.id ?? -1);
    if (winnerId >= 0) {
      const winner = state.players[winnerId];
      if (winner) {
        winner.pot += lastPlayer.hand.length + state.tableCards.length + state.historyCards.length;
      }
    }

    // Clear table/history to prevent double-counting from any pending collectPot timer
    state.tableCards = [];
    state.historyCards = [];
    state.pendingCollect = false;

    determineWinnerByPot(state);
  }
}

/**
 * Determine round winner by comparing team pot totals.
 * Only used when round ends without a team victory (last player finished).
 */
export function determineWinnerByPot(state: GameStateData): void {
  // Only use pot comparison if no victory reason already set
  if (state.victoryReason) return;

  if (state.currentRound < state.config.totalRounds) {
    const redPot = state.players.filter(p => p.isRed3Team).reduce((s, p) => s + p.pot, 0);
    const blackPot = state.players.filter(p => !p.isRed3Team).reduce((s, p) => s + p.pot, 0);

    const tb = state.teamPotBonus || { red_team: 0, black_team: 0 };
    const redFinal = redPot + (tb.red_team || 0);
    const blackFinal = blackPot + (tb.black_team || 0);

    state.status = 'finished';
    state.victoryReason = '章子比拼';
    if (redFinal > blackFinal) state.victoryTeam = 'red';
    else if (blackFinal > redFinal) state.victoryTeam = 'black';
    else {
      // Tiebreaker: rank 1 player's team wins
      const rank1 = state.players.find(p => p.rank === 1);
      state.victoryTeam = rank1?.isRed3Team ? 'red' : 'black';
    }
  }
}

/**
 * Reset game state for the next round (new deal, same accumulated scores).
 */
export function resetForNextRound(
  state: GameStateData,
  hands: Card[][],
  isBusinessMode: boolean,
  businessPlayerId: number,
  firstPlayer: number,
): void {
  state.currentRound++;
  state.status = 'playing';
  state.victoryReason = null;
  state.victoryTeam = null;

  state.players.forEach((p) => {
    p.hand = hands[p.id]!;
    p.pot = 0;
    p.finished = false;
    p.revealed = false;
    p.rank = null;
    p.canChe = false;
    p.isRed3Team = false;
  });

  state.isBusinessMode = isBusinessMode;
  state.businessPlayerId = businessPlayerId;

  state.turnIndex = firstPlayer;
  state.lastValidPlay = null;
  state.lastPlayByPlayerId = -1;
  state.passCount = 0;
  state.passStatuses = [false, false, false, false];
  state.tableCards = [];
  state.historyCards = [];
  state.isFirstTurnOfGame = true;
  state.chePhase = false;
  state.chePhaseStartedAt = null;
  state.cheTimerExpired = false;
  state.askingSourceId = -1;
  state.roundHasCheHappened = false;
  state.roundHistory = [];
  state.rankCounter = 0;
  state.red3CountByPlayer = { 0: 0, 1: 0, 2: 0, 3: 0 };
  state.tributeProcessed = false;
  state.teamPotBonus = null;
  state.pendingCollect = false;
  state.pendingPassPlayerId = -1;
  state._scoresStored = false;
}
