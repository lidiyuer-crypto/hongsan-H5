// Game state → UI state renderer (unified pipeline)
// Extracted from Game.tsx renderOnlineGameState — single source of truth for UI computation

import { HAND_TYPES } from '../engine/constants';
import { cardKey } from './types';
import type { GameUIState } from './types';
import type { GameStateData, PlayerView } from '../network/types';

/**
 * Computes the GameUIState delta from a server GameStateData message.
 * Pure function — no side effects except reading prevUI for selection preservation.
 */
export function computeGameUI(state: GameStateData, prevUI: GameUIState): Partial<GameUIState> {
  const mySeat = state.mySeat;
  const myPlayer = state.players[mySeat];
  const opponents = [1, 2, 3].map(offset => state.players[(mySeat + offset) % 4]);

  // Map my hand - server sends full cards with suit/rankValue/displayRank etc.
  const myHand = myPlayer.hand.map((c: any) => ({
    ...c, isSelected: false,
  }));

  // Preserve selection state across re-renders
  const prevMyHand = prevUI.myHand;
  if (prevMyHand.length === myHand.length) {
    const prevSel = new Map<string, boolean>();
    prevMyHand.forEach((c: any) => { if (c.isSelected) prevSel.set(cardKey(c), true); });
    myHand.forEach((c: any) => { if (prevSel.has(cardKey(c))) c.isSelected = true; });
  }

  // Determine team text/class for each player
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

  // Build play slots
  const playSlots = state.passStatuses.map((passed, i) => ({
    cards: (i === state.lastPlayByPlayerId && state.lastValidPlay)
      ? state.lastValidPlay.cards : [],
    passed: passed && !(state.pendingCollect && i === state.pendingPassPlayerId && i !== state.lastPlayByPlayerId),
    isChe: !!(state.lastValidPlay && state.lastValidPlay.type === HAND_TYPES.CHE && i === state.lastPlayByPlayerId),
  }));

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
    p1RankLabel: opponents[0].rank ? ['上游', '前中游', '后中游', '下游'][opponents[0].rank - 1] : '',
    p2RankLabel: opponents[1].rank ? ['上游', '前中游', '后中游', '下游'][opponents[1].rank - 1] : '',
    p3RankLabel: opponents[2].rank ? ['上游', '前中游', '后中游', '下游'][opponents[2].rank - 1] : '',

    faceDownP1: true,
    faceDownP2: true,
    faceDownP3: true,
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

  // Che phase: auto-select matching cards
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

  return data;
}
