import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "hongsan-dev-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = "2h";
const REFRESH_TOKEN_EXPIRY = "30d";

// ===== 注册 =====
export async function register(username: string, password: string, nickname: string) {
  // Validate
  if (!username || username.length < 2) return { error: "用户名至少2个字符" };
  if (!password || password.length < 4) return { error: "密码至少4个字符" };
  if (!nickname || nickname.length < 1) return { error: "请输入昵称" };

  // Check duplicate
  const existing = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  if (existing) return { error: "用户名已被注册" };

  // Hash & insert
  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.insert(schema.users).values({ username, nickname, passwordHash }).returning().get();

  const user = { id: result!.id, username: result!.username, nickname: result!.nickname };
  const token = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return { user, token, refreshToken };
}

// ===== 登录 =====
export async function login(username: string, password: string) {
  const user = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  if (!user) return { error: "用户名或密码错误" };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { error: "用户名或密码错误" };

  const payload = { id: user.id, username: user.username, nickname: user.nickname };
  const token = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { user: payload, token, refreshToken };
}

// ===== 按 ID 查找用户 =====
export function getUserById(id: number) {
  return db.select({
    id: schema.users.id,
    username: schema.users.username,
    nickname: schema.users.nickname,
  }).from(schema.users).where(eq(schema.users.id, id)).get();
}

// ===== JWT 工具 =====
function generateAccessToken(user: { id: number; username: string; nickname: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(user: { id: number; username: string; nickname: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): { id: number; username: string; nickname: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

export function refreshAccessToken(refreshToken: string) {
  const user = verifyToken(refreshToken);
  if (!user) return null;
  return generateAccessToken(user);
}
