/**
 * Task DAG (Directed Acyclic Graph) System
 * Supports parallel task execution with dependency management
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Task {
  id: string;
  name: string;
  type: 'agent' | 'shell' | 'custom';
  agentName?: string;
  command?: string;
  input?: any;
  dependencies: string[]; // Task IDs that must complete before this task
  status: TaskStatus;
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface TaskNode {
  task: Task;
  dependents: Set<string>; // Tasks that depend on this task
}

export class TaskDAG {
  private nodes: Map<string, TaskNode> = new Map();
  private executionOrder: string[] = [];
  
  constructor() {}
  
  /**
   * Add a task to the DAG
   */
  addTask(task: Task): void {
    if (this.nodes.has(task.id)) {
      throw new Error(`Task ${task.id} already exists`);
    }
    
    this.nodes.set(task.id, {
      task,
      dependents: new Set(),
    });
    
    // Update dependents for dependencies
    for (const depId of task.dependencies) {
      const depNode = this.nodes.get(depId);
      if (!depNode) {
        throw new Error(`Dependency ${depId} not found for task ${task.id}`);
      }
      depNode.dependents.add(task.id);
    }
  }
  
  /**
   * Get tasks that are ready to execute (all dependencies completed)
   */
  getReadyTasks(): Task[] {
    const ready: Task[] = [];
    
    for (const [id, node] of this.nodes) {
      const task = node.task;
      
      // Skip if not pending
      if (task.status !== 'pending') {
        continue;
      }
      
      // Check if all dependencies are completed
      const allDepsCompleted = task.dependencies.every(depId => {
        const depNode = this.nodes.get(depId);
        return depNode?.task.status === 'completed';
      });
      
      if (allDepsCompleted) {
        ready.push(task);
      }
    }
    
    return ready;
  }
  
  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: TaskStatus, result?: any, error?: string): void {
    const node = this.nodes.get(taskId);
    if (!node) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    node.task.status = status;
    
    if (status === 'running') {
      node.task.startTime = Date.now();
    }
    
    if (status === 'completed' || status === 'failed') {
      node.task.endTime = Date.now();
      node.task.result = result;
      node.task.error = error;
    }
  }
  
  /**
   * Check if all tasks are completed
   */
  isComplete(): boolean {
    for (const [id, node] of this.nodes) {
      const status = node.task.status;
      if (status !== 'completed' && status !== 'failed' && status !== 'skipped') {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Get execution statistics
   */
  getStats(): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
    skipped: number;
  } {
    const stats = {
      total: this.nodes.size,
      completed: 0,
      failed: 0,
      pending: 0,
      running: 0,
      skipped: 0,
    };
    
    for (const [id, node] of this.nodes) {
      const status = node.task.status;
      stats[status]++;
    }
    
    return stats;
  }
  
  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.nodes.values()).map(node => node.task);
  }
  
  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.nodes.get(taskId)?.task;
  }
  
  /**
   * Validate DAG (check for cycles)
   */
  validate(): { valid: boolean; error?: string } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);
      
      const node = this.nodes.get(taskId);
      if (!node) return false;
      
      for (const depId of node.task.dependencies) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          return true;
        }
      }
      
      recursionStack.delete(taskId);
      return false;
    };
    
    for (const [id] of this.nodes) {
      if (!visited.has(id)) {
        if (hasCycle(id)) {
          return { valid: false, error: 'Cycle detected in task dependencies' };
        }
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Generate execution plan (topological sort)
   */
  generateExecutionPlan(): string[] {
    const plan: string[] = [];
    const visited = new Set<string>();
    
    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      
      const node = this.nodes.get(taskId);
      if (!node) return;
      
      // Visit dependencies first
      for (const depId of node.task.dependencies) {
        visit(depId);
      }
      
      visited.add(taskId);
      plan.push(taskId);
    };
    
    for (const [id] of this.nodes) {
      visit(id);
    }
    
    return plan;
  }
  
  /**
   * Visualize DAG as ASCII art
   */
  visualize(): string {
    const lines: string[] = [];
    const visited = new Set<string>();
    
    const visit = (taskId: string, indent: number = 0) => {
      if (visited.has(taskId)) {
        lines.push('  '.repeat(indent) + `↻ ${taskId} (already visited)`);
        return;
      }
      
      visited.add(taskId);
      const node = this.nodes.get(taskId);
      if (!node) return;
      
      const task = node.task;
      const statusIcon = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
        skipped: '⏭️',
      }[task.status];
      
      lines.push('  '.repeat(indent) + `${statusIcon} ${task.name} (${task.id})`);
      
      // Show dependents
      if (node.dependents.size > 0) {
        for (const depId of node.dependents) {
          visit(depId, indent + 1);
        }
      }
    };
    
    // Start from root tasks (tasks with no dependencies)
    for (const [id, node] of this.nodes) {
      if (node.task.dependencies.length === 0) {
        visit(id);
      }
    }
    
    return lines.join('\n');
  }
}
