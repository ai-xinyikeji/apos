/**
 * TaskClassifier - 任务类型分类器
 *
 * 功能：
 * - 根据 prompt 内容分类任务类型
 * - 支持 7 种任务类型 + default 回退
 * - 关键词匹配（快速路径）
 * - 模式识别（代码块、问题标记）
 * - 置信度计算
 *
 * 性能目标：< 10ms
 */

export type TaskType =
  | 'reasoning'
  | 'coding'
  | 'summarize'
  | 'refactor'
  | 'review'
  | 'planning'
  | 'explain'
  | 'default';

export interface TaskClassificationResult {
  taskType: TaskType;
  confidence: number;
  keywords: string[];
}

// ─── Keyword dictionaries ────────────────────────────────────────────────────
// Each entry is [keyword, weight].  Higher weight = stronger signal.

type WeightedKeyword = [string, number];

const TASK_KEYWORDS: Record<TaskType, WeightedKeyword[]> = {
  reasoning: [
    ['why', 2], ['reason', 2], ['analyze', 2], ['analysis', 2],
    ['think through', 2], ['logic', 1], ['deduce', 2], ['infer', 2],
    ['conclude', 2], ['evaluate', 1], ['assess', 1], ['compare', 1],
    ['contrast', 1], ['pros and cons', 2], ['trade-off', 2], ['tradeoff', 2],
    ['decide', 1], ['decision', 1],
    ['为什么', 2], ['分析', 2], ['推理', 2], ['逻辑', 1], ['判断', 1],
    ['评估', 1], ['比较', 1], ['权衡', 2],
  ],
  coding: [
    ['implement a', 3], ['implement the', 3], ['write a function', 3],
    ['write a class', 3], ['write a script', 3], ['write a program', 3],
    ['write code', 3], ['create a function', 3], ['create a class', 3],
    ['create a component', 3], ['build a', 2], ['develop a', 2], ['code a', 3],
    ['algorithm', 2], ['api endpoint', 2], ['fix bug', 2], ['debug', 2],
    ['feature', 1], ['module', 1],
    ['实现', 3], ['编写', 3], ['创建', 2], ['开发', 2], ['代码', 2],
    ['函数', 2], ['算法', 2], ['接口', 2],
  ],
  summarize: [
    ['summarize', 3], ['summary', 3], ['tldr', 3], ['tl;dr', 3],
    ['brief overview', 2], ['key points', 2], ['main points', 2],
    ['highlight', 1], ['condense', 2], ['shorten', 2],
    ['abstract', 2], ['digest', 2],
    ['总结', 3], ['摘要', 3], ['概述', 2], ['简述', 2], ['要点', 2], ['精简', 2],
  ],
  refactor: [
    ['refactor', 3], ['refactoring', 3], ['restructure', 3],
    ['reorganize', 2], ['clean up', 2], ['cleanup', 2],
    ['improve code', 2], ['optimize code', 2], ['simplify', 2],
    ['rewrite', 2], ['rename', 1], ['extract method', 2],
    ['decompose', 2], ['modularize', 2],
    ['重构', 3], ['重写', 2], ['优化代码', 2], ['简化', 2], ['整理', 2], ['拆分', 2],
  ],
  review: [
    ['review', 3], ['code review', 3], ['find bugs', 3], ['find issues', 3],
    ['audit', 3], ['inspect', 2], ['validate', 2], ['verify', 2],
    ['what is wrong', 2], ["what's wrong", 2],
    ['feedback', 2], ['critique', 2], ['code quality', 2],
    ['审查', 3], ['检查', 2], ['审核', 3], ['验证', 2], ['找问题', 3],
    ['代码审查', 3], ['反馈', 2],
  ],
  planning: [
    ['plan', 3], ['planning', 3], ['design the architecture', 3],
    ['architect', 2], ['architecture', 2], ['strategy', 2],
    ['roadmap', 3], ['outline', 2], ['structure', 1],
    ['approach', 1], ['steps to', 2], ['how to build', 2],
    ['best way to build', 2], ['recommend', 1], ['proposal', 2],
    ['计划', 3], ['规划', 3], ['设计', 2], ['架构', 2], ['策略', 2],
    ['方案', 2], ['步骤', 2], ['建议', 1],
  ],
  explain: [
    ['explain', 3], ['what is', 2], ["what's", 1], ['how does', 2],
    ['describe', 2], ['clarify', 2], ['elaborate', 2],
    ['tell me about', 2], ['definition of', 2], ['meaning of', 2],
    ['concept of', 2], ['help me understand', 2], ['walk me through', 2],
    ['解释', 3], ['什么是', 2], ['如何工作', 2], ['描述', 2],
    ['说明', 2], ['介绍', 2], ['帮我理解', 2],
  ],
  default: [],
};

// ─── Pattern matchers ────────────────────────────────────────────────────────

/** Matches fenced code blocks: ```...``` or inline code */
const CODE_BLOCK_PATTERN = /```[\s\S]*?```|`[^`\n]+`/;

/** Matches question markers */
const QUESTION_PATTERN = /\?|how (do|can|should|would)|what (is|are|does|should)|why (is|are|does|should)/i;

// ─── Scoring helpers ─────────────────────────────────────────────────────────

interface ScoreMap {
  [key: string]: number;
}

/**
 * Normalise prompt: lowercase, collapse whitespace.
 */
function normalise(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Count weighted keyword matches in the normalised prompt.
 */
function matchKeywords(
  normalised: string,
  keywords: WeightedKeyword[]
): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  for (const [kw, weight] of keywords) {
    if (normalised.includes(kw)) {
      score += weight;
      matched.push(kw);
    }
  }
  return { score, matched };
}

// ─── TaskClassifier ──────────────────────────────────────────────────────────

export class TaskClassifier {
  /**
   * Classify a prompt into one of the 8 task types.
   *
   * Algorithm:
   * 1. Keyword matching with weights (fast path)
   * 2. Pattern recognition — boost scores based on structural signals
   *    only when no keyword signal exists
   * 3. Pick the highest-scoring type; fall back to 'default'
   * 4. Compute confidence from score distribution
   */
  classify(prompt: string): TaskClassificationResult {
    if (!prompt || prompt.trim().length === 0) {
      return { taskType: 'default', confidence: 1.0, keywords: [] };
    }

    const normalised = normalise(prompt);
    const scores: ScoreMap = {
      reasoning: 0,
      coding: 0,
      summarize: 0,
      refactor: 0,
      review: 0,
      planning: 0,
      explain: 0,
    };
    const matchedKeywords: Record<string, string[]> = {};

    // ── Step 1: Weighted keyword matching ────────────────────────────────
    for (const [type, keywords] of Object.entries(TASK_KEYWORDS) as [TaskType, WeightedKeyword[]][]) {
      if (type === 'default') continue;
      const { score, matched } = matchKeywords(normalised, keywords);
      scores[type] = score;
      matchedKeywords[type] = matched;
    }

    // ── Step 2: Pattern recognition ───────────────────────────────────────
    const hasCodeBlock = CODE_BLOCK_PATTERN.test(prompt);
    const hasQuestion = QUESTION_PATTERN.test(normalised);

    // Code block boost: only meaningful when there is no strong keyword signal
    // (avoids overriding "Refactor this class" → coding just because "class" appears)
    const maxKeywordScore = Math.max(...Object.values(scores));
    if (hasCodeBlock && maxKeywordScore < 3) {
      scores['coding'] += 3;
      scores['refactor'] += 1;
      scores['review'] += 1;
    }

    if (hasQuestion) {
      // Question markers → mild boost for explain and reasoning
      scores['explain'] += 1;
      scores['reasoning'] += 1;
    }

    // Prompt length signal: very short prompts lean toward explain/default
    const wordCount = normalised.split(' ').length;
    if (wordCount <= 5) {
      scores['explain'] += 1;
    }

    // ── Step 3: Pick winner ───────────────────────────────────────────────
    let bestType: TaskType = 'default';
    let bestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as TaskType;
      }
    }

    // ── Step 4: Confidence calculation ────────────────────────────────────
    const confidence = this.calculateConfidence(scores, bestType, bestScore);
    const keywords = matchedKeywords[bestType] ?? [];

    return { taskType: bestType, confidence, keywords };
  }

  /**
   * Confidence is derived from how dominant the winning score is relative
   * to the total signal and the runner-up.
   *
   * Formula:
   *   base   = winnerScore / (totalScore + ε)
   *   margin = (winnerScore - runnerUpScore) / (winnerScore + ε)
   *   confidence = clamp(0.5 * base + 0.5 * margin, 0.1, 1.0)
   *
   * When there is no signal at all (default), confidence = 0.5.
   */
  private calculateConfidence(
    scores: ScoreMap,
    winner: TaskType,
    winnerScore: number
  ): number {
    if (winner === 'default' || winnerScore === 0) {
      return 0.5;
    }

    const allScores = Object.values(scores);
    const totalScore = allScores.reduce((a, b) => a + b, 0);

    // Runner-up score
    const sortedScores = [...allScores].sort((a, b) => b - a);
    const runnerUp = sortedScores[1] ?? 0;

    const base = winnerScore / (totalScore + 1e-9);
    const margin = (winnerScore - runnerUp) / (winnerScore + 1e-9);

    const raw = 0.5 * base + 0.5 * margin;

    // Scale to [0.55, 1.0] — clear winners (high base + margin) land above 0.8
    const scaled = 0.55 + raw * 0.45;

    return Math.min(1.0, Math.max(0.1, parseFloat(scaled.toFixed(4))));
  }
}
