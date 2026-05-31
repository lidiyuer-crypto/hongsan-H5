import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH || "./data/hongsan.db";

// Ensure data directory exists
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch {}

const sqlite = new Database(DB_PATH);
// Enable WAL mode for better concurrent read performance
sqlite.exec("PRAGMA journal_mode=WAL");
sqlite.exec("PRAGMA foreign_keys=ON");

export const db = drizzle(sqlite, { schema });
export { schema };
