/**
 * DecisionExplainer - 路由决策解释器
 *
 * 功能：
 * - 生成人类可读的路由决策摘要
 * - 包含任务类型、复杂度、选择的模型和原因
 * - 说明预算影响（如超支）
 * - 标注使用的自定义规则
 *
 * 对应需求：Requirement 9
 */

import { TaskType } from './task-classifier';
import { AnalysisResult } from './multi-dim-analyzer';
import { ModelSelectionResult } from './model-selector';
import { BudgetStatus } from './budget-checker';
import { CustomRule } from './custom-rules-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DecisionExplanation {
  summary: string;
  details: {
    taskType: string;
    complexity: string;
    selectedModel: string;
    reason: string;
    estimatedCost: string;
    estimatedTime: string;
    budgetImpact?: string;
    customRule?: string;
  };
}

// Estimated response time ranges per provider (seconds)
const PROVIDER_TIME_ESTIMATES: Record<string, { min: number; max: number }> = {
  anthropic: { min: 2, max: 5 },
  openai:    { min: 1, max: 4 },
  google:    { min: 1, max: 3 },
  lmstudio:  { min: 3, max: 8 },
};

// ─── DecisionExplainer ────────────────────────────────────────────────────────

export class DecisionExplainer {
  /**
   * Generate a human-readable explanation of the routing decision.
   */
  explain(
    taskType: TaskType,
    analysis: AnalysisResult,
    selection: ModelSelectionResult,
    budgetStatus: BudgetStatus,
    customRule?: CustomRule
  ): DecisionExplanation {
    // Build summary
    let summary = `Selected ${selection.modelName} for ${taskType} task`;
    if (customRule) summary += ' (custom rule applied)';
    if (selection.usesExtendedThinking) summary += ' with Extended Thinking';
    if (selection.usesPromptCaching) summary += ' + Prompt Caching';

    // Format complexity
    const complexity = this.formatComplexity(analysis.codeComplexity);

    // Format cost (cents → dollars)
    const estimatedCost = this.formatCost(selection.estimatedCost);

    // Format estimated time
    const estimatedTime = this.formatTime(selection.provider);

    // Budget impact (only when over budget)
    let budgetImpact: string | undefined;
    if (!budgetStatus.withinBudget) {
      const pct = Math.round(budgetStatus.percentageUsed);
      budgetImpact = `⚠️ Budget exceeded (${pct}% used).`;
      if (budgetStatus.recommendedModel) {
        budgetImpact += ` Recommended: ${budgetStatus.recommendedModel}`;
      }
    }

    // Custom rule annotation
    let customRuleNote: string | undefined;
    if (customRule) {
      customRuleNote = `Using custom rule: ${customRule.name} (priority: ${customRule.priority})`;
    }

    return {
      summary,
      details: {
        taskType,
        complexity,
        selectedModel: selection.modelName,
        reason: selection.reason,
        estimatedCost,
        estimatedTime,
        ...(budgetImpact   ? { budgetImpact }   : {}),
        ...(customRuleNote ? { customRule: customRuleNote } : {}),
      },
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Format complexity score as a human-readable label with score.
   * e.g. "Low (15/100)", "Medium (45/100)", "High (85/100)"
   */
  formatComplexity(score: number): string {
    let label: string;
    if (score < 30) {
      label = 'Low';
    } else if (score < 70) {
      label = 'Medium';
    } else {
      label = 'High';
    }
    return `${label} (${score}/100)`;
  }

  /**
   * Format cost in cents as a dollar string.
   * e.g. 42 cents → "$0.0042"
   */
  formatCost(cents: number): string {
    const dollars = cents / 100;
    return `$${dollars.toFixed(4)}`;
  }

  /**
   * Format estimated response time for a provider.
   * e.g. "2-5s"
   */
  formatTime(provider: string): string {
    const range = PROVIDER_TIME_ESTIMATES[provider] ?? { min: 1, max: 5 };
    return `${range.min}-${range.max}s`;
  }
}
