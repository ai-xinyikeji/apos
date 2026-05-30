import { BaseAgent } from '@/agents/base';

export interface AgentTask<TInput = any, TOutput = any> {
  id: string;
  agent: BaseAgent<TInput, TOutput>;
  input: TInput;
  dependencies: string[];
  priority?: number;
}

export interface ExecutionResult<T = any> {
  taskId: string;
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

/**
 * Parallel Agent Executor - 并行执行独立的 Agent 任务
 * 
 * 功能:
 * - 构建任务依赖图
 * - 拓扑排序
 * - 按层并行执行
 * - 错误隔离
 * 
 * 使用场景:
 * - 多个独立的代码生成任务
 * - 并行的代码审查
 * - 批量的可行性评估
 */
export class ParallelAgentExecutor {
  /**
   * 并行执行多个 Agent 任务
   * 
   * @param tasks - 任务列表
   * @returns 执行结果映射
   */
  async executeParallel<T = any>(
    tasks: AgentTask[]
  ): Promise<Map<string, ExecutionResult<T>>> {
    // 1. 验证任务
    this.validateTasks(tasks);

    // 2. 构建依赖图
    const graph = this.buildDependencyGraph(tasks);

    // 3. 检测循环依赖
    this.detectCycles(graph);

    // 4. 拓扑排序
    const layers = this.topologicalSort(graph, tasks);

    // 5. 按层并行执行
    const results = new Map<string, ExecutionResult<T>>();
    
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const layer = layers[layerIndex];
      
      console.log(`[ParallelExecutor] 执行第 ${layerIndex + 1}/${layers.length} 层，包含 ${layer.length} 个任务`);

      // 并行执行当前层的所有任务
      const promises = layer.map(async (taskId) => {
        const task = tasks.find(t => t.id === taskId)!;
        
        // 获取依赖结果
        const deps = task.dependencies.map(depId => {
          const depResult = results.get(depId);
          if (!depResult || !depResult.success) {
            throw new Error(`依赖任务 ${depId} 失败或未执行`);
          }
          return depResult.result;
        });

        // 执行任务
        const startTime = Date.now();
        try {
          const runId = `parallel_${taskId}_${Date.now()}`;
          const result = await task.agent.execute(task.input, runId);
          const duration = Date.now() - startTime;

          return {
            taskId,
            success: true,
            result,
            duration,
          } as ExecutionResult<T>;
        } catch (error) {
          const duration = Date.now() - startTime;
          console.error(`[ParallelExecutor] 任务 ${taskId} 失败:`, error);

          return {
            taskId,
            success: false,
            error: error as Error,
            duration,
          } as ExecutionResult<T>;
        }
      });

      // 等待当前层所有任务完成
      const layerResults = await Promise.all(promises);
      
      // 保存结果
      layerResults.forEach(result => {
        results.set(result.taskId, result);
      });

      // 检查是否有失败的任务
      const failedTasks = layerResults.filter(r => !r.success);
      if (failedTasks.length > 0) {
        console.warn(`[ParallelExecutor] 第 ${layerIndex + 1} 层有 ${failedTasks.length} 个任务失败`);
        
        // 如果有依赖失败任务的后续任务，标记为跳过
        const failedTaskIds = new Set(failedTasks.map(t => t.taskId));
        for (let i = layerIndex + 1; i < layers.length; i++) {
          const nextLayer = layers[i];
          for (const taskId of nextLayer) {
            const task = tasks.find(t => t.id === taskId)!;
            const hasFailedDep = task.dependencies.some(depId => failedTaskIds.has(depId));
            
            if (hasFailedDep) {
              results.set(taskId, {
                taskId,
                success: false,
                error: new Error('依赖任务失败，跳过执行'),
                duration: 0,
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * 验证任务列表
   */
  private validateTasks(tasks: AgentTask[]): void {
    // 检查任务 ID 唯一性
    const ids = new Set<string>();
    for (const task of tasks) {
      if (ids.has(task.id)) {
        throw new Error(`任务 ID 重复: ${task.id}`);
      }
      ids.add(task.id);
    }

    // 检查依赖是否存在
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (!ids.has(depId)) {
          throw new Error(`任务 ${task.id} 依赖的任务 ${depId} 不存在`);
        }
      }
    }
  }

  /**
   * 构建依赖图
   */
  private buildDependencyGraph(tasks: AgentTask[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const task of tasks) {
      graph.set(task.id, task.dependencies);
    }
    
    return graph;
  }

  /**
   * 检测循环依赖
   */
  private detectCycles(graph: Map<string, string[]>): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const deps = graph.get(node) || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (dfs(dep, path)) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          // 发现循环
          const cycleStart = path.indexOf(dep);
          const cycle = path.slice(cycleStart).concat(dep);
          throw new Error(`检测到循环依赖: ${cycle.join(' -> ')}`);
        }
      }

      recursionStack.delete(node);
      path.pop();
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }
  }

  /**
   * 拓扑排序 - 将任务分层
   */
  private topologicalSort(
    graph: Map<string, string[]>,
    tasks: AgentTask[]
  ): string[][] {
    const layers: string[][] = [];
    const inDegree = new Map<string, number>();
    
    // 计算入度
    for (const taskId of graph.keys()) {
      inDegree.set(taskId, 0);
    }
    
    for (const deps of graph.values()) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    // 按层处理
    while (inDegree.size > 0) {
      // 找出当前层（入度为 0 的节点）
      const currentLayer: string[] = [];
      
      for (const [taskId, degree] of inDegree.entries()) {
        if (degree === 0) {
          currentLayer.push(taskId);
        }
      }

      if (currentLayer.length === 0) {
        throw new Error('无法完成拓扑排序，可能存在循环依赖');
      }

      // 按优先级排序当前层
      currentLayer.sort((a, b) => {
        const taskA = tasks.find(t => t.id === a)!;
        const taskB = tasks.find(t => t.id === b)!;
        return (taskB.priority || 0) - (taskA.priority || 0);
      });

      layers.push(currentLayer);

      // 移除当前层的节点，更新入度
      for (const taskId of currentLayer) {
        inDegree.delete(taskId);
        
        // 更新依赖此节点的其他节点的入度
        for (const [otherId, deps] of graph.entries()) {
          if (deps.includes(taskId)) {
            const currentDegree = inDegree.get(otherId);
            if (currentDegree !== undefined) {
              inDegree.set(otherId, currentDegree - 1);
            }
          }
        }
      }
    }

    return layers;
  }

  /**
   * 生成执行报告
   */
  generateReport<T>(results: Map<string, ExecutionResult<T>>): string {
    const total = results.size;
    const successful = Array.from(results.values()).filter(r => r.success).length;
    const failed = total - successful;
    const totalDuration = Array.from(results.values()).reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = totalDuration / total;

    const lines = [
      '## 并行执行报告',
      '',
      `**总任务数**: ${total}`,
      `**成功**: ${successful}`,
      `**失败**: ${failed}`,
      `**总耗时**: ${(totalDuration / 1000).toFixed(2)}s`,
      `**平均耗时**: ${(avgDuration / 1000).toFixed(2)}s`,
      '',
      '### 任务详情',
      '',
    ];

    for (const [taskId, result] of results.entries()) {
      const status = result.success ? '✅' : '❌';
      const duration = (result.duration / 1000).toFixed(2);
      lines.push(`- ${status} **${taskId}**: ${duration}s`);
      
      if (!result.success && result.error) {
        lines.push(`  - 错误: ${result.error.message}`);
      }
    }

    return lines.join('\n');
  }
}
