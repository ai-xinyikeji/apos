/**
 * Tests for DecisionExplainer
 */

import { DecisionExplainer } from '../decision-explainer';
import { AnalysisResult } from '../multi-dim-analyzer';
import { ModelSelectionResult } from '../model-selector';
import { BudgetStatus } from '../budget-checker';
import { CustomRule } from '../custom-rules-engine';
import { TaskType } from '../task-classifier';

describe('DecisionExplainer', () => {
  let explainer: DecisionExplainer;

  const baseAnalysis: AnalysisResult = {
    contextSize: 1000,
    codeComplexity: 45,
    estimatedCost: 0.003,
    requiresExtendedThinking: false,
  };

  const baseSelection: ModelSelectionResult = {
    provider: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
    reason: 'Default model for task type: coding',
    estimatedCost: 30, // 30 cents
    usesExtendedThinking: false,
    usesPromptCaching: false,
  };

  const withinBudget: BudgetStatus = {
    withinBudget: true,
    currentSpend: 500,
    budgetLimit: 10000,
    percentageUsed: 5,
  };

  const overBudget: BudgetStatus = {
    withinBudget: false,
    currentSpend: 10500,
    budgetLimit: 10000,
    percentageUsed: 105,
    recommendedModel: 'claude-3-5-haiku-20241022',
  };

  beforeEach(() => {
    explainer = new DecisionExplainer();
  });

  // ── explain() ─────────────────────────────────────────────────────────────

  describe('explain()', () => {
    it('generates a summary with model name and task type', () => {
      const result = explainer.explain('coding', baseAnalysis, baseSelection, withinBudget);
      expect(result.summary).toContain('claude-3-5-sonnet-20241022');
      expect(result.summary).toContain('coding');
    });

    it('includes all required detail fields', () => {
      const result = explainer.explain('coding', baseAnalysis, baseSelection, withinBudget);
      expect(result.details.taskType).toBe('coding');
      expect(result.details.complexity).toBeDefined();
      expect(result.details.selectedModel).toBe('claude-3-5-sonnet-20241022');
      expect(result.details.reason).toBeDefined();
      expect(result.details.estimatedCost).toBeDefined();
      expect(result.details.estimatedTime).toBeDefined();
    });

    it('does not include budgetImpact when within budget', () => {
      const result = explainer.explain('coding', baseAnalysis, baseSelection, withinBudget);
      expect(result.details.budgetImpact).toBeUndefined();
    });

    it('includes budgetImpact when over budget', () => {
      const result = explainer.explain('coding', baseAnalysis, baseSelection, overBudget);
      expect(result.details.budgetImpact).toBeDefined();
      expect(result.details.budgetImpact).toContain('⚠️');
      expect(result.details.budgetImpact).toContain('105%');
      expect(result.details.budgetImpact).toContain('claude-3-5-haiku-20241022');
    });

    it('does not include customRule when no rule provided', () => {
      const result = explainer.explain('coding', baseAnalysis, baseSelection, withinBudget);
      expect(result.details.customRule).toBeUndefined();
    });

    it('includes customRule annotation when rule is provided', () => {
      const rule: CustomRule = {
        id: 'r1',
        name: 'High Complexity Code',
        priority: 90,
        enabled: true,
        conditions: {},
        targetProvider: 'anthropic',
        targetModel: 'claude-3-opus-20240229',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = explainer.explain('coding', baseAnalysis, baseSelection, withinBudget, rule);
      expect(result.details.customRule).toContain('High Complexity Code');
      expect(result.details.customRule).toContain('90');
    });

    it('adds "(custom rule applied)" to summary when rule is provided', () => {
      const rule: CustomRule = {
        id: 'r1', name: 'My Rule', priority: 50, enabled: true,
        conditions: {}, targetProvider: 'anthropic', targetModel: 'claude-3-opus-20240229',
        createdAt: new Date(), updatedAt: new Date(),
      };
      const result = explainer.explain('coding', baseAnalysis, baseSelection, withinBudget, rule);
      expect(result.summary).toContain('custom rule applied');
    });

    it('adds "with Extended Thinking" to summary when used', () => {
      const extSelection = { ...baseSelection, usesExtendedThinking: true };
      const result = explainer.explain('reasoning', baseAnalysis, extSelection, withinBudget);
      expect(result.summary).toContain('Extended Thinking');
    });

    it('adds "+ Prompt Caching" to summary when used', () => {
      const cacheSelection = { ...baseSelection, usesPromptCaching: true };
      const result = explainer.explain('coding', baseAnalysis, cacheSelection, withinBudget);
      expect(result.summary).toContain('Prompt Caching');
    });

    it('works for all task types', () => {
      const taskTypes: TaskType[] = ['reasoning', 'coding', 'summarize', 'refactor', 'review', 'planning', 'explain', 'default'];
      for (const taskType of taskTypes) {
        const result = explainer.explain(taskType, baseAnalysis, baseSelection, withinBudget);
        expect(result.summary).toContain(taskType);
        expect(result.details.taskType).toBe(taskType);
      }
    });
  });

  // ── formatComplexity() ────────────────────────────────────────────────────

  describe('formatComplexity()', () => {
    it('formats score < 30 as Low', () => {
      expect(explainer.formatComplexity(0)).toBe('Low (0/100)');
      expect(explainer.formatComplexity(15)).toBe('Low (15/100)');
      expect(explainer.formatComplexity(29)).toBe('Low (29/100)');
    });

    it('formats score 30-69 as Medium', () => {
      expect(explainer.formatComplexity(30)).toBe('Medium (30/100)');
      expect(explainer.formatComplexity(45)).toBe('Medium (45/100)');
      expect(explainer.formatComplexity(69)).toBe('Medium (69/100)');
    });

    it('formats score >= 70 as High', () => {
      expect(explainer.formatComplexity(70)).toBe('High (70/100)');
      expect(explainer.formatComplexity(85)).toBe('High (85/100)');
      expect(explainer.formatComplexity(100)).toBe('High (100/100)');
    });
  });

  // ── formatCost() ──────────────────────────────────────────────────────────

  describe('formatCost()', () => {
    it('formats 0 cents as $0.0000', () => {
      expect(explainer.formatCost(0)).toBe('$0.0000');
    });

    it('formats 100 cents as $1.0000', () => {
      expect(explainer.formatCost(100)).toBe('$1.0000');
    });

    it('formats fractional cents correctly', () => {
      expect(explainer.formatCost(42)).toBe('$0.4200');
      expect(explainer.formatCost(1)).toBe('$0.0100');
    });

    it('formats small costs with 4 decimal places', () => {
      expect(explainer.formatCost(0.3)).toBe('$0.0030');
    });
  });

  // ── formatTime() ──────────────────────────────────────────────────────────

  describe('formatTime()', () => {
    it('returns time range for anthropic', () => {
      expect(explainer.formatTime('anthropic')).toBe('2-5s');
    });

    it('returns time range for openai', () => {
      expect(explainer.formatTime('openai')).toBe('1-4s');
    });

    it('returns time range for google', () => {
      expect(explainer.formatTime('google')).toBe('1-3s');
    });

    it('returns time range for lmstudio', () => {
      expect(explainer.formatTime('lmstudio')).toBe('3-8s');
    });

    it('returns default range for unknown provider', () => {
      expect(explainer.formatTime('unknown')).toBe('1-5s');
    });
  });
});
