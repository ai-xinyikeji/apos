/**
 * 实时进度追踪系统
 * 使用 Server-Sent Events (SSE) 推送 Agent 执行进度
 */

import { db } from './db';
import { agentTraces } from './schema';
import { eq, desc } from 'drizzle-orm';

export interface ProgressUpdate {
  runId: string;
  step: string;
  status: 'info' | 'success' | 'error' | 'warning';
  message: string;
  progress: number; // 0-100
  timestamp: Date;
  details?: Record<string, any>;
}

export interface ProgressStep {
  name: string;
  weight: number; // 权重，用于计算总进度
  status: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * 进度追踪器
 */
export class ProgressTracker {
  private steps: Map<string, ProgressStep[]> = new Map();
  private listeners: Map<string, Set<(update: ProgressUpdate) => void>> = new Map();

  /**
   * 注册任务的步骤
   */
  registerSteps(runId: string, steps: ProgressStep[]) {
    this.steps.set(runId, steps);
  }

  /**
   * 订阅进度更新
   */
  subscribe(runId: string, callback: (update: ProgressUpdate) => void) {
    if (!this.listeners.has(runId)) {
      this.listeners.set(runId, new Set());
    }
    this.listeners.get(runId)!.add(callback);

    // 返回取消订阅函数
    return () => {
      const listeners = this.listeners.get(runId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(runId);
        }
      }
    };
  }

  /**
   * 发布进度更新
   */
  publish(update: ProgressUpdate) {
    const listeners = this.listeners.get(update.runId);
    if (listeners) {
      listeners.forEach(callback => callback(update));
    }
  }

  /**
   * 更新步骤状态并计算总进度
   */
  updateStep(
    runId: string,
    stepName: string,
    status: ProgressStep['status'],
    message: string,
    details?: Record<string, any>
  ) {
    const steps = this.steps.get(runId);
    if (!steps) return;

    // 更新步骤状态
    const step = steps.find(s => s.name === stepName);
    if (step) {
      step.status = status;
    }

    // 计算总进度
    const progress = this.calculateProgress(steps);

    // 发布更新
    this.publish({
      runId,
      step: stepName,
      status: status === 'failed' ? 'error' : status === 'completed' ? 'success' : 'info',
      message,
      progress,
      timestamp: new Date(),
      details,
    });
  }

  /**
   * 计算总进度
   */
  private calculateProgress(steps: ProgressStep[]): number {
    const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
    const completedWeight = steps
      .filter(step => step.status === 'completed')
      .reduce((sum, step) => sum + step.weight, 0);

    return Math.round((completedWeight / totalWeight) * 100);
  }

  /**
   * 获取任务的当前进度
   */
  getProgress(runId: string): number {
    const steps = this.steps.get(runId);
    if (!steps) return 0;
    return this.calculateProgress(steps);
  }

  /**
   * 清理已完成任务的数据
   */
  cleanup(runId: string) {
    this.steps.delete(runId);
    this.listeners.delete(runId);
  }
}

// 全局单例
let globalTracker: ProgressTracker | null = null;

export function getGlobalProgressTracker(): ProgressTracker {
  if (!globalTracker) {
    globalTracker = new ProgressTracker();
  }
  return globalTracker;
}

/**
 * 从数据库加载历史进度
 */
export async function loadProgressHistory(runId: string): Promise<ProgressUpdate[]> {
  const traces = await db
    .select()
    .from(agentTraces)
    .where(eq(agentTraces.runId, runId))
    .orderBy(agentTraces.createdAt);

  return traces.map((trace, index) => {
    let parsedDetails: Record<string, any> | undefined = undefined;
    if (trace.details) {
      try {
        parsedDetails = JSON.parse(trace.details);
      } catch {
        parsedDetails = { raw: trace.details };
      }
    }

    return {
      runId: trace.runId,
      step: trace.step,
      status: trace.status as ProgressUpdate['status'],
      message: trace.message,
      progress: Math.round(((index + 1) / traces.length) * 100),
      timestamp: trace.createdAt ? new Date(trace.createdAt) : new Date(),
      details: parsedDetails,
    };
  });
}

/**
 * 预定义的常见任务步骤
 */
export const COMMON_STEPS = {
  PROTO_BUILDER: [
    { name: 'init', weight: 5 },
    { name: 'rag_search', weight: 10 },
    { name: 'feasibility_check', weight: 15 },
    { name: 'generate_code', weight: 40 },
    { name: 'compile_check', weight: 10 },
    { name: 'git_commit', weight: 10 },
    { name: 'create_pr', weight: 5 },
    { name: 'complete', weight: 5 },
  ].map(s => ({ ...s, status: 'pending' as const })),

  REVIEW_BOT: [
    { name: 'init', weight: 5 },
    { name: 'fetch_diff', weight: 10 },
    { name: 'analyze_changes', weight: 30 },
    { name: 'security_check', weight: 20 },
    { name: 'performance_check', weight: 20 },
    { name: 'generate_report', weight: 10 },
    { name: 'complete', weight: 5 },
  ].map(s => ({ ...s, status: 'pending' as const })),

  ARCHITECT: [
    { name: 'init', weight: 5 },
    { name: 'analyze_requirements', weight: 20 },
    { name: 'deep_thinking', weight: 40 },
    { name: 'evaluate_alternatives', weight: 20 },
    { name: 'risk_assessment', weight: 10 },
    { name: 'complete', weight: 5 },
  ].map(s => ({ ...s, status: 'pending' as const })),
};
