/**
 * Tests for CustomRulesEngine
 * 
 * Tests cover:
 * - Rule loading from database
 * - Caching mechanism with 5-minute TTL
 * - Cache clearing when rules are modified
 * - CRUD operations
 * - Error handling
 */

import { CustomRulesEngine, CustomRule } from '../custom-rules-engine';
import { TaskType } from '../task-classifier';
import { AnalysisResult } from '../multi-dim-analyzer';
import { db } from '../../db';
import { customRules } from '../../schema';
import { eq } from 'drizzle-orm';

// Mock the database
jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('CustomRulesEngine', () => {
  let engine: CustomRulesEngine;
  let mockDbSelect: jest.Mock;
  let mockDbInsert: jest.Mock;
  let mockDbUpdate: jest.Mock;
  let mockDbDelete: jest.Mock;

  beforeEach(() => {
    engine = new CustomRulesEngine();
    
    // Setup mock implementations
    mockDbSelect = jest.fn();
    mockDbInsert = jest.fn();
    mockDbUpdate = jest.fn();
    mockDbDelete = jest.fn();

    (db.select as jest.Mock) = jest.fn(() => ({
      from: mockDbSelect,
    }));
    (db.insert as jest.Mock) = jest.fn(() => ({
      values: mockDbInsert,
    }));
    (db.update as jest.Mock) = jest.fn(() => ({
      set: jest.fn(() => ({
        where: mockDbUpdate,
      })),
    }));
    (db.delete as jest.Mock) = jest.fn(() => ({
      where: mockDbDelete,
    }));

    // Clear all mocks
    jest.clearAllMocks();
  });

  // ── Rule Loading ─────────────────────────────────────────────────────────

  describe('loadRules', () => {
    it('loads rules from database successfully', async () => {
      const mockDbRules = [
        {
          id: 'rule-1',
          name: 'High Complexity Code',
          priority: 90,
          enabled: 1,
          taskTypes: '["coding"]',
          contextSizeMin: null,
          contextSizeMax: null,
          codeComplexityMin: 80,
          codeComplexityMax: null,
          targetProvider: 'anthropic',
          targetModel: 'claude-3-opus-20240229',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'rule-2',
          name: 'Large Context',
          priority: 80,
          enabled: 1,
          taskTypes: null,
          contextSizeMin: 50000,
          contextSizeMax: null,
          codeComplexityMin: null,
          codeComplexityMax: null,
          targetProvider: 'anthropic',
          targetModel: 'claude-3-7-sonnet-20250219',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDbSelect.mockResolvedValue(mockDbRules);

      await engine.loadRules();

      expect(mockDbSelect).toHaveBeenCalledWith(customRules);
    });

    it('converts database records to CustomRule objects correctly', async () => {
      const mockDbRules = [
        {
          id: 'rule-1',
          name: 'Test Rule',
          priority: 50,
          enabled: 1,
          taskTypes: '["coding", "review"]',
          contextSizeMin: 1000,
          contextSizeMax: 10000,
          codeComplexityMin: 20,
          codeComplexityMax: 80,
          targetProvider: 'anthropic',
          targetModel: 'claude-3-5-sonnet-20241022',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDbSelect.mockResolvedValue(mockDbRules);

      await engine.loadRules();

      // Test by matching a rule
      const analysis: AnalysisResult = {
        contextSize: 5000,
        codeComplexity: 50,
        estimatedCost: 0.01,
        requiresExtendedThinking: false,
      };

      const result = engine.matchRule(analysis, 'coding');
      expect(result.matched).toBe(true);
      expect(result.rule?.name).toBe('Test Rule');
      expect(result.rule?.enabled).toBe(true);
      expect(result.rule?.conditions.taskTypes).toEqual(['coding', 'review']);
    });

    it('sorts rules by priority (highest first)', async () => {
      const mockDbRules = [
        {
          id: 'rule-low',
          name: 'Low Priority',
          priority: 10,
          enabled: 1,
          taskTypes: '["coding"]',
          contextSizeMin: null,
          contextSizeMax: null,
          codeComplexityMin: null,
          codeComplexityMax: null,
          targetProvider: 'google',
          targetModel: 'gemini-1.5-flash',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'rule-high',
          name: 'High Priority',
          priority: 90,
          enabled: 1,
          taskTypes: '["coding"]',
          contextSizeMin: null,
          contextSizeMax: null,
          codeComplexityMin: null,
          codeComplexityMax: null,
          targetProvider: 'anthropic',
          targetModel: 'claude-3-opus-20240229',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDbSelect.mockResolvedValue(mockDbRules);

      await engine.loadRules();

      const analysis: AnalysisResult = {
        contextSize: 1000,
        codeComplexity: 50,
        estimatedCost: 0.01,
        requiresExtendedThinking: false,
      };

      // Should match the high priority rule first
      const result = engine.matchRule(analysis, 'coding');
      expect(result.matched).toBe(true);
      expect(result.rule?.name).toBe('High Priority');
      expect(result.rule?.priority).toBe(90);
    });

    it('handles empty database result', async () => {
      mockDbSelect.mockResolvedValue([]);

      await engine.loadRules();

      const analysis: AnalysisResult = {
        contextSize: 1000,
        codeComplexity: 50,
        estimatedCost: 0.01,
        requiresExtendedThinking: false,
      };

      const result = engine.matchRule(analysis, 'coding');
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('No custom rules matched');
    });

    it('handles database errors gracefully', async () => {
      mockDbSelect.mockRejectedValue(new Error('Database connection failed'));

      await expect(engine.loadRules()).rejects.toThrow('Database connection failed');
    });
  });

  // ── Caching Mechanism ────────────────────────────────────────────────────

  describe('caching', () => {
    it('uses cached rules within TTL period', async () => {
      const mockDbRules = [
        {
          id: 'rule-1',
          name: 'Test Rule',
          priority: 50,
          enabled: 1,
          taskTypes: null,
          contextSizeMin: null,
          contextSizeMax: null,
          codeComplexityMin: null,
          codeComplexityMax: null,
          targetProvider: 'anthropic',
          targetModel: 'claude-3-5-sonnet-20241022',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDbSelect.mockResolvedValue(mockDbRules);

      // First load
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Second load within TTL - should use cache
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('reloads rules after TTL expires', async () => {
      const mockDbRules = [
        {
          id: 'rule-1',
          name: 'Test Rule',
          priority: 50,
          enabled: 1,
          taskTypes: null,
          contextSizeMin: null,
          contextSizeMax: null,
          codeComplexityMin: null,
          codeComplexityMax: null,
          targetProvider: 'anthropic',
          targetModel: 'claude-3-5-sonnet-20241022',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDbSelect.mockResolvedValue(mockDbRules);

      // First load
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Mock time passing (5 minutes + 1 second)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60 * 1000 + 1000);

      // Second load after TTL - should reload
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });

    it('clears cache when clearCache is called', async () => {
      const mockDbRules = [
        {
          id: 'rule-1',
          name: 'Test Rule',
          priority: 50,
          enabled: 1,
          taskTypes: null,
          contextSizeMin: null,
          contextSizeMax: null,
          codeComplexityMin: null,
          codeComplexityMax: null,
          targetProvider: 'anthropic',
          targetModel: 'claude-3-5-sonnet-20241022',
          matchCount: 0,
          lastMatchedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockDbSelect.mockResolvedValue(mockDbRules);

      // First load
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Clear cache
      engine.clearCache();

      // Second load - should reload because cache was cleared
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });
  });

  // ── CRUD Operations ──────────────────────────────────────────────────────

  describe('addRule', () => {
    it('inserts rule into database', async () => {
      mockDbInsert.mockResolvedValue(undefined);

      const rule: CustomRule = {
        id: 'new-rule',
        name: 'New Rule',
        priority: 50,
        enabled: true,
        conditions: {
          taskTypes: ['coding'],
          contextSizeMin: 1000,
        },
        targetProvider: 'anthropic',
        targetModel: 'claude-3-5-sonnet-20241022',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await engine.addRule(rule);

      expect(mockDbInsert).toHaveBeenCalled();
      const insertCall = mockDbInsert.mock.calls[0][0];
      expect(insertCall.id).toBe('new-rule');
      expect(insertCall.name).toBe('New Rule');
      expect(insertCall.enabled).toBe(1); // Boolean converted to 1
      expect(insertCall.taskTypes).toBe('["coding"]'); // Array stringified
    });

    it('clears cache after adding rule', async () => {
      mockDbInsert.mockResolvedValue(undefined);
      mockDbSelect.mockResolvedValue([]);

      const rule: CustomRule = {
        id: 'new-rule',
        name: 'New Rule',
        priority: 50,
        enabled: true,
        conditions: {},
        targetProvider: 'anthropic',
        targetModel: 'claude-3-5-sonnet-20241022',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Load rules first
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Add rule
      await engine.addRule(rule);

      // Load again - should reload because cache was cleared
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });

    it('handles database errors when adding rule', async () => {
      mockDbInsert.mockRejectedValue(new Error('Insert failed'));

      const rule: CustomRule = {
        id: 'new-rule',
        name: 'New Rule',
        priority: 50,
        enabled: true,
        conditions: {},
        targetProvider: 'anthropic',
        targetModel: 'claude-3-5-sonnet-20241022',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(engine.addRule(rule)).rejects.toThrow('Insert failed');
    });
  });

  describe('updateRule', () => {
    it('updates rule in database', async () => {
      mockDbUpdate.mockResolvedValue(undefined);

      await engine.updateRule('rule-1', {
        name: 'Updated Name',
        priority: 75,
      });

      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('clears cache after updating rule', async () => {
      mockDbUpdate.mockResolvedValue(undefined);
      mockDbSelect.mockResolvedValue([]);

      // Load rules first
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Update rule
      await engine.updateRule('rule-1', { name: 'Updated' });

      // Load again - should reload because cache was cleared
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });

    it('handles database errors when updating rule', async () => {
      mockDbUpdate.mockRejectedValue(new Error('Update failed'));

      await expect(engine.updateRule('rule-1', { name: 'Updated' }))
        .rejects.toThrow('Update failed');
    });
  });

  describe('deleteRule', () => {
    it('deletes rule from database', async () => {
      mockDbDelete.mockResolvedValue(undefined);

      await engine.deleteRule('rule-1');

      expect(mockDbDelete).toHaveBeenCalled();
    });

    it('clears cache after deleting rule', async () => {
      mockDbDelete.mockResolvedValue(undefined);
      mockDbSelect.mockResolvedValue([]);

      // Load rules first
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Delete rule
      await engine.deleteRule('rule-1');

      // Load again - should reload because cache was cleared
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });

    it('handles database errors when deleting rule', async () => {
      mockDbDelete.mockRejectedValue(new Error('Delete failed'));

      await expect(engine.deleteRule('rule-1')).rejects.toThrow('Delete failed');
    });
  });

  describe('toggleRule', () => {
    it('toggles rule enabled status in database', async () => {
      mockDbUpdate.mockResolvedValue(undefined);

      await engine.toggleRule('rule-1', false);

      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('clears cache after toggling rule', async () => {
      mockDbUpdate.mockResolvedValue(undefined);
      mockDbSelect.mockResolvedValue([]);

      // Load rules first
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);

      // Toggle rule
      await engine.toggleRule('rule-1', false);

      // Load again - should reload because cache was cleared
      await engine.loadRules();
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });

    it('handles database errors when toggling rule', async () => {
      mockDbUpdate.mockRejectedValue(new Error('Toggle failed'));

      await expect(engine.toggleRule('rule-1', false)).rejects.toThrow('Toggle failed');
    });
  });

  // ── matchRule Algorithm ──────────────────────────────────────────────────

  /**
   * Helper: seed the engine with in-memory rules without hitting the DB.
   * We load a fake DB result so the engine populates this.rules.
   */
  async function seedRules(rules: CustomRule[]): Promise<void> {
    const dbRows = rules.map(r => ({
      id: r.id,
      name: r.name,
      priority: r.priority,
      enabled: r.enabled ? 1 : 0,
      taskTypes: r.conditions.taskTypes ? JSON.stringify(r.conditions.taskTypes) : null,
      contextSizeMin: r.conditions.contextSizeMin ?? null,
      contextSizeMax: r.conditions.contextSizeMax ?? null,
      codeComplexityMin: r.conditions.codeComplexityMin ?? null,
      codeComplexityMax: r.conditions.codeComplexityMax ?? null,
      targetProvider: r.targetProvider,
      targetModel: r.targetModel,
      matchCount: 0,
      lastMatchedAt: null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    mockDbSelect.mockResolvedValue(dbRows);
    await engine.loadRules();
  }

  const baseAnalysis: AnalysisResult = {
    contextSize: 1000,
    codeComplexity: 50,
    estimatedCost: 0.003,
    requiresExtendedThinking: false,
  };

  const makeRule = (overrides: Partial<CustomRule> & { id: string; name: string }): CustomRule => ({
    priority: 50,
    enabled: true,
    conditions: {},
    targetProvider: 'anthropic',
    targetModel: 'claude-3-5-sonnet-20241022',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });

  describe('matchRule', () => {
    describe('no rules', () => {
      it('returns matched=false with correct reason when no rules are loaded', () => {
        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(false);
        expect(result.reason).toBe('No custom rules matched');
        expect(result.rule).toBeUndefined();
      });
    });

    describe('disabled rules', () => {
      it('skips disabled rules and returns no match', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Disabled Rule', enabled: false }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(false);
      });

      it('matches enabled rule while ignoring disabled one', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Disabled', enabled: false, priority: 90 }),
          makeRule({ id: 'r2', name: 'Enabled', enabled: true, priority: 50 }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
        expect(result.rule?.name).toBe('Enabled');
      });
    });

    describe('task type condition', () => {
      it('matches when taskType is in rule.conditions.taskTypes', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Coding Rule', conditions: { taskTypes: ['coding'] } }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
        expect(result.rule?.name).toBe('Coding Rule');
      });

      it('does not match when taskType is not in rule.conditions.taskTypes', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Coding Rule', conditions: { taskTypes: ['coding'] } }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'reasoning');
        expect(result.matched).toBe(false);
      });

      it('matches any taskType when conditions.taskTypes is undefined', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Any Task Rule', conditions: {} }),
        ]);

        for (const taskType of ['coding', 'reasoning', 'summarize', 'review', 'planning', 'explain', 'refactor', 'default'] as TaskType[]) {
          const result = engine.matchRule(baseAnalysis, taskType);
          expect(result.matched).toBe(true);
        }
      });

      it('matches any taskType when conditions.taskTypes is an empty array', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Empty TaskTypes Rule', conditions: { taskTypes: [] } }),
        ]);

        // Empty array means no taskType filter — all task types should match
        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
      });

      it('matches when taskType is one of multiple allowed types', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Multi-type Rule', conditions: { taskTypes: ['coding', 'review', 'refactor'] } }),
        ]);

        expect(engine.matchRule(baseAnalysis, 'coding').matched).toBe(true);
        expect(engine.matchRule(baseAnalysis, 'review').matched).toBe(true);
        expect(engine.matchRule(baseAnalysis, 'refactor').matched).toBe(true);
        expect(engine.matchRule(baseAnalysis, 'reasoning').matched).toBe(false);
      });
    });

    describe('contextSize conditions', () => {
      it('matches when contextSize >= contextSizeMin', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Min Context Rule', conditions: { contextSizeMin: 1000 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 1000 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5000 }, 'coding').matched).toBe(true);
      });

      it('does not match when contextSize < contextSizeMin', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Min Context Rule', conditions: { contextSizeMin: 1000 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 999 }, 'coding').matched).toBe(false);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 0 }, 'coding').matched).toBe(false);
      });

      it('matches when contextSize <= contextSizeMax', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Max Context Rule', conditions: { contextSizeMax: 5000 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5000 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 100 }, 'coding').matched).toBe(true);
      });

      it('does not match when contextSize > contextSizeMax', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Max Context Rule', conditions: { contextSizeMax: 5000 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5001 }, 'coding').matched).toBe(false);
      });

      it('matches when contextSize is within [contextSizeMin, contextSizeMax] range', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Range Rule', conditions: { contextSizeMin: 1000, contextSizeMax: 5000 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 1000 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 3000 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5000 }, 'coding').matched).toBe(true);
      });

      it('does not match when contextSize is outside [contextSizeMin, contextSizeMax] range', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Range Rule', conditions: { contextSizeMin: 1000, contextSizeMax: 5000 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 999 }, 'coding').matched).toBe(false);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5001 }, 'coding').matched).toBe(false);
      });
    });

    describe('codeComplexity conditions', () => {
      it('matches when codeComplexity >= codeComplexityMin', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Min Complexity Rule', conditions: { codeComplexityMin: 80 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 80 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 100 }, 'coding').matched).toBe(true);
      });

      it('does not match when codeComplexity < codeComplexityMin', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Min Complexity Rule', conditions: { codeComplexityMin: 80 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 79 }, 'coding').matched).toBe(false);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 0 }, 'coding').matched).toBe(false);
      });

      it('matches when codeComplexity <= codeComplexityMax', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Max Complexity Rule', conditions: { codeComplexityMax: 50 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 50 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 0 }, 'coding').matched).toBe(true);
      });

      it('does not match when codeComplexity > codeComplexityMax', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Max Complexity Rule', conditions: { codeComplexityMax: 50 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 51 }, 'coding').matched).toBe(false);
      });

      it('matches when codeComplexity is within [codeComplexityMin, codeComplexityMax] range', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Complexity Range Rule', conditions: { codeComplexityMin: 20, codeComplexityMax: 80 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 20 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 50 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 80 }, 'coding').matched).toBe(true);
      });

      it('does not match when codeComplexity is outside [codeComplexityMin, codeComplexityMax] range', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Complexity Range Rule', conditions: { codeComplexityMin: 20, codeComplexityMax: 80 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 19 }, 'coding').matched).toBe(false);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 81 }, 'coding').matched).toBe(false);
      });
    });

    describe('multi-condition rules', () => {
      it('matches only when ALL conditions are satisfied', async () => {
        await seedRules([
          makeRule({
            id: 'r1',
            name: 'Multi-condition Rule',
            conditions: {
              taskTypes: ['coding'],
              contextSizeMin: 1000,
              contextSizeMax: 10000,
              codeComplexityMin: 30,
              codeComplexityMax: 90,
            },
          }),
        ]);

        // All conditions met
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5000, codeComplexity: 60 }, 'coding').matched).toBe(true);

        // Wrong task type
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5000, codeComplexity: 60 }, 'reasoning').matched).toBe(false);

        // Context too small
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 500, codeComplexity: 60 }, 'coding').matched).toBe(false);

        // Context too large
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 20000, codeComplexity: 60 }, 'coding').matched).toBe(false);

        // Complexity too low
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5000, codeComplexity: 10 }, 'coding').matched).toBe(false);

        // Complexity too high
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 5000, codeComplexity: 95 }, 'coding').matched).toBe(false);
      });
    });

    describe('priority ordering', () => {
      it('returns the highest-priority matching rule first', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Low Priority', priority: 10, conditions: { taskTypes: ['coding'] } }),
          makeRule({ id: 'r2', name: 'High Priority', priority: 90, conditions: { taskTypes: ['coding'] } }),
          makeRule({ id: 'r3', name: 'Mid Priority', priority: 50, conditions: { taskTypes: ['coding'] } }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
        expect(result.rule?.name).toBe('High Priority');
        expect(result.rule?.priority).toBe(90);
      });

      it('falls through to lower-priority rule when higher-priority rule does not match', async () => {
        await seedRules([
          makeRule({
            id: 'r1',
            name: 'High Priority Specific',
            priority: 90,
            conditions: { taskTypes: ['reasoning'] }, // won't match 'coding'
          }),
          makeRule({
            id: 'r2',
            name: 'Low Priority General',
            priority: 10,
            conditions: {}, // matches everything
          }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
        expect(result.rule?.name).toBe('Low Priority General');
      });

      it('returns the first match and does not evaluate remaining rules', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'First Match', priority: 80, conditions: {} }),
          makeRule({ id: 'r2', name: 'Second Match', priority: 60, conditions: {} }),
          makeRule({ id: 'r3', name: 'Third Match', priority: 40, conditions: {} }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
        expect(result.rule?.name).toBe('First Match');
      });
    });

    describe('match result structure', () => {
      it('returns matched rule object on success', async () => {
        await seedRules([
          makeRule({
            id: 'r1',
            name: 'Test Rule',
            priority: 75,
            targetProvider: 'anthropic',
            targetModel: 'claude-3-opus-20240229',
            conditions: { taskTypes: ['coding'] },
          }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
        expect(result.rule).toBeDefined();
        expect(result.rule?.id).toBe('r1');
        expect(result.rule?.name).toBe('Test Rule');
        expect(result.rule?.priority).toBe(75);
        expect(result.rule?.targetProvider).toBe('anthropic');
        expect(result.rule?.targetModel).toBe('claude-3-opus-20240229');
      });

      it('includes rule name and priority in the reason string on match', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'My Rule', priority: 42, conditions: {} }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'coding');
        expect(result.matched).toBe(true);
        expect(result.reason).toContain('My Rule');
        expect(result.reason).toContain('42');
      });

      it('returns matched=false with reason and no rule on no match', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Coding Only', conditions: { taskTypes: ['coding'] } }),
        ]);

        const result = engine.matchRule(baseAnalysis, 'reasoning');
        expect(result.matched).toBe(false);
        expect(result.reason).toBe('No custom rules matched');
        expect(result.rule).toBeUndefined();
      });
    });

    describe('boundary values', () => {
      it('matches at exact contextSizeMin boundary', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Boundary Rule', conditions: { contextSizeMin: 500 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 500 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 499 }, 'coding').matched).toBe(false);
      });

      it('matches at exact contextSizeMax boundary', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Boundary Rule', conditions: { contextSizeMax: 500 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, contextSize: 500 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, contextSize: 501 }, 'coding').matched).toBe(false);
      });

      it('matches at exact codeComplexityMin boundary', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Boundary Rule', conditions: { codeComplexityMin: 80 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 80 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 79 }, 'coding').matched).toBe(false);
      });

      it('matches at exact codeComplexityMax boundary', async () => {
        await seedRules([
          makeRule({ id: 'r1', name: 'Boundary Rule', conditions: { codeComplexityMax: 80 } }),
        ]);

        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 80 }, 'coding').matched).toBe(true);
        expect(engine.matchRule({ ...baseAnalysis, codeComplexity: 81 }, 'coding').matched).toBe(false);
      });
    });
  });
});
