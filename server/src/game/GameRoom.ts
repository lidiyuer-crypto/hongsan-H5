import { Card } from '../engine/card';
import { createFullDeck, smartShuffleDeal, normalDeal, assignTeams } from '../engine/deck';
import { analyze, canBeat, generateAllValidPlays } from '../engine/analyzer';
import { HAND_TYPES, POWER_LEVEL } from '../engine/constants';
import { calculateFans, calculateSettlement } from '../engine/scoring';
import type { PlayInfo } from '../engine/analyzer';
import { broadcastToRoom, sendToUser } from '../ws/handler';

// ===== Types =====

export interface RoomConfig {
  baseAmount: number;
  doubleType: 'flat' | 'steep';
  smartShuffle: boolean;
  smartShuffleLevel: number;
  totalRounds: number;
  showHandCount: boolean;
}

interface GamePlayer {
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

interface GameState {
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

// ===== GameRoom =====

const TURN_TIMEOUT = 30000;  // 30s
const CHE_TIMEOUT = 3000;    // 3s
const DISCONNECT_GRACE = 60000; // 60s before AI substitution

export class GameRoom {
  roomCode: string;
  ownerId: number;
  players: { userId: number; seat: number; name: string; ready: boolean; isBot: boolean }[] = [];
  config: RoomConfig;
  game: GameState | null = null;
  private botCounter = 0;

  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private cheTimer: ReturnType<typeof setTimeout> | null = null;
  private collectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private botTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  constructor(roomCode: string, config: RoomConfig, ownerId: number) {
    this.roomCode = roomCode;
    this.config = config;
    this.ownerId = ownerId;
  }

  // ===== Room Management =====

  addPlayer(userId: number, seat: number, name: string) {
    if (this.players.length >= 4) return { error: '房间已满' };
    if (this.players.some(p => p.seat === seat)) return { error: '座位已被占' };
    if (this.players.some(p => p.userId === userId)) return { error: '你已在房间中' };

    this.players.push({ userId, seat, name, ready: false, isBot: false });
    this.broadcastRoomState();
    return { success: true };
  }

  addBot(): { success?: boolean; error?: string } {
    if (this.players.length >= 4) return { error: '房间已满' };
    if (this.game) return { error: '游戏已开始' };

    // Find available seat
    const takenSeats = new Set(this.players.map(p => p.seat));
    let seat = -1;
    for (let s = 0; s < 4; s++) {
      if (!takenSeats.has(s)) { seat = s; break; }
    }

    const botNames = ['电脑A', '电脑B', '电脑C', '电脑D'];
    this.botCounter++;
    const botUserId = -(seat + 1) * 1000 - this.botCounter; // negative to distinguish from real users
    const botName = botNames[seat] || `电脑${seat + 1}`;

    this.players.push({ userId: botUserId, seat, name: botName, ready: true, isBot: true });
    this.broadcastRoomState();
    return { success: true };
  }

  removePlayer(userId: number) {
    this.players = this.players.filter(p => p.userId !== userId);
    if (this.players.length === 0) {
      this.cleanup();
    } else {
      this.broadcastRoomState();
    }
  }

  toggleReady(userId: number) {
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;
    player.ready = !player.ready;
    this.broadcastRoomState();

    // Auto-start if all 4 ready
    if (this.players.length === 4 && this.players.every(p => p.ready)) {
      this.startGame();
    }
  }

  canStart(): boolean {
    // At least 1 human player, all seats filled, all humans ready
    const humanPlayers = this.players.filter(p => !p.isBot);
    return this.players.length === 4 && humanPlayers.every(p => p.ready) && humanPlayers.length >= 1;
  }

  // ===== Game Lifecycle =====

  startGame() {
    // Auto-fill remaining seats with bots
    while (this.players.length < 4) {
      const result = this.addBot();
      if ('error' in result) break;
    }

    if (!this.canStart()) return;

    // Deal cards
    const deck = createFullDeck();
    const hands = this.config.smartShuffle
      ? smartShuffleDeal(deck, this.config.smartShuffleLevel)
      : normalDeal(deck);

    // Assign seats to hands
    const gamePlayers: GamePlayer[] = this.players.map((rp) => ({
      id: rp.seat,
      userId: rp.userId,
      name: rp.name,
      hand: hands[rp.seat],
      pot: 0,
      finished: false,
      isRed3Team: false,
      revealed: false,
      rank: null,
      canChe: false,
      isBot: rp.isBot,
      disconnected: false,
    }));

    // Assign teams — pass gamePlayers directly (assignTeams mutates the objects in-place)
    const { isBusinessMode, businessPlayerId, firstPlayer } = assignTeams(gamePlayers);

    const gameId = Date.now();

    this.game = {
      gameId,
      players: gamePlayers,
      config: this.config,
      currentRound: 1,
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

      accumulatedScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      _scoresStored: false,
    };

    // Broadcast game start to each player (with filtered state)
    this.players.forEach(rp => {
      const state = this.getStateForPlayer(rp.seat);
      sendToUser(rp.userId, { type: 'game_start', gameId, state });
    });

    // Start turn timer
    this.startTurnTimer();
  }

  // ===== State Filtering =====

  getStateForPlayer(seat: number): any {
    if (!this.game) return null;
    const g = this.game;

    // Build player views - only show full hand for own seat
    const playerViews = g.players.map(p => {
      const isMe = p.id === seat;
      return {
        id: p.id,
        name: p.name,
        hand: isMe ? p.hand.map(c => c.toJSON()) : [],
        handCount: p.hand.length,
        pot: p.pot,
        finished: p.finished,
        isRed3Team: p.revealed ? p.isRed3Team : undefined,
        revealed: p.revealed,
        rank: p.rank,
        canChe: p.canChe,
        isBot: p.isBot,
        disconnected: p.disconnected,
      };
    });

    return {
      gameId: g.gameId,
      currentRound: g.currentRound,
      status: g.status,
      config: g.config,
      players: playerViews,
      mySeat: seat,

      turnIndex: g.turnIndex,
      lastValidPlay: g.lastValidPlay ? {
        type: g.lastValidPlay.type,
        rank: g.lastValidPlay.rank,
        level: g.lastValidPlay.level,
        length: g.lastValidPlay.length,
        cards: g.lastValidPlay.cards.map(c => c.toJSON()),
      } : null,
      lastPlayByPlayerId: g.lastPlayByPlayerId,
      passStatuses: g.passStatuses,

      tableCards: g.tableCards.map(c => c.toJSON()),
      historyCards: g.historyCards.map(c => c.toJSON()),
      tablePotCount: g.tableCards.length + g.historyCards.length,

      isFirstTurnOfGame: g.isFirstTurnOfGame,

      chePhase: g.chePhase,
      chePhaseStartedAt: g.chePhaseStartedAt,
      cheTimerExpired: g.cheTimerExpired,
      askingSourceId: g.askingSourceId,
      roundHasCheHappened: g.roundHasCheHappened,

      pendingCollect: g.pendingCollect,
      pendingPassPlayerId: g.pendingPassPlayerId,

      isBusinessMode: g.isBusinessMode,
      businessPlayerId: g.businessPlayerId,

      // Count fans from round history (for display)
      currentFans: g.roundHistory.reduce((sum, r) => {
        if (r.type === HAND_TYPES.BOMB) return sum + 1;
        if (r.type === HAND_TYPES.H_BOMB) return sum + 2;
        return sum;
      }, 0),

      accumulatedScores: g.accumulatedScores,
    };
  }

  broadcastGameState() {
    if (!this.game) return;
    this.players.forEach(rp => {
      const state = this.getStateForPlayer(rp.seat);
      sendToUser(rp.userId, { type: 'game_state', state });
    });
  }

  broadcastRoomState() {
    broadcastToRoom(this.roomCode, {
      type: 'room_state',
      ownerId: this.ownerId,
      players: this.players.map(p => ({
        userId: p.userId,
        seat: p.seat,
        name: p.name,
        ready: p.ready,
        isBot: p.isBot,
      })),
      config: this.config,
    });
  }

  // ===== Player Actions =====

  playCards(userId: number, cardsData: { suit: number; rankValue: number }[], isSelfChe: boolean) {
    if (!this.game) return { error: '游戏未开始' };
    const g = this.game;
    const player = g.players.find(p => p.userId === userId);
    if (!player) return { error: '玩家不存在' };
    if (g.turnIndex !== player.id) return { error: '还没轮到你' };
    if (g.chePhase && !player.canChe) return { error: '扯牌阶段不能出牌' };

    // Find cards in player's hand
    const cards: Card[] = [];
    const remainingData = [...cardsData.map(c => ({ ...c }))];
    for (const c of player.hand) {
      const idx = remainingData.findIndex(d => d.suit === c.suit && d.rankValue === c.rankValue);
      if (idx >= 0) {
        cards.push(c);
        remainingData.splice(idx, 1);
      }
    }
    if (remainingData.length > 0) return { error: '手牌中没有这些牌' };

    // Analyze
    const playInfo = analyze(cards);
    if (!playInfo) return { error: '无效牌型' };

    // First turn check
    if (g.isFirstTurnOfGame && g.turnIndex === g.players.find(p => p.hand.some(c => c.isH4))?.id) {
      const hasH4 = cards.some(c => c.isH4);
      const isThreeFours = cards.length === 3 && cards.every(c => c.rankValue === 4) && cards.some(c => c.isH4);
      if (!hasH4 && !isThreeFours) return { error: '首回合必须出红桃4' };
    }

    // Can beat check
    if (!canBeat(g.lastValidPlay, playInfo)) return { error: '打不过场上的牌' };

    // Execute play
    this.executePlay(player.id, cards, playInfo, isSelfChe);

    // Check game over
    if (player.hand.length === 0) {
      player.finished = true;
      player.rank = ++g.rankCounter;

      // Check team victory
      this.checkTeamVictory();
      if (g.status === 'finished') {
        this.endGame();
        return { success: true, gameFinished: true };
      }
    }

    // Check if only 1 active player left
    if (g.players.filter(p => !p.finished).length === 1) {
      this.checkGameOver();
      if (g.status === 'finished') {
        this.endGame();
        return { success: true, gameFinished: true };
      }
    }

    // Check che phase activation
    if (playInfo.type === HAND_TYPES.SINGLE && !g.chePhase && !g.roundHasCheHappened) {
      this.activateChePhase(player.id, cards[0].rankValue);
    } else {
      this.advanceTurn();
    }

    this.broadcastGameState();
    return { success: true };
  }

  passTurn(userId: number) {
    if (!this.game) return { error: '游戏未开始' };
    const g = this.game;
    const player = g.players.find(p => p.userId === userId);
    if (!player) return { error: '玩家不存在' };
    if (g.turnIndex !== player.id) return { error: '还没轮到你' };
    if (g.chePhase) return { error: '扯牌阶段不能过牌' };

    g.passStatuses[player.id] = true;
    g.passCount++;

    // Check if all other active players passed
    const activePlayers = g.players.filter(p => !p.finished);
    const passedCount = activePlayers.filter(p => g.passStatuses[p.id]).length;

    if (passedCount >= activePlayers.length - 1 && activePlayers.length > 1) {
      // Collect pot
      g.pendingCollect = true;
      g.pendingPassPlayerId = player.id;
      this.collectTimer = setTimeout(() => this.collectPot(), 1000);
      broadcastToRoom(this.roomCode, { type: 'action_result', success: true, pendingCollect: true });
    } else {
      this.advanceTurn();
    }

    this.broadcastGameState();
    return { success: true };
  }

  cheAction(userId: number, cardsData: { suit: number; rankValue: number }[]) {
    if (!this.game) return { error: '游戏未开始' };
    const g = this.game;
    const player = g.players.find(p => p.userId === userId);
    if (!player || !player.canChe) return { error: '不能扯牌' };
    if (!g.chePhase) return { error: '不在扯牌阶段' };

    // Find cards
    const cards: Card[] = [];
    const remainingData = [...cardsData.map(c => ({ ...c }))];
    for (const c of player.hand) {
      const idx = remainingData.findIndex(d => d.suit === c.suit && d.rankValue === c.rankValue);
      if (idx >= 0) {
        cards.push(c);
        remainingData.splice(idx, 1);
      }
    }

    if (cards.length !== 2) return { error: '扯牌需要2张同点数牌' };
    if (cards[0].rankValue !== cards[1].rankValue) return { error: '扯牌需要2张同点数的牌' };

    // Execute che
    this.clearCheTimers();
    g.chePhase = false;
    g.roundHasCheHappened = true;

    // Remove cards from hand
    cards.forEach(c => {
      const idx = player.hand.findIndex(h => h.suit === c.suit && h.rankValue === c.rankValue);
      if (idx >= 0) player.hand.splice(idx, 1);
    });

    // Set as last valid play (che type)
    g.lastValidPlay = { type: HAND_TYPES.CHE, rank: cards[0].rankValue, level: POWER_LEVEL.NORMAL, cards };
    g.lastPlayByPlayerId = player.id;
    g.passStatuses = [false, false, false, false];
    g.passCount = 0;
    g.roundHistory.push({ playerId: player.id, type: HAND_TYPES.CHE, rank: cards[0].rankValue, cards });

    // Reset che flags
    g.players.forEach(p => { p.canChe = false; });

    // Turn moves to the player AFTER the che player (clockwise)
    g.turnIndex = this.findNextPlayer(player.id);
    this.startTurnTimer();

    this.broadcastGameState();
    return { success: true };
  }

  declineChe(userId: number) {
    if (!this.game) return { error: '游戏未开始' };
    const g = this.game;
    const player = g.players.find(p => p.userId === userId);
    if (!player || !player.canChe) return { error: '你不能扯牌' };

    player.canChe = false;

    // Check if anyone can still che
    const anyCanChe = g.players.some(p => p.canChe);
    if (!anyCanChe) {
      this.endChePhase();
    }

    this.broadcastGameState();
    return { success: true };
  }

  // ===== Core Game Logic =====

  private executePlay(playerId: number, cards: Card[], playInfo: PlayInfo, isSelfChe: boolean) {
    const g = this.game!;
    const player = g.players[playerId];

    // Remove cards from hand
    cards.forEach(c => {
      const idx = player.hand.findIndex(h => h.suit === c.suit && h.rankValue === c.rankValue);
      if (idx >= 0) player.hand.splice(idx, 1);
    });

    // Add to table
    g.tableCards.push(...cards);
    g.historyCards.push(...cards);

    // Update game state
    g.lastValidPlay = playInfo;
    g.lastPlayByPlayerId = playerId;
    g.isFirstTurnOfGame = false;
    g.passStatuses = [false, false, false, false];
    g.passCount = 0;

    g.roundHistory.push({
      playerId,
      type: playInfo.type,
      rank: playInfo.rank,
      cards,
    });

    // Check red3 count for reveal
    const red3Count = cards.filter(c => c.isRed3).length;
    if (red3Count > 0) {
      g.red3CountByPlayer[playerId] = (g.red3CountByPlayer[playerId] || 0) + red3Count;
      this.updateRevealed();
    }
  }

  private activateChePhase(sourcePlayerId: number, rankValue: number) {
    const g = this.game!;
    g.chePhase = true;
    g.chePhaseStartedAt = Date.now();
    g.cheTimerExpired = false;
    g.askingSourceId = sourcePlayerId;

    // Find players who can che (have 2 of the same rank)
    let anyHumanCanChe = false;
    g.players.forEach(p => {
      if (p.id !== sourcePlayerId && !p.finished) {
        const count = p.hand.filter(c => c.rankValue === rankValue).length;
        p.canChe = count >= 2;
        if (p.canChe && !p.isBot) anyHumanCanChe = true;
      }
    });

    // If no human can che, use shorter timeout (bots don't need 3s to decide)
    // If a human can che, give them the full 3s
    const timeout = anyHumanCanChe ? CHE_TIMEOUT : 800;
    this.cheTimer = setTimeout(() => this.endChePhase(), timeout);
  }

  private endChePhase() {
    const g = this.game!;
    g.chePhase = false;
    g.cheTimerExpired = true;
    g.roundHasCheHappened = true; // Prevent re-triggering che until next pot collection
    g.players.forEach(p => { p.canChe = false; });
    this.clearCheTimers();
    this.advanceTurn();
    this.broadcastGameState();
  }

  private advanceTurn() {
    const g = this.game!;
    g.turnIndex = this.findNextPlayer(g.turnIndex);
    this.startTurnTimer();
  }

  private findNextPlayer(fromId: number): number {
    const g = this.game!;
    let next = (fromId - 1 + 4) % 4; // clockwise
    for (let i = 0; i < 4; i++) {
      if (!g.players[next].finished) return next;
      next = (next - 1 + 4) % 4;
    }
    return next;
  }

  private collectPot() {
    const g = this.game!;
    const winner = g.players[g.lastPlayByPlayerId];
    winner.pot += g.tableCards.length + g.historyCards.length;
    g.tableCards = [];
    g.historyCards = [];
    g.lastValidPlay = null;
    g.pendingCollect = false;
    g.passStatuses = [false, false, false, false];
    g.passCount = 0;
    g.roundHasCheHappened = false; // Allow che again for the new pot cycle

    // Winner's turn
    g.turnIndex = g.lastPlayByPlayerId;
    this.startTurnTimer();
    this.broadcastGameState();
  }

  private updateRevealed() {
    const g = this.game!;

    // Business mode: 5-condition reveal logic (mirrors original engine)
    if (g.isBusinessMode) {
      const bpRed3 = g.red3CountByPlayer[g.businessPlayerId] || 0;
      if (bpRed3 === 1) {
        g.players.forEach(p => { p.revealed = p.id === g.businessPlayerId; });
      } else if (bpRed3 >= 2) {
        g.players.forEach(p => { p.revealed = true; });
      } else {
        g.players.forEach(p => { p.revealed = false; });
      }
      return;
    }

    // Normal mode: reveal Red 3 team players who have played Red 3s
    const revealedTeamPlayers = g.players.filter(
      p => p.isRed3Team && (g.red3CountByPlayer[p.id] || 0) > 0
    );
    revealedTeamPlayers.forEach(p => { p.revealed = true; });

    // If 2 or more Red 3 team players revealed → all identities revealed
    if (revealedTeamPlayers.length >= 2) {
      g.players.forEach(p => { p.revealed = true; });
    }
  }

  private checkTeamVictory() {
    const g = this.game!;
    const finished = g.players.filter(p => p.finished);

    // Double lock: same team 1st and 2nd (sorted by rank, not seat order)
    if (finished.length >= 2) {
      const sorted = finished.filter(p => p.rank !== null).sort((a, b) => (a.rank || 0) - (b.rank || 0));
      if (sorted.length >= 2 && sorted[0].rank === 1 && sorted[1].rank === 2) {
        if (sorted[0].isRed3Team === sorted[1].isRed3Team) {
          g.status = 'finished';
          g.victoryReason = '双关';
          g.victoryTeam = sorted[0].isRed3Team ? 'red' : 'black';
        }
      }
    }

    // Business mode check
    if (g.isBusinessMode) {
      const bp = g.players[g.businessPlayerId];
      if (bp && bp.finished && bp.rank === 1) {
        g.status = 'finished';
        g.victoryReason = '业务胜利';
        g.victoryTeam = 'business';
      } else if (bp && !bp.finished) {
        const allOthersFinished = g.players.every(p => p.id === g.businessPlayerId || p.finished);
        if (allOthersFinished) {
          g.status = 'finished';
          g.victoryReason = '非业务玩家胜利';
          g.victoryTeam = bp.isRed3Team ? 'black' : 'red';
        }
      }
    }
  }

  private checkGameOver() {
    const g = this.game!;
    const activePlayers = g.players.filter(p => !p.finished);
    if (activePlayers.length === 1) {
      const lastPlayer = activePlayers[0];
      // Last player loses - winner is lastPlayByPlayerId or the last to finish
      lastPlayer.rank = 4;
      lastPlayer.finished = true;

      // Determine winner by pot comparison
      this.determineWinnerByPot();
    }
  }

  private determineWinnerByPot() {
    const g = this.game!;
    if (g.currentRound < g.config.totalRounds) {
      // Within multi-round: team with more total pot wins
      const redPot = g.players.filter(p => p.isRed3Team).reduce((s, p) => s + p.pot, 0);
      const blackPot = g.players.filter(p => !p.isRed3Team).reduce((s, p) => s + p.pot, 0);

      g.status = 'finished';
      g.victoryReason = '章子比拼';
      if (redPot > blackPot) g.victoryTeam = 'red';
      else if (blackPot > redPot) g.victoryTeam = 'black';
      else g.victoryTeam = g.players[0].isRed3Team ? 'black' : 'red'; // Opposite of rank 1
    }
  }

  private endGame() {
    if (!this.game) return;
    const g = this.game;

    // Calculate settlement
    const { fans, bombFans, extraFans, extraFansLabel, bombDetails } = calculateFans(
      g.roundHistory,
      g.victoryReason || '',
      g.players.map(p => ({ id: p.id, finished: p.finished, hand: p.hand }))
    );

    const settlement = calculateSettlement(
      g.players.map(p => ({
        id: p.id, name: p.name, isRed3Team: p.isRed3Team,
        rank: p.rank, pot: p.pot,
      })),
      (g.victoryTeam || 'red') as any,
      g.config.baseAmount,
      fans,
      g.config.doubleType,
      g.teamPotBonus,
      g.isBusinessMode,
      g.businessPlayerId,
    );

    // Accumulate scores
    settlement.results.forEach(r => {
      g.accumulatedScores[r.playerId] = (g.accumulatedScores[r.playerId] || 0) + r.netWon;
    });
    g._scoresStored = true;

    const isLastRound = g.currentRound >= g.config.totalRounds;

    // Broadcast settlement
    this.players.forEach(rp => {
      sendToUser(rp.userId, {
        type: 'settlement',
        result: {
          fans, bombFans, extraFans, extraFansLabel, bombDetails,
          amount: settlement.amount,
          results: settlement.results,
          victoryReason: g.victoryReason,
          victoryTeam: g.victoryTeam,
          currentRound: g.currentRound,
          totalRounds: g.config.totalRounds,
          isLastRound,
          accumulatedScores: g.accumulatedScores,
        },
      });
    });
  }

  nextRound() {
    if (!this.game) return { error: '游戏未开始' };
    const g = this.game;

    if (g.currentRound >= g.config.totalRounds) return { error: '已是最后一局' };
    if (g.status !== 'finished') return { error: '当前局还未结束' };

    // Reset for next round
    const deck = createFullDeck();
    const hands = this.config.smartShuffle
      ? smartShuffleDeal(deck, this.config.smartShuffleLevel)
      : normalDeal(deck);

    g.currentRound++;
    g.status = 'playing';
    g.victoryReason = null;
    g.victoryTeam = null;

    // Reset players
    g.players.forEach((p, i) => {
      p.hand = hands[p.id];
      p.pot = 0;
      p.finished = false;
      p.revealed = false;
      p.rank = null;
      p.canChe = false;
    });

    const { isBusinessMode, businessPlayerId, firstPlayer } = assignTeams(g.players);
    g.isBusinessMode = isBusinessMode;
    g.businessPlayerId = businessPlayerId;

    // Reset turn state
    g.turnIndex = firstPlayer;
    g.lastValidPlay = null;
    g.lastPlayByPlayerId = -1;
    g.passCount = 0;
    g.passStatuses = [false, false, false, false];
    g.tableCards = [];
    g.historyCards = [];
    g.isFirstTurnOfGame = true;
    g.chePhase = false;
    g.chePhaseStartedAt = null;
    g.cheTimerExpired = false;
    g.askingSourceId = -1;
    g.roundHasCheHappened = false;
    g.roundHistory = [];
    g.rankCounter = 0;
    g.red3CountByPlayer = {};
    g.tributeProcessed = false;
    g.teamPotBonus = null;
    g.pendingCollect = false;
    g.pendingPassPlayerId = -1;
    g._scoresStored = false;

    this.broadcastGameState();
    this.startTurnTimer();
    return { success: true };
  }

  // ===== Timers =====

  private startTurnTimer() {
    this.clearTimers();
    if (!this.game) return;

    const g = this.game;
    const player = g.players[g.turnIndex];
    if (!player) return;

    // Bot players — schedule AI move immediately
    if (player.isBot || player.disconnected) {
      this.scheduleBotMove(player.id);
      return;
    }

    this.turnTimer = setTimeout(() => {
      if (!this.game || this.game.status !== 'playing') return;
      const p = this.game.players[this.game.turnIndex];
      if (!p || p.isBot || p.disconnected) return;

      // Auto-pass on timeout
      this.autoPass();
    }, TURN_TIMEOUT);
  }

  private autoPass() {
    if (!this.game) return;
    const g = this.game;
    const player = g.players[g.turnIndex];

    if (g.chePhase && player.canChe) {
      this.declineChe(player.userId);
      return;
    }

    // Auto-pass
    g.passStatuses[player.id] = true;
    g.passCount++;
    this.advanceTurn();
    this.broadcastGameState();
  }

  private clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
  }

  private clearCheTimers() {
    if (this.cheTimer) { clearTimeout(this.cheTimer); this.cheTimer = null; }
  }

  // ===== Disconnection =====

  handleDisconnect(userId: number) {
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;

    // Start grace period
    const timer = setTimeout(() => {
      this.activateBotForPlayer(userId);
    }, DISCONNECT_GRACE);
    this.disconnectTimers.set(userId, timer);

    broadcastToRoom(this.roomCode, { type: 'player_disconnected', userId });
  }

  handleReconnect(userId: number) {
    // Cancel disconnect timer
    const timer = this.disconnectTimers.get(userId);
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(userId); }

    // Deactivate bot if active
    this.deactivateBotForPlayer(userId);

    // Send full game state
    if (this.game) {
      const rp = this.players.find(p => p.userId === userId);
      if (rp) {
        const state = this.getStateForPlayer(rp.seat);
        sendToUser(userId, { type: 'game_state', state });
      }
    }

    broadcastToRoom(this.roomCode, { type: 'player_reconnected', userId });
  }

  private activateBotForPlayer(userId: number) {
    if (!this.game) return;
    const player = this.game.players.find(p => p.userId === userId);
    if (!player) return;

    player.isBot = true;
    player.disconnected = true;
    this.broadcastGameState();

    // If it's this player's turn, trigger bot move
    if (this.game.turnIndex === player.id) {
      this.scheduleBotMove(player.id);
    }
  }

  private deactivateBotForPlayer(userId: number) {
    if (!this.game) return;
    const player = this.game.players.find(p => p.userId === userId);
    if (!player) return;

    player.isBot = false;
    player.disconnected = false;

    // Clear bot timer
    const bt = this.botTimers.get(userId);
    if (bt) { clearTimeout(bt); this.botTimers.delete(userId); }

    this.broadcastGameState();
  }

  private scheduleBotMove(playerId: number) {
    if (!this.game) return;
    const g = this.game;
    const player = g.players[playerId];
    if (!player || !player.isBot) return;

    // Clear any existing timer for this bot
    const existing = this.botTimers.get(playerId);
    if (existing) { clearTimeout(existing); this.botTimers.delete(playerId); }

    const timer = setTimeout(() => {
      this.executeBotMove(playerId);
    }, 1000 + Math.random() * 1500); // 1-2.5s realistic delay
    this.botTimers.set(playerId, timer);
  }

  private executeBotMove(playerId: number) {
    if (!this.game) return;
    const g = this.game;
    const player = g.players[playerId];
    if (!player || g.turnIndex !== playerId) return;

    // Che phase bot: 60% chance to che
    if (g.chePhase && player.canChe) {
      if (Math.random() > 0.4) {
        const cards = player.hand
          .filter(c => c.rankValue === g.lastValidPlay!.rank)
          .slice(0, 2);
        if (cards.length === 2) {
          this.executeCheBot(playerId, cards);
          return;
        }
      }
      this.declineChe(player.userId);
      return;
    }

    // If che phase is active but bot can't che, wait (don't play through che)
    if (g.chePhase) return;

    // Normal bot play
    const validPlays = generateAllValidPlays(player.hand, g.lastValidPlay, g.isFirstTurnOfGame);
    if (validPlays.length > 0) {
      // Pick the weakest valid play
      const play = validPlays[0];
      this.executeBotPlay(playerId, play);
    } else {
      // Pass — must check for pot collection (same logic as passTurn)
      g.passStatuses[playerId] = true;
      g.passCount++;
      const activePlayers = g.players.filter(p => !p.finished);
      const passedCount = activePlayers.filter(p => g.passStatuses[p.id]).length;
      if (passedCount >= activePlayers.length - 1 && activePlayers.length > 1) {
        g.pendingCollect = true;
        g.pendingPassPlayerId = playerId;
        this.collectTimer = setTimeout(() => this.collectPot(), 1000);
      } else {
        this.advanceTurn();
      }
      this.broadcastGameState();
    }
  }

  private executeBotPlay(playerId: number, play: PlayInfo) {
    if (!this.game) return;
    this.executePlay(playerId, play.cards, play, false);

    const g = this.game;
    const player = g.players[playerId];

    if (player.hand.length === 0) {
      player.finished = true;
      player.rank = ++g.rankCounter;
      this.checkTeamVictory();
      if (g.status === 'finished') {
        this.endGame();
        return;
      }
    }

    if (g.players.filter(p => !p.finished).length === 1) {
      this.checkGameOver();
      if (g.status === 'finished') {
        this.endGame();
        return;
      }
    }

    if (play.type === HAND_TYPES.SINGLE && !g.chePhase && !g.roundHasCheHappened) {
      this.activateChePhase(playerId, play.cards[0].rankValue);
    } else {
      this.advanceTurn();
    }

    this.broadcastGameState();
  }

  private executeCheBot(playerId: number, cards: Card[]) {
    if (!this.game) return;
    const g = this.game;

    this.clearCheTimers();
    g.chePhase = false;
    g.roundHasCheHappened = true;

    cards.forEach(c => {
      const idx = g.players[playerId].hand.findIndex(h => h.suit === c.suit && h.rankValue === c.rankValue);
      if (idx >= 0) g.players[playerId].hand.splice(idx, 1);
    });

    g.lastValidPlay = { type: HAND_TYPES.CHE, rank: cards[0].rankValue, level: POWER_LEVEL.NORMAL, cards };
    g.lastPlayByPlayerId = playerId;
    g.passStatuses = [false, false, false, false];
    g.passCount = 0;
    g.roundHistory.push({ playerId, type: HAND_TYPES.CHE, rank: cards[0].rankValue, cards });

    g.players.forEach(p => { p.canChe = false; });
    g.turnIndex = this.findNextPlayer(playerId);

    this.startTurnTimer();
    this.broadcastGameState();
  }

  // ===== Cleanup =====

  cleanup() {
    this.clearTimers();
    this.clearCheTimers();
    if (this.collectTimer) { clearTimeout(this.collectTimer); this.collectTimer = null; }
    this.disconnectTimers.forEach(t => clearTimeout(t));
    this.disconnectTimers.clear();
    this.botTimers.forEach(t => clearTimeout(t));
    this.botTimers.clear();
    this.game = null;
  }
}
