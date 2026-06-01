// Barrel export for the game engine
// All shared engine modules live in shared/engine/ (single source of truth)
// Legacy wrappers in src/engine/ re-export from shared/ for backward compatibility

export { RANK_DISPLAY, SUITS, HAND_TYPES, POWER_LEVEL } from '../../shared/engine/constants';
export { Card } from '../../shared/engine/card';
export type { CardData } from '../../shared/engine/card';
export { analyze, canBeat, analyzeHand, generateAllValidPlays } from '../../shared/engine/analyzer';
export type { PlayInfo } from '../../shared/engine/analyzer';
export { createFullDeck, smartShuffleDeal, normalDeal, adjustRed3sForTestMode, assignTeams } from '../../shared/engine/deck';
export type { TeamAssignment } from '../../shared/engine/deck';
export { calculateFans, calculateAmount, calculateSettlement } from '../../shared/engine/scoring';
export type { BombDetail, RoundHistoryEntry, PlayerResult, SettlementResult } from '../../shared/engine/scoring';

// Legacy: checkTeamVictory/checkGameOver/calculateRanks were in victory.js (DEAD CODE — deleted)
// These functions are implemented inline in gameEngine.js and GameRoom.ts

// GameEngine class removed in Phase 5 refactor (online-only architecture)
// Legacy barrel kept for shared engine type re-exports
