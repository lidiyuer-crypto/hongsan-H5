import { HAND_TYPES } from './constants';
import type { Card } from './card';
import type { PlayInfo } from './analyzer';

export interface BombDetail {
  playerId: number;
  type: string;
  fans: number;
  rank: number;
  cards: Card[];
}

export interface RoundHistoryEntry {
  playerId: number;
  type: number;
  rank: number;
  cards: Card[];
}

export function calculateFans(roundHistory: RoundHistoryEntry[], victoryReason: string, players: { id: number; finished: boolean; hand: Card[] }[]) {
  let bombFans = 0;
  const bombDetails: BombDetail[] = [];

  roundHistory.forEach(round => {
    if (round.type === HAND_TYPES.BOMB) {
      bombFans += 1;
      bombDetails.push({ playerId: round.playerId, type: '普通炸弹', fans: 1, rank: round.rank, cards: round.cards || [] });
    } else if (round.type === HAND_TYPES.H_BOMB) {
      bombFans += 2;
      bombDetails.push({ playerId: round.playerId, type: '氢弹', fans: 2, rank: round.rank, cards: round.cards || [] });
    }
  });

  let extraFans = 0;
  let extraFansLabel = '';

  if (victoryReason === '双关') {
    extraFans = 1;
    extraFansLabel = '双关';
  }
  if (victoryReason === '业务胜利') {
    const notFinished = players.filter(p => !p.finished || p.hand.length > 0).length;
    extraFans = notFinished;
    extraFansLabel = '业务(关' + notFinished + '人)';
  }
  if (victoryReason === '非业务玩家胜利') {
    extraFans = 3;
    extraFansLabel = '三家逃脱';
  }

  const fans = bombFans + extraFans;
  return { fans, bombFans, extraFans, extraFansLabel, bombDetails };
}

export function calculateAmount(baseAmount: number, fans: number, doubleType: 'flat' | 'steep'): number {
  if (doubleType === 'steep') {
    return baseAmount * Math.pow(2, fans);
  }
  return baseAmount * (1 + fans);
}

export interface PlayerResult {
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

export interface SettlementResult {
  results: PlayerResult[];
  amount: number;
}

export function calculateSettlement(
  players: { id: number; name: string; isRed3Team: boolean; rank: number | null; pot: number }[],
  victoryTeam: 'red' | 'black' | 'business',
  baseAmount: number,
  fans: number,
  doubleType: 'flat' | 'steep',
  teamPotBonus: Record<string, number> | null,
  isBusinessMode: boolean,
  businessPlayerId: number,
): SettlementResult {
  const amount = calculateAmount(baseAmount, fans, doubleType);
  const rankNames = ['上游', '前中游', '后中游', '下游'];

  const results: PlayerResult[] = players.map(p => {
    let won = 0;
    let lost = 0;

    if (victoryTeam === 'business') {
      if (p.id === businessPlayerId) {
        won = amount * 3;
      } else {
        lost = amount;
      }
    } else if (isBusinessMode) {
      if (p.id === businessPlayerId) {
        lost = amount * 3;
      } else {
        won = amount;
      }
    } else {
      const isWinner = (victoryTeam === 'red' && p.isRed3Team) ||
                       (victoryTeam === 'black' && !p.isRed3Team);
      if (isWinner) {
        won = amount;
      } else {
        lost = amount;
      }
    }

    // Apply team pot bonus
    if (teamPotBonus) {
      const team = p.isRed3Team ? 'red' : 'black';
      const bonus = teamPotBonus[team + '_team'] || 0;
      if (bonus > 0) {
        won += bonus;
      } else if (bonus < 0) {
        lost += Math.abs(bonus);
      }
    }

    const potAmount = p.pot || 0;

    return {
      playerId: p.id,
      name: p.name,
      isRed3Team: p.isRed3Team,
      rank: p.rank,
      rankName: p.rank ? rankNames[p.rank - 1] : '?',
      pot: potAmount,
      won,
      lost,
      netWon: won - lost,
    };
  });

  return { results, amount };
}
