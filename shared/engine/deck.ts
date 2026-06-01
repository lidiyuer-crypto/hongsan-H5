import { Card } from './card';

export function createFullDeck(): Card[] {
  const cards: Card[] = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 4; r <= 16; r++) {
      cards.push(new Card(s, r));
    }
  }
  return cards;
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 坨坨牌 probability config (5 levels)
const SPLIT_PROBS: Record<number, Record<string, number>> = {
  1: { quad: 0.05, tripleSingle: 0.15, twoPairs: 0.25, pairTwo: 0.35, fourSingles: 0.20 },
  2: { quad: 0.10, tripleSingle: 0.25, twoPairs: 0.30, pairTwo: 0.25, fourSingles: 0.10 },
  3: { quad: 0.20, tripleSingle: 0.30, twoPairs: 0.25, pairTwo: 0.20, fourSingles: 0.05 },
  4: { quad: 0.35, tripleSingle: 0.30, twoPairs: 0.20, pairTwo: 0.12, fourSingles: 0.03 },
  5: { quad: 0.50, tripleSingle: 0.25, twoPairs: 0.15, pairTwo: 0.08, fourSingles: 0.02 },
};

export function smartShuffleDeal(allCards: Card[], level: number): Card[][] {
  const probs = SPLIT_PROBS[level] || SPLIT_PROBS[3];

  // Step 1: Group by rank (13 groups × 4 cards)
  const rankGroups: Record<number, Card[]> = {};
  allCards.forEach(card => {
    if (!rankGroups[card.rankValue]) rankGroups[card.rankValue] = [];
    rankGroups[card.rankValue].push(card);
  });
  const groups = Object.values(rankGroups);

  // Step 2: Split each group into chunks based on probability
  const chunks: Card[][] = [];
  groups.forEach(group => {
    const r = Math.random();
    if (r < probs.quad) {
      chunks.push([...group]);
    } else if (r < probs.quad + probs.tripleSingle) {
      chunks.push(group.slice(0, 3));
      chunks.push([group[3]]);
    } else if (r < probs.quad + probs.tripleSingle + probs.twoPairs) {
      chunks.push(group.slice(0, 2));
      chunks.push(group.slice(2, 4));
    } else if (r < probs.quad + probs.tripleSingle + probs.twoPairs + probs.pairTwo) {
      chunks.push(group.slice(0, 2));
      chunks.push([group[2]]);
      chunks.push([group[3]]);
    } else {
      for (let i = 0; i < 4; i++) chunks.push([group[i]]);
    }
  });

  // Step 3: Shuffle, sort by size descending (big blocks first)
  shuffleArray(chunks);
  chunks.sort((a, b) => b.length - a.length);

  const playerCards: Card[][] = [[], [], [], []];
  const leftover: Card[] = [];

  for (const chunk of chunks) {
    const order = [0, 1, 2, 3].sort((a, b) => playerCards[a].length - playerCards[b].length);
    let placed = false;
    for (const pi of order) {
      if (playerCards[pi].length + chunk.length <= 13) {
        playerCards[pi].push(...chunk);
        placed = true;
        break;
      }
    }
    if (!placed) {
      leftover.push(...chunk);
    }
  }

  // Step 4: Fill remaining slots with leftover cards
  shuffleArray(leftover);
  let idx = 0;
  for (let pi = 0; pi < 4; pi++) {
    const needed = 13 - playerCards[pi].length;
    if (needed > 0) {
      playerCards[pi].push(...leftover.slice(idx, idx + needed));
      idx += needed;
    }
  }

  // Safety valve: fall back to normal deal
  for (let pi = 0; pi < 4; pi++) {
    if (playerCards[pi].length !== 13) {
      return normalDeal(allCards);
    }
  }

  return playerCards;
}

// Test mode: adjusts red 3 distribution, all other cards follow normal deal
export function adjustRed3sForTestMode(hands: Card[][], testModeType: string): Card[][] {
  // Find current positions of both red 3s
  const red3Positions: { player: number; cardIndex: number }[] = [];
  for (let pi = 0; pi < 4; pi++) {
    for (let ci = 0; ci < hands[pi].length; ci++) {
      if (hands[pi][ci].isRed3) {
        red3Positions.push({ player: pi, cardIndex: ci });
      }
    }
  }
  if (red3Positions.length !== 2) return hands; // safety

  // Determine target players for the 2 red 3s
  let targets: number[];
  if (testModeType === 'business-self') {
    targets = [0, 0];
  } else if (testModeType === 'business-other') {
    const bot = Math.floor(Math.random() * 3) + 1;
    targets = [bot, bot];
  } else {
    // normal-22: two different players
    const p1 = Math.floor(Math.random() * 4);
    let p2: number;
    do { p2 = Math.floor(Math.random() * 4); } while (p2 === p1);
    targets = [p1, p2];
  }

  // Move each red 3 to its target via swap
  for (let i = 0; i < 2; i++) {
    const target = targets[i];
    const current = red3Positions[i];
    if (current.player === target) continue;

    // Find a non-red-3 card in target's hand to swap with
    const swapIdx = hands[target].findIndex(c => !c.isRed3);
    if (swapIdx === -1) continue;

    // Swap
    const tmp = hands[current.player][current.cardIndex];
    hands[current.player][current.cardIndex] = hands[target][swapIdx];
    hands[target][swapIdx] = tmp;

    // Update tracked position (for case where both red3s go to same target)
    red3Positions[i] = { player: target, cardIndex: swapIdx };
  }

  return hands;
}

export function normalDeal(allCards: Card[]): Card[][] {
  shuffleArray(allCards);
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < 52; i++) {
    hands[i % 4].push(allCards[i]);
  }
  return hands;
}

export interface TeamAssignment {
  isBusinessMode: boolean;
  businessPlayerId: number;
  firstPlayer: number;   // player who holds H4 (always goes first)
}

export function assignTeams(players: { id: number; hand: Card[]; isRed3Team: boolean }[]): TeamAssignment {
  let isBusinessMode = false;
  let businessPlayerId = -1;
  let firstPlayer = -1;

  players.forEach(p => {
    p.hand.sort((a, b) => b.rankValue - a.rankValue);
    const red3s = p.hand.filter(c => c.isRed3);
    if (red3s.length === 1) {
      p.isRed3Team = true;
    } else if (red3s.length === 2) {
      p.isRed3Team = true;
      isBusinessMode = true;
      businessPlayerId = p.id;
    } else {
      p.isRed3Team = false;
    }
    if (p.hand.some(c => c.isH4)) {
      firstPlayer = p.id;
    }
  });

  return { isBusinessMode, businessPlayerId, firstPlayer };
}
