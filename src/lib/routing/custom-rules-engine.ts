/**
 * CustomRulesEngine - 自定义规则引擎
 *
 * 功能：
 * - 加载和管理用户自定义路由规则
 * - 按优先级匹配规则
 * - 支持多维度条件匹配（任务类型、上下文大小、代码复杂度）
 * - 规则 CRUD 操作
 * - 规则缓存优化
 *
 * 对应需求：Requirement 2 - 用户自定义路由规则
 */

import { TaskType } from './task-classifier';
import { AnalysisResult } from './multi-dim-analyzer';
import { db } from '../db';
import { customRules } from '../schema';
import { eq } from 'drizzle-orm';

// ─── Data Structures ─────────────────────────────────────────────────────────

export interface CustomRule {
  id: string;
  name: string;
  priority: number;          // 1-100
  enabled: boolean;
  conditions: {
    taskTypes?: TaskType[];
    contextSizeMin?: number;
    contextSizeMax?: number;
    codeComplexityMin?: number;
    codeComplexityMax?: number;
  };
  targetModel: string;
  targetProvider: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleMatchResult {
  matched: boolean;
  rule?: CustomRule;
  reason: string;
}

// ─── CustomRulesEngine ───────────────────────────────────────────────────────

export class CustomRulesEngine {
  private rules: CustomRule[] = [];
  private cache: Map<string, CustomRule[]>;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.cache = new Map<string, CustomRule[]>();
  }

  /**
   * Load rules from the database.
   * This should be called during initialization or when rules are updated.
   * 
   * Implements caching with 5-minute TTL:
   * - Rules are cached in memory
   * - Cache is refreshed every 5 minutes
   * - Cache is cleared when rules are modified
   */
  async loadRules(): Promise<void> {
    try {
      // Check if cache is still valid
      const now = Date.now();
      if (this.rules.length > 0 && (now - this.cacheTimestamp) < this.CACHE_TTL_MS) {
        // Cache is still valid, no need to reload
        return;
      }

      // Load rules from database
      const dbRules = await db.select().from(customRules);

      // Convert database records to CustomRule objects
      this.rules = dbRules.map(dbRule => ({
        id: dbRule.id,
        name: dbRule.name,
        priority: dbRule.priority,
        enabled: dbRule.enabled === 1, // SQLite stores boolean as 0 or 1
        conditions: {
          taskTypes: dbRule.taskTypes ? JSON.parse(dbRule.taskTypes) as TaskType[] : undefined,
          contextSizeMin: dbRule.contextSizeMin ?? undefined,
          contextSizeMax: dbRule.contextSizeMax ?? undefined,
          codeComplexityMin: dbRule.codeComplexityMin ?? undefined,
          codeComplexityMax: dbRule.codeComplexityMax ?? undefined,
        },
        targetModel: dbRule.targetModel,
        targetProvider: dbRule.targetProvider,
        createdAt: new Date(dbRule.createdAt ?? Date.now()),
        updatedAt: new Date(dbRule.updatedAt ?? Date.now()),
      }));

      // Sort rules by priority (highest first) for efficient matching
      this.rules.sort((a, b) => b.priority - a.priority);

      // Update cache timestamp
      this.cacheTimestamp = now;

      // Clear the match cache since rules have been reloaded
      this.cache.clear();

      console.log(`[CustomRulesEngine] Loaded ${this.rules.length} rules from database`);
    } catch (error) {
      console.error('[CustomRulesEngine] Error loading rules:', error);
      // On error, keep existing rules if any
      throw error;
    }
  }

  /**
   * Clear the cache and force reload on next access.
   * This should be called when rules are modified.
   */
  clearCache(): void {
    this.cacheTimestamp = 0;
    this.cache.clear();
    console.log('[CustomRulesEngine] Cache cleared');
  }

  /**
   * Match a rule against the analysis result and task type.
   *
   * Algorithm:
   * 1. Filter enabled rules
   * 2. Sort by priority (highest first)
   * 3. Check each rule's conditions in order
   * 4. Return the first matching rule
   * 5. If no match, return { matched: false }
   *
   * @param analysis  The multi-dimensional analysis result
   * @param taskType  The classified task type
   * @returns RuleMatchResult with the matched rule or reason for no match
   */
  matchRule(analysis: AnalysisResult, taskType: TaskType): RuleMatchResult {
    // Filter and sort rules by priority (highest first)
    const sortedRules = this.rules
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      // Check task type condition
      if (rule.conditions.taskTypes && rule.conditions.taskTypes.length > 0) {
        if (!rule.conditions.taskTypes.includes(taskType)) {
          continue;
        }
      }

      // Check context size minimum
      if (rule.conditions.contextSizeMin !== undefined) {
        if (analysis.contextSize < rule.conditions.contextSizeMin) {
          continue;
        }
      }

      // Check context size maximum
      if (rule.conditions.contextSizeMax !== undefined) {
        if (analysis.contextSize > rule.conditions.contextSizeMax) {
          continue;
        }
      }

      // Check code complexity minimum
      if (rule.conditions.codeComplexityMin !== undefined) {
        if (analysis.codeComplexity < rule.conditions.codeComplexityMin) {
          continue;
        }
      }

      // Check code complexity maximum
      if (rule.conditions.codeComplexityMax !== undefined) {
        if (analysis.codeComplexity > rule.conditions.codeComplexityMax) {
          continue;
        }
      }

      // All conditions matched!
      return {
        matched: true,
        rule,
        reason: `Matched custom rule: ${rule.name} (priority: ${rule.priority})`
      };
    }

    // No rules matched
    return {
      matched: false,
      reason: 'No custom rules matched'
    };
  }

  /**
   * Add a new custom rule.
   *
   * @param rule  The rule to add (without id, createdAt, updatedAt)
   */
  async addRule(rule: CustomRule): Promise<void> {
    try {
      // Insert into database
      await db.insert(customRules).values({
        id: rule.id,
        userId: null, // TODO: Add user support in future
        name: rule.name,
        priority: rule.priority,
        enabled: rule.enabled ? 1 : 0,
        taskTypes: rule.conditions.taskTypes ? JSON.stringify(rule.conditions.taskTypes) : null,
        contextSizeMin: rule.conditions.contextSizeMin ?? null,
        contextSizeMax: rule.conditions.contextSizeMax ?? null,
        codeComplexityMin: rule.conditions.codeComplexityMin ?? null,
        codeComplexityMax: rule.conditions.codeComplexityMax ?? null,
        targetProvider: rule.targetProvider,
        targetModel: rule.targetModel,
        matchCount: 0,
        lastMatchedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Clear cache to force reload
      this.clearCache();

      console.log(`[CustomRulesEngine] Added rule: ${rule.name}`);
    } catch (error) {
      console.error('[CustomRulesEngine] Error adding rule:', error);
      throw error;
    }
  }

  /**
   * Update an existing custom rule.
   *
   * @param id  The rule ID to update
   * @param updates  Partial rule updates
   */
  async updateRule(id: string, updates: Partial<CustomRule>): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.enabled !== undefined) updateData.enabled = updates.enabled ? 1 : 0;
      if (updates.targetProvider !== undefined) updateData.targetProvider = updates.targetProvider;
      if (updates.targetModel !== undefined) updateData.targetModel = updates.targetModel;

      if (updates.conditions !== undefined) {
        if (updates.conditions.taskTypes !== undefined) {
          updateData.taskTypes = updates.conditions.taskTypes ? JSON.stringify(updates.conditions.taskTypes) : null;
        }
        if (updates.conditions.contextSizeMin !== undefined) {
          updateData.contextSizeMin = updates.conditions.contextSizeMin;
        }
        if (updates.conditions.contextSizeMax !== undefined) {
          updateData.contextSizeMax = updates.conditions.contextSizeMax;
        }
        if (updates.conditions.codeComplexityMin !== undefined) {
          updateData.codeComplexityMin = updates.conditions.codeComplexityMin;
        }
        if (updates.conditions.codeComplexityMax !== undefined) {
          updateData.codeComplexityMax = updates.conditions.codeComplexityMax;
        }
      }

      await db.update(customRules)
        .set(updateData)
        .where(eq(customRules.id, id));

      // Clear cache to force reload
      this.clearCache();

      console.log(`[CustomRulesEngine] Updated rule: ${id}`);
    } catch (error) {
      console.error('[CustomRulesEngine] Error updating rule:', error);
      throw error;
    }
  }

  /**
   * Delete a custom rule.
   *
   * @param id  The rule ID to delete
   */
  async deleteRule(id: string): Promise<void> {
    try {
      await db.delete(customRules)
        .where(eq(customRules.id, id));

      // Clear cache to force reload
      this.clearCache();

      console.log(`[CustomRulesEngine] Deleted rule: ${id}`);
    } catch (error) {
      console.error('[CustomRulesEngine] Error deleting rule:', error);
      throw error;
    }
  }

  /**
   * Toggle a rule's enabled status.
   *
   * @param id  The rule ID to toggle
   * @param enabled  The new enabled status
   */
  async toggleRule(id: string, enabled: boolean): Promise<void> {
    try {
      await db.update(customRules)
        .set({
          enabled: enabled ? 1 : 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(customRules.id, id));

      // Clear cache to force reload
      this.clearCache();

      console.log(`[CustomRulesEngine] Toggled rule ${id} to ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('[CustomRulesEngine] Error toggling rule:', error);
      throw error;
    }
  }
}
