// Settlement data → UI state renderer (unified pipeline)
// Extracted from Game.tsx renderOnlineSettlement

import { playSound } from '../lib/sound';
import type { GameUIState } from './types';
import type { GameStateData, SettlementData } from '../network/types';

/**
 * Computes the GameUIState delta from a server SettlementData message.
 * Also triggers settlement sounds as a side effect.
 */
export function computeSettlementUI(
  result: SettlementData,
  gameState: GameStateData | null,
  prevUI: GameUIState,
  setBombExpanded: (v: boolean) => void,
): Partial<GameUIState> {
  const nameMap: Record<number, string> = { 0: '玩家', 1: '玩家A', 2: '玩家B', 3: '玩家C' };
  if (gameState) {
    gameState.players.forEach(p => { nameMap[p.id] = p.name; });
  }

  // Beiguan detection: players who didn't finish are "被关"
  const netResults = result.results.map(r => {
    const player = gameState?.players.find(p => p.id === r.playerId);
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
  const doubleTypeText = gameState?.config.doubleType === 'steep' ? '陡翻' : '平翻';

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

  // Side effect: play settlement sounds
  if (result.isLastRound) {
    setTimeout(() => playSound('settlement_final'), 600);
  } else {
    const humanPlayer = result.results.find(r => r.playerId === (gameState?.mySeat ?? 0));
    if (humanPlayer && humanPlayer.netWon >= 0) {
      setTimeout(() => playSound('settlement_win'), 600);
    } else {
      setTimeout(() => playSound('settlement_lose'), 600);
    }
  }

  return {
    showSettlement: true,
    settlementTitle: titleMap[result.victoryReason] || `${result.victoryTeam === 'red' ? '红三' : '黑三'}阵营胜利`,
    settlementReason: reasonMap[result.victoryReason] || '',
    settlementWinnerTeam: result.victoryTeam === 'business' ? 'red' : (result.victoryTeam || 'red'),
    settlementBaseAmount: gameState?.config.baseAmount || 5,
    settlementDoubleTypeText: doubleTypeText,
    settlementFans: result.fans,
    settlementAmount: result.amount,
    settlementFansAmount: result.amount - (gameState?.config.baseAmount || 5),
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
    settlementRedFinal: redTotal + redBonus,
    settlementBlackFinal: blackTotal + blackBonus,
    settlementShowFormula: showFormula,
    settlementCurrentRound: result.currentRound,
    settlementTotalRounds: result.totalRounds,
    settlementIsLastRound: result.isLastRound,
  };
}
