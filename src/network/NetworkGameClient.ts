import type { ServerMessage, GameStateData, SettlementData, RoomPlayer, GameConfig } from './types';

// ===== Config =====
const WS_URL = (() => {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = localStorage.getItem('server_host') || location.hostname;
  // 生产环境走页面同端口（nginx 代理），开发环境可手动设 server_port=3001
  const port = localStorage.getItem('server_port') || location.port || (location.protocol === 'https:' ? '443' : '80');
  return `${proto}//${host}:${port}/ws`;
})();

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]; // exponential backoff
const MAX_RECONNECT_ATTEMPTS = 6;

// ===== Client =====

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type StateListener = (state: GameStateData) => void;
type SettlementListener = (result: SettlementData) => void;
type RoomStateListener = (players: RoomPlayer[], config: GameConfig, ownerId?: number) => void;
type ConnectionListener = (status: ConnectionStatus) => void;
type ErrorListener = (message: string) => void;

export class NetworkGameClient {
  private ws: WebSocket | null = null;
  private token: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private authResolve: ((value: void) => void) | null = null;

  private stateListeners = new Set<StateListener>();
  private settlementListeners = new Set<SettlementListener>();
  private roomStateListeners = new Set<RoomStateListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private errorListeners = new Set<ErrorListener>();

  roomCode: string | null = null;
  userId: number = 0;
  nickname: string = '';

  // ===== Connection =====

  connect(token: string): Promise<void> {
    this.token = token;
    return new Promise((resolve, reject) => {
      this.authResolve = resolve;
      this.reconnectAttempts = 0;
      this.doConnect();
    });
  }

  private doConnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    const isReconnect = this.reconnectAttempts > 0;
    this.notifyConnection(isReconnect ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Send auth immediately
      this.send({ type: 'auth', token: this.token });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // prevent reconnect
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.notifyConnection('disconnected');
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.notifyConnection('disconnected');
      return;
    }

    const delay = RECONNECT_DELAYS[this.reconnectAttempts] || 30000;
    this.reconnectAttempts++;
    this.notifyConnection('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      // WebSocket has built-in ping/pong but we keep alive via messages
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  // ===== Message Handling =====

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'auth_ok':
        this.userId = msg.userId;
        this.nickname = msg.nickname;
        this.notifyConnection('connected');
        this.startHeartbeat();
        this.reconnectAttempts = 0;
        if (this.authResolve) { this.authResolve(); this.authResolve = null; }
        break;

      case 'error':
        console.warn('[GameClient] Error:', msg.message);
        break;

      case 'room_created':
        this.roomCode = msg.roomCode;
        break;

      case 'room_joined':
        this.roomCode = msg.roomCode;
        break;

      case 'room_left':
        this.roomCode = null;
        break;

      case 'room_state':
        for (const l of this.roomStateListeners) l(msg.players, msg.config, msg.ownerId);
        break;

      case 'game_start':
      case 'game_state':
        for (const l of this.stateListeners) l(msg.state);
        break;

      case 'settlement':
        for (const l of this.settlementListeners) l(msg.result);
        break;

      case 'action_result':
        if (!msg.success && msg.error) {
          console.warn('[GameClient] Action error:', msg.error);
          for (const l of this.errorListeners) l(msg.error);
        }
        break;

      case 'player_disconnected':
      case 'player_reconnected':
      case 'player_joined':
      case 'player_left':
        // These trigger room_state updates
        break;
    }
  }

  // ===== Send =====

  send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ===== Game Actions =====

  createRoom(config: GameConfig) {
    this.send({ type: 'create_room', ...config });
  }

  joinRoom(roomCode: string) {
    this.send({ type: 'join_room', roomCode });
  }

  setReady() {
    this.send({ type: 'ready' });
  }

  addBot() {
    this.send({ type: 'add_bot' });
  }

  startGame() {
    this.send({ type: 'start_game' });
  }

  playCards(cards: { suit: number; rankValue: number }[], isSelfChe = false, cheRemainCards?: { suit: number; rankValue: number }[]) {
    this.send({ type: 'play_cards', cards, isSelfChe, cheRemainCards });
  }

  pass() {
    this.send({ type: 'pass' });
  }

  cheAction(cards: { suit: number; rankValue: number }[]) {
    this.send({ type: 'che_action', cards });
  }

  declineChe() {
    this.send({ type: 'decline_che' });
  }

  nextRound() {
    this.send({ type: 'next_round' });
  }

  leaveRoom() {
    this.send({ type: 'leave_room' });
    this.roomCode = null;
  }

  // ===== Subscriptions =====

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onSettlement(listener: SettlementListener): () => void {
    this.settlementListeners.add(listener);
    return () => this.settlementListeners.delete(listener);
  }

  onRoomState(listener: RoomStateListener): () => void {
    this.roomStateListeners.add(listener);
    return () => this.roomStateListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private notifyConnection(status: ConnectionStatus) {
    for (const l of this.connectionListeners) l(status);
  }
}

// Singleton
export const networkClient = new NetworkGameClient();
