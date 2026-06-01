import type { ServerWebSocket, WebSocketHandler } from "bun";
import { verifyToken } from "../auth";

// ===== Connection State =====

interface ConnectedClient {
  ws: ServerWebSocket<WSData>;
  userId: number;
  username: string;
  nickname: string;
  roomCode: string | null;
  alive: boolean;
}

export interface WSData {
  userId: number;
  username: string;
  authed: boolean;
}

const clients = new Map<number, ConnectedClient>();

export { clients };
export function getClient(userId: number) { return clients.get(userId) ?? null; }
export function removeClient(userId: number) { clients.delete(userId); }

// ===== Message Handlers =====

type MessageHandler = (userId: number, data: any) => void;
const handlers = new Map<string, MessageHandler>();

export function onMessage(type: string, handler: MessageHandler) {
  handlers.set(type, handler);
}

// ===== WebSocket Callbacks (for Bun.serve) =====

export const wsHandler: WebSocketHandler<WSData> = {
  open(ws) {
    // Wait for auth message
    const data = ws.data;

    const authTimeout = setTimeout(() => {
      if (!data.authed) {
        ws.send(JSON.stringify({ type: "error", message: "认证超时" }));
        ws.close();
      }
    }, 30000);

    // Store timeout reference
    (ws as any)._authTimeout = authTimeout;
  },

  message(ws, msg) {
    let parsed: any;
    try {
      if (typeof msg === "string") {
        parsed = JSON.parse(msg);
      } else {
        return; // ignore binary
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "无效的JSON消息" }));
      return;
    }

    const data = ws.data;

    // Handle auth
    if (parsed.type === "auth") {
      const user = verifyToken(parsed.token);
      if (!user) {
        ws.send(JSON.stringify({ type: "error", message: "认证失败，请重新登录" }));
        ws.close();
        return;
      }

      data.userId = user.id;
      data.username = user.username;
      data.authed = true;

      const authTimeout = (ws as any)._authTimeout;
      if (authTimeout) clearTimeout(authTimeout);

      ws.subscribe(`user:${user.id}`);

      const client: ConnectedClient = {
        ws, userId: user.id, username: user.username,
        nickname: user.nickname, roomCode: null, alive: true,
      };
      clients.set(user.id, client);

      ws.send(JSON.stringify({ type: "auth_ok", userId: user.id, nickname: user.nickname }));
      return;
    }

    // Require auth for all other messages
    if (!data.authed) {
      ws.send(JSON.stringify({ type: "error", message: "请先认证" }));
      return;
    }

    // Dispatch to handler
    const handler = handlers.get(parsed.type);
    if (handler) {
      handler(data.userId, parsed);
    } else if (parsed.type !== 'ping') {
      // Silently ignore pings (keepalive), only warn for truly unknown types
      ws.send(JSON.stringify({ type: "error", message: `未知消息类型: ${parsed.type}` }));
    }
  },

  close(ws) {
    const data = ws.data;
    const authTimeout = (ws as any)._authTimeout;
    if (authTimeout) clearTimeout(authTimeout);

    if (data.userId > 0) {
      const client = clients.get(data.userId);
      if (client) client.alive = false;

      // Notify disconnect handler
      const leaveHandler = handlers.get("_disconnect");
      if (leaveHandler) leaveHandler(data.userId, {});
    }
  },

  drain(ws) {
    // Backpressure relieved
  },
};

// ===== Heartbeat =====
const HEARTBEAT_INTERVAL = 30000;

setInterval(() => {
  for (const [id, client] of clients) {
    if (!client.alive) {
      client.ws.close();
      clients.delete(id);
      continue;
    }
    client.alive = false;
    try { client.ws.ping(); } catch {}
  }
}, HEARTBEAT_INTERVAL);

// ===== Send Helpers =====

export function sendToUser(userId: number, msg: object) {
  const client = clients.get(userId);
  if (client && client.ws.readyState === 1) { // OPEN
    try { client.ws.send(JSON.stringify(msg)); } catch {}
  }
}

export function broadcastToRoom(roomCode: string, msg: object) {
  const data = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.roomCode === roomCode && client.ws.readyState === 1) {
      try { client.ws.send(data); } catch {}
    }
  }
}

export function setUserRoom(userId: number, roomCode: string | null) {
  const client = clients.get(userId);
  if (client) client.roomCode = roomCode;
}
