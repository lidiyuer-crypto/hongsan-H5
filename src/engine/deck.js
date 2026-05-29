// miniprogram/engine/deck.js
import Card from './card';

function createFullDeck() {
  const cards = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 4; r <= 16; r++) {
      cards.push(new Card(s, r));
    }
  }
  return cards;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const SPLIT_PROBS = {
  1: { quad: 0.05, tripleSingle: 0.15, twoPairs: 0.25, pairTwo: 0.35, fourSingles: 0.20 },
  2: { quad: 0.10, tripleSingle: 0.25, twoPairs: 0.30, pairTwo: 0.25, fourSingles: 0.10 },
  3: { quad: 0.20, tripleSingle: 0.30, twoPairs: 0.25, pairTwo: 0.20, fourSingles: 0.05 },
  4: { quad: 0.35, tripleSingle: 0.30, twoPairs: 0.20, pairTwo: 0.12, fourSingles: 0.03 },
  5: { quad: 0.50, tripleSingle: 0.25, twoPairs: 0.15, pairTwo: 0.08, fourSingles: 0.02 },
};

function smartShuffleDeal(allCards, level) {
  // 概率驱动五级坨坨牌：高级别=更大聚合概率，非固定配额
  const probs = SPLIT_PROBS[level] || SPLIT_PROBS[3];

  // Step 1: 按点数分组（13组×4张）
  const rankGroups = {};
  allCards.forEach(card => {
    if (!rankGroups[card.rankValue]) rankGroups[card.rankValue] = [];
    rankGroups[card.rankValue].push(card);
  });
  const groups = Object.values(rankGroups);

  // Step 2: 每组按级别概率决定分裂方式 → 产出若干"块"
  const chunks = [];
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

  // Step 3: 洗乱，大块优先分配
  shuffleArray(chunks);
  chunks.sort((a, b) => b.length - a.length);

  const playerCards = [[], [], [], []];
  const leftover = [];

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

  // Step 4: 余牌补齐每人到13张
  shuffleArray(leftover);
  let idx = 0;
  for (let pi = 0; pi < 4; pi++) {
    const needed = 13 - playerCards[pi].length;
    if (needed > 0) {
      playerCards[pi].push(...leftover.slice(idx, idx + needed));
      idx += needed;
    }
  }

  // Safety valve: fall back to normal deal if any player lacks 13 cards
  for (let pi = 0; pi < 4; pi++) {
    if (playerCards[pi].length !== 13) {
      return normalDeal(allCards);
    }
  }

  return playerCards;
}

function normalDeal(allCards) {
  // 普通随机发牌：从HTML第741-747行移植
  shuffleArray(allCards);
  const hands = [[], [], [], []];
  for (let i = 0; i < 52; i++) {
    hands[i % 4].push(allCards[i]);
  }
  return hands;
}

function assignTeams(players) {
  // 从HTML第749-756行移植
  let isBusinessMode = false;
  let businessPlayerId = -1;
  let firstPlayer = -1;

  players.forEach(p => {
    p.hand.sort((a, b) => b.rankValue - a.rankValue);
    const red3s = p.hand.filter(c => c.isRed3);
    if (red3s.length === 1) p.isRed3Team = true;
    else if (red3s.length === 2) {
      p.isRed3Team = true;
      isBusinessMode = true;
      businessPlayerId = p.id;
    }
    if (p.hand.some(c => c.isH4)) firstPlayer = p.id;
  });

  return { isBusinessMode, businessPlayerId, firstPlayer };
}

// Test mode: only adjusts red 3 distribution, all other cards follow normal deal
function adjustRed3sForTestMode(hands, testModeType) {
  // Find current positions of both red 3s
  const red3Positions = [];
  for (let pi = 0; pi < 4; pi++) {
    for (let ci = 0; ci < hands[pi].length; ci++) {
      if (hands[pi][ci].isRed3) {
        red3Positions.push({ player: pi, cardIndex: ci });
      }
    }
  }
  if (red3Positions.length !== 2) return hands; // safety

  // Determine target players for the 2 red 3s
  let targets;
  if (testModeType === 'business-self') {
    targets = [0, 0];
  } else if (testModeType === 'business-other') {
    const bot = Math.floor(Math.random() * 3) + 1;
    targets = [bot, bot];
  } else {
    // normal-22: two different players
    const p1 = Math.floor(Math.random() * 4);
    let p2;
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

export { createFullDeck, smartShuffleDeal, normalDeal, adjustRed3sForTestMode, assignTeams };
