import { db } from '@/lib/db';
import { agentTraces } from '@/lib/schema';
import { getLLMClient, LLMConfig } from '@/lib/llm';
import { logError, retryWithBackoff } from '@/lib/errors';
import { metricsCollector } from '@/lib/growth/metrics';
import { getGlobalProgressTracker, type ProgressStep } from '@/lib/progress-tracker';
import { getGlobalErrorRecovery } from '@/lib/error-recovery';

/**
 * Base class for all Agents in the AI Product OS.
 * Manages standard tracing to SQLite and LLM client retrieval.
 */
export abstract class BaseAgent<TInput, TOutput> {
  // Unique name identifying the agent (e.g. 'ProtoBuilder', 'ReviewBot')
  public abstract readonly name: string;

  /**
   * Abstract execution loop to be implemented by child agents.
   */
  public abstract run(input: TInput, runId: string): Promise<TOutput>;

  /**
   * Execute the agent with automatic metrics tracking and progress tracking
   */
  public async execute(input: TInput, runId: string): Promise<TOutput> {
    const startTime = Date.now();
    let success = false;
    const tracker = getGlobalProgressTracker();
    
    try {
      // 初始化进度追踪
      tracker.publish({
        runId,
        step: 'init',
        status: 'info',
        message: `启动 ${this.name} Agent`,
        progress: 0,
        timestamp: new Date(),
      });

      const result = await this.run(input, runId);
      success = true;

      // 完成进度追踪
      tracker.publish({
        runId,
        step: 'complete',
        status: 'success',
        message: `${this.name} Agent 执行完成`,
        progress: 100,
        timestamp: new Date(),
      });

      // Write terminal success trace to DB so the frontend can detect completion
      await this.trace(runId, 'Success', 'success', `${this.name} Agent 执行完成`);

      return result;
    } catch (error) {
      // 错误进度追踪
      tracker.publish({
        runId,
        step: 'error',
        status: 'error',
        message: `${this.name} Agent 执行失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0,
        timestamp: new Date(),
        details: { error: error instanceof Error ? error.message : String(error) },
      });

      // Write terminal failure trace to DB so the frontend can detect completion
      await this.trace(runId, 'Failed', 'error', `${this.name} Agent 执行失败: ${error instanceof Error ? error.message : 'Unknown error'}`);

      throw error;
    } finally {
      const duration = Date.now() - startTime;
      
      // Track agent execution metrics
      try {
        await metricsCollector.trackAgentExecution(this.name, success, duration);
        await metricsCollector.trackFeature(this.name, duration);
      } catch (error) {
        // Don't fail the agent execution if metrics tracking fails
        console.error('Failed to track metrics:', error);
      }

      // 清理进度追踪数据
      setTimeout(() => {
        tracker.cleanup(runId);
      }, 60000); // 1分钟后清理
    }
  }

  /**
   * Records a tracing step in the SQLite database `agent_traces` table.
   * Useful for showing agent execution progress in the frontend dashboard.
   * Also publishes to real-time progress tracker.
   */
  protected async trace(
    runId: string,
    step: string,
    status: 'info' | 'success' | 'warning' | 'error',
    message: string,
    details?: any
  ): Promise<void> {
    try {
      const detailsStr = details 
        ? typeof details === 'string' 
          ? details 
          : JSON.stringify(details, null, 2) 
        : null;

      await db.insert(agentTraces).values({
        agentName: this.name,
        runId,
        step,
        status,
        message,
        details: detailsStr,
      });

      console.log(`[Agent: ${this.name}] [Run: ${runId}] [${status.toUpperCase()}] ${step} - ${message}`);

      // 发布到实时进度追踪器
      const tracker = getGlobalProgressTracker();
      tracker.publish({
        runId,
        step,
        status,
        message,
        progress: tracker.getProgress(runId),
        timestamp: new Date(),
        details: details ? (typeof details === 'object' ? details : { value: details }) : undefined,
      });
    } catch (error) {
      logError(error, `${this.name} - trace`);
    }
  }

  /**
   * Helper function to instantiate the active LLM client configuration.
   * Includes retry logic for transient failures.
   */
  protected async getLLM(): Promise<LLMConfig> {
    return await retryWithBackoff(
      () => getLLMClient(this.name),
      {
        maxRetries: 2,
        initialDelay: 500,
        shouldRetry: (error) => {
          // Retry on network errors, but not on configuration errors
          if (error instanceof Error) {
            return error.message.includes('network') || 
                   error.message.includes('timeout') ||
                   error.message.includes('ECONNREFUSED');
          }
          return false;
        }
      }
    );
  }

  /**
   * Safe wrapper for LLM calls with automatic error handling, tracing, and recovery
   */
  protected async safeLLMCall<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>,
    options?: {
      maxRetries?: number;
      onRetry?: (attempt: number, error: unknown) => void;
    }
  ): Promise<T> {
    const { maxRetries = 3, onRetry } = options || {};
    const recovery = getGlobalErrorRecovery();
    
    return await recovery.executeWithRecovery(
      fn,
      {
        runId,
        agentName: this.name,
        taskType: 'default',
        attempt: 0,
        error: new Error(),
      },
      {
        maxRetries,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      }
    ).catch(async (error) => {
      await this.trace(
        runId,
        stepName,
        'error',
        `LLM 调用失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
      throw error;
    });
  }

  /**
   * Register progress steps for this agent execution
   */
  protected registerProgressSteps(runId: string, steps: ProgressStep[]): void {
    const tracker = getGlobalProgressTracker();
    tracker.registerSteps(runId, steps);
  }

  /**
   * Update a specific progress step
   */
  protected updateProgressStep(
    runId: string,
    stepName: string,
    status: ProgressStep['status'],
    message: string,
    details?: Record<string, any>
  ): void {
    const tracker = getGlobalProgressTracker();
    tracker.updateStep(runId, stepName, status, message, details);
  }
}
export type { LLMConfig };
