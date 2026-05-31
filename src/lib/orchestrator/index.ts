/**
 * Orchestrator - Main entry point for task orchestration
 * Manages task creation, execution, and monitoring
 */

import { TaskDAG, type Task, type TaskStatus } from './task-dag';
import { TaskExecutor, type ExecutionOptions } from './task-executor';
import { db } from '../db';
import { workflows as dbWorkflows } from '../schema';
import { eq } from 'drizzle-orm';

export { TaskDAG, TaskExecutor };
export type { Task, TaskStatus, ExecutionOptions };

export interface WorkflowDefinition {
  name: string;
  description: string;
  tasks: Omit<Task, 'status'>[];
  isCustom?: boolean;
}

export class Orchestrator {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  
  /**
   * Register a workflow
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.name, workflow);
  }
  
  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowName: string,
    options?: ExecutionOptions
  ): Promise<{ success: boolean; results: Map<string, any>; dag: TaskDAG }> {
    let tasksDef: Omit<Task, 'status'>[] = [];
    
    // Check built-in workflows first
    const builtIn = this.workflows.get(workflowName);
    if (builtIn) {
      tasksDef = builtIn.tasks;
    } else {
      // Check database custom workflows
      const [custom] = await db
        .select()
        .from(dbWorkflows)
        .where(eq(dbWorkflows.name, workflowName));
        
      if (!custom) {
        throw new Error(`Workflow ${workflowName} not found`);
      }
      
      try {
        tasksDef = JSON.parse(custom.tasks) as Omit<Task, 'status'>[];
      } catch (err) {
        throw new Error(`Failed to parse custom workflow tasks: ${err}`);
      }
    }
    
    // Create DAG
    const dag = new TaskDAG();
    
    // Add tasks to DAG
    for (const taskDef of tasksDef) {
      const task: Task = {
        ...taskDef,
        status: 'pending',
      };
      dag.addTask(task);
    }
    
    // Execute
    const executor = new TaskExecutor(dag, options);
    const { success, results } = await executor.execute();
    
    return { success, results, dag };
  }
  
  /**
   * Create and execute a custom DAG
   */
  async executeDAG(
    tasks: Omit<Task, 'status'>[],
    options?: ExecutionOptions
  ): Promise<{ success: boolean; results: Map<string, any>; dag: TaskDAG }> {
    const dag = new TaskDAG();
    
    // Add tasks
    for (const taskDef of tasks) {
      const task: Task = {
        ...taskDef,
        status: 'pending',
      };
      dag.addTask(task);
    }
    
    // Execute
    const executor = new TaskExecutor(dag, options);
    const { success, results } = await executor.execute();
    
    return { success, results, dag };
  }
  
  /**
   * Get all registered workflows (both system built-ins and user custom from SQLite)
   */
  async getWorkflows(): Promise<WorkflowDefinition[]> {
    // Built-in system workflows
    const systemWorkflows = Array.from(this.workflows.values()).map(w => ({
      ...w,
      isCustom: false,
    }));
    
    // Custom database workflows
    try {
      const customList = await db.select().from(dbWorkflows);
      const customWorkflows = customList.map(w => ({
        name: w.name,
        description: w.description,
        tasks: JSON.parse(w.tasks) as Omit<Task, 'status'>[],
        isCustom: true,
      }));
      
      return [...systemWorkflows, ...customWorkflows];
    } catch (error) {
      console.error('Failed to load custom workflows from DB:', error);
      return systemWorkflows;
    }
  }
}

// Singleton instance
export const orchestrator = new Orchestrator();

// Register built-in workflows
orchestrator.registerWorkflow({
  name: 'prototype-full-cycle',
  description: 'Complete prototype development cycle: design → code → review → test',
  tasks: [
    {
      id: 'design',
      name: 'Design Analysis',
      type: 'agent',
      agentName: 'ProtoBuilder',
      dependencies: [],
      input: { assessOnly: true },
    },
    {
      id: 'code',
      name: 'Code Generation',
      type: 'agent',
      agentName: 'ProtoBuilder',
      dependencies: ['design'],
      input: { assessOnly: false },
    },
    {
      id: 'review',
      name: 'Code Review',
      type: 'agent',
      agentName: 'ReviewBot',
      dependencies: ['code'],
      input: {},
    },
    {
      id: 'test',
      name: 'Run Tests',
      type: 'shell',
      command: 'npm run test:ci',
      dependencies: ['code'],
    },
  ],
});

orchestrator.registerWorkflow({
  name: 'insights-pipeline',
  description: 'Collect signals and generate insights report',
  tasks: [
    {
      id: 'collect-amplitude',
      name: 'Collect Amplitude Signals',
      type: 'agent',
      agentName: 'SignalCollector',
      dependencies: [],
      input: { sources: ['amplitude'] },
    },
    {
      id: 'collect-zendesk',
      name: 'Collect Zendesk Signals',
      type: 'agent',
      agentName: 'SignalCollector',
      dependencies: [],
      input: { sources: ['zendesk'] },
    },
    {
      id: 'collect-competitor',
      name: 'Collect Competitor Signals',
      type: 'agent',
      agentName: 'SignalCollector',
      dependencies: [],
      input: { sources: ['competitor'] },
    },
    {
      id: 'generate-report',
      name: 'Generate Insights Report',
      type: 'agent',
      agentName: 'ReportGenerator',
      dependencies: ['collect-amplitude', 'collect-zendesk', 'collect-competitor'],
      input: {},
    },
  ],
});

orchestrator.registerWorkflow({
  name: 'parallel-prototype-batch',
  description: 'Generate multiple prototypes in parallel',
  tasks: [
    {
      id: 'proto-1',
      name: 'Prototype 1',
      type: 'agent',
      agentName: 'ProtoBuilder',
      dependencies: [],
      input: { name: 'Feature A' },
    },
    {
      id: 'proto-2',
      name: 'Prototype 2',
      type: 'agent',
      agentName: 'ProtoBuilder',
      dependencies: [],
      input: { name: 'Feature B' },
    },
    {
      id: 'proto-3',
      name: 'Prototype 3',
      type: 'agent',
      agentName: 'ProtoBuilder',
      dependencies: [],
      input: { name: 'Feature C' },
    },
  ],
});
