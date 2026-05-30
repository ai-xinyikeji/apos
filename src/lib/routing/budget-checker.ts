/**
 * BudgetChecker - 预算检查器
 *
 * 功能：
 * - 查询当前周期的 API 支出
 * - 读取用户设定的预算限制
 * - 检查预算状态（是否超支）
 * - 建议替代的低成本模型
 * - 查询缓存（30s TTL）以满足 <50ms 性能要求
 *
 * 对应需求：Requirement 1 (§1.4, §1.6, §1.7), Requirement 7
 */

import { db } from '../db';
import { costRecords, settings } from '../schema';
import { gte, sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BudgetStatus {
  withinBudget: boolean;
  currentSpend: number;   // cents
  budgetLimit: number;    // cents
  percentageUsed: number; // 0-100+
  recommendedModel?: string;
}

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

// ─── Model cost table (input cost per 1M tokens, in cents) ───────────────────
// Used to rank models cheapest-first for alternative suggestions.

interface ModelCostEntry {
  provider: string;
  model: string;
  inputCostPerMillion: number; // cents
}

const MODEL_COST_RANKING: ModelCostEntry[] = [
  { provider: 'lmstudio',   model: '*',                          inputCostPerMillion: 0 },
  { provider: 'google',     model: 'gemini-1.5-flash',           inputCostPerMillion: 7.5 },
  { provider: 'google',     model: 'gemini-1.5-pro-latest',      inputCostPerMillion: 125 },
  { provider: 'openai',     model: 'gpt-4o-mini',                inputCostPerMillion: 15 },
  { provider: 'anthropic',  model: 'claude-3-5-haiku-20241022',  inputCostPerMillion: 80 },
  { provider: 'anthropic',  model: 'claude-3-5-sonnet-20241022', inputCostPerMillion: 300 },
  { provider: 'anthropic',  model: 'claude-3-opus-20240229',     inputCostPerMillion: 1500 },
  { provider: 'anthropic',  model: 'claude-3-7-sonnet-20250219', inputCostPerMillion: 300 },
];

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  value: number;
  expiresAt: number;
}

// ─── BudgetChecker ────────────────────────────────────────────────────────────

export class BudgetChecker {
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds
  private spendCache = new Map<string, CacheEntry>();
  private limitCache = new Map<string, CacheEntry>();

  /**
   * Check whether the estimated cost fits within the budget for the given period.
   *
   * @param estimatedCost  Estimated cost in cents for the upcoming request
   * @param period         Budget period to check against
   * @param originalModel  The originally selected model (for alternative suggestion)
   */
  async checkBudget(
    estimatedCost: number,
    period: BudgetPeriod,
    originalModel?: string
  ): Promise<BudgetStatus> {
    const [currentSpend, budgetLimit] = await Promise.all([
      this.getCurrentSpend(period),
      this.getBudgetLimit(period),
    ]);

    const projectedSpend = currentSpend + estimatedCost;
    const percentageUsed = budgetLimit > 0
      ? (projectedSpend / budgetLimit) * 100
      : 0;
    const withinBudget = projectedSpend <= budgetLimit;

    let recommendedModel: string | undefined;
    if (!withinBudget && originalModel) {
      const remainingBudget = Math.max(0, budgetLimit - currentSpend);
      recommendedModel = this.suggestAlternativeModel(originalModel, remainingBudget) ?? undefined;
    }

    return {
      withinBudget,
      currentSpend: projectedSpend,
      budgetLimit,
      percentageUsed,
      recommendedModel,
    };
  }

  /**
   * Get the total spend (in cents) for the given period.
   * Results are cached for 30 seconds.
   */
  async getCurrentSpend(period: BudgetPeriod): Promise<number> {
    const cacheKey = `spend:${period}`;
    const cached = this.spendCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const since = this.getPeriodStart(period);
    const rows = await db
      .select({ total: sql<number>`COALESCE(SUM(${costRecords.totalCost}), 0)` })
      .from(costRecords)
      .where(gte(costRecords.timestamp, since.toISOString()));

    const value = Number(rows[0]?.total ?? 0);
    this.spendCache.set(cacheKey, { value, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return value;
  }

  /**
   * Get the budget limit (in cents) for the given period from settings.
   * Falls back to 0 (no limit) if not configured.
   * Results are cached for 30 seconds.
   */
  async getBudgetLimit(period: BudgetPeriod): Promise<number> {
    const cacheKey = `limit:${period}`;
    const cached = this.limitCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const settingKey = `budget_${period}` as const; // e.g. 'budget_daily'
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(sql`${settings.key} = ${settingKey}`);

    // Settings store dollar amounts as strings like "10.00"; convert to cents
    const dollarStr = rows[0]?.value ?? '0';
    const value = Math.round(parseFloat(dollarStr) * 100);

    this.limitCache.set(cacheKey, { value, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return value;
  }

  /**
   * Suggest a cheaper alternative model given a remaining budget (in cents).
   *
   * Finds the most capable model whose per-request cost estimate fits within
   * the remaining budget (assuming ~1000 input tokens as a baseline).
   *
   * @param originalModel  The model that was originally selected
   * @param remainingBudget  Remaining budget in cents
   * @returns Model name string, or null if no alternative found
   */
  suggestAlternativeModel(originalModel: string, remainingBudget: number): string | null {
    // Baseline: estimate cost for 1000 input tokens
    const BASELINE_TOKENS = 1000;

    // Find the original model's cost — exact match only, no wildcard fallback
    const originalEntry = MODEL_COST_RANKING.find(m => m.model === originalModel);
    const originalCost = originalEntry
      ? (originalEntry.inputCostPerMillion / 1_000_000) * BASELINE_TOKENS
      : Infinity;

    // Iterate cheapest-first; keep the last (most capable) entry that fits
    let bestAlternative: string | null = null;
    for (const entry of MODEL_COST_RANKING) {
      const estimatedCost = (entry.inputCostPerMillion / 1_000_000) * BASELINE_TOKENS;
      if (estimatedCost < originalCost && estimatedCost <= remainingBudget) {
        bestAlternative = entry.model === '*' ? 'lmstudio-local' : entry.model;
      }
    }

    return bestAlternative;
  }

  /**
   * Invalidate the spend cache (call after recording a new cost).
   */
  invalidateSpendCache(): void {
    this.spendCache.clear();
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private getPeriodStart(period: BudgetPeriod): Date {
    const now = new Date();
    switch (period) {
      case 'daily': {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'weekly': {
        const d = new Date(now);
        const day = d.getDay(); // 0 = Sunday
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'monthly': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return d;
      }
    }
  }
}
