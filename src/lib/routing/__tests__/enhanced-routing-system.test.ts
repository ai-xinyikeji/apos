/**
 * Integration tests for EnhancedRoutingSystem
 */

import { EnhancedRoutingSystem } from '../enhanced-routing-system';
import { db } from '../../db';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupDbMocks() {
  // Default: no custom rules, no cost records, no budget settings
  // Must support both:
  //   db.select().from()           → returns array (for loadRules, getBudgetConfig, loadSettings)
  //   db.select().from().where()   → returns array (for getCurrentSpend, getBudgetLimit)
  (db.select as jest.Mock).mockImplementation(() => {
    const chain = {
      from: jest.fn().mockImplementation(() => {
        // Return a thenable that also has .where()
        const fromResult = {
          then: (resolve: (v: unknown[]) => void) => resolve([]),
          where: jest.fn().mockResolvedValue([]),
        };
        return fromResult;
      }),
    };
    return chain;
  });
  (db.insert as jest.Mock).mockReturnValue({
    values: jest.fn().mockResolvedValue(undefined),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EnhancedRoutingSystem', () => {
  let system: EnhancedRoutingSystem;

  beforeEach(() => {
    jest.clearAllMocks();
    setupDbMocks();
    system = new EnhancedRoutingSystem();
  });

  // ── Basic routing ──────────────────────────────────────────────────────────

  describe('route()', () => {
    it('returns a complete routing result', async () => {
      const result = await system.route({ prompt: 'Write a function to sort an array' });

      expect(result.decisionId).toBeDefined();
      expect(result.taskType).toBeDefined();
      expect(result.classification).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.selection).toBeDefined();
      expect(result.budgetStatus).toBeDefined();
      expect(result.explanation).toBeDefined();
      expect(result.routingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('classifies coding prompts correctly', async () => {
      const result = await system.route({ prompt: 'Write a function to sort an array' });
      expect(result.taskType).toBe('coding');
    });

    it('classifies reasoning prompts correctly', async () => {
      const result = await system.route({ prompt: 'Why is quicksort faster than bubble sort? Analyze the trade-offs' });
      expect(result.taskType).toBe('reasoning');
    });

    it('respects manual task type override', async () => {
      const result = await system.route({
        prompt: 'Write a function',
        taskType: 'planning',
      });
      expect(result.taskType).toBe('planning');
    });

    it('handles manual model override', async () => {
      const result = await system.route({
        prompt: 'Write a function',
        manualModel: 'claude-3-5-haiku-20241022',
      });
      expect(result.selection.modelName).toBe('claude-3-5-haiku-20241022');
      expect(result.manualOverride).toBe(true);
    });

    it('sets manualOverride=false for normal routing', async () => {
      const result = await system.route({ prompt: 'Summarize this text' });
      expect(result.manualOverride).toBe(false);
    });

    it('generates unique decision IDs', async () => {
      const r1 = await system.route({ prompt: 'Write a function' });
      const r2 = await system.route({ prompt: 'Summarize this' });
      expect(r1.decisionId).not.toBe(r2.decisionId);
    });

    it('includes routing time in result', async () => {
      const result = await system.route({ prompt: 'Write a function' });
      expect(typeof result.routingTimeMs).toBe('number');
      expect(result.routingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('completes routing within 500ms (generous limit for test env)', async () => {
      const start = Date.now();
      await system.route({ prompt: 'Write a function to sort an array' });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it('persists decision to database asynchronously', async () => {
      await system.route({ prompt: 'Write a function' });
      // Give async persist a chance to run
      await new Promise(r => setTimeout(r, 50));
      expect(db.insert).toHaveBeenCalled();
    });

    it('does not throw when DB persist fails', async () => {
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockRejectedValue(new Error('DB error')),
      });
      // Should not throw
      await expect(system.route({ prompt: 'Write a function' })).resolves.toBeDefined();
    });

    it('includes explanation with summary and details', async () => {
      const result = await system.route({ prompt: 'Write a function to sort an array' });
      expect(result.explanation.summary).toBeDefined();
      expect(result.explanation.details.taskType).toBeDefined();
      expect(result.explanation.details.selectedModel).toBeDefined();
      expect(result.explanation.details.estimatedCost).toBeDefined();
    });

    it('handles empty prompt gracefully', async () => {
      const result = await system.route({ prompt: '' });
      expect(result.taskType).toBe('default');
    });

    it('passes userId to persisted decision', async () => {
      const insertValues = jest.fn().mockResolvedValue(undefined);
      (db.insert as jest.Mock).mockReturnValue({ values: insertValues });

      await system.route({ prompt: 'Write a function', userId: 'user-123' });
      await new Promise(r => setTimeout(r, 50));

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' })
      );
    });
  });

  // ── Analysis ───────────────────────────────────────────────────────────────

  describe('analysis', () => {
    it('calculates context size from prompt', async () => {
      const prompt = 'a'.repeat(4000); // ~1000 tokens
      const result = await system.route({ prompt });
      expect(result.analysis.contextSize).toBeCloseTo(1000, -1);
    });

    it('detects code complexity in prompts with code', async () => {
      const prompt = `
        Review this code:
        \`\`\`
        function foo() {
          if (true) {
            for (let i = 0; i < 10; i++) {
              while (i > 0) { i--; }
            }
          }
        }
        \`\`\`
      `;
      const result = await system.route({ prompt });
      expect(result.analysis.codeComplexity).toBeGreaterThan(0);
    });
  });
});
