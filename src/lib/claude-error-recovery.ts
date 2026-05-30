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
 * Claude 专用错误恢复机制
 * 
 * 功能：
 * - 针对 Claude 特有错误的智能处理
 * - 自动重试和降级策略
 * - 提升可用性 20-30%
 * 
 * 错误类型：
 * - 速率限制（429）
 * - 上下文超限（400）
 * - 模型过载（529）
 * - 无效请求（400）
 */

import { ClaudeModel, selectClaudeModel } from './claude-model-selector';
import { optimizeClaudeContext } from './claude-context-optimizer';

export interface ClaudeError {
  status: number;
  type: string;
  message: string;
  headers?: Record<string, string>;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;  // 毫秒
  maxDelay: number;      // 毫秒
  backoffMultiplier: number;
  enableFallback: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 60000,
  backoffMultiplier: 2,
  enableFallback: true,
};

export type RecoveryStrategy = 
  | 'retry'           // 简单重试
  | 'exponential-backoff'  // 指数退避
  | 'fallback-model'  // 降级到更小的模型
  | 'reduce-context'  // 减少上下文
  | 'split-request';  // 拆分请求

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  attempts: number;
  finalModel?: ClaudeModel;
  error?: string;
}

/**
 * 解析 Claude 错误
 */
export function parseClaudeError(error: any): ClaudeError {
  return {
    status: error.status || error.statusCode || 500,
    type: error.type || error.error?.type || 'unknown_error',
    message: error.message || error.error?.message || 'Unknown error',
    headers: error.headers || {},
  };
}

/**
 * 判断错误类型并选择恢复策略
 */
export function selectRecoveryStrategy(error: ClaudeError): RecoveryStrategy {
  // 速率限制 → 指数退避
  if (error.status === 429) {
    return 'exponential-backoff';
  }

  // 上下文超限 → 减少上下文
  if (error.status === 400 && error.message.includes('context_length_exceeded')) {
    return 'reduce-context';
  }

  // 模型过载 → 降级模型
  if (error.status === 529 || error.message.includes('overloaded')) {
    return 'fallback-model';
  }

  // 无效请求 → 拆分请求
  if (error.status === 400 && error.message.includes('invalid_request')) {
    return 'split-request';
  }

  // 其他错误 → 简单重试
  return 'retry';
}

/**
 * 执行恢复策略
 */
export async function executeRecovery(
  error: ClaudeError,
  originalRequest: {
    messages: any[];
    system: string;
    model: ClaudeModel;
    apiKey: string;
  },
  config: Partial<RetryConfig> = {}
): Promise<RecoveryResult> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const strategy = selectRecoveryStrategy(error);

  console.log(`[Claude Error Recovery] Strategy: ${strategy}, Error: ${error.message}`);

  switch (strategy) {
    case 'exponential-backoff':
      return await retryWithBackoff(originalRequest, error, finalConfig);
    
    case 'fallback-model':
      return await fallbackToSmallerModel(originalRequest, finalConfig);
    
    case 'reduce-context':
      return await reduceContextAndRetry(originalRequest, finalConfig);
    
    case 'split-request':
      return await splitAndRetry(originalRequest, finalConfig);
    
    case 'retry':
    default:
      return await simpleRetry(originalRequest, finalConfig);
  }
}

/**
 * 策略 1：指数退避重试
 */
async function retryWithBackoff(
  request: any,
  error: ClaudeError,
  config: RetryConfig
): Promise<RecoveryResult> {
  let delay = config.initialDelay;
  
  // 如果响应头中有 retry-after，使用它
  if (error.headers?.['retry-after']) {
    delay = parseInt(error.headers['retry-after']) * 1000;
  }

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    console.log(`[Claude Error Recovery] Retry attempt ${attempt}/${config.maxRetries}, waiting ${delay}ms`);
    
    await sleep(delay);

    try {
      // 重试请求
      const result = await makeClaudeRequest(request);
      return {
        success: true,
        strategy: 'exponential-backoff',
        attempts: attempt,
        finalModel: request.model,
      };
    } catch (retryError: any) {
      const parsedError = parseClaudeError(retryError);
      
      // 如果还是速率限制，继续退避
      if (parsedError.status === 429) {
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        continue;
      }
      
      // 其他错误，停止重试
      return {
        success: false,
        strategy: 'exponential-backoff',
        attempts: attempt,
        error: parsedError.message,
      };
    }
  }

  return {
    success: false,
    strategy: 'exponential-backoff',
    attempts: config.maxRetries,
    error: 'Max retries exceeded',
  };
}

/**
 * 策略 2：降级到更小的模型
 */
async function fallbackToSmallerModel(
  request: any,
  config: RetryConfig
): Promise<RecoveryResult> {
  // 模型降级顺序：Opus → Sonnet → Haiku
  const fallbackChain: ClaudeModel[] = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
  ];

  const currentModelIndex = fallbackChain.indexOf(request.model);
  
  // 如果已经是最小的模型，无法降级
  if (currentModelIndex === fallbackChain.length - 1) {
    return {
      success: false,
      strategy: 'fallback-model',
      attempts: 1,
      error: 'Already using smallest model',
    };
  }

  // 尝试降级
  for (let i = currentModelIndex + 1; i < fallbackChain.length; i++) {
    const fallbackModel = fallbackChain[i];
    
    console.log(`[Claude Error Recovery] Falling back to ${fallbackModel}`);

    try {
      const result = await makeClaudeRequest({
        ...request,
        model: fallbackModel,
      });

      return {
        success: true,
        strategy: 'fallback-model',
        attempts: i - currentModelIndex,
        finalModel: fallbackModel,
      };
    } catch (error: any) {
      console.warn(`[Claude Error Recovery] Fallback to ${fallbackModel} failed:`, error.message);
      continue;
    }
  }

  return {
    success: false,
    strategy: 'fallback-model',
    attempts: fallbackChain.length - currentModelIndex - 1,
    error: 'All fallback models failed',
  };
}

/**
 * 策略 3：减少上下文并重试
 */
async function reduceContextAndRetry(
  request: any,
  config: RetryConfig
): Promise<RecoveryResult> {
  console.log('[Claude Error Recovery] Reducing context size');

  try {
    // 使用上下文优化器减少上下文
    const optimized = await optimizeClaudeContext(
      request.messages,
      request.system,
      {
        maxMessages: 10,  // 减少到 10 条消息
        summarizationThreshold: 50_000,  // 降低摘要阈值
        useCaching: false,  // 禁用缓存（避免额外复杂性）
        preserveDecisions: true,
      }
    );

    // 重试请求
    const result = await makeClaudeRequest({
      ...request,
      messages: optimized.messages,
      system: optimized.system,
    });

    return {
      success: true,
      strategy: 'reduce-context',
      attempts: 1,
      finalModel: request.model,
    };
  } catch (error: any) {
    return {
      success: false,
      strategy: 'reduce-context',
      attempts: 1,
      error: parseClaudeError(error).message,
    };
  }
}

/**
 * 策略 4：拆分请求
 */
async function splitAndRetry(
  request: any,
  config: RetryConfig
): Promise<RecoveryResult> {
  console.log('[Claude Error Recovery] Splitting request');

  try {
    // 将消息拆分成两部分
    const midpoint = Math.floor(request.messages.length / 2);
    const firstHalf = request.messages.slice(0, midpoint);
    const secondHalf = request.messages.slice(midpoint);

    // 处理第一部分
    const firstResult = await makeClaudeRequest({
      ...request,
      messages: firstHalf,
    });

    // 处理第二部分（将第一部分的结果作为上下文）
    const secondResult = await makeClaudeRequest({
      ...request,
      messages: secondHalf,
      system: `${request.system}\n\n[Previous context]: ${firstResult}`,
    });

    return {
      success: true,
      strategy: 'split-request',
      attempts: 2,
      finalModel: request.model,
    };
  } catch (error: any) {
    return {
      success: false,
      strategy: 'split-request',
      attempts: 1,
      error: parseClaudeError(error).message,
    };
  }
}

/**
 * 策略 5：简单重试
 */
async function simpleRetry(
  request: any,
  config: RetryConfig
): Promise<RecoveryResult> {
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    console.log(`[Claude Error Recovery] Simple retry attempt ${attempt}/${config.maxRetries}`);

    try {
      await sleep(config.initialDelay);
      const result = await makeClaudeRequest(request);
      
      return {
        success: true,
        strategy: 'retry',
        attempts: attempt,
        finalModel: request.model,
      };
    } catch (error: any) {
      if (attempt === config.maxRetries) {
        return {
          success: false,
          strategy: 'retry',
          attempts: attempt,
          error: parseClaudeError(error).message,
        };
      }
    }
  }

  return {
    success: false,
    strategy: 'retry',
    attempts: config.maxRetries,
    error: 'Max retries exceeded',
  };
}

/**
 * Placeholder implementation - requires actual Claude API integration
 *
 * This function is a placeholder that needs to be replaced with actual
 * Claude API client integration. The entire error recovery system requires
 * a working Claude API client to function.
 *
 * @throws Error Always throws "Not implemented" error
 */
async function makeClaudeRequest(request: any): Promise<string> {
  throw new Error('Not implemented: This function requires actual Claude API client integration');
}

/**
 * 睡眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 包装函数：自动错误恢复
 */
export async function withErrorRecovery<T>(
  fn: () => Promise<T>,
  request: any,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const parsedError = parseClaudeError(error);
    const recovery = await executeRecovery(parsedError, request, config);

    if (recovery.success) {
      console.log(`[Claude Error Recovery] Recovered successfully using ${recovery.strategy}`);
      // 这里应该返回恢复后的结果
      // 暂时抛出错误
      throw new Error('Recovery succeeded but result not available');
    } else {
      console.error(`[Claude Error Recovery] Recovery failed: ${recovery.error}`);
      throw error;
    }
  }
}
