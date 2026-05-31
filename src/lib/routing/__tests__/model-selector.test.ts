/**
 * Tests for ModelSelector
 */

import { ModelSelector } from '../model-selector';
import { BudgetChecker, BudgetStatus } from '../budget-checker';
import { AnalysisResult } from '../multi-dim-analyzer';
import { TaskType } from '../task-classifier';
import { CustomRule } from '../custom-rules-engine';
import { db } from '../../db';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('../budget-checker');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const withinBudgetStatus: BudgetStatus = {
  withinBudget: true,
  currentSpend: 100,
  budgetLimit: 10000,
  percentageUsed: 1,
};

const overBudgetStatus: BudgetStatus = {
  withinBudget: false,
  currentSpend: 10100,
  budgetLimit: 10000,
  percentageUsed: 101,
  recommendedModel: 'claude-3-5-haiku-20241022',
};

const baseAnalysis: AnalysisResult = {
  contextSize: 1000,
  codeComplexity: 30,
  estimatedCost: 0.003,
  requiresExtendedThinking: false,
};

function mockSettings(entries: Record<string, string>) {
  (db.select as jest.Mock).mockReturnValue({
    from: jest.fn().mockResolvedValue(
      Object.entries(entries).map(([key, value]) => ({ key, value }))
    ),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ModelSelector', () => {
  let selector: ModelSelector;
  let mockBudgetChecker: jest.Mocked<BudgetChecker>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBudgetChecker = new BudgetChecker() as jest.Mocked<BudgetChecker>;
    mockBudgetChecker.checkBudget = jest.fn().mockResolvedValue(withinBudgetStatus);
    selector = new ModelSelector(mockBudgetChecker);
    mockSettings({});
  });

  // ── Default model selection ────────────────────────────────────────────────

  describe('default model selection by task type', () => {
    it('selects claude-3-7-sonnet for reasoning tasks', async () => {
      const { selection } = await selector.select('reasoning', baseAnalysis);
      expect(selection.provider).toBe('anthropic');
      expect(selection.modelName).toBe('claude-3-7-sonnet-20250219');
    });

    it('selects claude-3-7-sonnet for planning tasks', async () => {
      const { selection } = await selector.select('planning', baseAnalysis);
      expect(selection.modelName).toBe('claude-3-7-sonnet-20250219');
    });

    it('selects claude-3-5-sonnet for coding tasks', async () => {
      const { selection } = await selector.select('coding', baseAnalysis);
      expect(selection.modelName).toBe('claude-3-5-sonnet-20241022');
    });

    it('selects claude-3-5-haiku for summarize tasks', async () => {
      const { selection } = await selector.select('summarize', baseAnalysis);
      expect(selection.modelName).toBe('claude-3-5-haiku-20241022');
    });

    it('selects claude-3-5-haiku for explain tasks', async () => {
      const { selection } = await selector.select('explain', baseAnalysis);
      expect(selection.modelName).toBe('claude-3-5-haiku-20241022');
    });

    it('selects claude-3-5-sonnet for default tasks', async () => {
      const { selection } = await selector.select('default', baseAnalysis);
      expect(selection.modelName).toBe('claude-3-5-sonnet-20241022');
    });
  });

  // ── Custom rule override ───────────────────────────────────────────────────

  describe('custom rule override', () => {
    const customRule: CustomRule = {
      id: 'rule-1',
      name: 'Force Opus',
      priority: 90,
      enabled: true,
      conditions: {},
      targetProvider: 'anthropic',
      targetModel: 'claude-3-opus-20240229',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('uses custom rule model when provided', async () => {
      const { selection } = await selector.select('coding', baseAnalysis, customRule);
      expect(selection.provider).toBe('anthropic');
      expect(selection.modelName).toBe('claude-3-opus-20240229');
    });

    it('includes custom rule name in reason', async () => {
      const { selection } = await selector.select('coding', baseAnalysis, customRule);
      expect(selection.reason).toContain('Force Opus');
    });

    it('does not downgrade custom rule model even when over budget', async () => {
      mockBudgetChecker.checkBudget.mockResolvedValue(overBudgetStatus);
      const { selection } = await selector.select('coding', baseAnalysis, customRule);
      expect(selection.modelName).toBe('claude-3-opus-20240229');
    });
  });

  // ── Extended Thinking ──────────────────────────────────────────────────────

  describe('Extended Thinking', () => {
    it('does not use Extended Thinking when disabled in settings', async () => {
      mockSettings({ enable_extended_thinking: 'false' });
      const { selection } = await selector.select('reasoning', baseAnalysis);
      expect(selection.usesExtendedThinking).toBe(false);
    });

    it('uses Extended Thinking for reasoning when enabled', async () => {
      mockSettings({ enable_extended_thinking: 'true' });
      const { selection } = await selector.select('reasoning', baseAnalysis);
      expect(selection.usesExtendedThinking).toBe(true);
      expect(selection.modelName).toBe('claude-3-7-sonnet-20250219');
    });

    it('uses Extended Thinking for large context when enabled', async () => {
      mockSettings({ enable_extended_thinking: 'true' });
      const largeContext: AnalysisResult = { ...baseAnalysis, contextSize: 60_000 };
      const { selection } = await selector.select('coding', largeContext);
      expect(selection.usesExtendedThinking).toBe(true);
    });

    it('uses Extended Thinking for high complexity when enabled', async () => {
      mockSettings({ enable_extended_thinking: 'true' });
      const highComplexity: AnalysisResult = { ...baseAnalysis, codeComplexity: 85 };
      const { selection } = await selector.select('coding', highComplexity);
      expect(selection.usesExtendedThinking).toBe(true);
    });
  });

  // ── Prompt Caching ─────────────────────────────────────────────────────────

  describe('Prompt Caching', () => {
    it('applies prompt caching for large context by default', async () => {
      const largeContext: AnalysisResult = { ...baseAnalysis, contextSize: 2000 };
      const { selection } = await selector.select('coding', largeContext);
      expect(selection.usesPromptCaching).toBe(true);
    });

    it('does not apply prompt caching for small context', async () => {
      const smallContext: AnalysisResult = { ...baseAnalysis, contextSize: 500 };
      const { selection } = await selector.select('coding', smallContext);
      expect(selection.usesPromptCaching).toBe(false);
    });

    it('does not apply prompt caching when disabled in settings', async () => {
      mockSettings({ enable_prompt_caching: 'false' });
      const largeContext: AnalysisResult = { ...baseAnalysis, contextSize: 5000 };
      const { selection } = await selector.select('coding', largeContext);
      expect(selection.usesPromptCaching).toBe(false);
    });
  });

  // ── Budget constraint ──────────────────────────────────────────────────────

  describe('budget constraint', () => {
    it('downgrades model when over budget', async () => {
      mockBudgetChecker.checkBudget.mockResolvedValue(overBudgetStatus);
      const { selection } = await selector.select('coding', baseAnalysis);
      expect(selection.modelName).toBe('claude-3-5-haiku-20241022');
      expect(selection.reason).toContain('budget constraint');
    });

    it('returns budget status in result', async () => {
      const { budgetStatus } = await selector.select('coding', baseAnalysis);
      expect(budgetStatus).toBeDefined();
      expect(budgetStatus.withinBudget).toBe(true);
    });
  });

  // ── shouldUseExtendedThinking ──────────────────────────────────────────────

  describe('shouldUseExtendedThinking', () => {
    it('returns true for reasoning', () => {
      expect(selector.shouldUseExtendedThinking('reasoning', baseAnalysis)).toBe(true);
    });

    it('returns true for planning', () => {
      expect(selector.shouldUseExtendedThinking('planning', baseAnalysis)).toBe(true);
    });

    it('returns false for coding with small context', () => {
      expect(selector.shouldUseExtendedThinking('coding', baseAnalysis)).toBe(false);
    });

    it('returns true for large context', () => {
      expect(selector.shouldUseExtendedThinking('coding', { ...baseAnalysis, contextSize: 51_000 })).toBe(true);
    });

    it('returns true for high complexity', () => {
      expect(selector.shouldUseExtendedThinking('coding', { ...baseAnalysis, codeComplexity: 81 })).toBe(true);
    });
  });

  // ── shouldUsePromptCaching ─────────────────────────────────────────────────

  describe('shouldUsePromptCaching', () => {
    it('returns false for context below threshold', () => {
      expect(selector.shouldUsePromptCaching(500)).toBe(false);
    });

    it('returns true for context above system prompt threshold', () => {
      expect(selector.shouldUsePromptCaching(1025)).toBe(true);
    });

    it('returns true for context above user message threshold', () => {
      expect(selector.shouldUsePromptCaching(2049)).toBe(true);
    });
  });

  // ── estimateCost ───────────────────────────────────────────────────────────

  describe('estimateCost', () => {
    it('returns 0 for lmstudio', () => {
      expect(selector.estimateCost('lmstudio', '*', 10000)).toBe(0);
    });

    it('calculates cost for anthropic sonnet', () => {
      // 1M tokens = 300 cents, so 1000 tokens = 0.3 cents
      const cost = selector.estimateCost('anthropic', 'claude-3-5-sonnet-20241022', 1_000_000);
      expect(cost).toBe(300);
    });

    it('returns 0 for unknown provider', () => {
      expect(selector.estimateCost('unknown', 'model', 1000)).toBe(0);
    });
  });
});
