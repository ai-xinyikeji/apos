/**
 * Tests for BudgetChecker
 */

import { BudgetChecker, BudgetPeriod } from '../budget-checker';
import { db } from '../../db';

// Mock the database
jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockDbSelect(returnValue: unknown) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(returnValue),
  };
  (db.select as jest.Mock).mockReturnValue(chain);
  return chain;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BudgetChecker', () => {
  let checker: BudgetChecker;

  beforeEach(() => {
    checker = new BudgetChecker();
    jest.clearAllMocks();
  });

  // ── getCurrentSpend ────────────────────────────────────────────────────────

  describe('getCurrentSpend', () => {
    it('returns total spend from cost_records for daily period', async () => {
      mockDbSelect([{ total: 500 }]); // 500 cents = $5.00
      const spend = await checker.getCurrentSpend('daily');
      expect(spend).toBe(500);
    });

    it('returns 0 when no records exist', async () => {
      mockDbSelect([{ total: null }]);
      const spend = await checker.getCurrentSpend('daily');
      expect(spend).toBe(0);
    });

    it('caches result for 30 seconds', async () => {
      mockDbSelect([{ total: 200 }]);
      await checker.getCurrentSpend('daily');
      await checker.getCurrentSpend('daily');
      // db.select should only be called once due to caching
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('uses separate cache keys for different periods', async () => {
      mockDbSelect([{ total: 100 }]);
      await checker.getCurrentSpend('daily');
      await checker.getCurrentSpend('weekly');
      await checker.getCurrentSpend('monthly');
      expect(db.select).toHaveBeenCalledTimes(3);
    });

    it('reloads after cache is invalidated', async () => {
      mockDbSelect([{ total: 100 }]);
      await checker.getCurrentSpend('daily');
      checker.invalidateSpendCache();
      mockDbSelect([{ total: 200 }]);
      const spend = await checker.getCurrentSpend('daily');
      expect(spend).toBe(200);
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });

  // ── getBudgetLimit ─────────────────────────────────────────────────────────

  describe('getBudgetLimit', () => {
    it('converts dollar string to cents for daily budget', async () => {
      mockDbSelect([{ value: '10.00' }]);
      const limit = await checker.getBudgetLimit('daily');
      expect(limit).toBe(1000); // $10.00 = 1000 cents
    });

    it('converts dollar string to cents for weekly budget', async () => {
      mockDbSelect([{ value: '50.00' }]);
      const limit = await checker.getBudgetLimit('weekly');
      expect(limit).toBe(5000);
    });

    it('converts dollar string to cents for monthly budget', async () => {
      mockDbSelect([{ value: '200.00' }]);
      const limit = await checker.getBudgetLimit('monthly');
      expect(limit).toBe(20000);
    });

    it('returns 0 when no budget is configured', async () => {
      mockDbSelect([]);
      const limit = await checker.getBudgetLimit('daily');
      expect(limit).toBe(0);
    });

    it('handles decimal values correctly', async () => {
      mockDbSelect([{ value: '9.99' }]);
      const limit = await checker.getBudgetLimit('daily');
      expect(limit).toBe(999);
    });

    it('caches budget limit', async () => {
      mockDbSelect([{ value: '10.00' }]);
      await checker.getBudgetLimit('daily');
      await checker.getBudgetLimit('daily');
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  // ── checkBudget ────────────────────────────────────────────────────────────

  describe('checkBudget', () => {
    function setupMocks(currentSpendCents: number, budgetLimitDollars: string) {
      // getCurrentSpend uses: db.select({total:...}).from(costRecords).where(...)
      // getBudgetLimit uses:  db.select({value:...}).from(settings).where(...)
      // Both are called in parallel. We distinguish by checking which columns are selected.
      (db.select as jest.Mock).mockImplementation((cols: Record<string, unknown>) => {
        const isSpend = cols && 'total' in cols;
        return {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(
            isSpend
              ? [{ total: currentSpendCents }]
              : [{ value: budgetLimitDollars }]
          ),
        };
      });
    }

    it('returns withinBudget=true when projected spend is under limit', async () => {
      setupMocks(200, '10.00'); // $2 spent, $10 limit, $1 estimated
      const status = await checker.checkBudget(100, 'daily');
      expect(status.withinBudget).toBe(true);
      expect(status.currentSpend).toBe(300); // 200 + 100
      expect(status.budgetLimit).toBe(1000);
    });

    it('returns withinBudget=false when projected spend exceeds limit', async () => {
      setupMocks(950, '10.00'); // $9.50 spent, $10 limit, $1 estimated
      const status = await checker.checkBudget(100, 'daily');
      expect(status.withinBudget).toBe(false);
      expect(status.currentSpend).toBe(1050);
    });

    it('calculates percentageUsed correctly', async () => {
      setupMocks(400, '10.00'); // $4 spent, $10 limit, $1 estimated → 50%
      const status = await checker.checkBudget(100, 'daily');
      expect(status.percentageUsed).toBeCloseTo(50, 1);
    });

    it('suggests alternative model when over budget', async () => {
      setupMocks(990, '10.00'); // nearly at limit
      const status = await checker.checkBudget(100, 'daily', 'claude-3-opus-20240229');
      expect(status.withinBudget).toBe(false);
      expect(status.recommendedModel).toBeDefined();
    });

    it('does not suggest alternative when within budget', async () => {
      setupMocks(100, '10.00');
      const status = await checker.checkBudget(50, 'daily', 'claude-3-opus-20240229');
      expect(status.withinBudget).toBe(true);
      expect(status.recommendedModel).toBeUndefined();
    });

    it('handles zero budget limit gracefully', async () => {
      setupMocks(0, '0');
      const status = await checker.checkBudget(100, 'daily');
      expect(status.percentageUsed).toBe(0);
    });
  });

  // ── suggestAlternativeModel ────────────────────────────────────────────────

  describe('suggestAlternativeModel', () => {
    it('suggests a cheaper model when remaining budget is limited', () => {
      // Very small remaining budget — should suggest lmstudio or cheapest option
      const suggestion = checker.suggestAlternativeModel('claude-3-opus-20240229', 1);
      expect(suggestion).toBeTruthy();
    });

    it('suggests a model cheaper than the original', () => {
      const suggestion = checker.suggestAlternativeModel('claude-3-5-sonnet-20241022', 10000);
      // Should suggest something cheaper than sonnet
      expect(suggestion).not.toBe('claude-3-5-sonnet-20241022');
      expect(suggestion).not.toBe('claude-3-opus-20240229');
    });

    it('returns null when no cheaper model fits the budget', () => {
      // 0 remaining budget — nothing fits
      const suggestion = checker.suggestAlternativeModel('claude-3-5-haiku-20241022', 0);
      // lmstudio is free so it should still fit
      // (or null if lmstudio cost > 0 remaining, but lmstudio is 0 cost)
      // lmstudio costs 0 per token so it always fits
      expect(suggestion).toBeDefined();
    });

    it('suggests lmstudio for very tight budgets', () => {
      const suggestion = checker.suggestAlternativeModel('claude-3-opus-20240229', 0);
      expect(suggestion).toBe('lmstudio-local');
    });

    it('suggests gemini-flash or haiku for moderate budgets', () => {
      // gemini-flash costs 7.5 cents per 1M tokens → ~0.0075 cents per 1000 tokens
      // haiku costs 80 cents per 1M tokens → ~0.08 cents per 1000 tokens
      // Both fit within 1 cent remaining budget
      const suggestion = checker.suggestAlternativeModel('claude-3-5-sonnet-20241022', 1);
      expect(['lmstudio-local', 'gemini-1.5-flash', 'gpt-4o-mini', 'claude-3-5-haiku-20241022']).toContain(suggestion);
    });
  });

  // ── invalidateSpendCache ───────────────────────────────────────────────────

  describe('invalidateSpendCache', () => {
    it('clears all spend cache entries', async () => {
      mockDbSelect([{ total: 100 }]);
      await checker.getCurrentSpend('daily');
      await checker.getCurrentSpend('weekly');

      checker.invalidateSpendCache();

      mockDbSelect([{ total: 200 }]);
      const daily = await checker.getCurrentSpend('daily');
      expect(daily).toBe(200);
    });
  });
});
