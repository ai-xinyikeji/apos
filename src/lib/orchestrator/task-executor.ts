/**
 * Task Executor
 * Executes tasks in parallel with dependency management
 */

import { TaskDAG, type Task, type TaskStatus } from './task-dag';
import { ProtoBuilderAgent } from '@/agents/proto-builder';
import { ReviewBotAgent } from '@/agents/review-bot';
import { SignalCollectorAgent } from '@/agents/signal-collector';
import { ReportGeneratorAgent } from '@/agents/report-generator';
import { OpenHandsAgent } from '@/agents/openhands-agent';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecutionOptions {
  maxParallel?: number; // Maximum number of parallel tasks (default: 3)
  timeout?: number; // Task timeout in ms (default: 5 minutes)
  onTaskStart?: (task: Task) => void;
  onTaskComplete?: (task: Task) => void;
  onTaskFail?: (task: Task, error: Error) => void;
}

export class TaskExecutor {
  private dag: TaskDAG;
  private options: Required<ExecutionOptions>;
  private runningTasks: Set<string> = new Set();
  
  constructor(dag: TaskDAG, options: ExecutionOptions = {}) {
    this.dag = dag;
    this.options = {
      maxParallel: options.maxParallel || 3,
      timeout: options.timeout || 5 * 60 * 1000, // 5 minutes
      onTaskStart: options.onTaskStart || (() => {}),
      onTaskComplete: options.onTaskComplete || (() => {}),
      onTaskFail: options.onTaskFail || (() => {}),
    };
  }
  
  /**
   * Execute all tasks in the DAG
   */
  async execute(): Promise<{ success: boolean; results: Map<string, any> }> {
    // Validate DAG
    const validation = this.dag.validate();
    if (!validation.valid) {
      throw new Error(`Invalid DAG: ${validation.error}`);
    }
    
    const results = new Map<string, any>();
    
    // Execute tasks in waves
    while (!this.dag.isComplete()) {
      const readyTasks = this.dag.getReadyTasks();
      
      if (readyTasks.length === 0 && this.runningTasks.size === 0) {
        // No ready tasks and no running tasks - deadlock or all failed
        break;
      }
      
      // Execute ready tasks in parallel (up to maxParallel)
      const tasksToExecute = readyTasks.slice(0, this.options.maxParallel - this.runningTasks.size);
      
      const promises = tasksToExecute.map(task => this.executeTask(task, results));
      
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      } else {
        // Wait a bit if no tasks to execute but some are running
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const stats = this.dag.getStats();
    const success = stats.failed === 0;
    
    return { success, results };
  }
  
  /**
   * Execute a single task
   */
  private async executeTask(task: Task, results: Map<string, any>): Promise<void> {
    this.runningTasks.add(task.id);
    this.dag.updateTaskStatus(task.id, 'running');
    this.options.onTaskStart(task);
    
    try {
      let result: any;
      
      // Execute based on task type
      switch (task.type) {
        case 'agent':
          result = await this.executeAgentTask(task);
          break;
        case 'shell':
          result = await this.executeShellTask(task);
          break;
        case 'custom':
          result = await this.executeCustomTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      
      // Task completed successfully
      this.dag.updateTaskStatus(task.id, 'completed', result);
      results.set(task.id, result);
      this.options.onTaskComplete(task);
      
    } catch (error: any) {
      // Task failed
      this.dag.updateTaskStatus(task.id, 'failed', undefined, error.message);
      this.options.onTaskFail(task, error);
      
      // Mark dependent tasks as skipped
      this.skipDependentTasks(task.id);
      
    } finally {
      this.runningTasks.delete(task.id);
    }
  }
  
  /**
   * Execute an agent task
   */
  private async executeAgentTask(task: Task): Promise<any> {
    if (!task.agentName) {
      throw new Error('Agent name is required for agent tasks');
    }
    
    const runId = `${task.id}-${Date.now()}`;
    
    // Create agent instance
    let agent: any;
    switch (task.agentName) {
      case 'ProtoBuilder':
        agent = new ProtoBuilderAgent();
        break;
      case 'ReviewBot':
        agent = new ReviewBotAgent();
        break;
      case 'SignalCollector':
        agent = new SignalCollectorAgent();
        break;
      case 'ReportGenerator':
        agent = new ReportGeneratorAgent();
        break;
      case 'OpenHands':
        agent = new OpenHandsAgent();
        break;
      default:
        throw new Error(`Unknown agent: ${task.agentName}`);
    }
    
    // Execute agent
    const result = await agent.run(task.input, runId);
    return result;
  }
  
  /**
   * Execute a shell command task
   */
  private async executeShellTask(task: Task): Promise<any> {
    if (!task.command) {
      throw new Error('Command is required for shell tasks');
    }
    
    const { stdout, stderr } = await execAsync(task.command, {
      timeout: this.options.timeout,
      cwd: process.cwd(),
    });
    
    return { stdout, stderr };
  }
  
  /**
   * Execute a custom task
   */
  private async executeCustomTask(task: Task): Promise<any> {
    // Custom tasks can be extended by users
    throw new Error('Custom tasks not implemented yet');
  }
  
  /**
   * Skip all tasks that depend on a failed task
   */
  private skipDependentTasks(failedTaskId: string): void {
    const visited = new Set<string>();
    
    const skip = (taskId: string) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      
      const task = this.dag.getTask(taskId);
      if (!task) return;
      
      // Skip if pending
      if (task.status === 'pending') {
        this.dag.updateTaskStatus(taskId, 'skipped', undefined, `Dependency ${failedTaskId} failed`);
      }
      
      // Recursively skip dependents
      const allTasks = this.dag.getAllTasks();
      for (const t of allTasks) {
        if (t.dependencies.includes(taskId)) {
          skip(t.id);
        }
      }
    };
    
    // Find and skip all dependents
    const allTasks = this.dag.getAllTasks();
    for (const task of allTasks) {
      if (task.dependencies.includes(failedTaskId)) {
        skip(task.id);
      }
    }
  }
}
