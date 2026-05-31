import { Hono } from 'hono';
import { db, schema } from '../db';
import { eq, desc, sql } from 'drizzle-orm';

// Lazy import to avoid circular dependency (admin ↔ app)
let _roomManager: any = null;
export function setRoomManager(rm: any) { _roomManager = rm; }

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';

export const adminApp = new Hono();

// ===== Auth middleware (only protect API routes) =====
adminApp.use('/api/admin/*', async (c, next) => {
  const key = c.req.header('X-Admin-Key') || c.req.query('key') || '';
  if (key !== ADMIN_KEY) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

// ===== Stats =====
adminApp.get('/api/admin/stats', (c) => {
  const userCount = db.select({ count: sql<number>`count(*)` }).from(schema.users).get()?.count || 0;
  const gameActions = db.select({ count: sql<number>`count(*)` }).from(schema.gameActions).get()?.count || 0;
  const settlementCount = db.select({ count: sql<number>`count(*)` }).from(schema.settlements).get()?.count || 0;

  return c.json({ userCount, gameActions, settlementCount });
});

// ===== Users =====
adminApp.get('/api/admin/users', (c) => {
  const users = db.select().from(schema.users).all();
  return c.json(users.map(u => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    createdAt: u.createdAt,
  })));
});

// ===== Delete user =====
adminApp.delete('/api/admin/users/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  db.delete(schema.users).where(eq(schema.users.id, id)).run();
  return c.json({ ok: true });
});

// ===== Active Rooms =====
adminApp.get('/api/admin/rooms', (c) => {
  const rooms = _roomManager.listRooms();
  return c.json(rooms.map(r => ({
    code: r.code,
    status: r.game ? 'playing' : 'waiting',
    playerCount: r.players.length,
    players: r.players.map(p => ({ name: p.name, isBot: p.isBot, seat: p.seat })),
    config: r.config,
  })));
});

// ===== Close/Delete Room =====
adminApp.delete('/api/admin/rooms/:code', (c) => {
  const code = c.req.param('code');
  const room = _roomManager.getRoom(code);
  if (!room) return c.json({ error: '房间不存在' }, 404);
  _roomManager.removeRoom(code);
  return c.json({ ok: true });
});

// ===== DB stats =====
adminApp.get('/api/admin/db', (c) => {
  const tables = ['users', 'rooms', 'room_players', 'game_actions', 'settlements', 'user_scores'];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const r = db.all<{ count: number }>(sql.raw(`SELECT count(*) as count FROM ${t}`));
      counts[t] = r[0]?.count || 0;
    } catch { counts[t] = 0; }
  }
  return c.json(counts);
});

// ===== Admin HTML page =====
adminApp.get('/admin', (c) => {
  const key = c.req.query('key') || '';
  if (key !== ADMIN_KEY) {
    return c.html(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>红三管理后台 - 登录</title>
<style>body{background:#1a1510;color:#f5ede0;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
input{padding:12px 16px;border-radius:8px;border:1px solid #f0a828;background:#2a2218;color:#f5ede0;font-size:16px;width:280px}
button{padding:12px 24px;border-radius:8px;background:#f0a828;color:#1a1510;border:none;font-size:16px;cursor:pointer;font-weight:bold}
form{display:flex;flex-direction:column;gap:12px;align-items:center}
</style></head><body>
<form onsubmit="location.href='?key='+document.getElementById('k').value;return false">
<h2>🔐 红三管理后台</h2>
<input id="k" type="password" placeholder="管理员密钥" autofocus>
<button type="submit">进入</button>
</form></body></html>`);
  }
  return c.html(getAdminHTML(key));
});

function getAdminHTML(key: string) {
  const users = db.select().from(schema.users).all();
  const userRows = users.map(u =>
    `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.nickname}</td><td>${u.createdAt}</td>
     <td><button onclick="delUser(${u.id})" style="background:#c0392b;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer">删除</button></td></tr>`
  ).join('');

  const counts = {} as Record<string, number>;
  try {
    const tables = ['users', 'rooms', 'room_players', 'game_actions', 'settlements', 'user_scores'];
    for (const t of tables) {
      const r = db.all<{ count: number }>(sql.raw(`SELECT count(*) as count FROM ${t}`));
      counts[t] = r[0]?.count || 0;
    }
  } catch {}

  // Active room list
  const rooms = _roomManager.listRooms();
  const roomRows = rooms.length > 0
    ? rooms.map(r => {
        const playerNames = r.players.map(p =>
          `${p.seat}号:${p.name}${p.isBot ? '🤖' : ''}`
        ).join(' ');
        const statusBadge = r.game
          ? '<span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">游戏中</span>'
          : '<span style="background:#27ae60;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">等待中</span>';
        return `<tr>
          <td><b>${r.code}</b></td>
          <td>${statusBadge}</td>
          <td>${r.players.length}/4</td>
          <td style="font-size:12px">${playerNames}</td>
          <td><button onclick="closeRoom('${r.code}')" style="background:#c0392b;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer">关闭房间</button></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#8a7a60">暂无活跃房间</td></tr>';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>红三管理后台</title>
<style>
*{box-sizing:border-box}
body{background:#1a1510;color:#f5ede0;font-family:system-ui;margin:0;padding:24px}
h1{color:#f0a828;font-size:24px;margin-bottom:4px}
h2{color:#f0a828;font-size:18px;margin-top:28px}
.sub{color:#8a7a60;font-size:13px;margin-bottom:24px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.card{background:#2a2218;border-radius:12px;padding:16px;text-align:center;border:1px solid #3a3028}
.card .num{font-size:32px;font-weight:bold;color:#f0a828}
.card .label{font-size:12px;color:#8a7a60;margin-top:4px}
table{width:100%;border-collapse:collapse;background:#2a2218;border-radius:12px;overflow:hidden;margin-bottom:24px}
th{background:#3a3028;padding:12px 16px;text-align:left;font-size:13px;color:#f0a828}
td{padding:10px 16px;border-bottom:1px solid #3a3028;font-size:14px}
tr:hover{background:#332a1e}
.btn{background:#f0a828;color:#1a1510;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px}
.btn:hover{opacity:0.9}
</style></head><body>
<h1>🎮 红三管理后台</h1>
<div class="sub">密钥: ${key.slice(0,4)}*** | <a href="/admin" style="color:#f0a828">退出</a> | <a href="javascript:location.reload()" style="color:#f0a828">刷新</a></div>

<div class="cards">
<div class="card"><div class="num">${counts['users']||0}</div><div class="label">注册用户</div></div>
<div class="card"><div class="num">${rooms.length}</div><div class="label">活跃房间</div></div>
<div class="card"><div class="num">${counts['game_actions']||0}</div><div class="label">游戏操作</div></div>
<div class="card"><div class="num">${counts['settlements']||0}</div><div class="label">结算记录</div></div>
</div>

<h2>🏠 活跃房间</h2>
<table>
<thead><tr><th>房间号</th><th>状态</th><th>人数</th><th>玩家</th><th>操作</th></tr></thead>
<tbody>${roomRows}</tbody>
</table>

<h2>👥 用户列表</h2>
<table>
<thead><tr><th>ID</th><th>用户名</th><th>昵称</th><th>注册时间</th><th>操作</th></tr></thead>
<tbody>${userRows||'<tr><td colspan="5" style="text-align:center;color:#8a7a60">暂无用户</td></tr>'}</tbody>
</table>

<script>
async function delUser(id) {
  if (!confirm('确定删除用户 #'+id+'？此操作不可恢复。')) return;
  const res = await fetch('/api/admin/users/'+id, { method:'DELETE', headers:{'X-Admin-Key':'${key}'} });
  if (res.ok) location.reload();
  else alert('删除失败');
}
async function closeRoom(code) {
  if (!confirm('确定关闭房间 '+code+'？所有玩家将被踢出。')) return;
  const res = await fetch('/api/admin/rooms/'+code, { method:'DELETE', headers:{'X-Admin-Key':'${key}'} });
  if (res.ok) location.reload();
  else alert('关闭失败');
}
</script>
</body></html>`;
}
