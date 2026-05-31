/**
 * EnhancedRoutingSystem - 增强型路由系统
 *
 * 集成所有子组件，提供统一的路由决策入口：
 * - TaskClassifier: 任务类型分类
 * - MultiDimAnalyzer: 多维度分析
 * - CustomRulesEngine: 自定义规则匹配
 * - BudgetChecker: 预算检查
 * - ModelSelector: 模型选择
 * - DecisionExplainer: 决策解释
 *
 * 性能目标：路由决策 < 100ms (P95)
 *
 * 对应需求：Requirement 1, 2, 4, 5, 9, 17
 */

import { TaskClassifier, TaskType, TaskClassificationResult } from './task-classifier';
import { MultiDimAnalyzer, AnalysisResult } from './multi-dim-analyzer';
import { CustomRulesEngine, CustomRule } from './custom-rules-engine';
import { BudgetChecker } from './budget-checker';
import { ModelSelector, ModelSelectionResult } from './model-selector';
import { DecisionExplainer, DecisionExplanation } from './decision-explainer';
import { BudgetStatus } from './budget-checker';
import { db } from '../db';
import { routingDecisions } from '../schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingRequest {
  prompt: string;
  /** Optional: override task type classification */
  taskType?: TaskType;
  /** Optional: force a specific model (manual override) */
  manualModel?: string;
  /** Optional: user ID for multi-user support */
  userId?: string;
}

export interface RoutingResult {
  decisionId: string;
  taskType: TaskType;
  classification: TaskClassificationResult;
  analysis: AnalysisResult;
  selection: ModelSelectionResult;
  budgetStatus: BudgetStatus;
  explanation: DecisionExplanation;
  /** Performance: time taken for routing decision in ms */
  routingTimeMs: number;
  /** Whether a custom rule was applied */
  customRule?: CustomRule;
  /** Whether this was a manual model override */
  manualOverride: boolean;
}

// ─── EnhancedRoutingSystem ────────────────────────────────────────────────────

export class EnhancedRoutingSystem {
  private classifier: TaskClassifier;
  private analyzer: MultiDimAnalyzer;
  private rulesEngine: CustomRulesEngine;
  private budgetChecker: BudgetChecker;
  private modelSelector: ModelSelector;
  private explainer: DecisionExplainer;

  constructor() {
    this.classifier   = new TaskClassifier();
    this.analyzer     = new MultiDimAnalyzer();
    this.rulesEngine  = new CustomRulesEngine();
    this.budgetChecker = new BudgetChecker();
    this.modelSelector = new ModelSelector(this.budgetChecker);
    this.explainer    = new DecisionExplainer();
  }

  /**
   * Make a routing decision for the given request.
   *
   * Full pipeline:
   * 1. Classify task type
   * 2. Multi-dimensional analysis
   * 3. Load and match custom rules
   * 4. Select model (with budget check)
   * 5. Generate explanation
   * 6. Persist decision asynchronously
   *
   * @throws Error if routing fails critically
   */
  async route(request: RoutingRequest): Promise<RoutingResult> {
    const startTime = Date.now();

    try {
      // 1. Task classification
      const classification = this.classifier.classify(request.prompt);
      const taskType: TaskType = request.taskType ?? classification.taskType;

      // 2. Multi-dimensional analysis
      const analysis = this.analyzer.analyze(request.prompt, taskType);

      // 3. Load custom rules and find a match
      await this.rulesEngine.loadRules();
      const ruleMatch = this.rulesEngine.matchRule(analysis, taskType);
      const customRule = ruleMatch.matched ? ruleMatch.rule : undefined;

      // 4. Model selection (with budget check)
      let selection: ModelSelectionResult;
      let budgetStatus: BudgetStatus;

      if (request.manualModel) {
        // Manual override: use the specified model
        const resolved = this.resolveManualModel(request.manualModel);
        selection = {
          provider: resolved.provider,
          modelName: resolved.model,
          reason: `Manual override: ${request.manualModel}`,
          estimatedCost: this.modelSelector.estimateCost(resolved.provider, resolved.model, analysis.contextSize),
          usesExtendedThinking: false,
          usesPromptCaching: this.modelSelector.shouldUsePromptCaching(analysis.contextSize),
        };
        budgetStatus = await this.budgetChecker.checkBudget(selection.estimatedCost, 'monthly', resolved.model);
      } else {
        const result = await this.modelSelector.select(taskType, analysis, customRule);
        selection = result.selection;
        budgetStatus = result.budgetStatus;
      }

      // 5. Generate explanation
      const explanation = this.explainer.explain(
        taskType,
        analysis,
        selection,
        budgetStatus,
        customRule
      );

      const routingTimeMs = Date.now() - startTime;

      // Warn if routing took too long
      if (routingTimeMs > 100) {
        console.warn(`[EnhancedRoutingSystem] Routing took ${routingTimeMs}ms (target: <100ms)`);
      }

      const decisionId = this.generateId();

      const result: RoutingResult = {
        decisionId,
        taskType,
        classification,
        analysis,
        selection,
        budgetStatus,
        explanation,
        routingTimeMs,
        customRule,
        manualOverride: !!request.manualModel,
      };

      // 6. Persist decision asynchronously (non-blocking)
      this.persistDecision(result, request).catch(err => {
        console.error('[EnhancedRoutingSystem] Failed to persist routing decision:', err);
      });

      return result;

    } catch (error) {
      const routingTimeMs = Date.now() - startTime;
      console.error(`[EnhancedRoutingSystem] Routing failed after ${routingTimeMs}ms:`, error);
      throw error;
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolve a manual model name to provider + model.
   */
  private resolveManualModel(modelName: string): { provider: string; model: string } {
    const providerMap: Record<string, string> = {
      'claude-3-5-sonnet-20241022': 'anthropic',
      'claude-3-5-haiku-20241022':  'anthropic',
      'claude-3-opus-20240229':     'anthropic',
      'claude-3-7-sonnet-20250219': 'anthropic',
      'gpt-4o':                     'openai',
      'gpt-4o-mini':                'openai',
      'gemini-1.5-pro-latest':      'google',
      'gemini-1.5-flash':           'google',
    };

    const provider = providerMap[modelName] ?? 'ollama';
    return { provider, model: modelName };
  }

  /**
   * Persist the routing decision to the database asynchronously.
   */
  private async persistDecision(result: RoutingResult, request: RoutingRequest): Promise<void> {
    try {
      await db.insert(routingDecisions).values({
        id: result.decisionId,
        userId: request.userId ?? null,
        taskType: result.taskType,
        promptPreview: request.prompt.slice(0, 200),
        contextSize: result.analysis.contextSize,
        codeComplexity: result.analysis.codeComplexity,
        selectedProvider: result.selection.provider,
        selectedModel: result.selection.modelName,
        decisionReason: result.selection.reason,
        customRuleId: result.customRule?.id ?? null,
        manualOverride: result.manualOverride ? 1 : 0,
        estimatedCost: result.selection.estimatedCost,
        estimatedTime: null,
        usesExtendedThinking: result.selection.usesExtendedThinking ? 1 : 0,
        usesPromptCaching: result.selection.usesPromptCaching ? 1 : 0,
      });
    } catch (error) {
      // Non-critical: log but don't throw
      console.error('[EnhancedRoutingSystem] DB persist error:', error);
    }
  }

  /**
   * Generate a unique ID for the routing decision.
   */
  private generateId(): string {
    return `rd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
