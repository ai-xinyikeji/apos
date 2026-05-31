/**
 * 多 Agent 协作工作流
 * 智能分配任务给最适合的 Agent，优化成本和质量
 */

import { BaseAgent } from '@/agents/base';
import { ProtoBuilderAgent } from '@/agents/proto-builder';
import { ReviewBotAgent } from '@/agents/review-bot';
import { ArchitectAgent } from '@/agents/architect-agent';
import { getGlobalProgressTracker } from '@/lib/progress-tracker';
import { getGlobalErrorRecovery } from '@/lib/error-recovery';
import type { TaskType } from '@/lib/llm';

export interface WorkflowTask {
  id: string;
  type: 'design' | 'code' | 'review' | 'test' | 'refactor';
  complexity: 'low' | 'medium' | 'high';
  input: any;
  dependencies?: string[];
  preferredAgent?: string;
}

export interface WorkflowResult {
  taskId: string;
  success: boolean;
  output: any;
  agent: string;
  duration: number;
  cost: number;
}

export interface WorkflowStrategy {
  name: string;
  description: string;
  costWeight: number; // 0-1, 成本权重
  qualityWeight: number; // 0-1, 质量权重
  speedWeight: number; // 0-1, 速度权重
}

/**
 * 预定义的工作流策略
 */
export const WORKFLOW_STRATEGIES = {
  COST_OPTIMIZED: {
    name: 'cost-optimized',
    description: '成本优先：尽可能使用便宜的模型',
    costWeight: 0.7,
    qualityWeight: 0.2,
    speedWeight: 0.1,
  },
  QUALITY_OPTIMIZED: {
    name: 'quality-optimized',
    description: '质量优先：使用最好的模型保证质量',
    costWeight: 0.1,
    qualityWeight: 0.7,
    speedWeight: 0.2,
  },
  SPEED_OPTIMIZED: {
    name: 'speed-optimized',
    description: '速度优先：快速完成任务',
    costWeight: 0.2,
    qualityWeight: 0.2,
    speedWeight: 0.6,
  },
  BALANCED: {
    name: 'balanced',
    description: '平衡模式：成本、质量、速度均衡',
    costWeight: 0.33,
    qualityWeight: 0.34,
    speedWeight: 0.33,
  },
} as const;

/**
 * 多 Agent 协作工作流编排器
 */
export class MultiAgentWorkflow {
  private strategy: WorkflowStrategy;
  private agents: Map<string, BaseAgent<any, any>>;

  constructor(strategy: WorkflowStrategy = WORKFLOW_STRATEGIES.BALANCED) {
    this.strategy = strategy;
    this.agents = new Map();
    this.initializeAgents();
  }

  /**
   * 初始化可用的 Agent
   */
  private initializeAgents() {
    this.agents.set('ProtoBuilder', new ProtoBuilderAgent());
    this.agents.set('ReviewBot', new ReviewBotAgent());
    this.agents.set('Architect', new ArchitectAgent());
  }

  /**
   * 执行复杂的多 Agent 工作流
   */
  async executeWorkflow(
    tasks: WorkflowTask[],
    runId: string
  ): Promise<WorkflowResult[]> {
    const tracker = getGlobalProgressTracker();

    // 注册工作流步骤
    tracker.registerSteps(runId, [
      { name: 'init', weight: 5, status: 'pending' },
      { name: 'analyze_tasks', weight: 10, status: 'pending' },
      { name: 'assign_agents', weight: 10, status: 'pending' },
      { name: 'execute_tasks', weight: 60, status: 'pending' },
      { name: 'validate_results', weight: 10, status: 'pending' },
      { name: 'complete', weight: 5, status: 'pending' },
    ]);

    tracker.updateStep(runId, 'init', 'running', '初始化工作流...');
    tracker.updateStep(runId, 'init', 'completed', '初始化完成');

    try {
      // 1. 分析任务
      tracker.updateStep(runId, 'analyze_tasks', 'running', '分析任务复杂度...');
      const analyzedTasks = this.analyzeTasks(tasks);
      tracker.updateStep(
        runId,
        'analyze_tasks',
        'completed',
        `分析完成，共 ${tasks.length} 个任务`
      );

      // 2. 分配 Agent
      tracker.updateStep(runId, 'assign_agents', 'running', '分配最优 Agent...');
      const assignments = this.assignAgents(analyzedTasks);
      tracker.updateStep(
        runId,
        'assign_agents',
        'completed',
        `Agent 分配完成`,
        { assignments }
      );

      // 3. 执行任务
      tracker.updateStep(runId, 'execute_tasks', 'running', '执行任务...');
      const results = await this.executeTasks(assignments, runId);
      tracker.updateStep(
        runId,
        'execute_tasks',
        'completed',
        `任务执行完成，成功 ${results.filter(r => r.success).length}/${results.length}`
      );

      // 4. 验证结果
      tracker.updateStep(runId, 'validate_results', 'running', '验证结果...');
      const validated = await this.validateResults(results, runId);
      tracker.updateStep(runId, 'validate_results', 'completed', '验证完成');

      tracker.updateStep(runId, 'complete', 'completed', '工作流完成');

      return validated;
    } catch (error) {
      tracker.updateStep(
        runId,
        'error',
        'failed',
        `工作流失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  /**
   * 分析任务复杂度和特征
   */
  private analyzeTasks(tasks: WorkflowTask[]): WorkflowTask[] {
    return tasks.map(task => {
      // 如果没有指定复杂度，自动分析
      if (!task.complexity) {
        task.complexity = this.estimateComplexity(task);
      }
      return task;
    });
  }

  /**
   * 估算任务复杂度
   */
  private estimateComplexity(task: WorkflowTask): 'low' | 'medium' | 'high' {
    let score = 0;

    // 根据任务类型评分
    if (task.type === 'design') score += 3;
    if (task.type === 'review') score += 2;
    if (task.type === 'code') score += 1;
    if (task.type === 'test') score += 1;
    if (task.type === 'refactor') score += 2;

    // 根据输入大小评分
    const inputSize = JSON.stringify(task.input).length;
    if (inputSize > 5000) score += 2;
    else if (inputSize > 1000) score += 1;

    // 根据依赖数量评分
    if (task.dependencies && task.dependencies.length > 2) score += 1;

    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  /**
   * 为任务分配最优 Agent
   */
  private assignAgents(
    tasks: WorkflowTask[]
  ): Array<{ task: WorkflowTask; agent: BaseAgent<any, any>; agentName: string }> {
    return tasks.map(task => {
      // 如果指定了 Agent，直接使用
      if (task.preferredAgent && this.agents.has(task.preferredAgent)) {
        return {
          task,
          agent: this.agents.get(task.preferredAgent)!,
          agentName: task.preferredAgent,
        };
      }

      // 根据策略选择最优 Agent
      const agentName = this.selectOptimalAgent(task);
      return {
        task,
        agent: this.agents.get(agentName)!,
        agentName,
      };
    });
  }

  /**
   * 根据策略选择最优 Agent
   */
  private selectOptimalAgent(task: WorkflowTask): string {
    const { costWeight, qualityWeight, speedWeight } = this.strategy;

    // Agent 特性评分
    const agentScores = {
      ProtoBuilder: {
        cost: task.complexity === 'low' ? 0.9 : task.complexity === 'medium' ? 0.6 : 0.3,
        quality: task.complexity === 'low' ? 0.7 : task.complexity === 'medium' ? 0.8 : 0.9,
        speed: task.complexity === 'low' ? 0.9 : task.complexity === 'medium' ? 0.7 : 0.5,
      },
      ReviewBot: {
        cost: 0.7,
        quality: 0.9,
        speed: 0.8,
      },
      Architect: {
        cost: 0.3,
        quality: 0.95,
        speed: 0.4,
      },
    };

    // 根据任务类型调整
    if (task.type === 'design') {
      return 'Architect'; // 设计任务优先使用架构师
    }
    if (task.type === 'review') {
      return 'ReviewBot'; // 审查任务优先使用审查机器人
    }

    // 计算综合得分
    let bestAgent = 'ProtoBuilder';
    let bestScore = 0;

    for (const [agentName, scores] of Object.entries(agentScores)) {
      const score =
        scores.cost * costWeight +
        scores.quality * qualityWeight +
        scores.speed * speedWeight;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentName;
      }
    }

    return bestAgent;
  }

  /**
   * 执行任务
   */
  private async executeTasks(
    assignments: Array<{ task: WorkflowTask; agent: BaseAgent<any, any>; agentName: string }>,
    runId: string
  ): Promise<WorkflowResult[]> {
    const results: WorkflowResult[] = [];
    const recovery = getGlobalErrorRecovery();

    for (const { task, agent, agentName } of assignments) {
      const startTime = Date.now();

      try {
        // 使用错误恢复执行任务
        const output = await recovery.executeWithRecovery(
          () => agent.execute(task.input, `${runId}-${task.id}`),
          {
            runId,
            agentName,
            taskType: this.mapTaskTypeToLLMType(task.type),
            attempt: 0,
            error: new Error(),
          },
          {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
          }
        );

        const duration = Date.now() - startTime;

        results.push({
          taskId: task.id,
          success: true,
          output,
          agent: agentName,
          duration,
          cost: this.estimateCost(task, agentName, duration),
        });
      } catch (error) {
        const duration = Date.now() - startTime;

        results.push({
          taskId: task.id,
          success: false,
          output: null,
          agent: agentName,
          duration,
          cost: this.estimateCost(task, agentName, duration),
        });
      }
    }

    return results;
  }

  /**
   * 映射任务类型到 LLM 类型
   */
  private mapTaskTypeToLLMType(taskType: WorkflowTask['type']): TaskType {
    const mapping: Record<WorkflowTask['type'], TaskType> = {
      design: 'planning',
      code: 'coding',
      review: 'review',
      test: 'coding',
      refactor: 'refactor',
    };
    return mapping[taskType] || 'default';
  }

  /**
   * 估算任务成本
   */
  private estimateCost(task: WorkflowTask, agentName: string, duration: number): number {
    // 简化的成本估算
    const baseCost = {
      ProtoBuilder: 0.01,
      ReviewBot: 0.015,
      Architect: 0.03,
    }[agentName] || 0.01;

    const complexityMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 2.0,
    }[task.complexity];

    return baseCost * complexityMultiplier;
  }

  /**
   * 验证结果
   */
  private async validateResults(
    results: WorkflowResult[],
    runId: string
  ): Promise<WorkflowResult[]> {
    // 检查是否有失败的任务
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
      const tracker = getGlobalProgressTracker();
      tracker.publish({
        runId,
        step: 'validation',
        status: 'warning',
        message: `${failed.length} 个任务失败`,
        progress: 0,
        timestamp: new Date(),
        details: { failedTasks: failed.map(f => f.taskId) },
      });
    }

    return results;
  }

  /**
   * 生成工作流报告
   */
  generateReport(results: WorkflowResult[]): string {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = total - successful;
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    const agentUsage = results.reduce((acc, r) => {
      acc[r.agent] = (acc[r.agent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return `
# 工作流执行报告

## 概览
- 总任务数: ${total}
- 成功: ${successful}
- 失败: ${failed}
- 成功率: ${((successful / total) * 100).toFixed(1)}%

## 性能
- 总耗时: ${(totalDuration / 1000).toFixed(2)}s
- 平均耗时: ${(totalDuration / total / 1000).toFixed(2)}s/任务
- 总成本: $${totalCost.toFixed(4)}
- 平均成本: $${(totalCost / total).toFixed(4)}/任务

## Agent 使用情况
${Object.entries(agentUsage)
  .map(([agent, count]) => `- ${agent}: ${count} 次`)
  .join('\n')}

## 策略
- 名称: ${this.strategy.name}
- 描述: ${this.strategy.description}
- 成本权重: ${this.strategy.costWeight}
- 质量权重: ${this.strategy.qualityWeight}
- 速度权重: ${this.strategy.speedWeight}
`;
  }
}

/**
 * 创建工作流实例
 */
export function createWorkflow(
  strategy: WorkflowStrategy = WORKFLOW_STRATEGIES.BALANCED
): MultiAgentWorkflow {
  return new MultiAgentWorkflow(strategy);
}
