import { create } from 'zustand';
import { GameEngine, type Card } from '../lib/engine';

interface Player {
  id: number;
  name: string;
  isBot: boolean;
  hand: Card[];
}

interface GameState {
  // Engine
  engine: GameEngine | null;
  gameState: any;

  // Room
  roomCode: string;
  players: Player[];
  mySeat: number;

  // UI state
  showSettlement: boolean;
  isOnline: boolean;

  // Actions
  initLocalGame: (players: Player[], config: any) => void;
  setGameState: (state: any) => void;
  setRoomCode: (code: string) => void;
  setPlayers: (players: Player[]) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  engine: null,
  gameState: null,
  roomCode: '',
  players: [],
  mySeat: 0,
  showSettlement: false,
  isOnline: false,

  initLocalGame: (players, config) => {
    const engine = new GameEngine();
    engine.createGame(players, config);
    set({ engine, gameState: engine.getState(), isOnline: false });
  },

  setGameState: (state) => set({ gameState: state }),
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayers: (players) => set({ players }),
}));
