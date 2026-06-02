import { Card } from '../../../shared/engine/card';
import { createFullDeck, smartShuffleDeal, normalDeal, assignTeams } from '../../../shared/engine/deck';
import { analyze, canBeat, generateAllValidPlays } from '../../../shared/engine/analyzer';
import { HAND_TYPES, POWER_LEVEL } from '../../../shared/engine/constants';
import { calculateFans, calculateSettlement } from '../../../shared/engine/scoring';
import type { PlayInfo } from '../../../shared/engine/analyzer';
import {
  createInitialGameState,
  executePlay as executePlayAction,
  activateChePhase as activateChePhaseState,
  endChePhase as endChePhaseState,
  collectPot as collectPotState,
  updateRevealed,
  checkTeamVictory,
  checkGameOver as checkGameOverState,
  determineWinnerByPot,
  findNextPlayer,
  resetForNextRound,
} from '../../../shared/engine/GameState';
import type { RoomConfig, GamePlayer, GameStateData } from '../../../shared/engine/GameState';
import { broadcastToRoom, sendToUser } from '../ws/handler';

// Re-export types for app.ts
export type { RoomConfig };

// ===== Constants =====

const TURN_TIMEOUT = 60000;  // 60s (safety net — client handles timeout at 30s via managed mode)
const CHE_TIMEOUT = 3000;    // 3s
const DISCONNECT_GRACE = 60000; // 60s before AI substitution

// ===== Bot Controller =====

class BotController {
  private room: GameRoom;
  private botTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  constructor(room: GameRoom) {
    this.room = room;
  }

  scheduleMove(playerId: number): void {
    const g = this.room.game;
    if (!g) return;
    const player = g.players[playerId];
    if (!player || !player.isBot) return;

    // Clear any existing timer for this bot
    const existing = this.botTimers.get(playerId);
    if (existing) { clearTimeout(existing); this.botTimers.delete(playerId); }

    const timer = setTimeout(() => {
      this.executeMove(playerId);
    }, 1000 + Math.random() * 1500); // 1-2.5s realistic delay
    this.botTimers.set(playerId, timer);
  }

  clearTimer(playerId: number): void {
    const bt = this.botTimers.get(playerId);
    if (bt) { clearTimeout(bt); this.botTimers.delete(playerId); }
  }

  clearAll(): void {
    this.botTimers.forEach(t => clearTimeout(t));
    this.botTimers.clear();
  }

  private executeMove(playerId: number): void {
    const g = this.room.game;
    if (!g) return;
    const player = g.players[playerId];
    if (!player || g.turnIndex !== playerId) return;

    // Che phase bot: 60% chance to che, but only if bot can che
    if (g.chePhase && player.canChe && !g.cheTimerExpired) {
      if (Math.random() > 0.4) {
        const rank = g.lastValidPlay?.rank;
        if (rank) {
          const cards = player.hand
            .filter(c => c.rankValue === rank)
            .slice(0, 2);
          if (cards.length === 2) {
            this.executeCheBot(playerId, cards);
            return;
          }
        }
      }
      this.room.declineChe(player.userId);
      return;
    }

    // If che phase is active but bot can't che, wait (don't play through che)
    if (g.chePhase) return;

    // Normal bot play
    const validPlays = generateAllValidPlays(player.hand, g.lastValidPlay, g.isFirstTurnOfGame);
    if (validPlays.length > 0) {
      // Pick the weakest valid play
      const play = validPlays[0]!;
      this.executeBotPlay(playerId, play);
    } else {
      // Pass
      g.passStatuses[playerId] = true;
      g.passCount++;
      const activePlayers = g.players.filter(p => !p.finished);
      const passedCount = activePlayers.filter(p => g.passStatuses[p.id]).length;
      if (passedCount >= activePlayers.length - 1 && activePlayers.length > 1) {
        g.pendingCollect = true;
        g.pendingPassPlayerId = playerId;
        this.room.scheduleCollect();
      } else {
        this.room.advanceTurn();
      }
      this.room.broadcastGameState();
    }
  }

  private executeBotPlay(playerId: number, play: PlayInfo): void {
    const g = this.room.game;
    if (!g) return;

    executePlayAction(g, playerId, play.cards, play, false);

    const player = g.players[playerId]!;

    if (player.hand.length === 0) {
      player.finished = true;
      player.rank = ++g.rankCounter;
      if (checkTeamVictory(g)) {
        this.room.endGame();
        return;
      }
    }

    if (g.players.filter(p => !p.finished).length === 1) {
      checkGameOverState(g);
      if (g.status === 'finished') {
        this.room.endGame();
        return;
      }
    }

    if (play.type === HAND_TYPES.SINGLE && !g.chePhase && !g.roundHasCheHappened) {
      const anyHuman = activateChePhaseState(g, playerId, play.cards[0]!.rankValue);
      const timeout = anyHuman ? CHE_TIMEOUT : 800;
      this.room.startCheTimer(timeout);
    } else {
      this.room.advanceTurn();
    }

    this.room.broadcastGameState();
  }

  private executeCheBot(playerId: number, cards: Card[]): void {
    const g = this.room.game;
    if (!g) return;

    this.room.clearCheTimers();
    endChePhaseState(g);

    // Remove cards from hand
    cards.forEach(c => {
      const idx = g.players[playerId]!.hand.findIndex(h => h.suit === c.suit && h.rankValue === c.rankValue);
      if (idx >= 0) g.players[playerId]!.hand.splice(idx, 1);
    });

    // Set last valid play as che
    g.lastValidPlay = { type: HAND_TYPES.CHE, rank: cards[0]!.rankValue, level: POWER_LEVEL.NORMAL, cards };
    g.lastPlayByPlayerId = playerId;
    g.passStatuses = [false, false, false, false];
    g.passCount = 0;
    g.roundHistory.push({ playerId, type: HAND_TYPES.CHE, rank: cards[0]!.rankValue, cards });

    g.turnIndex = findNextPlayer(g, playerId);
    this.room.startTurnTimer();
    this.room.broadcastGameState();
  }
}

// ===== GameRoom =====

export class GameRoom {
  roomCode: string;
  ownerId: number;
  players: { userId: number; seat: number; name: string; ready: boolean; isBot: boolean }[] = [];
  config: RoomConfig;
  game: GameStateData | null = null;
  private nextRoundReady: Set<number> = new Set(); // userIds who clicked "准备" for next round
  private botCounter = 0;

  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private cheTimer: ReturnType<typeof setTimeout> | null = null;
  private collectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private bots: BotController;

  constructor(roomCode: string, config: RoomConfig, ownerId: number) {
    this.roomCode = roomCode;
    this.config = config;
    this.ownerId = ownerId;
    this.bots = new BotController(this);
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

    const takenSeats = new Set(this.players.map(p => p.seat));
    let seat = -1;
    for (let s = 0; s < 4; s++) {
      if (!takenSeats.has(s)) { seat = s; break; }
    }

    const botNames = ['电脑A', '电脑B', '电脑C', '电脑D'];
    this.botCounter++;
    const botUserId = -(seat + 1) * 1000 - this.botCounter;
    const botName = botNames[seat] || `电脑${seat + 1}`;

    this.players.push({ userId: botUserId, seat, name: botName, ready: true, isBot: true });
    this.broadcastRoomState();
    return { success: true };
  }

  removePlayer(userId: number) {
    const wasOwner = this.ownerId === userId;
    this.players = this.players.filter(p => p.userId !== userId);
    if (this.players.length === 0) {
      this.cleanup();
      return;
    }
    // Transfer ownership if the owner left — assign to first remaining human
    if (wasOwner) {
      const nextHuman = this.players.find(p => !p.isBot);
      if (nextHuman) {
        this.ownerId = nextHuman.userId;
      }
    }
    this.broadcastRoomState();
  }

  toggleReady(userId: number) {
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;
    player.ready = !player.ready;
    this.broadcastRoomState();
  }

  updateConfig(partial: Partial<RoomConfig>): void {
    Object.assign(this.config, partial);
  }

  canStart(): boolean {
    const humanPlayers = this.players.filter(p => !p.isBot);
    return this.players.length === 4 && humanPlayers.every(p => p.ready) && humanPlayers.length >= 1;
  }

  // ===== Game Lifecycle =====

  startGame() {
    // Prevent overwriting an existing game (could be a finished game waiting for nextRound)
    if (this.game) {
      console.log('[GameRoom] startGame denied — game already exists:', this.game.status);
      return;
    }

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

    const gamePlayers: GamePlayer[] = this.players.map((rp) => ({
      id: rp.seat,
      userId: rp.userId,
      name: rp.name,
      hand: hands[rp.seat]!,
      pot: 0,
      finished: false,
      isRed3Team: false,
      revealed: false,
      rank: null,
      canChe: false,
      isBot: rp.isBot,
      disconnected: false,
    }));

    const { isBusinessMode, businessPlayerId, firstPlayer } = assignTeams(gamePlayers);

    this.game = createInitialGameState(gamePlayers, this.config, isBusinessMode, businessPlayerId, firstPlayer);

    // Broadcast game start to each player (with filtered state)
    this.players.forEach(rp => {
      const state = this.getStateForPlayer(rp.seat);
      sendToUser(rp.userId, { type: 'game_start', gameId: this.game!.gameId, state });
    });

    this.startTurnTimer();
  }

  nextRound(userId: number) {
    if (!this.game) return { error: '游戏未开始' };
    const g = this.game;

    if (g.currentRound >= g.config.totalRounds) return { error: '已是最后一局' };
    if (g.status !== 'finished') return { error: '当前局还未结束' };

    // Track readiness — all human players must click "准备" before next round starts
    this.nextRoundReady.add(userId);
    const humanPlayers = this.players.filter(p => !p.isBot);
    const allHumansReady = humanPlayers.every(p => this.nextRoundReady.has(p.userId));
    const readyCount = this.nextRoundReady.size;
    const totalHumans = humanPlayers.length;

    if (!allHumansReady) {
      // Notify all clients about ready status
      this.players.forEach(rp => {
        sendToUser(rp.userId, {
          type: 'next_round_status',
          readyCount,
          totalHumans,
          readyUserIds: [...this.nextRoundReady],
        });
      });
      return { waiting: true, readyCount, totalHumans };
    }

    // All humans ready — start next round
    this.nextRoundReady.clear();

    const deck = createFullDeck();
    const hands = this.config.smartShuffle
      ? smartShuffleDeal(deck, this.config.smartShuffleLevel)
      : normalDeal(deck);

    const { isBusinessMode, businessPlayerId, firstPlayer } = assignTeams(g.players);

    resetForNextRound(g, hands, isBusinessMode, businessPlayerId, firstPlayer);

    this.broadcastGameState();
    this.startTurnTimer();
    return { success: true };
  }

  // ===== State Filtering =====

  getStateForPlayer(seat: number): any {
    if (!this.game) return null;
    const g = this.game;

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

  playCards(userId: number, cardsData: { suit: number; rankValue: number }[], isSelfChe: boolean, cheRemainCards?: { suit: number; rankValue: number }[]) {
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

    const playInfo = analyze(cards);
    if (!playInfo) return { error: '无效牌型' };

    // First turn check
    if (g.isFirstTurnOfGame && player.id === g.turnIndex) {
      const hasFour4s = player.hand.filter(c => c.rankValue === 4).length === 4;
      if (!hasFour4s) {
        const hasH4 = cards.some(c => c.isH4);
        const isThreeFours = cards.length === 3 && cards.every(c => c.rankValue === 4) && cards.some(c => c.isH4);
        if (!hasH4 && !isThreeFours) return { error: '首手仅能出红桃4或3个4包含红桃4的自扯' };
      }
    }

    if (!canBeat(g.lastValidPlay, playInfo)) return { error: '打不过场上的牌' };

    // Execute play via shared pure function
    executePlayAction(g, player.id, cards, playInfo, isSelfChe, cheRemainCards);

    // Check game over
    if (player.hand.length === 0) {
      player.finished = true;
      player.rank = ++g.rankCounter;

      if (checkTeamVictory(g)) {
        this.endGame();
        return { success: true, gameFinished: true };
      }
    }

    if (g.players.filter(p => !p.finished).length === 1) {
      checkGameOverState(g);
      if (g.status === 'finished') {
        this.endGame();
        return { success: true, gameFinished: true };
      }
    }

    // Che phase activation
    if (playInfo.type === HAND_TYPES.SINGLE && !g.chePhase && !g.roundHasCheHappened) {
      const anyHuman = activateChePhaseState(g, player.id, cards[0]!.rankValue);
      const timeout = anyHuman ? CHE_TIMEOUT : 800;
      this.startCheTimer(timeout);
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

    const activePlayers = g.players.filter(p => !p.finished);
    const passedCount = activePlayers.filter(p => g.passStatuses[p.id]).length;

    if (passedCount >= activePlayers.length - 1 && activePlayers.length > 1) {
      g.pendingCollect = true;
      g.pendingPassPlayerId = player.id;
      this.scheduleCollect();
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
    if (cards[0]!.rankValue !== cards[1]!.rankValue) return { error: '扯牌需要2张同点数的牌' };

    // Execute che
    this.clearCheTimers();
    endChePhaseState(g);

    cards.forEach(c => {
      const idx = player.hand.findIndex(h => h.suit === c.suit && h.rankValue === c.rankValue);
      if (idx >= 0) player.hand.splice(idx, 1);
    });

    if (g.tableCards.length > 0) {
      g.historyCards.push(...g.tableCards);
    }
    g.tableCards = [...cards];

    g.lastValidPlay = { type: HAND_TYPES.CHE, rank: cards[0]!.rankValue, level: POWER_LEVEL.NORMAL, cards };
    g.lastPlayByPlayerId = player.id;
    g.passStatuses = [false, false, false, false];
    g.passCount = 0;
    g.roundHistory.push({ playerId: player.id, type: HAND_TYPES.CHE, rank: cards[0]!.rankValue, cards });

    g.turnIndex = findNextPlayer(g, player.id);
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

    const anyCanChe = g.players.some(p => p.canChe);
    if (!anyCanChe) {
      endChePhaseState(g);
      this.clearCheTimers();
      this.advanceTurn();
    }

    this.broadcastGameState();
    return { success: true };
  }

  // ===== Turn Management =====

  advanceTurn() {
    if (!this.game) return;
    this.game.turnIndex = findNextPlayer(this.game, this.game.turnIndex);
    this.startTurnTimer();
  }

  // ===== Settlement =====

  endGame() {
    if (!this.game) return;
    const g = this.game;

    // Prevent double-settlement
    if (g.status !== 'finished') return;

    // Clear all timers and bot schedules (prevents stale timers from firing post-game)
    this.clearTimers();
    this.clearCheTimers();
    if (this.collectTimer) { clearTimeout(this.collectTimer); this.collectTimer = null; }
    this.bots.clearAll();

    // Reset ready states and next-round readiness
    this.nextRoundReady.clear();
    this.players.forEach(p => { p.ready = false; });
    // Keep bots ready for next round
    this.players.forEach(p => { if (p.isBot) p.ready = true; });

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

    settlement.results.forEach(r => {
      g.accumulatedScores[r.playerId] = (g.accumulatedScores[r.playerId] || 0) + r.netWon;
    });
    g._scoresStored = true;

    const isLastRound = g.currentRound >= g.config.totalRounds;

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
          teamPotBonus: g.teamPotBonus,
        },
      });
    });
  }

  // ===== Timers =====

  startTurnTimer() {
    this.clearTimers();
    if (!this.game) return;

    const g = this.game;
    const player = g.players[g.turnIndex];
    if (!player) return;

    if (player.isBot || player.disconnected) {
      this.bots.scheduleMove(player.id);
      return;
    }

    this.turnTimer = setTimeout(() => {
      if (!this.game || this.game.status !== 'playing') return;
      const p = this.game.players[this.game.turnIndex];
      if (!p || p.isBot || p.disconnected) return;
      this.autoPass();
    }, TURN_TIMEOUT);
  }

  startCheTimer(timeout: number) {
    this.cheTimer = setTimeout(() => {
      if (!this.game || !this.game.chePhase) return;
      endChePhaseState(this.game);
      this.clearCheTimers();
      this.advanceTurn();
      this.broadcastGameState();
    }, timeout);
  }

  scheduleCollect() {
    this.collectTimer = setTimeout(() => {
      if (!this.game || !this.game.pendingCollect) return;
      if (this.game.status !== 'playing') return; // Game already ended — skip pot collection

      const winnerId = collectPotState(this.game);
      // Set turn to winner, but skip past them if they've finished (played last card)
      this.game.turnIndex = winnerId;
      if (this.game.players[winnerId]?.finished) {
        this.game.turnIndex = findNextPlayer(this.game, winnerId);
      }
      this.startTurnTimer();
      this.broadcastGameState();
    }, 1000);
  }

  clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
  }

  clearCheTimers() {
    if (this.cheTimer) { clearTimeout(this.cheTimer); this.cheTimer = null; }
  }

  private autoPass() {
    if (!this.game) return;
    const g = this.game;
    const player = g.players[g.turnIndex]!;

    if (g.chePhase && player.canChe) {
      this.declineChe(player.userId);
      return;
    }

    g.passStatuses[player.id] = true;
    g.passCount++;
    this.advanceTurn();
    this.broadcastGameState();
  }

  // ===== Disconnection =====

  handleDisconnect(userId: number) {
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;

    const timer = setTimeout(() => {
      this.activateBotForPlayer(userId);
    }, DISCONNECT_GRACE);
    this.disconnectTimers.set(userId, timer);

    broadcastToRoom(this.roomCode, { type: 'player_disconnected', userId });
  }

  handleReconnect(userId: number) {
    const timer = this.disconnectTimers.get(userId);
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(userId); }

    this.deactivateBotForPlayer(userId);

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

    if (this.game.turnIndex === player.id) {
      this.bots.scheduleMove(player.id);
    }
  }

  private deactivateBotForPlayer(userId: number) {
    if (!this.game) return;
    const player = this.game.players.find(p => p.userId === userId);
    if (!player) return;

    player.isBot = false;
    player.disconnected = false;
    this.bots.clearTimer(userId);
    this.broadcastGameState();
  }

  // ===== Cleanup =====

  cleanup() {
    this.clearTimers();
    this.clearCheTimers();
    if (this.collectTimer) { clearTimeout(this.collectTimer); this.collectTimer = null; }
    this.disconnectTimers.forEach(t => clearTimeout(t));
    this.disconnectTimers.clear();
    this.bots.clearAll();
    this.game = null;
  }
}
