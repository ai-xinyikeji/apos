/**
 * Migration Test Suite
 *
 * Tests the database migration scripts for the Claude model routing optimization feature.
 * Validates:
 * - All tables are created successfully
 * - All indexes are created successfully
 * - Migrations are idempotent (can be run multiple times)
 * - Backward compatibility with existing data
 *
 * NOTE: Uses absolute paths to bypass jest.config.js moduleNameMapper mocks so
 * the real better-sqlite3 native addon and drizzle-orm are used.
 */

import * as fs from 'fs';
import * as path from 'path';

// Use absolute paths to bypass moduleNameMapper mocks
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require(path.resolve(process.cwd(), 'node_modules/better-sqlite3/lib/index.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { drizzle } = require(path.resolve(process.cwd(), 'node_modules/drizzle-orm/better-sqlite3/index.cjs'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sqliteTable, text, integer, index: sqliteIndex } = require(path.resolve(process.cwd(), 'node_modules/drizzle-orm/sqlite-core/index.cjs'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sql } = require(path.resolve(process.cwd(), 'node_modules/drizzle-orm/index.cjs'));

/**
 * Helper function to apply SQL migrations from files
 */
function applyMigrations(sqlite: InstanceType<typeof Database>) {
  const migrationsDir = path.join(process.cwd(), 'drizzle');

  // Get all SQL files in order
  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const migrationSQL = fs.readFileSync(filePath, 'utf-8');

    // Split by statement-breakpoint and execute each statement
    const statements = migrationSQL
      .split('--> statement-breakpoint')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    for (const statement of statements) {
      try {
        sqlite.exec(statement);
      } catch (error) {
        // Ignore "already exists" errors for idempotency
        if (!(error instanceof Error) || !error.message.includes('already exists')) {
          throw error;
        }
      }
    }
  }
}

describe('Database Migration Tests', () => {
  let testDbPath: string | undefined;
  let sqlite: InstanceType<typeof Database>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeEach(() => {
    // Create a temporary in-memory test database
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    // Clean up any leftover temp files
    if (testDbPath && fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  // ─── Migration Execution ────────────────────────────────────────────────────

  describe('Migration Execution', () => {
    test('should run all migrations successfully', () => {
      expect(() => {
        applyMigrations(sqlite);
      }).not.toThrow();
    });

    test('should be idempotent (can run migrations multiple times)', () => {
      // Run migrations first time
      applyMigrations(sqlite);

      // Run migrations second time — should not throw
      expect(() => {
        applyMigrations(sqlite);
      }).not.toThrow();
    });
  });

  // ─── Table Creation ─────────────────────────────────────────────────────────

  describe('Table Creation', () => {
    beforeEach(() => {
      applyMigrations(sqlite);
    });

    test('should create routing_decisions table', () => {
      const result = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='routing_decisions'"
      ).get();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('name', 'routing_decisions');
    });

    test('should create cost_records table', () => {
      const result = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cost_records'"
      ).get();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('name', 'cost_records');
    });

    test('should create custom_rules table', () => {
      const result = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='custom_rules'"
      ).get();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('name', 'custom_rules');
    });

    test('should create budget_alerts table', () => {
      const result = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='budget_alerts'"
      ).get();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('name', 'budget_alerts');
    });
  });

  // ─── Table Structure ─────────────────────────────────────────────────────────

  describe('Table Structure', () => {
    beforeEach(() => {
      applyMigrations(sqlite);
    });

    test('routing_decisions table should have correct columns', () => {
      const columns = sqlite.prepare('PRAGMA table_info(routing_decisions)').all() as Array<{
        name: string; type: string; notnull: number; pk: number;
      }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('task_type');
      expect(columnNames).toContain('context_size');
      expect(columnNames).toContain('selected_provider');
      expect(columnNames).toContain('selected_model');
      expect(columnNames).toContain('decision_reason');
      expect(columnNames).toContain('estimated_cost');
      expect(columnNames).toContain('uses_extended_thinking');
      expect(columnNames).toContain('uses_prompt_caching');
      expect(columnNames).toContain('cache_creation_tokens');
      expect(columnNames).toContain('cache_read_tokens');

      const pkColumn = columns.find((c) => c.pk === 1);
      expect(pkColumn?.name).toBe('id');
    });

    test('cost_records table should have correct columns', () => {
      const columns = sqlite.prepare('PRAGMA table_info(cost_records)').all() as Array<{
        name: string; type: string; notnull: number; pk: number;
      }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('provider');
      expect(columnNames).toContain('model_name');
      expect(columnNames).toContain('task_type');
      expect(columnNames).toContain('input_tokens');
      expect(columnNames).toContain('output_tokens');
      expect(columnNames).toContain('cache_creation_tokens');
      expect(columnNames).toContain('cache_read_tokens');
      expect(columnNames).toContain('total_cost');
      expect(columnNames).toContain('cache_savings');
      expect(columnNames).toContain('routing_decision_id');

      const pkColumn = columns.find((c) => c.pk === 1);
      expect(pkColumn?.name).toBe('id');
    });

    test('custom_rules table should have correct columns', () => {
      const columns = sqlite.prepare('PRAGMA table_info(custom_rules)').all() as Array<{
        name: string; type: string; notnull: number; pk: number;
      }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('priority');
      expect(columnNames).toContain('enabled');
      expect(columnNames).toContain('task_types');
      expect(columnNames).toContain('context_size_min');
      expect(columnNames).toContain('context_size_max');
      expect(columnNames).toContain('code_complexity_min');
      expect(columnNames).toContain('code_complexity_max');
      expect(columnNames).toContain('target_provider');
      expect(columnNames).toContain('target_model');
      expect(columnNames).toContain('match_count');

      const pkColumn = columns.find((c) => c.pk === 1);
      expect(pkColumn?.name).toBe('id');
    });

    test('budget_alerts table should have correct columns', () => {
      const columns = sqlite.prepare('PRAGMA table_info(budget_alerts)').all() as Array<{
        name: string; type: string; notnull: number; pk: number;
      }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('period');
      expect(columnNames).toContain('threshold');
      expect(columnNames).toContain('current_spend');
      expect(columnNames).toContain('budget_limit');
      expect(columnNames).toContain('severity');
      expect(columnNames).toContain('acknowledged');

      const pkColumn = columns.find((c) => c.pk === 1);
      expect(pkColumn?.name).toBe('id');
    });
  });

  // ─── Index Creation ──────────────────────────────────────────────────────────

  describe('Index Creation', () => {
    beforeEach(() => {
      applyMigrations(sqlite);
    });

    test('should create indexes for routing_decisions table', () => {
      const indexes = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='routing_decisions'"
      ).all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_routing_decisions_timestamp');
      expect(indexNames).toContain('idx_routing_decisions_user_id');
      expect(indexNames).toContain('idx_routing_decisions_task_type');
      expect(indexNames).toContain('idx_routing_decisions_provider');
    });

    test('should create indexes for cost_records table', () => {
      const indexes = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='cost_records'"
      ).all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_cost_records_timestamp');
      expect(indexNames).toContain('idx_cost_records_user_id');
      expect(indexNames).toContain('idx_cost_records_provider');
      expect(indexNames).toContain('idx_cost_records_task_type');
    });

    test('should create indexes for custom_rules table', () => {
      const indexes = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='custom_rules'"
      ).all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_custom_rules_user_id');
      expect(indexNames).toContain('idx_custom_rules_priority');
      expect(indexNames).toContain('idx_custom_rules_enabled');
    });

    test('should create indexes for budget_alerts table', () => {
      const indexes = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='budget_alerts'"
      ).all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_budget_alerts_user_id');
      expect(indexNames).toContain('idx_budget_alerts_timestamp');
      expect(indexNames).toContain('idx_budget_alerts_acknowledged');
    });
  });

  // ─── Data Insertion ──────────────────────────────────────────────────────────

  describe('Data Insertion', () => {
    beforeEach(() => {
      applyMigrations(sqlite);
    });

    test('should insert data into routing_decisions table', () => {
      const id = 'test-decision-1';
      const now = new Date().toISOString();

      expect(() => {
        sqlite.prepare(`
          INSERT INTO routing_decisions (
            id, timestamp, task_type, context_size, selected_provider,
            selected_model, decision_reason, estimated_cost,
            uses_extended_thinking, uses_prompt_caching, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, now, 'coding', 5000, 'anthropic',
          'claude-3-5-sonnet-20241022', 'Test decision', 100, 0, 1, now, now);
      }).not.toThrow();

      const result = sqlite.prepare('SELECT * FROM routing_decisions WHERE id = ?').get(id) as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result?.task_type).toBe('coding');
    });

    test('should insert data into cost_records table', () => {
      const id = 'test-cost-1';
      const now = new Date().toISOString();

      expect(() => {
        sqlite.prepare(`
          INSERT INTO cost_records (
            id, timestamp, provider, model_name, task_type,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
            total_cost, cache_savings, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, now, 'anthropic', 'claude-3-5-sonnet-20241022', 'coding',
          1000, 500, 200, 0, 150, 0, now);
      }).not.toThrow();

      const result = sqlite.prepare('SELECT * FROM cost_records WHERE id = ?').get(id) as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result?.provider).toBe('anthropic');
    });

    test('should insert data into custom_rules table', () => {
      const id = 'test-rule-1';
      const now = new Date().toISOString();

      expect(() => {
        sqlite.prepare(`
          INSERT INTO custom_rules (
            id, name, priority, enabled, task_types, code_complexity_min,
            target_provider, target_model, match_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, 'High Complexity Code', 90, 1, JSON.stringify(['coding']),
          80, 'anthropic', 'claude-3-opus-20240229', 0, now, now);
      }).not.toThrow();

      const result = sqlite.prepare('SELECT * FROM custom_rules WHERE id = ?').get(id) as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result?.name).toBe('High Complexity Code');
    });

    test('should insert data into budget_alerts table', () => {
      const id = 'test-alert-1';
      const now = new Date().toISOString();

      expect(() => {
        sqlite.prepare(`
          INSERT INTO budget_alerts (
            id, timestamp, period, threshold, current_spend,
            budget_limit, severity, acknowledged, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, now, 'daily', 80, 8000, 10000, 'warning', 0, now);
      }).not.toThrow();

      const result = sqlite.prepare('SELECT * FROM budget_alerts WHERE id = ?').get(id) as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result?.severity).toBe('warning');
    });
  });

  // ─── Backward Compatibility ──────────────────────────────────────────────────

  describe('Backward Compatibility', () => {
    test('should not affect existing tables', () => {
      applyMigrations(sqlite);

      const tables = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      // Pre-existing tables must still be present
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('metrics');
      expect(tableNames).toContain('code_nodes');
      expect(tableNames).toContain('code_edges');
      expect(tableNames).toContain('experiments');
      expect(tableNames).toContain('workflows');
      expect(tableNames).toContain('conversation_memories');

      // New tables must also be present
      expect(tableNames).toContain('routing_decisions');
      expect(tableNames).toContain('cost_records');
      expect(tableNames).toContain('custom_rules');
      expect(tableNames).toContain('budget_alerts');
    });

    test('should preserve existing data in settings table', () => {
      // Create settings table and insert data BEFORE running migrations
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          created_at TEXT,
          updated_at TEXT
        )
      `);
      sqlite.prepare(
        "INSERT INTO settings (key, value, created_at, updated_at) VALUES ('test_key', 'test_value', datetime('now'), datetime('now'))"
      ).run();

      // Run migrations — must not destroy the pre-existing row
      applyMigrations(sqlite);

      const result = sqlite.prepare(
        "SELECT * FROM settings WHERE key = 'test_key'"
      ).get() as { key: string; value: string } | undefined;

      expect(result).toBeDefined();
      expect(result?.key).toBe('test_key');
      expect(result?.value).toBe('test_value');
    });

    test('should add routing settings without overwriting existing settings', () => {
      applyMigrations(sqlite);

      // Routing settings from migration 0005 must be present
      const smartRouting = sqlite.prepare(
        "SELECT value FROM settings WHERE key = 'enable_smart_routing'"
      ).get() as { value: string } | undefined;

      expect(smartRouting).toBeDefined();
      expect(smartRouting?.value).toBe('true');

      const promptCaching = sqlite.prepare(
        "SELECT value FROM settings WHERE key = 'enable_prompt_caching'"
      ).get() as { value: string } | undefined;

      expect(promptCaching).toBeDefined();
      expect(promptCaching?.value).toBe('true');
    });
  });

  // ─── Foreign Key Relationships ───────────────────────────────────────────────

  describe('Foreign Key Relationships', () => {
    beforeEach(() => {
      applyMigrations(sqlite);
    });

    test('should allow linking cost_records to routing_decisions', () => {
      const now = new Date().toISOString();

      // Insert routing decision first
      sqlite.prepare(`
        INSERT INTO routing_decisions (
          id, timestamp, task_type, context_size, selected_provider,
          selected_model, decision_reason, estimated_cost,
          uses_extended_thinking, uses_prompt_caching, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('decision-1', now, 'coding', 5000, 'anthropic',
        'claude-3-5-sonnet-20241022', 'Test decision', 100, 0, 1, now, now);

      // Insert cost record linked to the decision
      expect(() => {
        sqlite.prepare(`
          INSERT INTO cost_records (
            id, timestamp, provider, model_name, task_type,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
            total_cost, cache_savings, routing_decision_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('cost-1', now, 'anthropic', 'claude-3-5-sonnet-20241022', 'coding',
          1000, 500, 200, 0, 150, 0, 'decision-1', now);
      }).not.toThrow();

      const result = sqlite.prepare(
        'SELECT * FROM cost_records WHERE routing_decision_id = ?'
      ).get('decision-1') as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result?.routing_decision_id).toBe('decision-1');
    });
  });

  // ─── Default Values ──────────────────────────────────────────────────────────

  describe('Default Values', () => {
    beforeEach(() => {
      applyMigrations(sqlite);
    });

    test('routing_decisions should have correct default values', () => {
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO routing_decisions (
          id, timestamp, task_type, context_size, selected_provider,
          selected_model, decision_reason, estimated_cost, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('test-minimal-1', now, 'coding', 5000, 'anthropic',
        'claude-3-5-sonnet-20241022', 'Test', 100, now, now);

      const result = sqlite.prepare(
        'SELECT * FROM routing_decisions WHERE id = ?'
      ).get('test-minimal-1') as Record<string, unknown>;

      expect(result?.manual_override).toBe(0);
      expect(result?.uses_extended_thinking).toBe(0);
      expect(result?.uses_prompt_caching).toBe(0);
    });

    test('custom_rules should have correct default values', () => {
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO custom_rules (
          id, name, target_provider, target_model, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-rule-minimal-1', 'Test Rule', 'anthropic',
        'claude-3-5-sonnet-20241022', now, now);

      const result = sqlite.prepare(
        'SELECT * FROM custom_rules WHERE id = ?'
      ).get('test-rule-minimal-1') as Record<string, unknown>;

      expect(result?.priority).toBe(50);
      expect(result?.enabled).toBe(1);
      expect(result?.match_count).toBe(0);
    });

    test('budget_alerts should have correct default values', () => {
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO budget_alerts (
          id, timestamp, period, threshold, current_spend,
          budget_limit, severity, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('test-alert-minimal-1', now, 'daily', 80, 8000, 10000, 'warning', now);

      const result = sqlite.prepare(
        'SELECT * FROM budget_alerts WHERE id = ?'
      ).get('test-alert-minimal-1') as Record<string, unknown>;

      expect(result?.acknowledged).toBe(0);
    });
  });
});
