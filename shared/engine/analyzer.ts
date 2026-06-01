import { HAND_TYPES, POWER_LEVEL } from './constants';
import type { Card } from './card';

export interface PlayInfo {
  type: number;
  rank: number;
  level: number;
  length?: number;
  cards: Card[];
}

export function analyze(cards: Card[]): PlayInfo | null {
  if (!cards || cards.length === 0) return null;
  const len = cards.length;
  const ranks = cards.map(c => c.rankValue).sort((a, b) => a - b);
  const unique = [...new Set(ranks)];

  if (len === 4 && unique.length === 1)
    return { type: HAND_TYPES.H_BOMB, rank: ranks[0], level: POWER_LEVEL.H_BOMB, cards };
  if (len === 3 && unique.length === 1)
    return { type: HAND_TYPES.BOMB, rank: ranks[0], level: POWER_LEVEL.BOMB, cards };
  if (len === 1)
    return { type: HAND_TYPES.SINGLE, rank: ranks[0], level: POWER_LEVEL.NORMAL, cards };
  if (len === 2 && unique.length === 1)
    return { type: HAND_TYPES.PAIR, rank: ranks[0], level: POWER_LEVEL.NORMAL, cards };
  if (len >= 5 && unique.length === len && (ranks[len - 1] - ranks[0] === len - 1)) {
    return { type: HAND_TYPES.STRAIGHT, rank: ranks[len - 1], level: POWER_LEVEL.NORMAL, length: len, cards };
  }
  return null;
}

export function canBeat(lastValidPlay: PlayInfo | null, nextInfo: PlayInfo): boolean {
  const cur = lastValidPlay;
  if (!cur) return true; // free play
  if (cur.type === HAND_TYPES.CHE) return nextInfo.type === HAND_TYPES.H_BOMB;
  if (cur.level === POWER_LEVEL.H_BOMB) return nextInfo.level === POWER_LEVEL.H_BOMB && nextInfo.rank > cur.rank;
  if (nextInfo.level === POWER_LEVEL.H_BOMB) return true;
  if (cur.level === POWER_LEVEL.BOMB) return nextInfo.level === POWER_LEVEL.BOMB && nextInfo.rank > cur.rank;
  if (nextInfo.level === POWER_LEVEL.BOMB) return true;
  if (nextInfo.type === cur.type) {
    if (nextInfo.type === HAND_TYPES.STRAIGHT && nextInfo.length !== cur.length) return false;
    return nextInfo.rank > cur.rank;
  }
  return false;
}

export function analyzeHand(hand: Card[]) {
  const rankCounts: Record<number, number> = {};
  hand.forEach(c => {
    rankCounts[c.rankValue] = (rankCounts[c.rankValue] || 0) + 1;
  });
  const pairs: number[] = [], triples: number[] = [], singles: number[] = [];
  Object.keys(rankCounts).forEach(rank => {
    const r = parseInt(rank);
    if (rankCounts[r] === 2) pairs.push(r);
    else if (rankCounts[r] === 3) triples.push(r);
    else if (rankCounts[r] === 1) singles.push(r);
  });
  pairs.sort((a, b) => a - b);
  triples.sort((a, b) => a - b);
  singles.sort((a, b) => a - b);
  return { pairs, triples, singles };
}

export function generateAllValidPlays(hand: Card[], lastValidPlay: PlayInfo | null, isFirstTurn: boolean): PlayInfo[] {
  const plays: PlayInfo[] = [];

  const byRank: Record<number, Card[]> = {};
  hand.forEach(c => {
    if (!byRank[c.rankValue]) byRank[c.rankValue] = [];
    byRank[c.rankValue].push(c);
  });
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);
  const count = (r: number) => (byRank[r] || []).length;

  const isFreePlay = !lastValidPlay;

  if (isFreePlay) {
    if (isFirstTurn) {
      const h4 = hand.find(c => c.isH4);
      if (h4) {
        plays.push({ cards: [h4], type: HAND_TYPES.SINGLE, rank: 4, level: POWER_LEVEL.NORMAL });
      }
    }
    ranks.filter(r => count(r) === 1).forEach(r => {
      byRank[r].forEach(c => {
        if (isFirstTurn && c.isH4) return;
        plays.push({ cards: [c], type: HAND_TYPES.SINGLE, rank: r, level: POWER_LEVEL.NORMAL });
      });
    });
    ranks.filter(r => count(r) === 2).forEach(r => {
      plays.push({ cards: [...byRank[r]], type: HAND_TYPES.PAIR, rank: r, level: POWER_LEVEL.NORMAL });
    });
    const singleRanks = ranks.filter(r => count(r) === 1);
    for (let len = 5; len <= singleRanks.length; len++) {
      for (let i = 0; i <= singleRanks.length - len; i++) {
        const seq = singleRanks.slice(i, i + len);
        if (seq[len - 1] - seq[0] === len - 1) {
          plays.push({
            cards: seq.map(r => byRank[r][0]),
            type: HAND_TYPES.STRAIGHT, rank: seq[len - 1], level: POWER_LEVEL.NORMAL, length: len,
          });
        }
      }
    }
    ranks.filter(r => count(r) === 3).forEach(r => {
      plays.push({ cards: [...byRank[r]], type: HAND_TYPES.BOMB, rank: r, level: POWER_LEVEL.BOMB });
    });
    ranks.filter(r => count(r) === 4).forEach(r => {
      plays.push({ cards: [...byRank[r]], type: HAND_TYPES.H_BOMB, rank: r, level: POWER_LEVEL.H_BOMB });
    });
  } else {
    const cur = lastValidPlay;

    if (cur.type === HAND_TYPES.CHE) {
      ranks.filter(r => count(r) === 4).forEach(r => {
        plays.push({ cards: [...byRank[r]], type: HAND_TYPES.H_BOMB, rank: r, level: POWER_LEVEL.H_BOMB });
      });
    } else if (cur.level === POWER_LEVEL.NORMAL) {
      if (cur.type === HAND_TYPES.SINGLE) {
        ranks.filter(r => r > cur.rank && count(r) === 1).forEach(r => {
          byRank[r].forEach(c => plays.push({ cards: [c], type: HAND_TYPES.SINGLE, rank: r, level: POWER_LEVEL.NORMAL }));
        });
      } else if (cur.type === HAND_TYPES.PAIR) {
        ranks.filter(r => r > cur.rank && count(r) === 2).forEach(r => {
          plays.push({ cards: [...byRank[r]], type: HAND_TYPES.PAIR, rank: r, level: POWER_LEVEL.NORMAL });
        });
      } else if (cur.type === HAND_TYPES.STRAIGHT) {
        const len = cur.length!;
        const singleRanks = ranks.filter(r => count(r) === 1);
        for (let i = 0; i <= singleRanks.length - len; i++) {
          const seq = singleRanks.slice(i, i + len);
          if (seq[len - 1] - seq[0] === len - 1 && seq[len - 1] > cur.rank) {
            plays.push({
              cards: seq.map(r => byRank[r][0]),
              type: HAND_TYPES.STRAIGHT, rank: seq[len - 1], level: POWER_LEVEL.NORMAL, length: len,
            });
          }
        }
      }
      ranks.filter(r => count(r) === 3).forEach(r => {
        plays.push({ cards: [...byRank[r]], type: HAND_TYPES.BOMB, rank: r, level: POWER_LEVEL.BOMB });
      });
      ranks.filter(r => count(r) === 4).forEach(r => {
        plays.push({ cards: [...byRank[r]], type: HAND_TYPES.H_BOMB, rank: r, level: POWER_LEVEL.H_BOMB });
      });
    } else if (cur.level === POWER_LEVEL.BOMB) {
      ranks.filter(r => r > cur.rank && count(r) === 3).forEach(r => {
        plays.push({ cards: [...byRank[r]], type: HAND_TYPES.BOMB, rank: r, level: POWER_LEVEL.BOMB });
      });
      ranks.filter(r => count(r) === 4).forEach(r => {
        plays.push({ cards: [...byRank[r]], type: HAND_TYPES.H_BOMB, rank: r, level: POWER_LEVEL.H_BOMB });
      });
    } else if (cur.level === POWER_LEVEL.H_BOMB) {
      ranks.filter(r => r > cur.rank && count(r) === 4).forEach(r => {
        plays.push({ cards: [...byRank[r]], type: HAND_TYPES.H_BOMB, rank: r, level: POWER_LEVEL.H_BOMB });
      });
    }
  }

  plays.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.rank - b.rank;
  });

  return plays;
}
