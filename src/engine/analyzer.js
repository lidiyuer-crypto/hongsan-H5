import { HAND_TYPES, POWER_LEVEL } from './constants';

function analyze(cards) {
  if (!cards || cards.length === 0) return null;
  const len = cards.length;
  const ranks = cards.map(c => c.rankValue).sort((a, b) => a - b);
  const unique = [...new Set(ranks)];
  if (len === 4 && unique.length === 1) return { type: HAND_TYPES.H_BOMB, rank: ranks[0], level: POWER_LEVEL.H_BOMB, cards };
  if (len === 3 && unique.length === 1) return { type: HAND_TYPES.BOMB, rank: ranks[0], level: POWER_LEVEL.BOMB, cards };
  if (len === 1) return { type: HAND_TYPES.SINGLE, rank: ranks[0], level: POWER_LEVEL.NORMAL, cards };
  if (len === 2 && unique.length === 1) return { type: HAND_TYPES.PAIR, rank: ranks[0], level: POWER_LEVEL.NORMAL, cards };
  if (len >= 5 && unique.length === len && (ranks[len - 1] - ranks[0] === len - 1)) {
    return { type: HAND_TYPES.STRAIGHT, rank: ranks[len - 1], level: POWER_LEVEL.NORMAL, length: len, cards };
  }
  return null;
}

function canBeat(lastValidPlay, nextInfo) {
  const cur = lastValidPlay;
  if (!cur) return true;
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

function analyzeHand(hand) {
  const rankCounts = {};
  hand.forEach(c => {
    rankCounts[c.rankValue] = (rankCounts[c.rankValue] || 0) + 1;
  });
  const pairs = [], triples = [], singles = [];
  Object.keys(rankCounts).forEach(rank => {
    const r = parseInt(rank);
    if (rankCounts[rank] === 2) pairs.push(r);
    else if (rankCounts[rank] === 3) triples.push(r);
    else if (rankCounts[rank] === 1) singles.push(r);
  });
  pairs.sort((a, b) => a - b);
  triples.sort((a, b) => a - b);
  singles.sort((a, b) => a - b);
  return { pairs, triples, singles };
}

function generateAllValidPlays(hand, lastValidPlay, isFirstTurn) {
  const plays = [];

  // Group cards by rank
  const byRank = {};
  hand.forEach(c => {
    if (!byRank[c.rankValue]) byRank[c.rankValue] = [];
    byRank[c.rankValue].push(c);
  });
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);
  const count = (r) => (byRank[r] || []).length;

  const isFreePlay = !lastValidPlay;

  if (isFreePlay) {
    // First turn: red 4 single first (always allowed)
    if (isFirstTurn) {
      const h4 = hand.find(c => c.isH4);
      if (h4) {
        plays.push({ cards: [h4], type: HAND_TYPES.SINGLE, rank: 4, level: POWER_LEVEL.NORMAL });
      }
    }
    // Singles: only from isolated cards (count === 1)
    ranks.filter(r => count(r) === 1).forEach(r => {
      byRank[r].forEach(c => {
        if (isFirstTurn && c.isH4) return;
        plays.push({ cards: [c], type: HAND_TYPES.SINGLE, rank: r, level: POWER_LEVEL.NORMAL });
      });
    });
    // Pairs: only from exact 2-card groups
    ranks.filter(r => count(r) === 2).forEach(r => {
      plays.push({ cards: [...byRank[r]], type: HAND_TYPES.PAIR, rank: r, level: POWER_LEVEL.NORMAL });
    });
    // Straights: only from isolated cards
    const singleRanks = ranks.filter(r => count(r) === 1);
    for (let len = 5; len <= singleRanks.length; len++) {
      for (let i = 0; i <= singleRanks.length - len; i++) {
        const seq = singleRanks.slice(i, i + len);
        if (seq[len - 1] - seq[0] === len - 1) {
          plays.push({
            cards: seq.map(r => byRank[r][0]),
            type: HAND_TYPES.STRAIGHT, rank: seq[len - 1], level: POWER_LEVEL.NORMAL, length: len
          });
        }
      }
    }
    // Bombs: only from exact 3-card groups
    ranks.filter(r => count(r) === 3).forEach(r => {
      plays.push({ cards: [...byRank[r]], type: HAND_TYPES.BOMB, rank: r, level: POWER_LEVEL.BOMB });
    });
    // H-Bombs: only from exact 4-card groups
    ranks.filter(r => count(r) === 4).forEach(r => {
      plays.push({ cards: [...byRank[r]], type: HAND_TYPES.H_BOMB, rank: r, level: POWER_LEVEL.H_BOMB });
    });
  } else {
    const cur = lastValidPlay;

    // CHE can only be beaten by H_BOMB
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
        const len = cur.length;
        const singleRanks = ranks.filter(r => count(r) === 1);
        for (let i = 0; i <= singleRanks.length - len; i++) {
          const seq = singleRanks.slice(i, i + len);
          if (seq[len - 1] - seq[0] === len - 1 && seq[len - 1] > cur.rank) {
            plays.push({
              cards: seq.map(r => byRank[r][0]),
              type: HAND_TYPES.STRAIGHT, rank: seq[len - 1], level: POWER_LEVEL.NORMAL, length: len
            });
          }
        }
      }
      // Bombs beat any normal play
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

  // Sort by level then rank (ascending = weakest first)
  plays.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.rank - b.rank;
  });

  return plays;
}

export { analyze, canBeat, analyzeHand, generateAllValidPlays };
