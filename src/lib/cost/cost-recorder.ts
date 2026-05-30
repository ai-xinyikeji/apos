/**
 * CostRecorder - 成本记录器
 *
 * 功能：
 * - 计算各模型的 API 调用成本
 * - 支持 Prompt Caching 成本计算
 * - 异步批量记录，不阻塞主流程
 * - 计算缓存节省
 *
 * 对应需求：Requirement 6
 */

import { db } from '../db';
import { costRecords } from '../schema';
import { TaskType } from '../routing/task-classifier';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CostRecordInput {
  userId?: string;
  provider: string;
  modelName: string;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  routingDecisionId?: string;
}

export interface CostRecord extends CostRecordInput {
  id: string;
  timestamp: Date;
  totalCost: number;    // cents
  cacheSavings: number; // cents
}

// ─── Model pricing table (per 1M tokens, in cents) ───────────────────────────

interface ModelPricing {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
}

export const MODEL_PRICING: Record<string, Record<string, ModelPricing>> = {
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
    'gemini-1.5-pro-latest': { input: 125, output: 500 },
    'gemini-1.5-flash':      { input: 7,   output: 30  },
  },
  lmstudio: {
    '*': { input: 0, output: 0 },
  },
};

// ─── CostRecorder ─────────────────────────────────────────────────────────────

export class CostRecorder {
  private batchQueue: CostRecordInput[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_INTERVAL_MS = 1000; // flush every 1 second
  private readonly BATCH_SIZE = 50;

  /**
   * Record a single cost entry asynchronously.
   * Adds to the batch queue; does not block the caller.
   */
  record(input: CostRecordInput): void {
    this.batchQueue.push(input);

    if (this.batchQueue.length >= this.BATCH_SIZE) {
      this.flush();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), this.BATCH_INTERVAL_MS);
    }
  }

  /**
   * Record multiple cost entries asynchronously.
   */
  batchRecord(inputs: CostRecordInput[]): void {
    for (const input of inputs) {
      this.record(input);
    }
  }

  /**
   * Flush the batch queue to the database immediately.
   * Returns a promise that resolves when all records are written.
   */
  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0);

    try {
      const rows = batch.map(input => {
        const { totalCost, cacheSavings } = this.calculateCost(input);
        return {
          id: this.generateId(),
          userId: input.userId ?? null,
          provider: input.provider,
          modelName: input.modelName,
          taskType: input.taskType,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          cacheCreationTokens: input.cacheCreationTokens ?? 0,
          cacheReadTokens: input.cacheReadTokens ?? 0,
          totalCost,
          cacheSavings,
          routingDecisionId: input.routingDecisionId ?? null,
        };
      });

      // Insert in chunks to avoid SQLite limits
      const CHUNK_SIZE = 20;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        await db.insert(costRecords).values(rows.slice(i, i + CHUNK_SIZE));
      }
    } catch (error) {
      console.error('[CostRecorder] Failed to flush batch:', error);
      // Re-queue failed records
      this.batchQueue.unshift(...batch);
    }
  }

  /**
   * Calculate the total cost and cache savings for a record.
   *
   * @returns { totalCost, cacheSavings } in cents
   */
  calculateCost(input: CostRecordInput): { totalCost: number; cacheSavings: number } {
    const pricing = this.getPricing(input.provider, input.modelName);

    if (!pricing) {
      return { totalCost: 0, cacheSavings: 0 };
    }

    let totalCost = 0;

    // Input tokens
    totalCost += (input.inputTokens / 1_000_000) * pricing.input;

    // Output tokens
    totalCost += (input.outputTokens / 1_000_000) * pricing.output;

    // Cache creation tokens (writing to cache costs more)
    if (input.cacheCreationTokens && pricing.cacheWrite) {
      totalCost += (input.cacheCreationTokens / 1_000_000) * pricing.cacheWrite;
    }

    // Cache read tokens (reading from cache is much cheaper)
    if (input.cacheReadTokens && pricing.cacheRead) {
      totalCost += (input.cacheReadTokens / 1_000_000) * pricing.cacheRead;
    }

    // Cache savings: what we would have paid for cache-read tokens at full input price
    // vs what we actually paid at cache-read price
    let cacheSavings = 0;
    if (input.cacheReadTokens && pricing.cacheRead) {
      const fullPrice = (input.cacheReadTokens / 1_000_000) * pricing.input;
      const cachePrice = (input.cacheReadTokens / 1_000_000) * pricing.cacheRead;
      cacheSavings = Math.max(0, fullPrice - cachePrice);
    }

    return {
      totalCost: Math.round(totalCost),
      cacheSavings: Math.round(cacheSavings),
    };
  }

  /**
   * Get pricing for a provider/model combination.
   * Falls back to wildcard '*' for providers like lmstudio.
   */
  getPricing(provider: string, model: string): ModelPricing | null {
    const providerPricing = MODEL_PRICING[provider];
    if (!providerPricing) return null;
    return providerPricing[model] ?? providerPricing['*'] ?? null;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private generateId(): string {
    return `cr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
