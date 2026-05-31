#!/usr/bin/env tsx
/**
 * Configuration migration script for routing system settings
 * Adds new routing-related configuration to the settings table
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { settings } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

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

// Define routing configuration settings
const routingSettings = [
  // Routing configuration
  { key: 'enable_smart_routing', value: 'true' },
  { key: 'enable_extended_thinking', value: 'false' },
  { key: 'enable_prompt_caching', value: 'true' },
  { key: 'offline_first_mode', value: 'false' },
  
  // Budget configuration (stored in cents)
  { key: 'budget_daily', value: '1000' }, // $10.00
  { key: 'budget_weekly', value: '5000' }, // $50.00
  { key: 'budget_monthly', value: '20000' }, // $200.00
  { key: 'budget_alert_thresholds', value: '[0.5, 0.8, 1.0]' },
  { key: 'budget_auto_downgrade', value: 'false' },
  
  // Cache configuration
  { key: 'cache_system_prompt_threshold', value: '1024' },
  { key: 'cache_user_message_threshold', value: '2048' },
  
  // Extended Thinking configuration
  { key: 'extended_thinking_context_threshold', value: '50000' },
  { key: 'extended_thinking_complexity_threshold', value: '80' },
  
  // Performance configuration
  { key: 'routing_cache_ttl', value: '300' }, // 5 minutes
  { key: 'config_cache_ttl', value: '300' }, // 5 minutes
];

console.log('Migrating routing configuration settings...');

try {
  let added = 0;
  let skipped = 0;

  for (const setting of routingSettings) {
    // Check if setting already exists
    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.key, setting.key))
      .get();

    if (existing) {
      console.log(`⏭️  Skipping existing setting: ${setting.key}`);
      skipped++;
    } else {
      await db.insert(settings).values({
        key: setting.key,
        value: setting.value,
      });
      console.log(`✅ Added setting: ${setting.key} = ${setting.value}`);
      added++;
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Added: ${added} settings`);
  console.log(`   Skipped: ${skipped} settings (already exist)`);
  console.log(`\n✅ Configuration migration completed successfully!`);
} catch (error) {
  console.error('❌ Configuration migration failed:', error);
  process.exit(1);
} finally {
  sqlite.close();
}
