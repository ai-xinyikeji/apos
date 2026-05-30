/**
 * ModelSelector - 增强型模型选择器
 *
 * 功能：
 * - 根据任务类型、多维分析结果和预算状态选择最优模型
 * - 支持 claude-3-7-sonnet Extended Thinking
 * - 支持 Prompt Caching 判断
 * - 集成 BudgetChecker
 * - 支持自定义规则覆盖
 *
 * 对应需求：Requirement 1, 4, 5, 10
 */

import { TaskType } from './task-classifier';
import { AnalysisResult } from './multi-dim-analyzer';
import { BudgetChecker, BudgetStatus, BudgetPeriod } from './budget-checker';
import { CustomRule } from './custom-rules-engine';
import { db } from '../db';
import { settings } from '../schema';
import { sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelSelectionResult {
  provider: string;
  modelName: string;
  reason: string;
  estimatedCost: number;       // cents
  usesExtendedThinking: boolean;
  usesPromptCaching: boolean;
}

// ─── Model pricing (input cost per 1M tokens, in cents) ──────────────────────

export const MODEL_PRICING: Record<string, Record<string, {
  input: number;   // cents per 1M tokens
  output: number;  // cents per 1M tokens
  cacheWrite?: number;
  cacheRead?: number;
}>> = {
  anthropic: {
    'claude-3-5-sonnet-20241022': { input: 300,   output: 1500,  cacheWrite: 375,  cacheRead: 30  },
    'claude-3-5-haiku-20241022':  { input: 80,    output: 400,   cacheWrite: 100,  cacheRead: 8   },
    'claude-3-opus-20240229':     { input: 1500,  output: 7500,  cacheWrite: 1875, cacheRead: 150 },
    'claude-3-7-sonnet-20250219': { input: 300,   output: 1500,  cacheWrite: 375,  cacheRead: 30  },
  },
  openai: {
    'gpt-4o':      { input: 250,  output: 1000 },
    'gpt-4o-mini': { input: 15,   output: 60   },
  },
  google: {
    'gemini-1.5-pro-latest': { input: 125, output: 500  },
    'gemini-1.5-flash':      { input: 7,   output: 30   },
  },
  ollama: {
    '*': { input: 0, output: 0 },
  },
};

// Default task-type → model mapping
const TASK_TYPE_MODEL_MAP: Record<TaskType, { provider: string; model: string }> = {
  reasoning: { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219' },
  planning:  { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219' },
  coding:    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  refactor:  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  review:    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  explain:   { provider: 'anthropic', model: 'claude-3-5-haiku-20241022'  },
  summarize: { provider: 'anthropic', model: 'claude-3-5-haiku-20241022'  },
  default:   { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
};

// Prompt caching thresholds (tokens)
const PROMPT_CACHE_SYSTEM_THRESHOLD = 1024;
const PROMPT_CACHE_USER_THRESHOLD   = 2048;

// ─── ModelSelector ────────────────────────────────────────────────────────────

export class ModelSelector {
  private budgetChecker: BudgetChecker;
  private settingsCache: Map<string, string> = new Map();
  private settingsCacheExpiry = 0;
  private readonly SETTINGS_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(budgetChecker?: BudgetChecker) {
    this.budgetChecker = budgetChecker ?? new BudgetChecker();
  }

  /**
   * Select the optimal model for the given task.
   *
   * Priority order:
   * 1. Custom rule override (if provided)
   * 2. Budget constraint (downgrade if over budget)
   * 3. Extended Thinking (upgrade to claude-3-7-sonnet if needed)
   * 4. Default task-type mapping
   */
  async select(
    taskType: TaskType,
    analysis: AnalysisResult,
    customRule?: CustomRule
  ): Promise<{ selection: ModelSelectionResult; budgetStatus: BudgetStatus }> {
    // Load settings
    const cfg = await this.loadSettings();

    // 1. Start with default model for task type
    let { provider, model } = TASK_TYPE_MODEL_MAP[taskType] ?? TASK_TYPE_MODEL_MAP.default;
    let reason = `Default model for task type: ${taskType}`;

    // 2. Apply custom rule override
    if (customRule) {
      provider = customRule.targetProvider;
      model = customRule.targetModel;
      reason = `Custom rule: ${customRule.name} (priority: ${customRule.priority})`;
    }

    // 3. Determine Extended Thinking
    const extendedThinkingEnabled = cfg.get('enable_extended_thinking') === 'true';
    const usesExtendedThinking = extendedThinkingEnabled
      ? this.shouldUseExtendedThinking(taskType, analysis)
      : false;

    if (usesExtendedThinking && provider === 'anthropic' && !customRule) {
      model = 'claude-3-7-sonnet-20250219';
      reason += ' + Extended Thinking';
    }

    // 4. Estimate cost
    const estimatedCost = this.estimateCost(provider, model, analysis.contextSize);

    // 5. Check budget
    const period: BudgetPeriod = 'monthly';
    const budgetStatus = await this.budgetChecker.checkBudget(estimatedCost, period, model);

    // 6. Downgrade if over budget (unless custom rule forced the model)
    if (!budgetStatus.withinBudget && !customRule && budgetStatus.recommendedModel) {
      const downgraded = this.resolveModel(budgetStatus.recommendedModel);
      provider = downgraded.provider;
      model = downgraded.model;
      reason += ` → downgraded to ${model} (budget constraint)`;
    }

    // 7. Determine Prompt Caching
    const promptCachingEnabled = cfg.get('enable_prompt_caching') !== 'false'; // default true
    const usesPromptCaching = promptCachingEnabled
      ? this.shouldUsePromptCaching(analysis.contextSize)
      : false;

    const finalCost = this.estimateCost(provider, model, analysis.contextSize);

    return {
      selection: {
        provider,
        modelName: model,
        reason,
        estimatedCost: finalCost,
        usesExtendedThinking,
        usesPromptCaching,
      },
      budgetStatus,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Determine whether Extended Thinking should be used.
   * Triggers: reasoning/planning task, large context, or high complexity.
   */
  shouldUseExtendedThinking(taskType: TaskType, analysis: AnalysisResult): boolean {
    if (taskType === 'reasoning' || taskType === 'planning') return true;
    if (analysis.contextSize > 50_000) return true;
    if (analysis.codeComplexity > 80) return true;
    return false;
  }

  /**
   * Determine whether Prompt Caching should be applied.
   * Triggers when context exceeds the system prompt threshold.
   */
  shouldUsePromptCaching(contextSize: number): boolean {
    return contextSize > PROMPT_CACHE_SYSTEM_THRESHOLD ||
           contextSize > PROMPT_CACHE_USER_THRESHOLD;
  }

  /**
   * Estimate cost in cents for a given model and context size.
   */
  estimateCost(provider: string, model: string, contextSizeTokens: number): number {
    const providerPricing = MODEL_PRICING[provider];
    if (!providerPricing) return 0;

    const modelPricing = providerPricing[model] ?? providerPricing['*'];
    if (!modelPricing) return 0;

    return (contextSizeTokens / 1_000_000) * modelPricing.input;
  }

  /**
   * Resolve a model name string to provider + model.
   */
  private resolveModel(modelName: string): { provider: string; model: string } {
    if (modelName === 'ollama-local' || modelName === 'lmstudio-local') return { provider: 'ollama', model: '*' };

    for (const [provider, models] of Object.entries(MODEL_PRICING)) {
      if (models[modelName]) return { provider, model: modelName };
    }

    // Fallback: haiku
    return { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' };
  }

  /**
   * Load settings from DB with 5-minute cache.
   */
  private async loadSettings(): Promise<Map<string, string>> {
    if (Date.now() < this.settingsCacheExpiry && this.settingsCache.size > 0) {
      return this.settingsCache;
    }

    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    this.settingsCache = new Map(rows.map(r => [r.key, r.value]));
    this.settingsCacheExpiry = Date.now() + this.SETTINGS_TTL_MS;
    return this.settingsCache;
  }
}
