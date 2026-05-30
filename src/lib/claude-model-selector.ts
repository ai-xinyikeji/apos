/**
 * Optional feature: Requires Anthropic API key to use
 *
 * This module provides Claude-specific optimizations including prompt caching,
 * model selection, context management, and error recovery. These features are
 * not used by default and require an Anthropic API key to function.
 *
 * To enable: Set ANTHROPIC_API_KEY environment variable or configure in settings.
 */

/**
 * Claude 模型智能选择器
 * 
 * 功能：
 * - 根据任务类型自动选择最优模型
 * - 平衡成本和准确度
 * - 支持自定义策略
 * 
 * 模型对比：
 * - Haiku: 快速便宜，适合简单任务
 * - Sonnet: 平衡，适合大多数任务
 * - Opus: 最准确，适合复杂推理
 */

export type ClaudeModel = 
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-opus-20240229';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

export interface ModelInfo {
  model: ClaudeModel;
  speed: number;        // 1-5, 5 最快
  accuracy: number;     // 1-5, 5 最准确
  costPerMToken: number;  // 美元/百万 tokens
  contextWindow: number;  // tokens
  bestFor: string[];
}

export const CLAUDE_MODELS: Record<ClaudeModel, ModelInfo> = {
  'claude-3-5-haiku-20241022': {
    model: 'claude-3-5-haiku-20241022',
    speed: 5,
    accuracy: 3,
    costPerMToken: 0.80,  // $0.80 per 1M input tokens
    contextWindow: 200_000,
    bestFor: ['summarize', 'format', 'translate', 'simple-qa'],
  },
  'claude-3-5-sonnet-20241022': {
    model: 'claude-3-5-sonnet-20241022',
    speed: 4,
    accuracy: 5,
    costPerMToken: 3.00,  // $3.00 per 1M input tokens
    contextWindow: 200_000,
    bestFor: ['coding', 'refactor', 'review', 'explain', 'default'],
  },
  'claude-3-opus-20240229': {
    model: 'claude-3-opus-20240229',
    speed: 3,
    accuracy: 5,
    costPerMToken: 15.00,  // $15.00 per 1M input tokens
    contextWindow: 200_000,
    bestFor: ['reasoning', 'planning', 'complex-analysis', 'research'],
  },
};

export interface SelectionStrategy {
  prioritize: 'cost' | 'speed' | 'accuracy' | 'balanced';
  maxCostPerMToken?: number;
  minAccuracy?: number;
}

const DEFAULT_STRATEGY: SelectionStrategy = {
  prioritize: 'balanced',
};

/**
 * 根据任务类型选择最优 Claude 模型
 */
export function selectClaudeModel(
  taskType: string,
  strategy: Partial<SelectionStrategy> = {}
): ClaudeModel {
  const finalStrategy = { ...DEFAULT_STRATEGY, ...strategy };

  // 任务类型到复杂度的映射
  const taskComplexityMap: Record<string, TaskComplexity> = {
    // 简单任务
    'summarize': 'simple',
    'format': 'simple',
    'translate': 'simple',
    'extract': 'simple',
    
    // 中等任务
    'coding': 'medium',
    'refactor': 'medium',
    'review': 'medium',
    'explain': 'medium',
    'default': 'medium',
    
    // 复杂任务
    'reasoning': 'complex',
    'planning': 'complex',
    'research': 'complex',
    'analysis': 'complex',
  };

  const complexity = taskComplexityMap[taskType] || 'medium';

  // 根据策略选择模型
  switch (finalStrategy.prioritize) {
    case 'cost':
      return selectByCost(complexity, finalStrategy);
    
    case 'speed':
      return selectBySpeed(complexity, finalStrategy);
    
    case 'accuracy':
      return selectByAccuracy(complexity, finalStrategy);
    
    case 'balanced':
    default:
      return selectBalanced(complexity, finalStrategy);
  }
}

/**
 * 成本优先策略
 */
function selectByCost(
  complexity: TaskComplexity,
  strategy: SelectionStrategy
): ClaudeModel {
  switch (complexity) {
    case 'simple':
      return 'claude-3-5-haiku-20241022';  // 最便宜
    
    case 'medium':
      // 如果有成本限制，使用 Haiku
      if (strategy.maxCostPerMToken && strategy.maxCostPerMToken < 3.00) {
        return 'claude-3-5-haiku-20241022';
      }
      return 'claude-3-5-sonnet-20241022';
    
    case 'complex':
      // 即使是复杂任务，如果成本限制严格，也用 Sonnet
      if (strategy.maxCostPerMToken && strategy.maxCostPerMToken < 15.00) {
        return 'claude-3-5-sonnet-20241022';
      }
      return 'claude-3-opus-20240229';
  }
}

/**
 * 速度优先策略
 */
function selectBySpeed(
  complexity: TaskComplexity,
  strategy: SelectionStrategy
): ClaudeModel {
  // 速度优先：总是选择 Haiku（最快）
  // 除非准确度要求很高
  if (strategy.minAccuracy && strategy.minAccuracy >= 5) {
    return complexity === 'complex' 
      ? 'claude-3-opus-20240229' 
      : 'claude-3-5-sonnet-20241022';
  }
  
  return 'claude-3-5-haiku-20241022';
}

/**
 * 准确度优先策略
 */
function selectByAccuracy(
  complexity: TaskComplexity,
  strategy: SelectionStrategy
): ClaudeModel {
  switch (complexity) {
    case 'simple':
      // 简单任务不需要最高准确度
      return 'claude-3-5-sonnet-20241022';
    
    case 'medium':
      return 'claude-3-5-sonnet-20241022';
    
    case 'complex':
      return 'claude-3-opus-20240229';  // 最准确
  }
}

/**
 * 平衡策略（默认）
 */
function selectBalanced(
  complexity: TaskComplexity,
  strategy: SelectionStrategy
): ClaudeModel {
  switch (complexity) {
    case 'simple':
      // 简单任务：Haiku（快速便宜）
      return 'claude-3-5-haiku-20241022';
    
    case 'medium':
      // 中等任务：Sonnet（平衡）
      return 'claude-3-5-sonnet-20241022';
    
    case 'complex':
      // 复杂任务：如果有成本限制，用 Sonnet；否则用 Opus
      if (strategy.maxCostPerMToken && strategy.maxCostPerMToken < 15.00) {
        return 'claude-3-5-sonnet-20241022';
      }
      return 'claude-3-opus-20240229';
  }
}

/**
 * 获取模型信息
 */
export function getModelInfo(model: ClaudeModel): ModelInfo {
  return CLAUDE_MODELS[model];
}

/**
 * 估算任务成本
 */
export function estimateCost(
  model: ClaudeModel,
  inputTokens: number,
  outputTokens: number
): number {
  const modelInfo = CLAUDE_MODELS[model];
  
  // 输入成本
  const inputCost = (inputTokens / 1_000_000) * modelInfo.costPerMToken;
  
  // 输出成本（通常是输入的 3-5 倍）
  const outputCostMultiplier = model === 'claude-3-5-haiku-20241022' ? 4 : 5;
  const outputCost = (outputTokens / 1_000_000) * (modelInfo.costPerMToken * outputCostMultiplier);
  
  return inputCost + outputCost;
}

/**
 * 比较两个模型
 */
export function compareModels(
  model1: ClaudeModel,
  model2: ClaudeModel
): {
  speedDiff: number;
  accuracyDiff: number;
  costDiff: number;
  recommendation: ClaudeModel;
} {
  const info1 = CLAUDE_MODELS[model1];
  const info2 = CLAUDE_MODELS[model2];

  const speedDiff = info1.speed - info2.speed;
  const accuracyDiff = info1.accuracy - info2.accuracy;
  const costDiff = info1.costPerMToken - info2.costPerMToken;

  // 推荐：速度更快、准确度相同或更高、成本更低的模型
  let recommendation: ClaudeModel;
  if (speedDiff > 0 && accuracyDiff >= 0 && costDiff <= 0) {
    recommendation = model1;
  } else if (speedDiff < 0 && accuracyDiff <= 0 && costDiff >= 0) {
    recommendation = model2;
  } else {
    // 平衡选择：优先考虑准确度
    recommendation = accuracyDiff >= 0 ? model1 : model2;
  }

  return {
    speedDiff,
    accuracyDiff,
    costDiff,
    recommendation,
  };
}

/**
 * 根据预算选择模型
 */
export function selectByBudget(
  taskType: string,
  maxBudgetPerRequest: number,  // 美元
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): ClaudeModel {
  // 尝试从最便宜的开始
  const models: ClaudeModel[] = [
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
  ];

  for (const model of models) {
    const cost = estimateCost(model, estimatedInputTokens, estimatedOutputTokens);
    if (cost <= maxBudgetPerRequest) {
      return model;
    }
  }

  // 如果都超预算，返回最便宜的
  return 'claude-3-5-haiku-20241022';
}
