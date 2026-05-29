// Local game engine - all game logic from HTML demo ported to client-side
// No cloud function dependency required
import Card from './card';
import { analyze, canBeat, analyzeHand } from './analyzer';
import { HAND_TYPES, POWER_LEVEL } from './constants';
import { createFullDeck, smartShuffleDeal, normalDeal, adjustRed3sForTestMode, assignTeams } from './deck';
import { calculateFans, calculateSettlement } from './scoring';

// Card display properties (needed because JSON clone loses class getters)
const RANK_DISPLAY = { 4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'3' };
const SUITS = ['♦','♣','♥','♠'];

function attachCardDisplay(card) {
  if (!card) return card;
  card.displayRank = RANK_DISPLAY[card.rankValue] || String(card.rankValue);
  card.suitChar = SUITS[card.suit] || '?';
  card.color = (card.suit === 0 || card.suit === 2) ? 'red' : 'black';
  card.isH4 = card.suit === 2 && card.rankValue === 4;
  card.isRed3 = card.rankValue === 16 && (card.suit === 0 || card.suit === 2);
  return card;
}

function attachAllCards(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(item => {
      if (item && typeof item === 'object' && 'suit' in item && 'rankValue' in item) {
        attachCardDisplay(item);
      } else {
        attachAllCards(item);
      }
    });
  } else {
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        if ('suit' in obj[key] && 'rankValue' in obj[key]) {
          attachCardDisplay(obj[key]);
        } else {
          attachAllCards(obj[key]);
        }
      }
    }
  }
  return obj;
}

// === Helpers ===
function findNextPlayer(game, fromId) {
  let next = (fromId - 1 + 4) % 4;
  for (let i = 0; i < 4; i++) {
    if (!game.players[next].finished) return next;
    next = (next - 1 + 4) % 4;
  }
  return next;
}

function simpleClone(obj) {
  const cloned = JSON.parse(JSON.stringify(obj));
  attachAllCards(cloned); // Restore card display properties lost in JSON serialization
  return cloned;
}

// === Player Revealed Status (完整移植 HTML updatePlayerRevealedStatus) ===
function updateRevealed(game) {
  if (game.lastValidPlay && game.tableCards.length > 0 && game.lastPlayByPlayerId !== -1) {
    const red3Count = game.tableCards.filter(c => c.isRed3 === true || (c.rankValue === 16 && (c.suit === 0 || c.suit === 2))).length;
    if (red3Count > 0) {
      const pid = game.lastPlayByPlayerId;
      game.red3CountByPlayer[pid] = (game.red3CountByPlayer[pid] || 0) + red3Count;
    }
  }

  const player0 = game.players[0];
  const player0IsBusiness = player0.id === game.businessPlayerId;

  if (player0IsBusiness) {
    // Business player holds 2 red 3s — knows all identities from the start
    game.players.forEach(p => { if (p.id !== 0) p.revealed = true; });
    return;
  }

  if (game.isBusinessMode) {
    const bpRed3 = game.red3CountByPlayer[game.businessPlayerId] || 0;
    if (bpRed3 === 1) {
      game.players.forEach(p => { p.revealed = p.id === game.businessPlayerId; });
    } else if (bpRed3 >= 2) {
      game.players.forEach(p => { p.revealed = true; });
    } else {
      game.players.forEach(p => { p.revealed = false; });
    }
    return;
  }

  if (player0.isRed3Team) {
    let revealedCount = 0;
    for (let i = 1; i < 4; i++) {
      const p = game.players[i];
      if (p.isRed3Team && (game.red3CountByPlayer[i] || 0) > 0) {
        p.revealed = true;
        revealedCount++;
      }
    }
    if (revealedCount >= 1) {
      game.players.forEach(p => { if (p.id !== 0) p.revealed = true; });
    }
    return;
  }

  let red3Players = 0;
  for (let i = 1; i < 4; i++) {
    const p = game.players[i];
    if (p.isRed3Team && (game.red3CountByPlayer[i] || 0) > 0) {
      p.revealed = true;
      red3Players++;
    }
  }
  if (red3Players >= 2) {
    game.players.forEach(p => { p.revealed = true; });
  }
}

// === Victory Checking ===
function checkTeamVictory(game) {
  const players = game.players;
  const finishedPlayers = players.filter(p => p.finished && p.rank !== null);

  if (game.isBusinessMode) {
    const bp = players[game.businessPlayerId];
    if (bp.finished && bp.rank <= 3) {
      game.status = 'finished'; game.victoryReason = '业务胜利'; game.victoryTeam = 'business'; return true;
    }
    const nonBP = players.filter(p => p.id !== game.businessPlayerId);
    const fNonBP = nonBP.filter(p => p.finished && p.rank !== null);
    if (fNonBP.length === 3) {
      const ranks = fNonBP.map(p => p.rank);
      if (ranks.includes(1) && ranks.includes(2) && ranks.includes(3)) {
        if (!bp.finished || bp.rank === 4) {
          game.status = 'finished';
          game.victoryReason = '非业务玩家胜利';
          game.victoryTeam = bp.isRed3Team ? 'black' : 'red';
          return true;
        }
      }
    }
  }

  if (finishedPlayers.length < 2) return false;
  const ranks = {};
  finishedPlayers.forEach(p => { ranks[p.rank] = p; });

  if (!game.isBusinessMode && ranks[1] && ranks[2] && ranks[1].isRed3Team === ranks[2].isRed3Team) {
    game.status = 'finished'; game.victoryReason = '双关'; game.victoryTeam = ranks[1].isRed3Team ? 'red' : 'black'; return true;
  }

  // Tribute processing
  if (!game.tributeProcessed) {
    if (ranks[1] && ranks[3] && ranks[1].isRed3Team === ranks[3].isRed3Team) {
      const wt = ranks[1].isRed3Team ? 'red' : 'black';
      const lt = wt === 'red' ? 'black' : 'red';
      if (!game.teamPotBonus) game.teamPotBonus = {};
      game.teamPotBonus[wt + '_team'] = (game.teamPotBonus[wt + '_team'] || 0) + 5;
      game.teamPotBonus[lt + '_team'] = (game.teamPotBonus[lt + '_team'] || 0) - 5;
    }
    if (ranks[2] && ranks[4] && ranks[2].isRed3Team === ranks[4].isRed3Team) {
      const lt = ranks[2].isRed3Team ? 'red' : 'black';
      const wt = lt === 'red' ? 'black' : 'red';
      if (!game.teamPotBonus) game.teamPotBonus = {};
      game.teamPotBonus[wt + '_team'] = (game.teamPotBonus[wt + '_team'] || 0) + 5;
      game.teamPotBonus[lt + '_team'] = (game.teamPotBonus[lt + '_team'] || 0) - 5;
    }
    game.tributeProcessed = true;
  }
  return false;
}

function determineWinnerByPot(game) {
  let redPot = 0, blackPot = 0;
  game.players.forEach(p => {
    if (p.isRed3Team) redPot += (p.pot || 0);
    else blackPot += (p.pot || 0);
  });
  // Include tribute bonus
  if (game.teamPotBonus) {
    redPot += (game.teamPotBonus.red_team || 0);
    blackPot += (game.teamPotBonus.black_team || 0);
  }
  game.victoryReason = '章子比拼';
  if (redPot > blackPot) {
    game.victoryTeam = 'red';
  } else if (blackPot > redPot) {
    game.victoryTeam = 'black';
  } else {
    // Tiebreaker: rank 1's team wins
    const rank1 = game.players.find(p => p.rank === 1);
    game.victoryTeam = (rank1 && rank1.isRed3Team) ? 'red' : 'black';
  }
}

function checkGameOver(game) {
  const active = game.players.filter(p => !p.finished);
  if (active.length === 1) {
    if (active[0].rank === null) { game.rankCounter++; active[0].rank = game.rankCounter; }
    let winnerId = game.lastPlayByPlayerId;
    if (winnerId === -1) winnerId = (active[0].id + 1) % 4;
    game.players[winnerId].pot += active[0].hand.length;
    game.players[winnerId].pot += (game.tableCards.length + game.historyCards.length);
    active[0].finished = true;
    game.status = 'finished';
    if (!game.victoryReason) {
      determineWinnerByPot(game);
    }
    return true;
  }
  return false;
}

// === Game Actions ===
function executePlayAction(game, playerId, cards) {
  const p = game.players[playerId];
  if (game.tableCards.length > 0) {
    game.tableCards.forEach(c => { c._playerId = game.lastPlayByPlayerId; });
    game.historyCards.push(...game.tableCards);
  }
  p.hand = p.hand.filter(c => !cards.some(sc => sc.suit === c.suit && sc.rankValue === c.rankValue));
  game.tableCards = [...cards];
  game.passStatuses = [false, false, false, false];
  const info = analyze(cards);
  game.lastValidPlay = { playerId, type: info.type, rank: info.rank, level: info.level };
  if (info.length) game.lastValidPlay.length = info.length;
  game.lastPlayByPlayerId = playerId;
  game.isFirstTurnOfGame = false;
  game.passCount = 0;

  game.roundHistory.push({
    playerId, cards: cards.map(c => ({ suit: c.suit, rankValue: c.rankValue })),
    type: info.type, rank: info.rank, timestamp: new Date()
  });

  if (p.hand.length === 0) {
    p.finished = true;
    if (p.rank === null) { game.rankCounter++; p.rank = game.rankCounter; }
  }
  updateRevealed(game);
  return info;
}

function executeCheActionInternal(game, playerId, cards) {
  const p = game.players[playerId];
  game.chePhase = false;
  game.chePhaseStartedAt = null;
  game.cheTimerExpired = true;
  game.roundHasCheHappened = true;
  p.hand = p.hand.filter(c => !cards.some(sc => sc.suit === c.suit && sc.rankValue === c.rankValue));
  game.historyCards.push(...game.tableCards);
  game.tableCards = [...cards];
  game.passStatuses = [false, false, false, false];
  game.passStatuses[playerId] = true;
  if (p.hand.length === 0) { p.finished = true; if (p.rank === null) { game.rankCounter++; p.rank = game.rankCounter; } }
  game.lastValidPlay = { playerId, type: HAND_TYPES.CHE, rank: cards[0].rankValue, level: POWER_LEVEL.BOMB };
  game.lastPlayByPlayerId = playerId;
  game.passCount = 0;
  game.roundHistory.push({
    playerId, cards: cards.map(c => ({ suit: c.suit, rankValue: c.rankValue })),
    type: HAND_TYPES.CHE, rank: cards[0].rankValue, isChe: true, timestamp: new Date()
  });
}

function collectPotAction(game) {
  if (game.lastPlayByPlayerId !== -1) {
    game.players[game.lastPlayByPlayerId].pot += (game.tableCards.length + game.historyCards.length);
  }
  game.tableCards = [];
  game.historyCards = [];
  game.lastValidPlay = null;
  game.roundHasCheHappened = false;
  game.passCount = 0;
  game.passStatuses = [false, false, false, false];
  game.pendingPassPlayerId = undefined;
  game.isFirstRound = false;
  if (checkGameOver(game)) return;
  const lastPlayer = game.players[game.lastPlayByPlayerId];
  let next = lastPlayer.finished ? (game.lastPlayByPlayerId - 1 + 4) % 4 : game.lastPlayByPlayerId;
  let count = 0;
  while (game.players[next].finished && count < 4) { next = (next - 1 + 4) % 4; count++; }
  game.turnIndex = next;
}

// === AI Decision ===
function aiDecide(p, game) {
  let move = null;
  if (!game.lastValidPlay) {
    if (game.isFirstTurnOfGame) {
      const h4 = p.hand.find(c => c.suit === 2 && c.rankValue === 4);
      if (h4) move = [h4];
      else move = [p.hand[p.hand.length - 1]]; // fallback
    } else {
      const ha = analyzeHand(p.hand);
      if (ha.pairs.length > 0) {
        move = p.hand.filter(c => c.rankValue === ha.pairs[0]).slice(0, 2);
      } else if (ha.triples.length > 0) {
        move = p.hand.filter(c => c.rankValue === ha.triples[0]).slice(0, 3);
      } else {
        move = [p.hand[p.hand.length - 1]];
      }
    }
  } else {
    const cur = game.lastValidPlay;
    if (cur.type === HAND_TYPES.SINGLE) {
      const better = p.hand.filter(c => c.rankValue > cur.rank).sort((a, b) => a.rankValue - b.rankValue);
      if (better.length) {
        const activePlayers = game.players.filter(pl => !pl.finished);
        if (activePlayers.length === 2 && p.hand.length > 5) move = [better[0]];
        else move = [better[better.length - 1]];
      }
    } else if (cur.type === HAND_TYPES.PAIR) {
      for (let r = cur.rank + 1; r <= 16; r++) {
        let m = p.hand.filter(c => c.rankValue === r);
        if (m.length >= 2) { move = m.slice(0, 2); break; }
      }
    }
    if (!move && cur.type !== HAND_TYPES.CHE) {
      for (let r = 4; r <= 16; r++) {
        let m = p.hand.filter(c => c.rankValue === r);
        if (m.length >= 3) {
          const bombInfo = analyze(m.slice(0, 3));
          if (bombInfo && canBeat(game.lastValidPlay, bombInfo)) { move = m.slice(0, 3); break; }
        }
      }
      if (!move) {
        for (let r = 4; r <= 16; r++) {
          let m = p.hand.filter(c => c.rankValue === r);
          if (m.length >= 4) { move = m.slice(0, 4); break; }
        }
      }
    }
  }
  return move;
}

// ============================================
//  GameEngine Class
// ============================================
class GameEngine {
  constructor() {
    this._state = null;
    this._listeners = [];
  }

  onChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  _notify() {
    const state = this.getState();
    this._listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
  }

  getState() {
    if (!this._state) return null;
    return simpleClone(this._state);
  }

  // ===== Create Game =====
  createGame(players, config) {
    // Deal all cards through the normal pipeline
    const deck = createFullDeck();
    let hands;
    if (config.smartShuffle) {
      hands = smartShuffleDeal(deck, config.smartShuffleLevel || 3);
    } else {
      hands = normalDeal(deck);
    }

    // Test mode: only adjust red 3 distribution, everything else unchanged
    if (config.testModeType) {
      hands = adjustRed3sForTestMode(hands, config.testModeType);
    }

    const gamePlayers = players.map((pl, i) => ({
      id: i,
      openid: pl.openid,
      name: pl.name || ('玩家' + (i + 1)),
      hand: hands[i],
      pot: 0,
      finished: false,
      isRed3Team: false,
      revealed: false,
      rank: null,
      canChe: false,
      isBot: pl.isBot || false
    }));

    const { isBusinessMode, businessPlayerId, firstPlayer } = assignTeams(gamePlayers);

    const red3CountByPlayer = {};
    for (let i = 0; i < 4; i++) {
      red3CountByPlayer[i] = 0;
    }

    this._state = {
      gameId: 'local_' + Date.now(),
      roomCode: 'TEST',
      config: { ...config },
      players: gamePlayers,
      isBusinessMode,
      businessPlayerId,
      turnIndex: firstPlayer,
      tableCards: [],
      historyCards: [],
      lastValidPlay: null,
      lastPlayByPlayerId: -1,
      passCount: 0,
      passStatuses: [false, false, false, false],
      isFirstTurnOfGame: true,
      chePhase: false,
      chePhaseStartedAt: null,
      cheTimerExpired: false,
      askingSourceId: null,
      roundHasCheHappened: false,
      isFirstRound: true,
      rankCounter: 0,
      red3CountByPlayer,
      tributeProcessed: false,
      teamPotBonus: null,
      status: 'playing',
      roundHistory: [],
      victoryReason: null,
      victoryTeam: null,
      totalRounds: config.totalRounds || 8,
      currentRound: config.skipToFinalRound ? (config.totalRounds || 8) : 1,
      accumulatedScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      _scoresStored: false
    };

    this._notify();
    return this._state;
  }

  // ===== Play Cards =====
  playCards(playerId, cardsData, isSelfChe, cheRemainCards) {
    const game = this._state;
    if (!game || game.status === 'finished') return { success: false, error: '对局已结束' };
    if (game.pendingCollect) return { success: false, error: '正在收池' };

    const p = game.players[playerId];
    if (!game.chePhase && game.turnIndex !== playerId) return { success: false, error: '不是你的回合' };

    // Map cardsData (suit+rankValue) to actual hand cards
    const cards = cardsData.map(cd => p.hand.find(h => h.suit === cd.suit && h.rankValue === cd.rankValue));
    if (cards.some(c => !c)) return { success: false, error: '手牌中没有这些牌' };

    const info = analyze(cards);
    if (!info) return { success: false, error: '无效牌型' };

    // First-turn validation
    if (game.isFirstTurnOfGame && playerId === game.turnIndex) {
      const hasFour4s = p.hand.filter(c => c.rankValue === 4).length === 4;
      if (!hasFour4s) {
        const hasH4 = cards.some(c => c.suit === 2 && c.rankValue === 4);
        const isSingleH4 = info.type === HAND_TYPES.SINGLE && hasH4;
        const isThree4sSelfChe = info.type === HAND_TYPES.BOMB && cards.length === 3 &&
                                 cards[0].rankValue === 4 && hasH4;
        if (!isSingleH4 && !isThree4sSelfChe) {
          return { success: false, error: '首手仅能出红桃4或3个4包含红桃4的自扯' };
        }
      }
    }

    // canBeat check
    if (game.lastValidPlay && !canBeat(game.lastValidPlay, info)) {
      return { success: false, error: '牌力不足' };
    }

    // === executePlay ===
    const isRoundStart = !game.lastValidPlay;
    executePlayAction(game, playerId, cards);

    // Victory check
    if (p.finished && checkTeamVictory(game)) {
      this._notify();
      return { success: true, gameFinished: true, victoryReason: game.victoryReason, victoryTeam: game.victoryTeam };
    }

    if (isSelfChe) {
      game.roundHasCheHappened = true;
      game.isFirstRound = false;
      if (cheRemainCards && cheRemainCards.length > 0) {
        p.hand = p.hand.filter(c => !cheRemainCards.some(rc => rc.suit === c.suit && rc.rankValue === c.rankValue));
        game.historyCards.push(...game.tableCards);
        game.tableCards = [...cheRemainCards];
      }
      if (p.hand.length === 0 && p.rank === null) {
        p.finished = true; game.rankCounter++; p.rank = game.rankCounter;
      }
      game.lastValidPlay = { playerId, type: HAND_TYPES.CHE, rank: cards[0].rankValue, level: POWER_LEVEL.BOMB };
      game.lastPlayByPlayerId = playerId;
      game.passCount = 1;
      updateRevealed(game);
      if (checkTeamVictory(game)) {
        this._notify();
        return { success: true, gameFinished: true, victoryReason: game.victoryReason, victoryTeam: game.victoryTeam };
      }
      if (!checkGameOver(game)) {
        game.turnIndex = findNextPlayer(game, playerId);
      }
    } else if (isRoundStart && info.type === HAND_TYPES.SINGLE && !game.roundHasCheHappened) {
      // Only start che phase if at least one other player can che
      const cheRank = info.rank;
      let anyoneCanChe = false;
      game.players.forEach(pl => {
        if (pl.id !== playerId && !pl.finished) {
          const matchCount = pl.hand.filter(c => c.rankValue === cheRank).length;
          pl.canChe = matchCount >= 2;
          if (pl.canChe) anyoneCanChe = true;
        } else {
          pl.canChe = false;
        }
      });

      if (anyoneCanChe) {
        game.chePhase = true;
        game.chePhaseStartedAt = Date.now();
        game.cheTimerExpired = false;
        game.askingSourceId = playerId;
      } else {
        game.isFirstRound = false;
        if (!checkGameOver(game)) {
          game.turnIndex = findNextPlayer(game, playerId);
        }
      }
    } else {
      game.isFirstRound = false;
      if (!checkGameOver(game)) {
        game.turnIndex = findNextPlayer(game, playerId);
      }
    }

    this._notify();
    return { success: true, gameFinished: game.status === 'finished' };
  }

  // ===== Pass Turn =====
  passTurn(playerId) {
    const game = this._state;
    if (!game || game.status === 'finished') return { success: false, error: '对局已结束' };
    if (game.pendingCollect) return { success: false, error: '正在收池' };
    if (game.chePhase) return { success: false, error: '扯牌阶段不能过牌' };
    if (game.turnIndex !== playerId) return { success: false, error: '不是你的回合' };
    if (!game.lastValidPlay) return { success: false, error: '必须出牌' };
    if (game.passStatuses[playerId]) return { success: false, error: '已经出过牌' };

    game.passStatuses[playerId] = true;
    game.passCount++;
    const activePlayers = game.players.filter(p => !p.finished);

    if (game.passCount >= activePlayers.length - 1) {
      // Delay to let UI show "不要" tag before clearing the table
      game.pendingCollect = true;
      game.pendingPassPlayerId = playerId;
      this._notify();
      this._collectTimer = setTimeout(() => {
        this._collectTimer = null;
        if (this._state && this._state.pendingCollect) {
          collectPotAction(this._state);
          this._state.pendingCollect = false;
          this._notify();
        }
      }, 1000);
      return { success: true, pendingCollect: true };
    } else {
      game.turnIndex = findNextPlayer(game, playerId);
    }

    this._notify();
    return { success: true, gameFinished: game.status === 'finished' };
  }

  // ===== Che Action =====
  cheAction(playerId, cardsData) {
    const game = this._state;
    if (!game || game.status === 'finished') return { success: false, error: '对局已结束' };
    if (game.pendingCollect) return { success: false, error: '正在收池' };
    if (!game.chePhase) return { success: false, error: '不在扯牌阶段' };

    const p = game.players[playerId];
    const rank = game.lastValidPlay.rank;
    const cards = cardsData.map(cd => p.hand.find(h => h.suit === cd.suit && h.rankValue === cd.rankValue));
    if (cards.some(c => !c)) return { success: false, error: '手牌中没有这些牌' };
    if (cards.length !== 2 || cards[0].rankValue !== rank) return { success: false, error: '扯牌需要2张同点牌' };

    executeCheActionInternal(game, playerId, cards);

    if (!checkGameOver(game)) {
      game.turnIndex = findNextPlayer(game, playerId);
    }

    this._notify();
    return { success: true, gameFinished: game.status === 'finished' };
  }

  // ===== Decline Che (player opts out) =====
  declineChe(playerId) {
    const game = this._state;
    if (!game || game.status === 'finished') return { success: false, error: '对局已结束' };
    if (game.pendingCollect) return { success: false, error: '正在收池' };
    if (!game.chePhase) return { success: false, error: '不在扯牌阶段' };

    const p = game.players[playerId];
    if (!p) return { success: false, error: '玩家不存在' };
    p.canChe = false;

    // If no one else can che, end the phase
    const anyoneCanChe = game.players.some(
      pl => !pl.finished && pl.id !== game.askingSourceId && pl.canChe
    );
    if (!anyoneCanChe) {
      return this.endChePhase();
    }

    this._notify();
    return { success: true };
  }

  // ===== End Che Phase (timeout) =====
  endChePhase() {
    const game = this._state;
    if (!game || game.status === 'finished') return { success: false, error: '对局已结束' };
    if (!game.chePhase) return { success: false, error: '不在扯牌阶段' };

    game.chePhase = false;
    game.cheTimerExpired = true;
    game.players.forEach(p => { p.canChe = false; });

    game.turnIndex = findNextPlayer(game, game.askingSourceId);
    checkGameOver(game);

    this._notify();
    return { success: true };
  }

  // ===== Process Bot Moves =====
  processBotMoves() {
    // 只处理一步，避免连续出牌太快；通过 onChange 回调链驱动后续步骤
    this._processOneBotStep();
  }

  _scheduleNextBotStep() {
    if (this._botTimer) return;
    this._botTimer = setTimeout(() => {
      this._botTimer = null;
      this._processOneBotStep();
    }, 800);
  }

  _processOneBotStep() {
    if (this._botTimer) return; // 已有调度，防止重复
    const game = this._state;
    if (!game || game.status === 'finished') return;
    if (game.pendingCollect) return; // 等待收池动画，暂停bot处理

    let safety = 0;
    while (safety < 50 && game.status !== 'finished') {
      safety++;

      // Handle che phase
      if (game.chePhase && !game.cheTimerExpired) {
        const humanCanChe = game.players.some(p =>
          !p.isBot && !p.finished && p.id !== game.askingSourceId && p.canChe
        );
        if (humanCanChe) break;

        // Find first bot that can che
        let cheBot = null;
        for (const bp of game.players) {
          if (bp.id === game.askingSourceId || bp.finished || !bp.isBot) continue;
          const rank = game.lastValidPlay && game.lastValidPlay.rank;
          const matchCards = rank ? bp.hand.filter(c => c.rankValue === rank) : [];
          if (matchCards.length >= 2 && bp.canChe && Math.random() > 0.4) {
            cheBot = bp;
            break;
          }
        }

        if (cheBot) {
          // Schedule delayed che (1s thinking time)
          if (!this._botCheTimer) {
            this._botCheTimer = setTimeout(() => {
              this._botCheTimer = null;
              const g = this._state;
              if (!g || !g.chePhase || g.cheTimerExpired || g.status === 'finished') return;
              const bp = g.players[cheBot.id];
              if (!bp || !bp.canChe || bp.finished) return;
              const rank = g.lastValidPlay && g.lastValidPlay.rank;
              if (!rank) return;
              const matchCards = bp.hand.filter(c => c.rankValue === rank);
              if (matchCards.length >= 2) {
                executeCheActionInternal(g, bp.id, matchCards.slice(0, 2));
                if (!checkGameOver(g) && g.status !== 'finished') {
                  g.turnIndex = findNextPlayer(g, bp.id);
                }
                this._notify();
                if (g.status !== 'finished') {
                  this._scheduleNextBotStep();
                }
              }
            }, 1000);
          }
          return;
        }

        // No one can/wants to che — end phase
        game.chePhase = false;
        game.cheTimerExpired = true;
        game.players.forEach(p => { p.canChe = false; });
        game.turnIndex = findNextPlayer(game, game.askingSourceId);
        checkGameOver(game);
        this._notify();
        if (game.status === 'finished') break;
        this._scheduleNextBotStep();
        return;
      }

      const currentPlayer = game.players[game.turnIndex];
      if (!currentPlayer || currentPlayer.finished) {
        game.turnIndex = findNextPlayer(game, game.turnIndex);
        this._notify();
        continue;
      }

      // Skip player who already acted this round (e.g., che'd)
      if (game.passStatuses[game.turnIndex]) {
        game.turnIndex = findNextPlayer(game, game.turnIndex);
        this._notify();
        continue;
      }

      if (!currentPlayer.isBot) break;

      // 电脑思考延迟 1 秒
      if (this._botTimer) return;
      this._botTimer = setTimeout(() => {
        this._botTimer = null;
        this._processBotTurn();
        this._notify();
        if (this._state && this._state.status !== 'finished') {
          this._scheduleNextBotStep();
        }
      }, 1000);
      return;
    }
  }

  _processBotTurn() {
    const game = this._state;
    if (game.status === 'finished') return;

    const p = game.players[game.turnIndex];
    if (!p || p.finished || !p.isBot) return;

    let move = aiDecide(p, game);

    // First-turn validation for bots
    if (move && move.length > 0 && game.isFirstTurnOfGame) {
      const hasFour4s = p.hand.filter(c => c.rankValue === 4).length === 4;
      if (!hasFour4s) {
        const hasH4 = move.some(c => c.suit === 2 && c.rankValue === 4);
        const info = analyze(move);
        const isSingleH4 = info && info.type === HAND_TYPES.SINGLE && hasH4;
        const isThree4sSelfChe = info && info.type === HAND_TYPES.BOMB && move.length === 3 && move[0].rankValue === 4 && hasH4;
        if (!isSingleH4 && !isThree4sSelfChe) move = null;
      }
    }

    if (move && game.lastValidPlay) {
      const info = analyze(move);
      if (!info || !canBeat(game.lastValidPlay, info)) move = null;
    }

    if (move && move.length > 0) {
      const info = analyze(move);
      const isRoundStart = !game.lastValidPlay;
      executePlayAction(game, game.turnIndex, move);

      if (p.finished && checkTeamVictory(game)) return;
      if (game.status === 'finished') return;

      if (isRoundStart && info.type === HAND_TYPES.SINGLE && !game.roundHasCheHappened) {
        // Start che phase for bot
        game.chePhase = true;
        game.chePhaseStartedAt = Date.now();
        game.cheTimerExpired = false;
        game.askingSourceId = game.lastPlayByPlayerId;
        game.players.forEach(pl => {
          if (pl.id !== game.lastPlayByPlayerId && !pl.finished) {
            const matchCount = pl.hand.filter(c => c.rankValue === info.rank).length;
            pl.canChe = matchCount >= 2;
          } else {
            pl.canChe = false;
          }
        });
        // processBotMoves will handle the che phase
      } else {
        game.isFirstRound = false;
        if (!checkGameOver(game)) {
          game.turnIndex = findNextPlayer(game, game.lastPlayByPlayerId);
        }
      }
    } else {
      // Pass
      if (!game.passStatuses[game.turnIndex]) {
        game.passStatuses[game.turnIndex] = true;
        game.passCount++;
      }
      const activePlayers = game.players.filter(pl => !pl.finished);
      if (game.passCount >= activePlayers.length - 1) {
        // Delay to show "不要" tag in UI
        game.pendingCollect = true;
        game.pendingPassPlayerId = game.turnIndex;
        this._collectTimer = setTimeout(() => {
          this._collectTimer = null;
          if (this._state && this._state.pendingCollect) {
            collectPotAction(this._state);
            this._state.pendingCollect = false;
            this._notify();
          }
        }, 1000);
      } else {
        game.turnIndex = findNextPlayer(game, game.turnIndex);
      }
    }
  }

  // ===== Settlement =====
  getSettlement() {
    const game = this._state;
    if (!game || game.status !== 'finished') return null;

    const { fans, bombFans, extraFans, extraFansLabel, bombDetails } = calculateFans(game.roundHistory, game.victoryReason, game.players);
    const settlement = calculateSettlement(
      game.players, game.victoryTeam,
      game.config.baseAmount, fans, game.config.doubleType,
      game.teamPotBonus, game.isBusinessMode, game.businessPlayerId
    );

    // Accumulate scores if not yet stored for this round
    if (!game._scoresStored && settlement.results) {
      settlement.results.forEach(r => {
        game.accumulatedScores[r.playerId] = (game.accumulatedScores[r.playerId] || 0) + r.netWon;
      });
      game._scoresStored = true;
    }

    const isLastRound = game.currentRound >= game.totalRounds;

    return {
      ...settlement,
      fans,
      bombFans,
      extraFans,
      extraFansLabel,
      bombDetails,
      victoryReason: game.victoryReason,
      victoryTeam: game.victoryTeam,
      isBusinessMode: game.isBusinessMode,
      businessPlayerId: game.businessPlayerId,
      teamPotBonus: game.teamPotBonus,
      roundHistory: game.roundHistory,
      config: game.config,
      currentRound: game.currentRound,
      totalRounds: game.totalRounds,
      isLastRound,
      accumulatedScores: { ...game.accumulatedScores }
    };
  }

  // ===== Next Round =====
  nextRound() {
    const game = this._state;
    if (!game || game.currentRound >= game.totalRounds) {
      return { success: false, error: '已是最后一局' };
    }
    if (game.status !== 'finished') {
      return { success: false, error: '当前局未结束' };
    }

    // Deal new hands through the normal pipeline
    const deck = createFullDeck();
    let hands;
    if (game.config.smartShuffle) {
      hands = smartShuffleDeal(deck, game.config.smartShuffleLevel || 3);
    } else {
      hands = normalDeal(deck);
    }

    // Test mode: only adjust red 3 distribution
    if (game.config.testModeType) {
      hands = adjustRed3sForTestMode(hands, game.config.testModeType);
    }

    // Reset per-player state
    game.players.forEach((p, i) => {
      p.hand = hands[i];
      p.pot = 0;
      p.finished = false;
      p.rank = null;
      p.canChe = false;
      p.isRed3Team = false;
      p.revealed = false;
    });

    // Re-assign teams
    const { isBusinessMode, businessPlayerId, firstPlayer } = assignTeams(game.players);
    game.isBusinessMode = isBusinessMode;
    game.businessPlayerId = businessPlayerId;
    game.turnIndex = firstPlayer;

    // Reset table state
    game.tableCards = [];
    game.historyCards = [];
    game.lastValidPlay = null;
    game.lastPlayByPlayerId = -1;
    game.passCount = 0;
    game.passStatuses = [false, false, false, false];
    game.isFirstTurnOfGame = true;
    game.chePhase = false;
    game.chePhaseStartedAt = null;
    game.cheTimerExpired = false;
    game.askingSourceId = null;
    game.roundHasCheHappened = false;
    game.isFirstRound = false;
    game.rankCounter = 0;
    game.tributeProcessed = false;
    game.teamPotBonus = null;
    game.roundHistory = [];
    game.victoryReason = null;
    game.victoryTeam = null;
    game._scoresStored = false;
    game.pendingCollect = false;
    game.pendingPassPlayerId = undefined;
    // Reset per-player red3 reveal count (was NOT reset, causing identity leaks in multi-round games)
    game.red3CountByPlayer = { 0: 0, 1: 0, 2: 0, 3: 0 };

    game.currentRound++;
    game.status = 'playing';

    this._notify();
    return { success: true };
  }

  // ===== Cleanup =====
  destroy() {
    if (this._botTimer) { clearTimeout(this._botTimer); this._botTimer = null; }
    if (this._botCheTimer) { clearTimeout(this._botCheTimer); this._botCheTimer = null; }
    if (this._collectTimer) { clearTimeout(this._collectTimer); this._collectTimer = null; }
    this._state = null;
    this._listeners = [];
  }
}

export { attachAllCards };
export default GameEngine;
