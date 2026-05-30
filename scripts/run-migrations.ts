#!/usr/bin/env tsx
/**
 * Migration script to apply pending Drizzle migrations to the database
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists
const baseDir = process.env.APOS_DIR || process.cwd();
const dbDir = path.join(baseDir, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'apos.db');
console.log(`Connecting to database: ${dbPath}`);

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

console.log('Running migrations...');
try {
  migrate(db, { migrationsFolder: './drizzle' });
  console.log('✅ Migrations completed successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  sqlite.close();
}
