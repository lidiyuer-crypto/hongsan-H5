import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { register, login, refreshAccessToken } from './auth';
import { db, schema } from './db';
import { eq } from 'drizzle-orm';
import { GameRoom, RoomConfig } from './game/GameRoom';
import {
  handleConnection, onMessage, sendToUser, broadcastToRoom,
  setUserRoom, getClientsInRoom, removeClient, clients,
} from './ws/handler';
import { adminApp, setRoomManager } from './admin';

// ===== Hono App =====
export const app = new Hono();

// Mount admin routes
app.route('/', adminApp);

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ===== Auth Routes =====

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json();
  const { username, password, nickname } = body;
  const result = await register(username, password, nickname);
  if ('error' in result) return c.json(result, 400);
  return c.json(result);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json();
  const { username, password } = body;
  const result = await login(username, password);
  if ('error' in result) return c.json(result, 400);
  return c.json(result);
});

app.post('/api/auth/refresh', async (c) => {
  const body = await c.req.json();
  const token = refreshAccessToken(body.refreshToken);
  if (!token) return c.json({ error: '无效的refresh token' }, 400);
  return c.json({ token });
});

// ===== Room Routes (REST) =====

// Get room info
app.get('/api/rooms/:code', (c) => {
  const code = c.req.param('code');
  const room = roomManager.getRoom(code);
  if (!room) return c.json({ error: '房间不存在' }, 404);

  return c.json({
    code: room.roomCode,
    playerCount: room.players.length,
    config: room.config,
    status: room.game ? 'playing' : 'waiting',
  });
});

// ===== Health =====
app.get('/api/health', (c) => c.json({ ok: true, clients: clients.size }));

// ===== Room Manager =====

function generateRoomCode(): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

class RoomManager {
  private rooms = new Map<string, GameRoom>();

  getRoom(code: string): GameRoom | null {
    return this.rooms.get(code) || null;
  }

  createRoom(ownerId: number, config: RoomConfig): string {
    let code: string;
    do { code = generateRoomCode(); } while (this.rooms.has(code));

    // Validate config
    const safeConfig: RoomConfig = {
      baseAmount: config.baseAmount || 5,
      doubleType: config.doubleType === 'steep' ? 'steep' : 'flat',
      smartShuffle: !!config.smartShuffle,
      smartShuffleLevel: config.smartShuffleLevel || 3,
      totalRounds: [8, 16, 24, 32].includes(config.totalRounds) ? config.totalRounds : 8,
      showHandCount: config.showHandCount !== false,
    };

    const room = new GameRoom(code, safeConfig, ownerId);
    this.rooms.set(code, room);
    return code;
  }

  removeRoom(code: string) {
    const room = this.rooms.get(code);
    if (room) {
      room.cleanup();
      this.rooms.delete(code);
    }
  }

  listRooms(): { code: string; game: any; players: any[]; config: any }[] {
    return Array.from(this.rooms.entries()).map(([code, room]) => ({
      code,
      game: room.game,
      players: room.players,
      config: room.config,
    }));
  }
}

const roomManager = new RoomManager();
setRoomManager(roomManager);

// ===== WebSocket Message Handlers =====

onMessage('create_room', (userId, data) => {
  // Check not already in room
  for (const client of clients.values()) {
    if (client.userId === userId && client.roomCode) {
      sendToUser(userId, { type: 'error', message: '你已在房间中' });
      return;
    }
  }

  const config: RoomConfig = {
    baseAmount: data.baseAmount || 5,
    doubleType: data.doubleType || 'flat',
    smartShuffle: data.smartShuffle || false,
    smartShuffleLevel: data.smartShuffleLevel || 3,
    totalRounds: data.totalRounds || 8,
    showHandCount: data.showHandCount !== false,
  };

  const code = roomManager.createRoom(userId, config);
  const room = roomManager.getRoom(code)!;
  setUserRoom(userId, code);

  // Get user info from db
  const user = db.select({ nickname: schema.users.nickname })
    .from(schema.users).where(eq(schema.users.id, userId)).get();

  // Add owner to room
  room.addPlayer(userId, 0, user?.nickname || 'Player');
  room.toggleReady(userId); // Owner auto-ready

  sendToUser(userId, { type: 'room_created', roomCode: code });
});

onMessage('join_room', (userId, data) => {
  const code = data.roomCode;
  if (!code) {
    sendToUser(userId, { type: 'error', message: '请输入房间号' });
    return;
  }

  // Check not already in room
  for (const client of clients.values()) {
    if (client.userId === userId && client.roomCode) {
      sendToUser(userId, { type: 'error', message: '你已在房间中' });
      return;
    }
  }

  const room = roomManager.getRoom(code);
  if (!room) {
    sendToUser(userId, { type: 'error', message: '房间不存在' });
    return;
  }
  if (room.game) {
    sendToUser(userId, { type: 'error', message: '游戏已开始' });
    return;
  }
  if (room.players.length >= 4) {
    sendToUser(userId, { type: 'error', message: '房间已满' });
    return;
  }

  const user = db.select({ nickname: schema.users.nickname })
    .from(schema.users).where(eq(schema.users.id, userId)).get();

  // Find available seat
  const takenSeats = new Set(room.players.map(p => p.seat));
  let seat = -1;
  for (let s = 0; s < 4; s++) {
    if (!takenSeats.has(s)) { seat = s; break; }
  }

  const result = room.addPlayer(userId, seat, user?.nickname || 'Player');
  if ('error' in result) {
    sendToUser(userId, { type: 'error', message: result.error });
    return;
  }

  setUserRoom(userId, code);
  sendToUser(userId, { type: 'room_joined', roomCode: code, seat });
});

onMessage('ready', (userId) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room) return;

  room.toggleReady(userId);
});

onMessage('add_bot', (userId) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room) return;
  if (room.ownerId !== userId) {
    sendToUser(userId, { type: 'error', message: '只有房主可以添加电脑' });
    return;
  }

  const result = room.addBot();
  if ('error' in result) {
    sendToUser(userId, { type: 'error', message: result.error });
  }
});

onMessage('start_game', (userId) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room) return;
  if (!room.canStart()) {
    sendToUser(userId, { type: 'error', message: '人数不足或有人未准备' });
    return;
  }

  room.startGame();
});

onMessage('play_cards', (userId, data) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room || !room.game) return;

  const result = room.playCards(userId, data.cards || [], data.isSelfChe || false);
  if ('error' in result) {
    sendToUser(userId, { type: 'action_result', success: false, error: result.error });
  }
});

onMessage('pass', (userId) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room || !room.game) return;

  const result = room.passTurn(userId);
  if ('error' in result) {
    sendToUser(userId, { type: 'action_result', success: false, error: result.error });
  }
});

onMessage('che_action', (userId, data) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room || !room.game) return;

  const result = room.cheAction(userId, data.cards || []);
  if ('error' in result) {
    sendToUser(userId, { type: 'action_result', success: false, error: result.error });
  }
});

onMessage('decline_che', (userId) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room || !room.game) return;

  room.declineChe(userId);
});

onMessage('next_round', (userId) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const room = roomManager.getRoom(client.roomCode);
  if (!room) return;

  const result = room.nextRound();
  if ('error' in result) {
    sendToUser(userId, { type: 'action_result', success: false, error: result.error });
  }
});

onMessage('leave_room', (userId) => {
  const client = clients.get(userId);
  if (!client || !client.roomCode) return;

  const code = client.roomCode;
  const room = roomManager.getRoom(code);
  if (room) {
    room.removePlayer(userId);
    if (room.players.length === 0) {
      roomManager.removeRoom(code);
    }
  }

  setUserRoom(userId, null);
  sendToUser(userId, { type: 'room_left' });
});

// Handle disconnection
onMessage('_disconnect', (userId) => {
  const client = clients.get(userId);
  if (client && client.roomCode) {
    const room = roomManager.getRoom(client.roomCode);
    if (room && room.game) {
      room.handleDisconnect(userId);
    }
  }
});

// Reconnect
onMessage('reconnect', (userId) => {
  const client = clients.get(userId);
  if (client && client.roomCode) {
    const room = roomManager.getRoom(client.roomCode);
    if (room && room.game) {
      room.handleReconnect(userId);
    }
  }
});

// ===== Export for server entry =====
export { roomManager };
