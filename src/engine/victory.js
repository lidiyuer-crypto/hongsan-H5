// miniprogram/engine/victory.js

function checkTeamVictory(gameState) {
  const { players, isBusinessMode, businessPlayerId, tributeProcessed } = gameState;
  const finishedPlayers = players.filter(p => p.finished && p.rank !== null);

  if (isBusinessMode) {
    const businessPlayer = players[businessPlayerId];
    if (businessPlayer.finished && businessPlayer.rank <= 3) {
      return { isOver: true, victoryReason: '业务胜利', victoryTeam: 'business' };
    }
    const nonBusinessPlayers = players.filter(p => p.id !== businessPlayerId);
    const finishedNonBusiness = nonBusinessPlayers.filter(p => p.finished && p.rank !== null);
    if (finishedNonBusiness.length === 3) {
      const ranks = finishedNonBusiness.map(p => p.rank);
      if (ranks.includes(1) && ranks.includes(2) && ranks.includes(3)) {
        if (!businessPlayer.finished || businessPlayer.rank === 4) {
          return {
            isOver: true,
            victoryReason: '非业务玩家胜利',
            victoryTeam: businessPlayer.isRed3Team ? 'black' : 'red'
          };
        }
      }
    }
  }

  if (finishedPlayers.length < 2) return { isOver: false };

  const ranks = {};
  finishedPlayers.forEach(p => { ranks[p.rank] = p; });

  // 双关 (HTML L1248-1258)
  if (!isBusinessMode && ranks[1] && ranks[2]) {
    const p1 = ranks[1], p2 = ranks[2];
    if (p1.isRed3Team === p2.isRed3Team) {
      return { isOver: true, victoryReason: '双关', victoryTeam: p1.isRed3Team ? 'red' : 'black' };
    }
  }

  // 进贡逻辑 (HTML L1260-1298)
  if (!tributeProcessed) {
    if (ranks[1] && ranks[3]) {
      const p1 = ranks[1], p3 = ranks[3];
      if (p1.isRed3Team === p3.isRed3Team) {
        return { isOver: false, tribute: { winner: p1.isRed3Team ? 'red' : 'black', amount: 5, fromRank: '1-3' } };
      }
    }
    if (ranks[2] && ranks[4]) {
      const p2 = ranks[2], p4 = ranks[4];
      if (p2.isRed3Team === p4.isRed3Team) {
        return { isOver: false, tribute: { winner: p2.isRed3Team ? 'black' : 'red', amount: 5, fromRank: '2-4' } };
      }
    }
  }

  return { isOver: false };
}

function checkGameOver(players) {
  const active = players.filter(p => !p.finished);
  return active.length <= 1;
}

function calculateRanks(players) {
  const unfinished = players.filter(p => !p.finished);
  let rankCounter = players.filter(p => p.rank !== null).length;
  unfinished.forEach(p => {
    rankCounter++;
    p.rank = rankCounter;
    p.finished = true;
  });
}

export { checkTeamVictory, checkGameOver, calculateRanks };
