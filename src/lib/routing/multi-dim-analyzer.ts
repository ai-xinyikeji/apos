/**
 * MultiDimAnalyzer - 多维度分析器
 *
 * 功能：
 * - 计算上下文大小（token 数量，近似值 chars/4）
 * - 计算代码复杂度评分（0-100）
 * - 估算 API 调用成本（USD）
 * - 判断是否需要 Extended Thinking
 *
 * 性能目标：< 10ms（纯 CPU，无 I/O）
 */

import { TaskType } from './task-classifier';

export interface AnalysisResult {
  /** Approximate token count: Math.ceil(chars / 4) */
  contextSize: number;
  /** Code complexity score 0-100 */
  codeComplexity: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Whether Extended Thinking is recommended */
  requiresExtendedThinking: boolean;
}

// Default model used for cost estimation when no specific model is provided.
// Pricing: $3.00 per 1M input tokens (claude-3-5-sonnet).
const DEFAULT_MODEL = 'claude-3-5-sonnet';
const DEFAULT_INPUT_PRICE_PER_MILLION = 3.0;

// Extended Thinking thresholds (from requirements §4)
const EXTENDED_THINKING_CONTEXT_THRESHOLD = 50_000; // tokens
const EXTENDED_THINKING_COMPLEXITY_THRESHOLD = 80;   // score

// Regex patterns for code complexity scoring
const FUNCTION_PATTERN = /function|=>|class/g;
const COMPLEX_FLOW_PATTERN = /\bif\b|\bfor\b|\bwhile\b|\bswitch\b|\btry\b/g;

export class MultiDimAnalyzer {
  /**
   * Perform multi-dimensional analysis of a prompt.
   *
   * @param prompt  The full prompt text (may contain code blocks)
   * @param taskType  The classified task type
   */
  analyze(prompt: string, taskType: TaskType): AnalysisResult {
    const contextSize = this.calculateContextSize(prompt);
    const codeComplexity = this.calculateCodeComplexity(prompt);
    const estimatedCost = this.estimateCost(contextSize, DEFAULT_MODEL);
    const requiresExtendedThinking = this.shouldUseExtendedThinking(
      taskType,
      contextSize,
      codeComplexity
    );

    return {
      contextSize,
      codeComplexity,
      estimatedCost,
      requiresExtendedThinking,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Approximate token count.
   * Industry-standard heuristic: 1 token ≈ 4 characters.
   */
  private calculateContextSize(prompt: string): number {
    if (!prompt) return 0;
    return Math.ceil(prompt.length / 4);
  }

  /**
   * Code complexity score (0-100).
   *
   * Scoring breakdown:
   *   - Code length:           Math.min(lines / 100, 30)   → 0-30 pts
   *   - Max nesting depth:     Math.min(maxNesting * 5, 30) → 0-30 pts
   *   - Function count:        Math.min(count * 2, 20)      → 0-20 pts
   *   - Complex control flow:  Math.min(count, 20)          → 0-20 pts
   *   Total capped at 100.
   */
  private calculateCodeComplexity(code: string): number {
    if (!code) return 0;

    let score = 0;

    // Code length (0-30 pts)
    const lines = code.split('\n').length;
    score += Math.min(lines / 100, 30);

    // Max nesting depth (0-30 pts)
    const maxNesting = this.calculateMaxNesting(code);
    score += Math.min(maxNesting * 5, 30);

    // Function count (0-20 pts)
    const functionCount = (code.match(FUNCTION_PATTERN) || []).length;
    score += Math.min(functionCount * 2, 20);

    // Complex control flow (0-20 pts)
    const complexPatterns = (code.match(COMPLEX_FLOW_PATTERN) || []).length;
    score += Math.min(complexPatterns, 20);

    return Math.min(Math.round(score), 100);
  }

  /**
   * Estimate API cost in USD.
   *
   * Uses the default model pricing ($3.00 / 1M input tokens).
   * Only input tokens are estimated here; output tokens are unknown at routing time.
   */
  private estimateCost(contextSize: number, _model: string): number {
    return (contextSize / 1_000_000) * DEFAULT_INPUT_PRICE_PER_MILLION;
  }

  /**
   * Calculate the maximum brace/bracket nesting depth in the code.
   * Counts `{`, `(`, and `[` as opening delimiters.
   */
  private calculateMaxNesting(code: string): number {
    let depth = 0;
    let maxDepth = 0;

    for (const ch of code) {
      if (ch === '{' || ch === '(' || ch === '[') {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
      } else if (ch === '}' || ch === ')' || ch === ']') {
        depth = Math.max(0, depth - 1);
      }
    }

    return maxDepth;
  }

  /**
   * Determine whether Extended Thinking should be used.
   *
   * Triggers (from requirements §4):
   *   - taskType is 'reasoning' or 'planning'
   *   - contextSize > 50,000 tokens
   *   - codeComplexity > 80
   */
  private shouldUseExtendedThinking(
    taskType: TaskType,
    contextSize: number,
    codeComplexity: number
  ): boolean {
    if (taskType === 'reasoning' || taskType === 'planning') {
      return true;
    }
    if (contextSize > EXTENDED_THINKING_CONTEXT_THRESHOLD) {
      return true;
    }
    if (codeComplexity > EXTENDED_THINKING_COMPLEXITY_THRESHOLD) {
      return true;
    }
    return false;
  }
}
