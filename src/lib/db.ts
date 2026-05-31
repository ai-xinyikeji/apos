import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists
const baseDir = process.env.APOS_DIR || process.cwd();
const dbDir = path.join(baseDir, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'apos.db');
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
