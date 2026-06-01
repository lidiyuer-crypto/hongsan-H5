import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GameEngine, { attachAllCards } from '../engine/gameEngine';
import { analyze, canBeat, generateAllValidPlays } from '../engine/analyzer';
import { HAND_TYPES, RANK_DISPLAY, SUITS } from '../engine/constants';
import { playSound, isMuted, setMuted } from '../lib/sound';
import { networkClient } from '../network/NetworkGameClient';
import type { GameStateData, SettlementData, PlayerView } from '../network/types';

// ===== Helpers =====
function cardDisplay(c: any) {
  return {
    rank: (c && (c.displayRank || RANK_DISPLAY[c.rankValue])) || '?',
    suit: (c && (c.suitChar || SUITS[c.suit])) || '',
    color: (c && (c.suit === 0 || c.suit === 2)) ? 'red' : 'black',
    isRed3: c && (c.isRed3 || (c.rankValue === 16 && (c.suit === 0 || c.suit === 2))),
    isH4: c && (c.isH4 || (c.suit === 2 && c.rankValue === 4)),
    rankValue: c ? c.rankValue : 0,
    suitVal: c ? c.suit : 0,
  };
}

function cardKey(c: any) {
  return (c.suit) + '_' + (c.rankValue);
}

const RANK_NAMES = ['上游', '前中游', '后中游', '下游'];
const RANK_CLASSES = ['rank-1', 'rank-2', 'rank-3', 'rank-4'];

// ===== Default GameUI State =====
function defaultGameUI(): GameUIState {
  return {
    myPlayerId: 0,
    myHand: [] as any[],
    myPot: 0,
    myName: '我',
    myTeamText: '未知身份',
    myTeamClass: 'unknown',
    p1Cards: [], p2Cards: [], p3Cards: [],
    p1Pot: 0, p2Pot: 0, p3Pot: 0,
    p1Name: '玩家A', p2Name: '玩家B', p3Name: '玩家C',
    p1TeamText: '未知身份', p2TeamText: '未知身份', p3TeamText: '未知身份',
    p1TeamClass: 'unknown', p2TeamClass: 'unknown', p3TeamClass: 'unknown',
    p1Revealed: false, p2Revealed: false, p3Revealed: false,
    p1Rank: 0, p2Rank: 0, p3Rank: 0,
    p1RankLabel: '', p2RankLabel: '', p3RankLabel: '',
    faceDownP1: true, faceDownP2: true, faceDownP3: true,
    p1CardCount: 13, p2CardCount: 13, p3CardCount: 13,
    showHandCount: true,
    currentFans: 0,
    turnIndex: -1,
    lastValidPlay: null as any,
    playSlots: [
      { cards: [], passed: false, isChe: false },
      { cards: [], passed: false, isChe: false },
      { cards: [], passed: false, isChe: false },
      { cards: [], passed: false, isChe: false },
    ],
    passFlashSlot: -1,
    historyCards: [] as any[],
    tablePotCount: 0,
    showControls: false,
    showCheControls: false,
    canChe: false,
    showTimer: false,
    timerPercent: 100,
    turnTimePercent: 100,
    isManaged: false,
    showSettlement: false,
    settlementTitle: '',
    settlementReason: '',
    settlementWinnerTeam: 'red',
    settlementBaseAmount: 0,
    settlementDoubleTypeText: '',
    settlementFans: 0,
    settlementAmount: 0,
    settlementFansAmount: 0,
    settlementBombFans: 0,
    settlementExtraFans: 0,
    settlementExtraFansLabel: '',
    settlementBombDetails: [] as Array<{ playerId: number; playerName: string; type: string; fans: number; cards: Array<{ suit: number; rankValue: number }> }>,
    settlementNetResults: [] as any[],
    settlementRedPlayers: [] as any[],
    settlementBlackPlayers: [] as any[],
    settlementRedTotal: 0, settlementBlackTotal: 0,
    settlementRedBonus: 0, settlementBlackBonus: 0,
    settlementRedFinal: 0, settlementBlackFinal: 0,
    settlementShowFormula: false,
    settlementCurrentRound: 1,
    settlementTotalRounds: 8,
    settlementIsLastRound: false,
    showScorePanel: false,
    scorePanelPlayers: [] as any[],
    scorePanelCurrentRound: 1,
    scorePanelTotalRounds: 8,
    showSelfCheDialog: false,
    selfCheCards: null as any[] | null,
  };
}

interface GameUIState {
  myPlayerId: number; myHand: any[]; myPot: number;
  myName: string; myTeamText: string; myTeamClass: string;
  p1Cards: any[]; p2Cards: any[]; p3Cards: any[];
  p1Pot: number; p2Pot: number; p3Pot: number;
  p1Name: string; p2Name: string; p3Name: string;
  p1TeamText: string; p2TeamText: string; p3TeamText: string;
  p1TeamClass: string; p2TeamClass: string; p3TeamClass: string;
  p1Revealed: boolean; p2Revealed: boolean; p3Revealed: boolean;
  p1Rank: number; p2Rank: number; p3Rank: number;
  p1RankLabel: string; p2RankLabel: string; p3RankLabel: string;
  faceDownP1: boolean; faceDownP2: boolean; faceDownP3: boolean;
  p1CardCount: number; p2CardCount: number; p3CardCount: number;
  showHandCount: boolean;
  currentFans: number;
  turnIndex: number; lastValidPlay: any;
  playSlots: Array<{ cards: any[]; passed: boolean; isChe?: boolean }>;
  passFlashSlot: number; historyCards: any[]; tablePotCount: number;
  showControls: boolean; showCheControls: boolean; canChe: boolean;
  showTimer: boolean; timerPercent: number; turnTimePercent: number;
  isManaged: boolean;
  showSettlement: boolean; settlementTitle: string; settlementReason: string;
  settlementWinnerTeam: string; settlementBaseAmount: number;
  settlementDoubleTypeText: string; settlementFans: number;
  settlementAmount: number; settlementFansAmount: number;
  settlementBombFans: number; settlementExtraFans: number;
  settlementExtraFansLabel: string; settlementBombDetails: Array<{ playerId: number; playerName: string; type: string; fans: number; cards: Array<{ suit: number; rankValue: number }> }>;
  settlementNetResults: any[]; settlementRedPlayers: any[]; settlementBlackPlayers: any[];
  settlementRedTotal: number; settlementBlackTotal: number;
  settlementRedBonus: number; settlementBlackBonus: number;
  settlementRedFinal: number; settlementBlackFinal: number;
  settlementShowFormula: boolean;
  settlementCurrentRound: number; settlementTotalRounds: number;
  settlementIsLastRound: boolean;
  showScorePanel: boolean; scorePanelPlayers: any[];
  scorePanelCurrentRound: number; scorePanelTotalRounds: number;
  showSelfCheDialog: boolean; selfCheCards: any[] | null;
}

// ===== COMPONENT =====
export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  const engineRef = useRef<GameEngine | null>(null);
  const turnTimerRef = useRef<ReturnType<typeof setInterval>>();
  const cheTimerRef = useRef<ReturnType<typeof setInterval>>();
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const gameStateRef = useRef<any>(null);
  const lastTurnIndexRef = useRef(-1);
  const lastChePhaseRef = useRef(false);
  const lastFinishedRef = useRef(new Set<number>());
  const lastRevealedRef = useRef(new Set<number>());
  const settlementRef = useRef<any>(null);

  // Touch/mouse state
  const touchRef = useRef<{
    startIdx: number | null; startPageX: number; moved: boolean;
    startSelected: boolean; lastStart: number | null; lastEnd: number | null;
    cardStep: number | null; firstCardLeft: number | null;
    _mouseActive: boolean;
    dragEndTime: number;
  }>({
    startIdx: null, startPageX: 0, moved: false,
    startSelected: false, lastStart: null, lastEnd: null,
    cardStep: null, firstCardLeft: null,
    _mouseActive: false,
    dragEndTime: 0,
  });

  // Hint state
  const hintRef = useRef<{ key: string; index: number }>({ key: '', index: 0 });

  // Online mode detection
  const isOnline = gameId?.startsWith('online-') ?? false;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const settlementListenerRef = useRef<(() => void) | null>(null);
  const stateListenerRef = useRef<(() => void) | null>(null);

  const [gameUI, setGameUI] = useState<GameUIState>(defaultGameUI());
  const [muted, setMutedState] = useState(isMuted());
  const [bombExpanded, setBombExpanded] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const uiRef = useRef(gameUI);
  uiRef.current = gameUI;

  const flashError = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 2500);
  };

  // ===== renderOnlineGameState (maps server state to GameUIState) =====
  const renderOnlineGameState = useCallback((state: GameStateData) => {
    const mySeat = state.mySeat;
    const myPlayer = state.players[mySeat];
    const opponents = [1, 2, 3].map(offset => state.players[(mySeat + offset) % 4]);

    // Map my hand - server sends full cards with suit/rankValue/displayRank etc.
    const myHand = myPlayer.hand.map((c: any) => ({
      ...c, isSelected: false,
    }));

    // Preserve selection state
    const prevMyHand = uiRef.current.myHand;
    if (prevMyHand.length === myHand.length) {
      const prevSel = new Map<string, boolean>();
      prevMyHand.forEach((c: any) => { if (c.isSelected) prevSel.set(cardKey(c), true); });
      myHand.forEach((c: any) => { if (prevSel.has(cardKey(c))) c.isSelected = true; });
    }

    // Determine team text/class
    const getTeamInfo = (p: PlayerView, isMe: boolean) => {
      if (isMe && state.isBusinessMode && state.players[mySeat] === p) {
        return p.isRed3Team ? { text: '红三(业务)', cls: 'red3' } : { text: '未知身份', cls: 'unknown' };
      }
      if (!p.revealed) return { text: '未知身份', cls: 'unknown' };
      if (state.isBusinessMode && state.businessPlayerId === p.id) return { text: '红三(业务)', cls: 'red3' };
      if (p.isRed3Team) return { text: '红三阵营', cls: 'red3' };
      return { text: '黑三阵营', cls: 'black3' };
    };

    const myTeam = getTeamInfo(myPlayer, true);
    const t1 = getTeamInfo(opponents[0], false);
    const t2 = getTeamInfo(opponents[1], false);
    const t3 = getTeamInfo(opponents[2], false);

    // Build play slots — hide pass tag for the pending-pass player (show flash instead)
    const playSlots = state.passStatuses.map((passed, i) => ({
      cards: (i === state.lastPlayByPlayerId && state.lastValidPlay)
        ? state.lastValidPlay.cards : [],
      passed: passed && !(state.pendingCollect && i === state.pendingPassPlayerId && i !== state.lastPlayByPlayerId),
      isChe: !!(state.lastValidPlay && state.lastValidPlay.type === HAND_TYPES.CHE && i === state.lastPlayByPlayerId),
    }));

    // Che phase - check if my player can che
    const myCanChe = myPlayer.canChe || false;

    const data: Partial<GameUIState> = {
      myPlayerId: mySeat,
      myHand,
      myPot: myPlayer.pot,
      myName: myPlayer.name,
      myTeamText: myTeam.text,
      myTeamClass: myTeam.cls,

      p1Cards: opponents[0].hand || [],
      p2Cards: opponents[1].hand || [],
      p3Cards: opponents[2].hand || [],
      p1Pot: opponents[0].pot,
      p2Pot: opponents[1].pot,
      p3Pot: opponents[2].pot,
      p1Name: opponents[0].name,
      p2Name: opponents[1].name,
      p3Name: opponents[2].name,
      p1TeamText: t1.text, p2TeamText: t2.text, p3TeamText: t3.text,
      p1TeamClass: t1.cls, p2TeamClass: t2.cls, p3TeamClass: t3.cls,
      p1Revealed: opponents[0].revealed,
      p2Revealed: opponents[1].revealed,
      p3Revealed: opponents[2].revealed,
      p1Rank: opponents[0].rank || 0,
      p2Rank: opponents[1].rank || 0,
      p3Rank: opponents[2].rank || 0,
      p1RankLabel: opponents[0].rank ? RANK_NAMES[opponents[0].rank - 1] : '',
      p2RankLabel: opponents[1].rank ? RANK_NAMES[opponents[1].rank - 1] : '',
      p3RankLabel: opponents[2].rank ? RANK_NAMES[opponents[2].rank - 1] : '',

      faceDownP1: !state.players.find(p => p.id === opponents[0].id)?.revealed,
      faceDownP2: !state.players.find(p => p.id === opponents[1].id)?.revealed,
      faceDownP3: !state.players.find(p => p.id === opponents[2].id)?.revealed,
      p1CardCount: opponents[0].handCount,
      p2CardCount: opponents[1].handCount,
      p3CardCount: opponents[2].handCount,
      showHandCount: state.config.showHandCount,

      currentFans: state.currentFans,
      turnIndex: state.turnIndex,
      lastValidPlay: state.lastValidPlay,
      playSlots,
      passFlashSlot: state.pendingPassPlayerId !== undefined ? state.pendingPassPlayerId : -1,
      historyCards: state.historyCards,
      tablePotCount: state.tablePotCount,

      showControls: state.turnIndex === mySeat && !state.chePhase && state.status === 'playing',
      showCheControls: state.chePhase && myCanChe && !state.cheTimerExpired,
      canChe: myCanChe,
      showTimer: state.chePhase,
      timerPercent: state.chePhaseStartedAt
        ? Math.max(0, (3000 - (Date.now() - state.chePhaseStartedAt)) / 30)
        : 100,
      turnTimePercent: 100,
    };

    // Che phase: auto-select matching cards (same as local)
    if (state.chePhase && myCanChe && !state.cheTimerExpired && state.lastValidPlay) {
      const rank = state.lastValidPlay.rank;
      let found = 0;
      for (const card of myHand) {
        if (card.rankValue === rank && found < 2) {
          card.isSelected = true;
          found++;
        }
      }
      data.myHand = myHand;
    }

    // Finished state: reveal all opponent cards
    if (state.status === 'finished') {
      data.faceDownP1 = false; data.faceDownP2 = false; data.faceDownP3 = false;
    }

    // Business player red3 count detail
    if (state.isBusinessMode) {
      opponents.forEach((p: PlayerView, i: number) => {
        if (p.id === state.businessPlayerId) {
          const bpRed3Count = (state as any).red3CountByPlayer?.[p.id] || 0;
          const idx = ['p1', 'p2', 'p3'][i];
          if (bpRed3Count >= 2) {
            (data as any)[idx + 'TeamText'] = '💼 做业务';
            (data as any)[idx + 'TeamClass'] = 'solo';
          }
        }
      });
    }

    setGameUI(prev => ({ ...prev, ...data }));
    return data;
  }, []);

  // ===== renderOnlineSettlement =====
  const renderOnlineSettlement = useCallback((result: SettlementData) => {
    const nameMap: Record<number, string> = { 0: '玩家', 1: '玩家A', 2: '玩家B', 3: '玩家C' };
    // Try to get real names from game state
    const gs = gameStateRef.current as GameStateData | null;
    if (gs) {
      gs.players.forEach(p => { nameMap[p.id] = p.name; });
    }

    // Beiguan detection: players who didn't finish are "被关"
    const netResults = result.results.map(r => {
      const player = gs?.players.find(p => p.id === r.playerId);
      const isBeiguan = player && (!player.finished || (player.hand && player.hand.length > 0));
      return {
        ...r,
        playerName: nameMap[r.playerId] || r.name,
        rankName: isBeiguan ? '被关' : r.rankName,
        rankClass: isBeiguan ? 'rank-beiguan' : (r.rank ? ['rank-1', 'rank-2', 'rank-3', 'rank-4'][r.rank - 1] : ''),
      };
    }).sort((a, b) => b.netWon - a.netWon);

    const redPlayers = result.results.filter(r => r.isRed3Team);
    const blackPlayers = result.results.filter(r => !r.isRed3Team);
    const redTotal = redPlayers.reduce((s, r) => s + r.pot, 0);
    const blackTotal = blackPlayers.reduce((s, r) => s + r.pot, 0);
    const doubleTypeText = gs?.config.doubleType === 'steep' ? '陡翻' : '平翻';

    // Team pot bonus (tribute)
    const tb = result.teamPotBonus || { red_team: 0, black_team: 0 };
    const redBonus = tb.red_team || 0;
    const blackBonus = tb.black_team || 0;
    const showFormula = redBonus !== 0 || blackBonus !== 0;

    const titleMap: Record<string, string> = {
      '双关': '双关胜利！', '业务胜利': '业务玩家胜利！',
      '非业务玩家胜利': '非业务玩家胜利！', '章子比拼': '章子比拼获胜！',
    };

    const reasonMap: Record<string, string> = {
      '双关': '同阵营玩家以第一、二名完成！',
      '业务胜利': '业务玩家成功关住了其他玩家',
      '非业务玩家胜利': '业务失败！三家逃脱',
      '章子比拼': '两队章子总数比拼获胜',
    };

    const bombDetails = result.bombDetails.map(b => ({
      playerId: b.playerId,
      playerName: nameMap[b.playerId] || ('玩家' + b.playerId),
      type: b.type,
      fans: b.fans,
      cards: b.cards || [],
    }));

    setBombExpanded(false);

    setGameUI(prev => ({
      ...prev,
      showSettlement: true,
      settlementTitle: titleMap[result.victoryReason] || `${result.victoryTeam === 'red' ? '红三' : '黑三'}阵营胜利`,
      settlementReason: reasonMap[result.victoryReason] || '',
      settlementWinnerTeam: result.victoryTeam === 'business' ? 'red' : (result.victoryTeam || 'red'),
      settlementBaseAmount: gs?.config.baseAmount || 5,
      settlementDoubleTypeText: doubleTypeText,
      settlementFans: result.fans,
      settlementAmount: result.amount,
      settlementFansAmount: result.amount - (gs?.config.baseAmount || 5),
      settlementBombFans: result.bombFans,
      settlementExtraFans: result.extraFans,
      settlementExtraFansLabel: result.extraFansLabel,
      settlementBombDetails: bombDetails,
      settlementNetResults: netResults,
      settlementRedPlayers: redPlayers,
      settlementBlackPlayers: blackPlayers,
      settlementRedTotal: redTotal,
      settlementBlackTotal: blackTotal,
      settlementRedBonus: redBonus,
      settlementBlackBonus: blackBonus,
      settlementRedFinal: redPlayers.reduce((s, r) => s + r.netWon, 0),
      settlementBlackFinal: blackPlayers.reduce((s, r) => s + r.netWon, 0),
      settlementShowFormula: showFormula,
      settlementCurrentRound: result.currentRound,
      settlementTotalRounds: result.totalRounds,
      settlementIsLastRound: result.isLastRound,
    }));

    if (result.isLastRound) {
      setTimeout(() => playSound('settlement_final'), 600);
    } else {
      const humanPlayer = result.results.find(r => r.playerId === (gs?.mySeat ?? 0));
      if (humanPlayer && humanPlayer.netWon >= 0) {
        setTimeout(() => playSound('settlement_win'), 600);
      } else {
        setTimeout(() => playSound('settlement_lose'), 600);
      }
    }
  }, []);

  // ===== Shared sound detection (works for both local engine state and online GameStateData) =====
  const detectGameSounds = useCallback((gs: any) => {
    if (gs.chePhase !== lastChePhaseRef.current) {
      lastChePhaseRef.current = gs.chePhase;
      if (gs.chePhase) playSound('che_open');
      else playSound('che_close');
    }
    if (gs.turnIndex !== lastTurnIndexRef.current && gs.status !== 'finished') {
      const prevTurn = lastTurnIndexRef.current;
      if (gs.turnIndex === 0) {
        playSound('turn_start');
        if (gs.isFirstTurnOfGame) playSound('first_turn_h4');
      }
      if (prevTurn >= 0 && gs.passStatuses && gs.passStatuses[prevTurn]) {
        playSound('pass_other');
      }
    }
    const finishedSet = new Set<number>();
    (gs.players || []).forEach((p: any) => { if (p && p.finished) finishedSet.add(p.id); });
    finishedSet.forEach((id: number) => {
      if (!lastFinishedRef.current.has(id)) {
        lastFinishedRef.current.add(id);
        if (id !== 0) playSound('player_finish');
      }
    });
    (gs.players || []).forEach((p: any) => {
      if (p && p.revealed && !lastRevealedRef.current.has(p.id)) {
        lastRevealedRef.current.add(p.id);
        playSound('red3_reveal');
      }
    });
  }, []);

  const handleTurnAndTimers = useCallback((gs: any, data: Partial<GameUIState>) => {
    if (gs.status !== 'finished' && gs.turnIndex !== lastTurnIndexRef.current) {
      lastTurnIndexRef.current = gs.turnIndex;
      startTurnTimer();
    }
    if (uiRef.current.isManaged && gs.turnIndex === 0 && !gs.chePhase) {
      scheduleAutoPlay();
    }
    if (data.showTimer && !cheTimerRef.current) {
      startCheTimer();
    } else if (!data.showTimer && cheTimerRef.current) {
      clearCheTimer();
    }
  }, []);

  // ===== renderGameState =====
  const renderGameState = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const gs = engine.getState();
    if (!gs) return;
    gameStateRef.current = gs;

    const myPlayerId = 0;
    const myPlayer = gs.players[0];
    const opponents = [gs.players[1], gs.players[2], gs.players[3]];

    // Preserve isSelected across renders
    const curSel: Record<string, boolean> = {};
    (uiRef.current.myHand || []).forEach((c: any) => {
      if (c.isSelected) curSel[cardKey(c)] = true;
    });

    const data: any = {
      myPlayerId: 0,
      myHand: (myPlayer ? myPlayer.hand : []).map((c: any) => ({
        ...c,
        isSelected: !!curSel[cardKey(c)],
      })),
      myPot: myPlayer ? myPlayer.pot : 0,
      myName: myPlayer ? (myPlayer.name || '我') : '我',
      p1Name: opponents[0] ? (opponents[0].name || '玩家A') : '玩家A',
      p2Name: opponents[1] ? (opponents[1].name || '玩家B') : '玩家B',
      p3Name: opponents[2] ? (opponents[2].name || '玩家C') : '玩家C',
      turnIndex: gs.turnIndex,
      lastValidPlay: gs.lastValidPlay,
      historyCards: gs.historyCards || [],
      showCheControls: false,
      canChe: myPlayer ? myPlayer.canChe === true : false,
      myTeamText: gs.isBusinessMode && gs.businessPlayerId === 0
        ? '💼 做业务'
        : (myPlayer && myPlayer.isRed3Team ? '🚩 红三' : '⚑ 黑三'),
      myTeamClass: gs.isBusinessMode && gs.businessPlayerId === 0
        ? 'solo'
        : (myPlayer && myPlayer.isRed3Team ? 'red3' : 'black3'),
      // Real-time fan counter — sum bomb/h-bomb from roundHistory
      currentFans: (gs.roundHistory || []).reduce((sum: number, r: any) => {
        if (r.type === HAND_TYPES.BOMB) return sum + 1;
        if (r.type === HAND_TYPES.H_BOMB) return sum + 2;
        return sum;
      }, 0),
    };

    // Che phase: auto-select matching cards
    if (gs.chePhase && myPlayer && myPlayer.canChe && !gs.cheTimerExpired) {
      const rank = gs.lastValidPlay.rank;
      const myHandCopy = myPlayer.hand.map((c: any) => ({ ...c }));
      let found = 0;
      for (const card of myHandCopy) {
        if (card.rankValue === rank && found < 2) {
          card.isSelected = true;
          found++;
        }
      }
      data.myHand = myHandCopy;
      data.showCheControls = true;
    }

    const botRevealed = gs.config && gs.config.botRevealed;

    opponents.forEach((p: any, i: number) => {
      const idx = ['p1', 'p2', 'p3'][i];
      data[idx + 'Cards'] = (p && p.hand) ? p.hand.map((c: any) => ({ ...c })) : [];
      data[idx + 'Pot'] = p ? p.pot : 0;
      data[idx + 'Revealed'] = p ? p.revealed === true : false;
      data[idx + 'Rank'] = p ? (p.rank || 0) : 0;
      data[idx + 'RankLabel'] = (p && p.rank) ? RANK_NAMES[p.rank - 1] : '';
      data[idx + 'CardCount'] = (p && p.hand) ? p.hand.length : 0;
      data['faceDown' + idx.charAt(0).toUpperCase() + idx.charAt(1)] = !(botRevealed && p && p.isBot);

      if (p && (p.revealed === true || p.id === myPlayerId)) {
        if (gs.isBusinessMode && p.id === gs.businessPlayerId) {
          const bpRed3Count = (gs.red3CountByPlayer && gs.red3CountByPlayer[p.id]) || 0;
          if (bpRed3Count >= 2) {
            data[idx + 'TeamText'] = '💼 做业务';
            data[idx + 'TeamClass'] = 'solo';
          } else {
            data[idx + 'TeamText'] = '🚩 红三';
            data[idx + 'TeamClass'] = 'red3';
          }
        } else {
          data[idx + 'TeamText'] = p.isRed3Team ? '🚩 红三' : '⚑ 黑三';
          data[idx + 'TeamClass'] = p.isRed3Team ? 'red3' : 'black3';
        }
      } else {
        data[idx + 'TeamText'] = '未知身份';
        data[idx + 'TeamClass'] = 'unknown';
      }
    });

    if (gs.status === 'finished') {
      data.faceDownP1 = false; data.faceDownP2 = false; data.faceDownP3 = false;
    }

    // Play slots
    const playSlots: any[] = [
      { cards: [], passed: false },
      { cards: [], passed: false },
      { cards: [], passed: false },
      { cards: [], passed: false },
    ];
    if (gs.lastPlayByPlayerId >= 0 && gs.tableCards && gs.tableCards.length > 0) {
      const isChePlay = gs.lastValidPlay && gs.lastValidPlay.type === HAND_TYPES.CHE;
      playSlots[gs.lastPlayByPlayerId] = { cards: gs.tableCards, passed: false };
      if (isChePlay) playSlots[gs.lastPlayByPlayerId].isChe = true;
    }
    if (gs.passStatuses) {
      gs.passStatuses.forEach((passed: boolean, i: number) => {
        if (passed && i !== gs.lastPlayByPlayerId && !(gs.pendingCollect && i === gs.pendingPassPlayerId)) {
          playSlots[i] = { cards: [], passed: true };
        }
      });
    }
    if (gs.pendingCollect && gs.pendingPassPlayerId !== undefined && gs.pendingPassPlayerId !== gs.lastPlayByPlayerId) {
      data.passFlashSlot = gs.pendingPassPlayerId;
    } else {
      data.passFlashSlot = -1;
    }
    data.playSlots = playSlots;

    const tableTotal = (gs.tableCards ? gs.tableCards.length : 0) +
      (gs.historyCards ? gs.historyCards.length : 0);
    data.tablePotCount = tableTotal;

    const isMyTurn = myPlayer && gs.turnIndex === 0 && !gs.chePhase;
    data.showControls = isMyTurn;
    data.showHandCount = gs.config && gs.config.showHandCount !== false;

    if (uiRef.current.isManaged) {
      if (data.showControls) data.showControls = false;
      if (data.showCheControls) data.showCheControls = false;
    }

    // Che phase timer
    if (gs.chePhase && gs.chePhaseStartedAt && !gs.cheTimerExpired) {
      data.showTimer = true;
      const elapsed = Date.now() - gs.chePhaseStartedAt;
      const remaining = Math.max(0, 3000 - elapsed);
      data.timerPercent = (remaining / 3000) * 100;
    } else {
      data.showTimer = false;
      data.timerPercent = 100;
    }

    // ===== 音效检测 (shared between local and online) =====
    detectGameSounds(gs);
    setGameUI(prev => ({ ...prev, ...data }));
    handleTurnAndTimers(gs, data);
  }, []);

  // ===== Turn Timer =====
  const timerWarnedRef = useRef(false);
  const startTurnTimer = useCallback(() => {
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    timerWarnedRef.current = false;
    const startTime = Date.now();
    setGameUI(prev => ({ ...prev, turnTimePercent: 100 }));
    turnTimerRef.current = setInterval(() => {
      const gs = gameStateRef.current;
      if (!gs || gs.status === 'finished') { clearTurnTimer(); return; }
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 30000 - elapsed);
      setGameUI(prev => ({ ...prev, turnTimePercent: (remaining / 30000) * 100 }));
      if (remaining <= 10000 && !timerWarnedRef.current) {
        timerWarnedRef.current = true;
        playSound('timer_warning');
      }
      if (remaining <= 0) {
        clearTurnTimer();
        onTurnTimeout();
      }
    }, 500);
  }, []);

  const clearTurnTimer = () => {
    if (turnTimerRef.current) { clearInterval(turnTimerRef.current); turnTimerRef.current = undefined; }
  };

  const onTurnTimeout = () => {
    playSound('timer_timeout');
    const gs = gameStateRef.current;
    if (!gs || gs.status === 'finished' || gs.turnIndex !== 0 || gs.chePhase) return;

    if (gs.lastValidPlay) {
      doPass();
    } else {
      const hand = (gs.players[0]?.hand || []);
      if (hand.length === 0) return;
      const plays = generateAllValidPlays(hand, null, gs.isFirstTurnOfGame);
      if (plays.length === 0) { doPass(); return; }
      const play = plays[0];
      const handWithSel = hand.map((c: any) => {
        const match = play.cards.some((pc: any) => pc.suit === c.suit && pc.rankValue === c.rankValue);
        return { ...c, isSelected: match };
      });
      setGameUI(prev => ({ ...prev, myHand: handWithSel }));
      setTimeout(() => doPlay(), 400);
    }
  };

  // ===== Che Timer =====
  const startCheTimer = () => {
    if (cheTimerRef.current) clearInterval(cheTimerRef.current);
    cheTimerRef.current = setInterval(() => {
      const gs = gameStateRef.current;
      if (!gs || gs.status === 'finished' || !gs.chePhase) { clearCheTimer(); return; }
      const elapsed = Date.now() - gs.chePhaseStartedAt;
      const remaining = Math.max(0, 3000 - elapsed);
      if (remaining <= 0) {
        clearCheTimer();
        onCheTimerExpired();
      } else {
        setGameUI(prev => ({ ...prev, timerPercent: (remaining / 3000) * 100 }));
      }
    }, 100);
  };

  const clearCheTimer = () => {
    if (cheTimerRef.current) { clearInterval(cheTimerRef.current); cheTimerRef.current = undefined; }
  };

  const onCheTimerExpired = () => {
    if (isOnlineRef.current) {
      networkClient.declineChe();
    } else {
      engineRef.current?.endChePhase();
      // onChange will trigger renderGameState
    }
  };

  // ===== Actions =====
  // 根据牌型播放对应音效
  const playCardTypeSound = (info: any) => {
    switch (info.type) {
      case HAND_TYPES.SINGLE: playSound('play_single'); break;
      case HAND_TYPES.PAIR: playSound('play_pair'); break;
      case HAND_TYPES.STRAIGHT: playSound('play_straight'); break;
      case HAND_TYPES.BOMB: playSound('play_bomb'); break;
      case HAND_TYPES.H_BOMB: playSound('play_hbomb'); break;
      case HAND_TYPES.CHE: playSound('play_che'); break;
    }
  };

  const submitPlay = (cards: any[], isSelfChe: boolean, cheRemain: any[] | null) => {
    if (isOnlineRef.current) {
      networkClient.playCards(
        cards.map((c: any) => ({ suit: c.suit, rankValue: c.rankValue })),
        isSelfChe || false,
        cheRemain ? cheRemain.map((c: any) => ({ suit: c.suit, rankValue: c.rankValue })) : undefined
      );
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    const result = engine.playCards(0, cards, isSelfChe || false, cheRemain);
    if (!result.success) {
      // Invalid play — deselect
      setGameUI(prev => ({ ...prev, myHand: prev.myHand.map((c: any) => ({ ...c, isSelected: false })) }));
    }
    // onChange will trigger renderGameState
    triggerBotIfNeeded();
  };

  const doPlay = () => {
    const hand = uiRef.current.myHand;
    const sel = hand.filter((c: any) => c.isSelected);
    if (sel.length === 0) { flashError('请先选择要出的牌'); return; }

    const info = analyze(sel);
    if (!info) { flashError('无效牌型，请重新选择'); return; }

    const gs = gameStateRef.current;
    if (!gs) return;

    // First-turn check
    if (gs.isFirstTurnOfGame) {
      const hasFour4s = hand.filter((c: any) => c.rankValue === 4).length === 4;
      if (!hasFour4s) {
        const hasH4 = sel.some((c: any) =>
          c.isH4 || (c.suit === 2 && c.rankValue === 4)
        );
        const isSingleH4 = info.type === HAND_TYPES.SINGLE && hasH4;
        const isThree4sSelfChe = info.type === HAND_TYPES.BOMB && sel.length === 3 &&
          sel[0].rankValue === 4 && hasH4;
        if (!isSingleH4 && !isThree4sSelfChe) { flashError('首回合必须先出红桃4'); return; }
      }
    }

    // canBeat check
    if (gs.lastValidPlay && !canBeat(gs.lastValidPlay, info)) {
      flashError('打不过场上的牌，请重新选择或点「不要」');
      return;
    }

    // Self-che dialog for bombs as first play
    if (!gs.lastValidPlay && info.type === HAND_TYPES.BOMB) {
      const isFirstTurnWithThree4sOnly = gs.isFirstTurnOfGame &&
        sel[0].rankValue === 4 &&
        hand.filter((c: any) => c.rankValue === 4).length === 3;
      if (isFirstTurnWithThree4sOnly) {
        playSound('play_bomb');
        submitPlay(sel, true, [sel[1], sel[2]]);
      } else {
        setGameUI(prev => ({ ...prev, showSelfCheDialog: true, selfCheCards: sel }));
      }
      return;
    }

    playCardTypeSound(info);
    submitPlay(sel, false, null);
  };

  const handlePlayClick = () => { cancelManagedIfNeeded(); doPlay(); };

  const handleSelfCheBomb = () => {
    const cards = uiRef.current.selfCheCards;
    setGameUI(prev => ({ ...prev, showSelfCheDialog: false, selfCheCards: null }));
    if (cards) { playSound('play_bomb'); submitPlay(cards, false, null); }
  };

  const handleSelfCheChe = () => {
    const cards = uiRef.current.selfCheCards;
    setGameUI(prev => ({ ...prev, showSelfCheDialog: false, selfCheCards: null }));
    if (cards) { playSound('play_che'); submitPlay(cards, true, [cards[1], cards[2]]); }
  };

  const doPass = () => {
    if (isOnlineRef.current) {
      playSound('pass_self');
      networkClient.pass();
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    playSound('pass_self');
    engine.passTurn(0);
    // onChange will trigger renderGameState
    triggerBotIfNeeded();
  };

  const handlePassClick = () => { cancelManagedIfNeeded(); doPass(); };

  const handleCheAction = () => {
    cancelManagedIfNeeded();
    const gs = gameStateRef.current;
    if (!gs || !gs.lastValidPlay) return;
    const rank = gs.lastValidPlay.rank;
    const matchCards = uiRef.current.myHand.filter((c: any) => c.rankValue === rank).slice(0, 2);
    if (matchCards.length < 2) return;
    if (isOnlineRef.current) {
      networkClient.cheAction(matchCards.map((c: any) => ({ suit: c.suit, rankValue: c.rankValue })));
      return;
    }
    engineRef.current?.cheAction(0, matchCards);
    triggerBotIfNeeded();
  };

  const handleDeclineChe = () => {
    setGameUI(prev => ({
      ...prev,
      myHand: prev.myHand.map((c: any) => ({ ...c, isSelected: false })),
      showCheControls: false,
    }));
    if (isOnlineRef.current) {
      networkClient.declineChe();
      return;
    }
    engineRef.current?.declineChe(0);
  };

  // ===== Hint =====
  const handleHint = () => {
    cancelManagedIfNeeded();
    const hand = uiRef.current.myHand.map((c: any) => ({ ...c, isSelected: false }));
    const gs = gameStateRef.current;
    if (!gs) return;

    if (gs.chePhase) {
      const rank = gs.lastValidPlay.rank;
      const matches = hand.filter((c: any) => c.rankValue === rank);
      if (matches.length >= 2) {
        matches[0].isSelected = true;
        matches[1].isSelected = true;
      }
      setGameUI(prev => ({ ...prev, myHand: hand }));
      return;
    }

    const playKey = gs.lastValidPlay
      ? `${gs.lastValidPlay.type}_${gs.lastValidPlay.rank}_${gs.lastValidPlay.length || 0}`
      : 'free';

    if (hintRef.current.key !== playKey) {
      hintRef.current.key = playKey;
      hintRef.current.index = 0;
    }

    const plays = generateAllValidPlays(hand, gs.lastValidPlay, gs.isFirstTurnOfGame);

    if (plays.length === 0) {
      hintRef.current.index = 0;
      hintRef.current.key = '';
      if (gs.lastValidPlay) doPass();
      return;
    }

    if (hintRef.current.index >= plays.length) hintRef.current.index = 0;

    const play = plays[hintRef.current.index];
    play.cards.forEach((card: any) => { card.isSelected = true; });
    hintRef.current.index++;
    setGameUI(prev => ({ ...prev, myHand: hand }));
  };

  // ===== Managed / 托管 =====
  const cancelManagedIfNeeded = () => {
    if (uiRef.current.isManaged) {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = undefined;
      }
      setGameUI(prev => ({ ...prev, isManaged: false }));
    }
  };

  const toggleManaged = () => {
    setGameUI(prev => {
      const next = !prev.isManaged;
      if (next) {
        playSound('managed_on');
        // Just turned on — kick off auto-play immediately if it's our turn
        setTimeout(() => scheduleAutoPlay(), 200);
      } else {
        playSound('managed_off');
        // Turned off — cancel any pending auto-play
        if (autoPlayTimerRef.current) {
          clearTimeout(autoPlayTimerRef.current);
          autoPlayTimerRef.current = undefined;
        }
      }
      return { ...prev, isManaged: next };
    });
  };

  const scheduleAutoPlay = () => {
    if (autoPlayTimerRef.current) return;
    if (!uiRef.current.isManaged) return;
    const gs = gameStateRef.current;
    if (!gs || gs.status === 'finished' || gs.turnIndex !== 0) return;

    // In che phase — always decline for managed mode
    if (gs.chePhase) {
      const myPlayer = gs.players[0];
      if (myPlayer && myPlayer.canChe && !gs.cheTimerExpired) {
        autoPlayTimerRef.current = setTimeout(() => {
          autoPlayTimerRef.current = undefined;
          if (!uiRef.current.isManaged) return;
          handleDeclineChe();
          // After declining, bot may play — renderGameState will call scheduleAutoPlay again
        }, 800);
      }
      return;
    }

    // Use engine state directly to find a play (not UI ref which can be stale)
    const myPlayer = gs.players[0];
    if (!myPlayer || !myPlayer.hand || myPlayer.hand.length === 0) return;

    const handCopy = myPlayer.hand.map((c: any) => ({ ...c }));
    const plays = generateAllValidPlays(handCopy, gs.lastValidPlay, gs.isFirstTurnOfGame);

    autoPlayTimerRef.current = setTimeout(() => {
      autoPlayTimerRef.current = undefined;
      if (!uiRef.current.isManaged) return;

      // Re-check conditions (might have changed during timeout)
      const gs2 = gameStateRef.current;
      if (!gs2 || gs2.status === 'finished' || gs2.turnIndex !== 0) return;

      if (plays.length === 0) {
        // No valid play — pass if required
        if (gs2.lastValidPlay) {
          doPass();
        }
        return;
      }

      // Pick the first (smallest) valid play
      const play = plays[0];
      const currentHand = uiRef.current.myHand.map((c: any) => ({
        ...c,
        isSelected: play.cards.some((pc: any) => pc.suit === c.suit && pc.rankValue === c.rankValue),
      }));
      setGameUI(prev => ({ ...prev, myHand: currentHand }));

      // Short delay for visual feedback, then play
      autoPlayTimerRef.current = setTimeout(() => {
        autoPlayTimerRef.current = undefined;
        if (!uiRef.current.isManaged) return;
        doPlay();
      }, 500);
    }, 800);
  };

  // ===== Bot Trigger =====
  const triggerBotIfNeeded = () => {
    const gs = gameStateRef.current;
    if (!gs || gs.status === 'finished') return;
    engineRef.current?.processBotMoves();
  };

  // ===== Touch Selection =====
  const initHandMetrics = () => {
    const t = touchRef.current;
    if (t.cardStep != null) return;
    // Compute actual pixel step between adjacent cards (accounts for CSS overlap margin)
    const cards = document.querySelectorAll('.hand-container .card-wrapper');
    if (cards.length >= 2) {
      const c0 = cards[0].getBoundingClientRect();
      const c1 = cards[1].getBoundingClientRect();
      t.cardStep = c1.left - c0.left;
      t.firstCardLeft = c0.left;
    } else if (cards.length === 1) {
      const c0 = cards[0].getBoundingClientRect();
      t.cardStep = c0.width;
      t.firstCardLeft = c0.left;
    }
  };

  const onHandTouchStart = (e: React.TouchEvent, idx: number) => {
    cancelManagedIfNeeded(); playSound('card_select');
    const ui = uiRef.current;
    if (!ui.showControls && !ui.showCheControls) return;
    if (idx < 0 || idx >= ui.myHand.length) return;
    e.preventDefault();
    initHandMetrics();
    const t = touchRef.current;
    t.startIdx = idx;
    t.startPageX = e.touches[0].pageX;
    t.moved = false;
    t.startSelected = ui.myHand[idx].isSelected || false;
    t.lastStart = null; t.lastEnd = null;

    const hand = ui.myHand.map((c: any, i: number) => ({
      ...c, isSelected: i === idx ? !t.startSelected : c.isSelected,
    }));
    setGameUI(prev => ({ ...prev, myHand: hand }));
  };

  const onHandTouchMove = (e: React.TouchEvent) => {
    const t = touchRef.current;
    if (t.startIdx == null) return;
    if (!e.touches.length) return;
    e.preventDefault();

    const touchX = e.touches[0].pageX;
    let idx: number;
    if (t.firstCardLeft != null && t.cardStep != null) {
      idx = Math.round((touchX - t.firstCardLeft) / t.cardStep);
    } else if (t.cardStep != null) {
      const deltaPx = touchX - t.startPageX;
      idx = t.startIdx + Math.round(deltaPx / t.cardStep);
    } else return;

    idx = Math.max(0, Math.min(idx, uiRef.current.myHand.length - 1));
    if (idx !== t.startIdx) t.moved = true;
    if (!t.moved) return;

    const start = Math.min(t.startIdx, idx);
    const end = Math.max(t.startIdx, idx);
    if (t.lastStart === start && t.lastEnd === end) return;
    t.lastStart = start; t.lastEnd = end;

    const hand = uiRef.current.myHand.map((c: any, i: number) => ({
      ...c, isSelected: i >= start && i <= end ? !t.startSelected : c.isSelected,
    }));
    setGameUI(prev => ({ ...prev, myHand: hand }));
  };

  const onHandTouchEnd = () => {
    const t = touchRef.current;
    if (t.startIdx == null) return;
    if (t.moved) {
      // Record drag end time so onHandBgTap ignores the synthetic click that
      // fires ~300ms after touchend at the release position (which may land on
      // the .hand-scroll gap between cards and spuriously clear all selections).
      t.dragEndTime = Date.now();
    }
    // Single tap toggle is handled in touchStart (start card → !startSelected)
    t.startIdx = null;
    t.startPageX = 0;
    t.moved = false;
    t.startSelected = false;
    t.lastStart = null;
    t.lastEnd = null;
  };

  const onHandBgTap = () => {
    // Ignore clicks that arrive right after a drag (e.g. the ~300ms synthetic
    // click after touchend), otherwise selections are spuriously cleared.
    if (Date.now() - touchRef.current.dragEndTime < 400) return;
    const hand = uiRef.current.myHand.map((c: any) => ({ ...c, isSelected: false }));
    if (uiRef.current.myHand.some((c: any) => c.isSelected)) {
      setGameUI(prev => ({ ...prev, myHand: hand }));
    }
  };

  const onTableBgTap = () => {
    onHandBgTap();
  };

  // ===== Mouse Selection (desktop) =====
  const onCardMouseDown = (e: React.MouseEvent, idx: number) => {
    cancelManagedIfNeeded(); playSound('card_select');
    const ui = uiRef.current;
    if (!ui.showControls && !ui.showCheControls) return;
    if (idx < 0 || idx >= ui.myHand.length) return;
    e.preventDefault();
    initHandMetrics();
    const t = touchRef.current;
    t.startIdx = idx;
    t.startPageX = e.pageX;
    t.moved = false;
    t.startSelected = ui.myHand[idx].isSelected || false;
    t.lastStart = null; t.lastEnd = null;
    t._mouseActive = true;

    const hand = ui.myHand.map((c: any, i: number) => ({
      ...c, isSelected: i === idx ? !t.startSelected : c.isSelected,
    }));
    setGameUI(prev => ({ ...prev, myHand: hand }));
  };

  const onHandMouseMove = (e: React.MouseEvent) => {
    const t = touchRef.current;
    if (!t._mouseActive || t.startIdx == null) return;
    // Only track when left button is held
    if (!(e.buttons & 1)) { t._mouseActive = false; t.startIdx = null; return; }

    const touchX = e.pageX;
    let idx: number;
    if (t.firstCardLeft != null && t.cardStep != null) {
      idx = Math.round((touchX - t.firstCardLeft) / t.cardStep);
    } else if (t.cardStep != null) {
      const deltaPx = touchX - t.startPageX;
      idx = t.startIdx + Math.round(deltaPx / t.cardStep);
    } else return;

    idx = Math.max(0, Math.min(idx, uiRef.current.myHand.length - 1));
    if (idx !== t.startIdx) t.moved = true;
    if (!t.moved) return;

    const start = Math.min(t.startIdx, idx);
    const end = Math.max(t.startIdx, idx);
    if (t.lastStart === start && t.lastEnd === end) return;
    t.lastStart = start; t.lastEnd = end;

    const hand = uiRef.current.myHand.map((c: any, i: number) => ({
      ...c, isSelected: i >= start && i <= end ? !t.startSelected : c.isSelected,
    }));
    setGameUI(prev => ({ ...prev, myHand: hand }));
  };

  const onHandMouseUp = () => {
    const t = touchRef.current;
    t._mouseActive = false;
    if (t.startIdx == null) return;
    if (t.moved) {
      t.dragEndTime = Date.now();
    }
    // Single click toggle is handled in onCardMouseDown (start card → !startSelected)
    t.startIdx = null;
    t.startPageX = 0;
    t.moved = false;
    t.startSelected = false;
    t.lastStart = null;
    t.lastEnd = null;
  };

  // ===== Settlement =====
  const loadSettlement = useCallback(() => {
    const gs = gameStateRef.current;
    const settlement = settlementRef.current;
    if (!gs || !settlement) return;

    setBombExpanded(false);

    const players = gs.players || [];
    const cfg = gs.config || {};

    const { fans, bombFans, extraFans, extraFansLabel, bombDetails, results, amount } = settlement;

    const rankClasses = ['rank-1', 'rank-2', 'rank-3', 'rank-4'];
    const doubleTypeText = cfg.doubleType === 'steep' ? '陡翻' : '平翻';

    let titleText = '牌局结算';
    let reasonText = '';
    if (gs.victoryReason === '双关') {
      titleText = gs.victoryTeam === 'red' ? '🚩 红三阵营胜利' : '⚑ 黑三阵营胜利';
      reasonText = '双关！同阵营玩家以第一、二名完成！';
    } else if (gs.victoryReason === '业务胜利') {
      titleText = '💼 业务玩家胜利';
      const notFinished = players.filter((p: any) => !p.finished || p.hand?.length > 0).length;
      reasonText = '关住了' + notFinished + '名玩家，业务成功！';
    } else if (gs.victoryReason === '非业务玩家胜利') {
      titleText = gs.victoryTeam === 'red' ? '🚩 红三阵营胜利' : '⚑ 黑三阵营胜利';
      reasonText = '业务失败！';
    } else if (gs.victoryReason === '章子比拼') {
      titleText = gs.victoryTeam === 'red' ? '🚩 红三阵营胜利' : '⚑ 黑三阵营胜利';
      reasonText = '章子比拼获胜！';
    }

    const buildRow = (r: any) => {
      const player = players[r.playerId];
      const isBeiguan = player && (!player.finished || (player.hand && player.hand.length > 0));
      return {
        playerId: r.playerId,
        name: player ? player.name : r.name,
        rankName: isBeiguan ? '被关' : r.rankName,
        rankClass: isBeiguan ? 'rank-beiguan' : (r.rank ? rankClasses[r.rank - 1] : ''),
        pot: r.pot,
        netWon: r.netWon,
        isSolo: gs.isBusinessMode && r.playerId === gs.businessPlayerId,
      };
    };

    const allResults = results.map(buildRow);
    const redPlayers = allResults.filter((r: any) => {
      const p = players[r.playerId];
      return p && p.isRed3Team;
    });
    const blackPlayers = allResults.filter((r: any) => {
      const p = players[r.playerId];
      return p && !p.isRed3Team;
    });

    const redTotal = redPlayers.reduce((s: number, r: any) => s + r.pot, 0);
    const blackTotal = blackPlayers.reduce((s: number, r: any) => s + r.pot, 0);

    let redBonus = 0, blackBonus = 0;
    if (gs.teamPotBonus) {
      redBonus = gs.teamPotBonus.red_team || 0;
      blackBonus = gs.teamPotBonus.black_team || 0;
    }
    const redFinal = redTotal + redBonus;
    const blackFinal = blackTotal + blackBonus;
    const showFormula = (redBonus !== 0 || blackBonus !== 0);

    const bombDetailsMapped = bombDetails.map((b: any) => {
      const p = players[b.playerId];
      return {
        playerId: b.playerId,
        playerName: p ? p.name : ('玩家' + (b.playerId + 1)),
        type: b.type,
        fans: b.fans,
        cards: b.cards || [],
      };
    });

    const winnerTeam = gs.victoryTeam === 'business' ? 'red' : (gs.victoryTeam || 'red');
    const isLastRound = (gs.currentRound >= (gs.totalRounds || 8));

    // 结算音效
    playSound('settlement_show');
    setTimeout(() => {
      const myPlayer = gs.players[0];
      const iWon = myPlayer && myPlayer.isRed3Team
        ? (winnerTeam === 'red')
        : (winnerTeam !== 'red' && winnerTeam !== 'business');
      if (isLastRound) playSound('settlement_final');
      else if (iWon) playSound('settlement_win');
      else playSound('settlement_lose');
    }, 600);

    setGameUI(prev => ({
      ...prev,
      showSettlement: true,
      settlementTitle: titleText,
      settlementReason: reasonText,
      settlementWinnerTeam: winnerTeam,
      settlementIsLastRound: isLastRound,
      settlementCurrentRound: gs.currentRound || 1,
      settlementTotalRounds: gs.totalRounds || 8,
      settlementRedPlayers: redPlayers,
      settlementBlackPlayers: blackPlayers,
      settlementRedTotal: redTotal, settlementBlackTotal: blackTotal,
      settlementRedBonus: redBonus, settlementBlackBonus: blackBonus,
      settlementRedFinal: redFinal, settlementBlackFinal: blackFinal,
      settlementShowFormula: showFormula,
      settlementBaseAmount: cfg.baseAmount || 0,
      settlementDoubleTypeText: doubleTypeText,
      settlementFans: fans,
      settlementAmount: amount,
      settlementFansAmount: amount - (cfg.baseAmount || 0),
      settlementBombFans: bombFans,
      settlementExtraFans: extraFans,
      settlementExtraFansLabel: extraFansLabel,
      settlementBombDetails: bombDetailsMapped,
      settlementNetResults: allResults.sort((a: any, b: any) => b.netWon - a.netWon),
    }));
  }, []);

  const handleNextRound = () => {
    if (isOnlineRef.current) {
      networkClient.nextRound();
      setGameUI(prev => ({
        ...prev,
        showSettlement: false,
        playSlots: [
          { cards: [], passed: false }, { cards: [], passed: false },
          { cards: [], passed: false }, { cards: [], passed: false },
        ],
        historyCards: [],
        tablePotCount: 0,
        showControls: false,
        showCheControls: false,
        showTimer: false,
      }));
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    const result = engine.nextRound();
    if (!result.success) return;
    setGameUI(prev => ({
      ...prev,
      showSettlement: false,
      playSlots: [
        { cards: [], passed: false }, { cards: [], passed: false },
        { cards: [], passed: false }, { cards: [], passed: false },
      ],
      historyCards: [],
      tablePotCount: 0,
      showControls: false,
      showCheControls: false,
      showTimer: false,
    }));
    gameStateRef.current = engine.getState();
    if (gameStateRef.current) {
      lastTurnIndexRef.current = -1;
      renderGameState();
      triggerBotIfNeeded();
    }
  };

  // ===== Score Panel =====
  const openScorePanel = () => {
    const gs = gameStateRef.current;
    if (!gs) return;
    const accScores = gs.accumulatedScores || {};
    const players = (gs.players || []).map((p: any) => ({
      playerId: p.id,
      name: p.name,
      totalNet: accScores[p.id] || 0,
    })).sort((a: any, b: any) => b.totalNet - a.totalNet);
    setGameUI(prev => ({
      ...prev,
      showScorePanel: true,
      scorePanelPlayers: players,
      scorePanelCurrentRound: gs.currentRound || 1,
      scorePanelTotalRounds: gs.totalRounds || 8,
    }));
  };

  const closeScorePanel = () => {
    setGameUI(prev => ({ ...prev, showScorePanel: false }));
  };

  const handleLeaveRoom = () => {
    if (isOnlineRef.current) {
      networkClient.leaveRoom();
    }
    engineRef.current?.destroy();
    navigate('/');
  };

  // ===== Init =====
  const initEscapeRef = useRef(false);
  const savedStateJsonRef = useRef<string | null>(null);
  useEffect(() => {
    // ===== ONLINE MODE =====
    if (isOnline) {
      // Try to load initial state from sessionStorage (saved by Room.tsx on game_start)
      const savedState = sessionStorage.getItem('onlineGameState');
      if (savedState) {
        try {
          const state: GameStateData = JSON.parse(savedState);
          gameStateRef.current = state;
          renderOnlineGameState(state);
          sessionStorage.removeItem('onlineGameState');
        } catch {}
      }

      // Subscribe to live state updates
      stateListenerRef.current = networkClient.onStateChange((state: GameStateData) => {
        gameStateRef.current = state;
        if (state.status === 'finished') {
          clearTurnTimer();
          clearCheTimer();
          // Settlement will arrive via onSettlement
          return;
        }
        const uiData = renderOnlineGameState(state);
        detectGameSounds(state);
        handleTurnAndTimers(state, uiData);
      });

      // Subscribe to server errors
      const unsubError = networkClient.onError((msg) => { flashError(msg); });

      // Subscribe to settlement
      settlementListenerRef.current = networkClient.onSettlement((result: SettlementData) => {
        gameStateRef.current && renderOnlineGameState(gameStateRef.current as GameStateData);
        renderOnlineSettlement(result);
      });

      return () => {
        clearTurnTimer();
        clearCheTimer();
        if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
        if (stateListenerRef.current) stateListenerRef.current();
        if (settlementListenerRef.current) settlementListenerRef.current();
        unsubError();
      };
    }

    // ===== LOCAL MODE =====
    let engine: GameEngine;
    let created = false;

    // Load saved state: from sessionStorage on first run, from ref on Strict Mode re-run (sessionStorage already cleared)
    let saved: string | null = null;
    if (!initEscapeRef.current) {
      saved = sessionStorage.getItem('localGame');
      if (saved) {
        savedStateJsonRef.current = saved;
        sessionStorage.removeItem('localGame');
      }
      initEscapeRef.current = true;
    } else {
      saved = savedStateJsonRef.current;
    }

    if (saved) {
      try {
        const state = JSON.parse(saved);
        engine = new GameEngine();
        engine._state = attachAllCards(state);
      } catch {
        engine = new GameEngine();
        created = true;
      }
    } else {
      engine = new GameEngine();
      created = true;
    }

    if (created) {
      const players = [0, 1, 2, 3].map(i => ({
        openid: `p${i}`,
        name: i === 0 ? '我' : `电脑${['A','B','C'][i-1]}`,
        isBot: i !== 0,
      }));
      engine.createGame(players, {
        baseAmount: 5, doubleType: 'steep', smartShuffle: true,
        smartShuffleLevel: 3, totalRounds: 8, showHandCount: true,
      });
    }

    engineRef.current = engine;
    const unsub = engine.onChange((state: any) => {
      if (!state) return;
      gameStateRef.current = state;
      if (state.status === 'finished') {
        clearTurnTimer();
        clearCheTimer();
        renderGameState();
        settlementRef.current = engine.getSettlement(); // Triggers accumulatedScores update + caches result
        loadSettlement();
        return;
      }
      renderGameState();
      triggerBotIfNeeded();
    });

    const gs = engine.getState();
    gameStateRef.current = gs;
    lastTurnIndexRef.current = -1; // Ensure timer starts on first renderGameState
    renderGameState();

    if (gs && gs.status === 'playing') {
      triggerBotIfNeeded();
    }

    return () => {
      clearTurnTimer();
      clearCheTimer();
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      unsub();
      engine.destroy();
    };
  }, [gameId, isOnline, renderOnlineGameState, renderOnlineSettlement]);

  // ===== Render Helpers =====
  const renderCard = (c: any, size: 'mini' | 'normal' | 'large', extraClass = '') => {
    if (!c) {
      // Face-down card back
      const style: React.CSSProperties = size === 'large'
        ? { width: 'var(--play-card-w)', height: 'var(--play-card-h)' }
        : size === 'normal'
        ? { width: 'var(--card-w)', height: 'var(--card-h)' }
        : { width: 'var(--mini-card-w)', height: 'var(--mini-card-h)' };
      return (
        <div className={`card-back-el ${extraClass}`} style={style}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-dim)' }}>🂠</span>
        </div>
      );
    }
    const d = cardDisplay(c);
    const style: React.CSSProperties = size === 'large'
      ? { width: 'var(--play-card-w)', height: 'var(--play-card-h)' }
      : size === 'normal'
      ? { width: 'var(--card-w)', height: 'var(--card-h)' }
      : { width: 'var(--mini-card-w)', height: 'var(--mini-card-h)' };
    const cornerRank = size === 'mini' ? 'calc(var(--mini-card-w) * 0.28)' : size === 'large' ? 'calc(var(--play-card-w) * 0.32)' : 'calc(var(--card-w) * 0.28)';
    const cornerSuit = size === 'mini' ? 'calc(var(--mini-card-w) * 0.18)' : size === 'large' ? 'calc(var(--play-card-w) * 0.2)' : 'calc(var(--card-w) * 0.18)';
    return (
      <div className={`card-face-el ${d.color === 'red' ? 'red' : 'black'} ${extraClass}`} style={style}>
        <div style={{ position: 'absolute', top: 1, left: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span style={{ fontSize: cornerRank, fontWeight: 900 }}>{d.rank}</span>
          <span style={{ fontSize: cornerSuit }}>{d.suit}</span>
        </div>
      </div>
    );
  };

  const renderTeamBadge = (teamClass: string, teamText: string) => (
    <span className={`tag tag-${teamClass}`}>{teamText}</span>
  );

  const renderRankBadge = (rank: number, rankLabel: string) => {
    if (!rank) return null;
    const cls = RANK_CLASSES[rank - 1] || 'rank-beiguan';
    return (
      <span className="result-rank" style={{
        background: cls === 'rank-1' ? 'linear-gradient(135deg, #f97316, #ea580c)' :
                    cls === 'rank-2' ? 'linear-gradient(135deg, #a855f7, #9333ea)' :
                    cls === 'rank-3' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' :
                    cls === 'rank-4' ? 'linear-gradient(135deg, #22c55e, #16a34a)' :
                    '#dc2626',
        color: '#fff', fontWeight: 800,
        fontSize: 'var(--fs-xs)', padding: '1px 6px',
        borderRadius: 'var(--radius-sm)',
      }}>
        {rankLabel}
      </span>
    );
  };

  // ===== Main Layout =====
  const ui = gameUI;
  const opponents = [
    { idx: 'p1', cards: ui.p1Cards, cardCount: ui.p1CardCount, pot: ui.p1Pot, name: ui.p1Name, teamText: ui.p1TeamText, teamClass: ui.p1TeamClass, rank: ui.p1Rank, rankLabel: ui.p1RankLabel, faceDown: ui.faceDownP1 },
    { idx: 'p2', cards: ui.p2Cards, cardCount: ui.p2CardCount, pot: ui.p2Pot, name: ui.p2Name, teamText: ui.p2TeamText, teamClass: ui.p2TeamClass, rank: ui.p2Rank, rankLabel: ui.p2RankLabel, faceDown: ui.faceDownP2 },
    { idx: 'p3', cards: ui.p3Cards, cardCount: ui.p3CardCount, pot: ui.p3Pot, name: ui.p3Name, teamText: ui.p3TeamText, teamClass: ui.p3TeamClass, rank: ui.p3Rank, rankLabel: ui.p3RankLabel, faceDown: ui.faceDownP3 },
  ];

  // Unified opponent rendering — hand cards on left, avatar+info on right
  // Left-side player (sideId 1): hand cards on the RIGHT of avatar
  const renderOpponent = (p: typeof opponents[0], sideId: number) => {
    const isActive = ui.turnIndex === sideId;
    const handOnRight = sideId === 1; // left-side player → hand on right

    const handFan = (
      <div className="opponent-hand-fan" style={handOnRight ? { flexDirection: 'row-reverse' } : undefined}>
        {p.faceDown ? (
          <div className="card-wrapper">
            <div className="card-back-el" style={{
              width: 'var(--mini-card-w)', height: 'var(--mini-card-h)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {ui.showHandCount && <span style={{ fontSize: 'var(--fs-base)', fontWeight: 900, color: 'var(--accent)' }}>{p.cardCount}</span>}
            </div>
          </div>
        ) : (
          p.cards.map((c: any, i: number) => (
            <div key={i} className="card-wrapper">
              {renderCard(c, 'mini')}
            </div>
          ))
        )}
      </div>
    );

    const infoCol = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        <div className={`avatar-ring ${isActive ? 'turn-active' : ''}`}>
          <span>{p.name.includes('电脑') ? '🤖' : '👤'}</span>
        </div>
        <span className="player-name">{p.name}</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
          {renderTeamBadge(p.teamClass, p.teamText)}
          {renderRankBadge(p.rank, p.rankLabel)}
        </div>
        <div className="pot-chip">
          <span>🪙</span>
          <span className="pot-num">{p.pot}</span>
          <span>张子</span>
        </div>
      </div>
    );

    return (
      <div className="opponent-cluster" style={handOnRight ? { flexDirection: 'row-reverse' } : undefined}>
        {handFan}
        {infoCol}
      </div>
    );
  };

  // Play slot positions
  const slotPositions = ['slot-0', 'slot-1', 'slot-2', 'slot-3'];

  return (
    <div className="game-table" onClick={onTableBgTap}>
      {/* Error toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 'clamp(60px, 10vh, 100px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, padding: '10px 24px', borderRadius: 'var(--radius-lg)',
          background: 'rgba(220,38,38,0.9)', color: '#fff',
          fontSize: 'var(--fs-sm)', fontWeight: 700,
          boxShadow: '0 4px 20px rgba(220,38,38,0.4)',
          animation: 'toastIn 0.3s ease',
        }}>{toastMsg}</div>
      )}
      {/* Turn countdown bar */}
      {ui.showControls && (
        <div className="turn-timer-bar">
          <div className="turn-timer-fill" style={{
            width: `${ui.turnTimePercent}%`,
            background: ui.turnTimePercent < 20
              ? 'linear-gradient(to right, #dc2626, #ef4444)'
              : ui.turnTimePercent < 50
              ? 'linear-gradient(to right, #f97316, #f0a828)'
              : 'linear-gradient(to right, var(--accent), #f5d78c)',
          }} />
        </div>
      )}

      {/* Table counters — top-left corner of the full table */}
      <div className="table-counters">
        <div className="counter-pill">
          <span>🂠</span>
          <span className="counter-num">{ui.tablePotCount}</span>
          <span className="counter-label">桌上张子</span>
        </div>
        <div className="counter-pill">
          <span>🔥</span>
          <span className="counter-num">{ui.currentFans}</span>
          <span className="counter-label">番</span>
        </div>
      </div>

      {/* Mute button — top area */}
      <div style={{
        position: 'absolute', top: 'clamp(6px, 2vh, 14px)', right: 'clamp(6px, 2vw, 14px)',
        zIndex: 25, cursor: 'pointer',
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--bg-surface)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--fs-sm)',
      }} onClick={(e) => {
        e.stopPropagation();
        setMuted(!muted);
        setMutedState(!muted);
      }}>
        <span>{muted ? '🔇' : '🔊'}</span>
      </div>

      {/* Score panel button */}
      <div className="score-panel-btn" onClick={(e) => { e.stopPropagation(); openScorePanel(); }}>
        <span className="score-btn-icon">📊</span>
        <span className="score-btn-label">积分</span>
      </div>

      {/* Managed button — same style as score panel */}
      <div className={`score-panel-btn ${ui.isManaged ? 'managed-active' : ''}`}
        style={{ right: 'clamp(62px, 18vw, 80px)' }}
        onClick={(e) => { e.stopPropagation(); toggleManaged(); }}>
        <span className="score-btn-icon">{ui.isManaged ? '🎮' : '🤖'}</span>
        <span className="score-btn-label" style={{ color: ui.isManaged ? 'var(--green)' : 'var(--ink-dim)' }}>
          {ui.isManaged ? '托管中' : '托管'}
        </span>
      </div>

      {/* ===== Top Zone: Player B (index 2) ===== */}
      <div className="top-zone">
        {renderOpponent(opponents[1], 2)}
      </div>

      {/* ===== Middle Zone ===== */}
      <div className="middle-zone">
        {/* Left: Player A (index 1) */}
        <div className="side-zone">
          {renderOpponent(opponents[0], 1)}
        </div>

        {/* Center */}
        <div className="center-zone">
          {/* History pile */}
          <div className="history-pile">
            {ui.historyCards.map((c: any, i: number) => (
              <div key={i} className="card-wrapper">{renderCard(c, 'mini')}</div>
            ))}
          </div>

          {/* Pass flash slots */}
          {[0, 1, 2, 3].map(i => (
            ui.passFlashSlot === i && (
              <div key={`pass-${i}`} className={`pass-flash pass-flash-${i}`}>
                <span className="pass-tag pass-flash-tag">不要</span>
              </div>
            )
          ))}

          {/* Play slots */}
          {[0, 1, 2, 3].map(i => {
            const slot = ui.playSlots[i];
            return (
              <div key={`slot-${i}`} className={`play-slot play-slot-${i} ${slot.isChe ? 'che-slot' : ''}`}>
                {slot.cards.length > 0 && (
                  <div className="cards-row">
                    {slot.cards.map((c: any, j: number) => (
                      <div key={j} className="card-wrapper">{renderCard(c, 'large')}</div>
                    ))}
                  </div>
                )}
                {slot.isChe && <span className="che-tag">扯!</span>}
                {slot.passed && !slot.isChe && <span className="pass-tag">不要</span>}
              </div>
            );
          })}

          {/* Che timer */}
          {ui.showTimer && (
            <div className="che-timer-top">
              <span className="che-timer-label">抢扯</span>
              <div className="che-timer-track">
                <div className="che-timer-fill" style={{ width: `${ui.timerPercent}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Right: Player C (index 3) */}
        <div className="side-zone">
          {renderOpponent(opponents[2], 3)}
        </div>
      </div>

      {/* ===== Bottom Zone ===== */}
      <div className="bottom-zone">
        {/* Che controls */}
        {ui.showCheControls && (
          <div className="controls che-controls" onClick={(e) => e.stopPropagation()}>
            <button className="game-btn pass-btn" onClick={handleDeclineChe}>不抢扯</button>
            <button className="game-btn hint-btn" onClick={handleHint}>提示</button>
            <button className="game-btn che-btn che-active" onClick={handleCheAction}>抢扯!</button>
          </div>
        )}

        {/* Normal controls */}
        {ui.showControls && (
          <div className="controls" onClick={(e) => e.stopPropagation()}>
            {ui.lastValidPlay && (
              <button className="game-btn pass-btn" onClick={handlePassClick}>不要</button>
            )}
            <button className="game-btn hint-btn" onClick={handleHint}>提示</button>
            <button className="game-btn play-btn" onClick={handlePlayClick}>确认出牌</button>
          </div>
        )}

        {/* Hand scroll area */}
        <div className="hand-scroll" onClick={(e) => { e.stopPropagation(); onHandBgTap(); }}>
          <div className="hand-container"
            onTouchMove={onHandTouchMove}
            onTouchEnd={onHandTouchEnd}
            onMouseMove={onHandMouseMove}
            onMouseUp={onHandMouseUp}
            onMouseLeave={onHandMouseUp}>
            {ui.myHand.map((c: any, i: number) => {
              const d = cardDisplay(c);
              const isSel = c.isSelected;
              return (
                <div key={i} className={`card-wrapper ${isSel ? 'selected' : ''}`}
                  onTouchStart={(e) => onHandTouchStart(e, i)}
                  onMouseDown={(e) => onCardMouseDown(e, i)}
                  onClick={(e) => e.stopPropagation()}>
                  <div
                    className={`card-face-el ${d.color === 'red' ? 'red' : 'black'}`}
                    style={{
                      width: 'var(--card-w)', height: 'var(--card-h)',
                      cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                      ...(isSel ? {
                        transform: 'translateY(-8px)',
                        border: '2px solid var(--accent)',
                        boxShadow: '0 6px 18px var(--accent-glow)',
                        zIndex: 5,
                      } : {
                        border: '2px solid transparent',
                      }),
                    }}
                  >
                    <div style={{ position: 'absolute', top: 2, left: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                      <span style={{ fontSize: 'calc(var(--card-w) * 0.28)', fontWeight: 900 }}>{d.rank}</span>
                      <span style={{ fontSize: 'calc(var(--card-w) * 0.18)' }}>{d.suit}</span>
                    </div>
                    {d.isRed3 && <span style={{ position: 'absolute', bottom: 1, left: 0, right: 0, textAlign: 'center', fontSize: 'calc(var(--card-w) * 0.16)', color: 'var(--card-red)' }}>红三</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* My info bar — floating chips */}
        <div className="my-info-bar">
          <span className="my-name">{ui.myName}</span>
          {renderTeamBadge(ui.myTeamClass, ui.myTeamText)}
          <div className="pot-chip">
            <span>🪙</span>
            <span className="pot-num">{ui.myPot}</span>
            <span>获得张子</span>
          </div>
        </div>
      </div>

      {/* ===== Self-Che Dialog ===== */}
      {ui.showSelfCheDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setGameUI(prev => ({ ...prev, showSelfCheDialog: false, selfCheCards: null }))}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', padding: 'clamp(14px, 3vh, 24px) clamp(14px, 4vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 2vh, 16px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 'var(--fs-md)', fontWeight: 800, textAlign: 'center' }}>三张点数相同</p>
            <button onClick={handleSelfCheBomb}
              className="btn-game btn-primary"
              style={{ padding: 'clamp(8px, 1.5vh, 12px) clamp(16px, 5vw, 32px)', fontSize: 'var(--fs-sm)' }}>
              炸弹 (3张一起出)
            </button>
            <button onClick={handleSelfCheChe}
              className="btn-game"
              style={{ padding: 'clamp(8px, 1.5vh, 12px) clamp(16px, 5vw, 32px)', fontSize: 'var(--fs-sm)', fontWeight: 700, borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', background: 'var(--red)', color: '#fff' }}>
              自扯 (出一张，另外两张为扯牌)
            </button>
          </div>
        </div>
      )}

      {/* ===== Settlement Modal ===== */}
      {ui.showSettlement && (
        <div className="settlement-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="settlement-card">
            <div className="settlement-body">
              {/* Left: Battle */}
              <div className="settlement-left">
                <span className="settlement-section-title">战况</span>

                {/* Red team */}
                <div className={`settlement-team team-red ${ui.settlementWinnerTeam === 'red' ? 'team-winner' : ''}`}>
                  {ui.settlementWinnerTeam === 'red' && <div className="winner-ribbon">WINNER</div>}
                  <div className="settlement-team-header">
                    <span className="team-label">🚩 红三阵营</span>
                    <div className="team-total">
                      <span className="total-num">{ui.settlementRedFinal}</span>
                      <span className="total-label">张子</span>
                    </div>
                  </div>
                  {ui.settlementShowFormula && (
                    <div className="settlement-formula">
                      <span>原始 {ui.settlementRedTotal} {ui.settlementRedBonus > 0 ? '+' : ''}{ui.settlementRedBonus} = {ui.settlementRedFinal}</span>
                    </div>
                  )}
                  {ui.settlementRedPlayers.map((r: any) => (
                    <div key={r.playerId} className="settlement-player">
                      <span className="sp-name">{r.name}</span>
                      {r.isSolo && <span className="sp-badge sp-solo">业务</span>}
                      {r.rankName && <span className={`sp-badge sp-rank ${r.rankClass}`}>{r.rankName}</span>}
                      <span className="sp-pot">{r.pot} 张子</span>
                    </div>
                  ))}
                  {ui.settlementRedPlayers.length === 0 && (
                    <div className="settlement-player empty"><span className="sp-empty">无</span></div>
                  )}
                </div>

                {/* Black team */}
                <div className={`settlement-team team-black ${ui.settlementWinnerTeam === 'black' ? 'team-winner' : ''}`}>
                  {ui.settlementWinnerTeam === 'black' && <div className="winner-ribbon">WINNER</div>}
                  <div className="settlement-team-header">
                    <span className="team-label">⚑ 黑三阵营</span>
                    <div className="team-total">
                      <span className="total-num">{ui.settlementBlackFinal}</span>
                      <span className="total-label">张子</span>
                    </div>
                  </div>
                  {ui.settlementShowFormula && (
                    <div className="settlement-formula">
                      <span>原始 {ui.settlementBlackTotal} {ui.settlementBlackBonus > 0 ? '+' : ''}{ui.settlementBlackBonus} = {ui.settlementBlackFinal}</span>
                    </div>
                  )}
                  {ui.settlementBlackPlayers.map((r: any) => (
                    <div key={r.playerId} className="settlement-player">
                      <span className="sp-name">{r.name}</span>
                      {r.isSolo && <span className="sp-badge sp-solo">业务</span>}
                      {r.rankName && <span className={`sp-badge sp-rank ${r.rankClass}`}>{r.rankName}</span>}
                      <span className="sp-pot">{r.pot} 张子</span>
                    </div>
                  ))}
                  {ui.settlementBlackPlayers.length === 0 && (
                    <div className="settlement-player empty"><span className="sp-empty">无</span></div>
                  )}
                </div>
              </div>

              {/* Right: Financial */}
              <div className="settlement-right">
                <span className="settlement-section-title">结算</span>

                <div className="fin-row">
                  <div className="fin-pair"><span className="fin-label">底注</span><span className="fin-value">{ui.settlementBaseAmount} 元</span></div>
                  <div className="fin-pair"><span className="fin-label">翻法</span><span className="fin-value">{ui.settlementDoubleTypeText}</span></div>
                </div>
                <div className="fin-divider" />

                <div className="fin-row"><span className="fin-label">番数（炸弹）</span><span className="fin-value">{ui.settlementBombFans} 番</span></div>
                {ui.settlementExtraFans > 0 && (
                  <div className="fin-row"><span className="fin-label">番数（{ui.settlementExtraFansLabel}）</span><span className="fin-value">+{ui.settlementExtraFans} 番</span></div>
                )}
                <div className="fin-row highlight"><span className="fin-label">总番数</span><span className="fin-value big">{ui.settlementFans} 番</span></div>
                <div className="fin-row highlight">
                  <span className="fin-label">底注+翻数</span>
                  <span className="fin-value big gold">{ui.settlementBaseAmount} + {ui.settlementFansAmount} = {ui.settlementAmount} 元</span>
                </div>
                <div className="fin-divider" />

                <span className="fin-sub-title">净收益</span>
                {ui.settlementNetResults.map((r: any) => (
                  <div key={r.playerId} className="fin-player">
                    <span className="fin-player-name">{r.name}</span>
                    <span className={`fin-player-net ${r.netWon >= 0 ? 'positive' : 'negative'}`}>
                      {r.netWon >= 0 ? '+' : ''}{r.netWon}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 炸弹详情 — 全宽横排，可折叠 */}
            <div className={`settlement-bomb-section ${bombExpanded ? 'expanded' : ''}`}>
              <div className="bomb-section-header" onClick={() => setBombExpanded(!bombExpanded)}>
                <span className="settlement-section-title" style={{ marginBottom: 0 }}>炸弹详情</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 700 }}>
                  {ui.settlementBombFans > 0 ? `${ui.settlementBombDetails.length}炸 ${ui.settlementBombFans}番` : '无'}
                </span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-dim)', marginLeft: 'auto' }}>
                  {bombExpanded ? '收起 ▲' : '展开 ▼'}
                </span>
              </div>
              {bombExpanded && ui.settlementBombDetails.length > 0 && (
                <div className="bomb-detail-list">
                  {(() => {
                    const grouped: Record<number, typeof ui.settlementBombDetails> = {};
                    ui.settlementBombDetails.forEach(b => {
                      if (!grouped[b.playerId]) grouped[b.playerId] = [];
                      grouped[b.playerId].push(b);
                    });
                    return Object.entries(grouped).map(([playerId, bombs]) => {
                      const totalFans = bombs.reduce((s, b) => s + b.fans, 0);
                      const playerName = bombs[0].playerName;
                      return (
                        <div key={playerId} className="bomb-player-group">
                          <div className="bomb-player-summary">
                            <span className="bomb-player-name">{playerName}</span>
                            <span className="bomb-player-stat">{bombs.length}炸 {totalFans}番</span>
                          </div>
                          <div className="bomb-cards-row">
                            {bombs.map((b, bi) => (
                              <div key={bi} className="bomb-entry">
                                <div className="bomb-entry-cards">
                                  {(b.cards || []).map((c: any, ci: number) => {
                                    const rank = RANK_DISPLAY[c.rankValue] || '?';
                                    const suit = SUITS[c.suit] || '';
                                    const isRed = c.suit === 0 || c.suit === 2;
                                    return (
                                      <div key={ci} style={{
                                        width: 'clamp(17px, 3.6vmin, 23px)',
                                        height: 'calc(clamp(17px, 3.6vmin, 23px) * 1.38)',
                                        background: '#fff',
                                        borderRadius: 2,
                                        display: 'inline-flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: isRed ? 'var(--card-red)' : '#2d2d2d',
                                        fontSize: 'clamp(7px, 1.5vmin, 10px)',
                                        fontWeight: 900,
                                        lineHeight: 1.1,
                                        border: '1px solid rgba(0,0,0,0.1)',
                                        flexShrink: 0,
                                      }}>
                                        <span>{rank}</span>
                                        <span style={{ fontSize: 'calc(clamp(7px, 1.5vmin, 10px) * 0.7)', lineHeight: 1 }}>
                                          {suit}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <span className="bomb-entry-label">{b.type} +{b.fans}番</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Round info + Actions */}
            <div className="settlement-round-info">
              <span className="round-info-text">第 {ui.settlementCurrentRound}/{ui.settlementTotalRounds} 局</span>
            </div>

            <div className="settlement-actions">
              {ui.settlementIsLastRound ? (
                <>
                  <button className="settlement-btn secondary" onClick={handleLeaveRoom}>退出房间</button>
                  <button className="settlement-btn primary" onClick={openScorePanel}>查看最终积分</button>
                </>
              ) : (
                <button className="settlement-btn primary" onClick={handleNextRound}>准备</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Score Panel Modal ===== */}
      {ui.showScorePanel && (
        <div className="score-overlay" onClick={closeScorePanel}>
          <div className="score-card" onClick={e => e.stopPropagation()}>
            <div className="score-card-header">
              <span className="score-card-title">积分情况</span>
              <span className="score-card-round">第 {ui.scorePanelCurrentRound}/{ui.scorePanelTotalRounds} 局</span>
            </div>
            <div className="score-card-body">
              {ui.scorePanelPlayers.map((p: any, i: number) => (
                <div key={p.playerId} className="score-row">
                  <span className="score-rank">{i + 1}</span>
                  <span className="score-name">{p.name}</span>
                  <span className={`score-net ${p.totalNet >= 0 ? 'positive' : 'negative'}`}>
                    {p.totalNet >= 0 ? '+' : ''}{p.totalNet}
                  </span>
                </div>
              ))}
              {ui.scorePanelPlayers.length === 0 && (
                <div className="score-empty"><span>暂无数据</span></div>
              )}
            </div>
            <div className="score-card-footer">
              <button className="score-close-btn" onClick={closeScorePanel}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
