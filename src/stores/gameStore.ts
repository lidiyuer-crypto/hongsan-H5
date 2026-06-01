import { create } from 'zustand';
import { networkClient, type ConnectionStatus } from '../network/NetworkGameClient';

// ===== Auth State =====
interface AuthState {
  token: string | null;
  userId: number | null;
  nickname: string | null;
  username: string | null;
  isLoggedIn: boolean;
}

// ===== Online State =====
interface OnlineState {
  connectionStatus: ConnectionStatus;
  serverHost: string;
  serverPort: string;
}

// ===== Full Store =====
interface GameStoreState {
  // Auth
  auth: AuthState;
  login: (token: string, userId: number, nickname: string, username: string) => void;
  logout: () => void;

  // Online
  online: OnlineState;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setServerConfig: (host: string, port: string) => void;

  // Room
  roomCode: string;
  players: any[];
  mySeat: number;

  // Actions
  setRoomCode: (code: string) => void;
  setPlayers: (players: any[]) => void;
  connectToServer: (token: string) => Promise<void>;
}

function loadAuth(): AuthState {
  try {
    const saved = localStorage.getItem('hongsan_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...parsed, isLoggedIn: true };
    }
  } catch {}
  return { token: null, userId: null, nickname: null, username: null, isLoggedIn: false };
}

function saveAuth(auth: AuthState) {
  if (auth.isLoggedIn) {
    localStorage.setItem('hongsan_auth', JSON.stringify({
      token: auth.token,
      userId: auth.userId,
      nickname: auth.nickname,
      username: auth.username,
    }));
  } else {
    localStorage.removeItem('hongsan_auth');
  }
}

export const useGameStore = create<GameStoreState>((set) => ({
  auth: loadAuth(),

  login: (token, userId, nickname, username) => {
    const auth: AuthState = { token, userId, nickname, username, isLoggedIn: true };
    saveAuth(auth);
    set({ auth });
  },

  logout: () => {
    networkClient.disconnect();
    const auth: AuthState = { token: null, userId: null, nickname: null, username: null, isLoggedIn: false };
    saveAuth(auth);
    set({ auth });
  },

  online: {
    connectionStatus: 'disconnected',
    serverHost: localStorage.getItem('server_host') || '',
    serverPort: localStorage.getItem('server_port') || '3001',
  },

  setConnectionStatus: (status) => set(s => ({ online: { ...s.online, connectionStatus: status } })),
  setServerConfig: (host, port) => {
    localStorage.setItem('server_host', host);
    localStorage.setItem('server_port', port);
    set(s => ({ online: { ...s.online, serverHost: host, serverPort: port } }));
  },

  roomCode: '',
  players: [],
  mySeat: 0,

  setRoomCode: (code) => set({ roomCode: code }),
  setPlayers: (players) => set({ players }),

  connectToServer: async (token: string) => {
    await networkClient.connect(token);
    set(s => ({ online: { ...s.online, connectionStatus: 'connected' } }));
  },
}));
