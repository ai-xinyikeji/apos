/**
 * 错误恢复机制
 * 自动重试、智能降级、错误分析
 */

import { type TaskType } from './llm';
import { getGlobalProgressTracker } from './progress-tracker';

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'skip' | 'abort';
  reason: string;
  action?: string;
  fallbackModel?: string;
}

export interface RecoveryContext {
  runId: string;
  agentName: string;
  taskType: TaskType;
  attempt: number;
  error: Error;
}

/**
 * 错误恢复器
 */
export class ErrorRecovery {
  private defaultOptions: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'rate limit',
      'timeout',
      'network',
      'connection',
      'ECONNRESET',
      'ETIMEDOUT',
      '429',
      '503',
      '504',
    ],
  };

  /**
   * 带恢复机制的执行函数
   */
  async executeWithRecovery<T>(
    fn: () => Promise<T>,
    context: RecoveryContext,
    options?: Partial<RetryOptions>
  ): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    let lastError: Error | null = null;
    const tracker = getGlobalProgressTracker();

    for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
      try {
        // 如果是重试，记录日志
        if (attempt > 0) {
          tracker.publish({
            runId: context.runId,
            step: 'retry',
            status: 'warning',
            message: `重试第 ${attempt} 次...`,
            progress: 0,
            timestamp: new Date(),
            details: { attempt, maxRetries: opts.maxRetries },
          });
        }

        return await fn();
      } catch (error) {
        lastError = error as Error;
        context.attempt = attempt;

        // 分析错误并决定恢复策略
        const strategy = this.analyzeError(error, context, opts);

        tracker.publish({
          runId: context.runId,
          step: 'error_analysis',
          status: 'warning',
          message: `错误: ${lastError.message}`,
          progress: 0,
          timestamp: new Date(),
          details: {
            error: lastError.message,
            strategy: strategy.type,
            reason: strategy.reason,
          },
        });

        // 应用恢复策略
        const shouldContinue = await this.applyStrategy(strategy, context);

        if (!shouldContinue) {
          throw lastError;
        }

        // 计算延迟时间
        const delay = Math.min(
          opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelay
        );

        // 等待后重试
        await this.delay(delay);
      }
    }

    // 所有重试都失败
    throw lastError || new Error('All retries failed');
  }

  /**
   * 分析错误并决定恢复策略
   */
  private analyzeError(
    error: unknown,
    context: RecoveryContext,
    options: RetryOptions
  ): RecoveryStrategy {
    if (!(error instanceof Error)) {
      return {
        type: 'abort',
        reason: 'Unknown error type',
      };
    }

    const message = error.message.toLowerCase();

    // 1. Rate Limit - 等待后重试
    if (message.includes('rate limit') || message.includes('429')) {
      return {
        type: 'retry',
        reason: 'Rate limit exceeded',
        action: 'Wait and retry with exponential backoff',
      };
    }

    // 2. Timeout - 增加超时时间后重试
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return {
        type: 'retry',
        reason: 'Request timeout',
        action: 'Retry with increased timeout',
      };
    }

    // 3. Context Too Long - 降级到更大上下文的模型
    if (message.includes('context') && message.includes('too long')) {
      return {
        type: 'fallback',
        reason: 'Context length exceeded',
        action: 'Fallback to model with larger context window',
        fallbackModel: 'claude-3-5-sonnet-20241022', // 200K context
      };
    }

    // 4. Model Unavailable - 降级到备用模型
    if (
      message.includes('model') &&
      (message.includes('unavailable') || message.includes('not found'))
    ) {
      return {
        type: 'fallback',
        reason: 'Model unavailable',
        action: 'Fallback to alternative model',
        fallbackModel: this.getFallbackModel(context.taskType),
      };
    }

    // 5. Network Error - 重试
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('ECONNRESET')
    ) {
      return {
        type: 'retry',
        reason: 'Network error',
        action: 'Retry after network recovery',
      };
    }

    // 6. 检查是否是可重试的错误
    const isRetryable = options.retryableErrors?.some(pattern =>
      message.includes(pattern.toLowerCase())
    );

    if (isRetryable) {
      return {
        type: 'retry',
        reason: 'Retryable error detected',
        action: 'Retry with exponential backoff',
      };
    }

    // 7. 不可恢复的错误
    return {
      type: 'abort',
      reason: 'Non-retryable error',
      action: 'Abort execution',
    };
  }

  /**
   * 应用恢复策略
   */
  private async applyStrategy(
    strategy: RecoveryStrategy,
    context: RecoveryContext
  ): Promise<boolean> {
    const tracker = getGlobalProgressTracker();

    switch (strategy.type) {
      case 'retry':
        tracker.publish({
          runId: context.runId,
          step: 'recovery',
          status: 'info',
          message: `应用恢复策略: ${strategy.action}`,
          progress: 0,
          timestamp: new Date(),
          details: { strategy: strategy.type, reason: strategy.reason },
        });
        return true;

      case 'fallback':
        tracker.publish({
          runId: context.runId,
          step: 'recovery',
          status: 'warning',
          message: `降级到备用模型: ${strategy.fallbackModel}`,
          progress: 0,
          timestamp: new Date(),
          details: {
            strategy: strategy.type,
            reason: strategy.reason,
            fallbackModel: strategy.fallbackModel,
          },
        });
        // TODO: 实际切换模型
        return true;

      case 'skip':
        tracker.publish({
          runId: context.runId,
          step: 'recovery',
          status: 'warning',
          message: '跳过当前步骤',
          progress: 0,
          timestamp: new Date(),
          details: { strategy: strategy.type, reason: strategy.reason },
        });
        return false;

      case 'abort':
        tracker.publish({
          runId: context.runId,
          step: 'recovery',
          status: 'error',
          message: `无法恢复: ${strategy.reason}`,
          progress: 0,
          timestamp: new Date(),
          details: { strategy: strategy.type, reason: strategy.reason },
        });
        return false;

      default:
        return false;
    }
  }

  /**
   * 获取备用模型
   */
  private getFallbackModel(taskType: TaskType): string {
    const fallbackMap: Record<TaskType, string> = {
      reasoning: 'claude-3-5-sonnet-20241022',
      coding: 'gemini-1.5-flash',
      summarize: 'gemini-1.5-flash',
      refactor: 'gemini-1.5-flash',
      review: 'claude-3-5-sonnet-20241022',
      planning: 'claude-3-5-sonnet-20241022',
      explain: 'gemini-1.5-flash',
      default: 'gemini-1.5-flash',
    };

    return fallbackMap[taskType] || fallbackMap.default;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 全局单例
let globalRecovery: ErrorRecovery | null = null;

export function getGlobalErrorRecovery(): ErrorRecovery {
  if (!globalRecovery) {
    globalRecovery = new ErrorRecovery();
  }
  return globalRecovery;
}

/**
 * 装饰器: 为函数添加错误恢复能力
 */
export function WithRecovery(options?: Partial<RetryOptions>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      const recovery = getGlobalErrorRecovery();
      const context: RecoveryContext = {
        runId: args[1] || 'unknown', // 假设第二个参数是 runId
        agentName: this.name || 'UnknownAgent',
        taskType: 'default',
        attempt: 0,
        error: new Error(),
      };

      return recovery.executeWithRecovery(
        () => originalMethod.apply(this, args),
        context,
        options
      );
    };

    return descriptor;
  };
}
