// Shared types and helpers for the game UI layer
// Extracted from Game.tsx to enable component decomposition

import { RANK_DISPLAY, SUITS } from '../engine/constants';

// ===== Card Helpers =====

export function cardDisplay(c: any) {
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

export function cardKey(c: any) {
  return (c.suit) + '_' + (c.rankValue);
}

export const RANK_NAMES = ['上游', '前中游', '后中游', '下游'];
export const RANK_CLASSES = ['rank-1', 'rank-2', 'rank-3', 'rank-4'];

// ===== GameUIState =====

export interface GameUIState {
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

export function defaultGameUI(): GameUIState {
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
