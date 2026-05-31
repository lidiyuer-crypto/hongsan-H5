import { app } from './src/app';
import { wsHandler, WSData } from './src/ws/handler';

// Run migration on startup
import './src/db/migrate';

const PORT = parseInt(process.env.PORT || '3001');

// Create Bun HTTP + WebSocket server
Bun.serve<WSData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req, {
        data: { userId: 0, username: '', authed: false },
      });
      if (upgraded) return;
    }
    // Pass everything else to Hono
    return app.fetch(req);
  },
  websocket: wsHandler,
});

console.log(`🚀 Server running on http://localhost:${PORT}`);
console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
