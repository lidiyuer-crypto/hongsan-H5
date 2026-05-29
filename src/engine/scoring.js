// Ported from HTML scoring logic
// Fan calculation: bombs, double-lock, business mode bonuses

const HAND_TYPES = { SINGLE: 1, PAIR: 2, STRAIGHT: 3, BOMB: 4, H_BOMB: 5, CHE: 6 };

function calculateFans(roundHistory, victoryReason, players) {
  let bombFans = 0;
  const bombDetails = [];

  roundHistory.forEach(round => {
    if (round.type === HAND_TYPES.BOMB) {
      bombFans += 1;
      bombDetails.push({ playerId: round.playerId, type: '普通炸弹', fans: 1, rank: round.rank });
    } else if (round.type === HAND_TYPES.H_BOMB) {
      bombFans += 2;
      bombDetails.push({ playerId: round.playerId, type: '氢弹', fans: 2, rank: round.rank });
    }
  });

  let extraFans = 0;
  let extraFansLabel = '';

  // Double lock bonus
  if (victoryReason === '双关') {
    extraFans = 1;
    extraFansLabel = '双关';
  }

  // Business mode bonus
  if (victoryReason === '业务胜利') {
    const notFinished = players.filter(p => !p.finished || p.hand.length > 0).length;
    extraFans = notFinished;
    extraFansLabel = '业务(关' + notFinished + '人)';
  }

  // Business player lost (三家逃脱) — 3 fans
  if (victoryReason === '非业务玩家胜利') {
    extraFans = 3;
    extraFansLabel = '三家逃脱';
  }

  const fans = bombFans + extraFans;
  return { fans, bombFans, extraFans, extraFansLabel, bombDetails };
}

function calculateAmount(baseAmount, fans, doubleType) {
  if (doubleType === 'steep') {
    return baseAmount * Math.pow(2, fans);
  }
  // flat: base × (1 + fans)
  return baseAmount * (1 + fans);
}

/**
 * Calculate per-player settlement
 * Winning team takes from losing team
 */
function calculateSettlement(players, victoryTeam, baseAmount, fans, doubleType, teamPotBonus, isBusinessMode, businessPlayerId) {
  const amount = calculateAmount(baseAmount, fans, doubleType);
  const rankNames = ['上游', '前中游', '后中游', '下游'];

  const results = players.map(p => {
    let won = 0;
    let lost = 0;

    if (victoryTeam === 'business') {
      // Business player wins: collects amount from each of 3 opponents
      if (p.id === businessPlayerId) {
        won = amount * 3;
      } else {
        lost = amount;
      }
    } else if (isBusinessMode) {
      // Business player lost: pays amount to each of 3 opponents
      if (p.id === businessPlayerId) {
        lost = amount * 3;
      } else {
        won = amount;
      }
    } else {
      // Normal 2v2: each player wins or loses exactly the round amount
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

    // Add individual pot
    const potAmount = p.pot || 0;

    return {
      playerId: p.id,
      name: ['玩家', '玩家A', '玩家B', '玩家C'][p.id],
      isRed3Team: p.isRed3Team,
      rank: p.rank,
      rankName: p.rank ? rankNames[p.rank - 1] : '?',
      pot: potAmount,
      won,
      lost,
      netWon: won - lost
    };
  });

  return { results, amount };
}

export { calculateFans, calculateAmount, calculateSettlement, HAND_TYPES };
