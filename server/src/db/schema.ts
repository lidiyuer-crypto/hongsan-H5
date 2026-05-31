import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ===== 用户表 =====
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),   // 登录用户名
  nickname: text("nickname").notNull(),            // 显示昵称
  passwordHash: text("password_hash").notNull(),   // bcrypt hash
  createdAt: text("created_at").default("(datetime('now'))"),
});

// ===== 房间表 =====
export const rooms = sqliteTable("rooms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),           // 4位房间号
  ownerId: integer("owner_id").references(() => users.id),
  config: text("config").notNull(),                 // JSON: 游戏配置
  status: text("status").default("waiting"),        // waiting | playing | finished
  createdAt: text("created_at").default("(datetime('now'))"),
});

// ===== 房间-玩家关联表 =====
export const roomPlayers = sqliteTable("room_players", {
  roomId: integer("room_id").references(() => rooms.id),
  userId: integer("user_id").references(() => users.id),
  seat: integer("seat").notNull(),                  // 0-3
  ready: integer("ready").default(1),               // 1=已准备, 0=未准备 (房主默认1)
}, (table) => [
  primaryKey({ columns: [table.roomId, table.userId] }),
]);

// ===== 游戏操作日志 =====
export const gameActions = sqliteTable("game_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id"),
  playerId: integer("player_id"),
  actionType: text("action_type"),                  // play_cards | pass | che_action | decline_che
  actionData: text("action_data"),                  // JSON
  createdAt: text("created_at").default("(datetime('now'))"),
});

// ===== 结算记录 =====
export const settlements = sqliteTable("settlements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id"),
  roundNumber: integer("round_number"),
  result: text("result").notNull(),                 // JSON
  createdAt: text("created_at").default("(datetime('now'))"),
});

// ===== 用户积分 =====
export const userScores = sqliteTable("user_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  gameId: integer("game_id"),
  netWon: integer("net_won"),
  createdAt: text("created_at").default("(datetime('now'))"),
});
