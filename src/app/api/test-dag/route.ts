import { NextRequest, NextResponse } from 'next/server';
import { TaskDAG, type Task } from '@/lib/orchestrator/task-dag';
import { TaskExecutor } from '@/lib/orchestrator/task-executor';

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * POST /api/test-dag - Test Task DAG system (dev only)
 */
export async function POST(request: NextRequest) {
  if (!IS_DEV) {
    return NextResponse.json({ error: 'This endpoint is only available in development' }, { status: 403 });
  }
  try {
    // Create a simple test DAG
    const dag = new TaskDAG();
    
    // Add test tasks
    const tasks: Omit<Task, 'status'>[] = [
      {
        id: 'task-1',
        name: 'Initialize Project',
        type: 'shell',
        command: 'echo "Initializing project..."',
        dependencies: [],
        input: {},
      },
      {
        id: 'task-2',
        name: 'Install Dependencies',
        type: 'shell',
        command: 'echo "Installing dependencies..."',
        dependencies: ['task-1'],
        input: {},
      },
      {
        id: 'task-3',
        name: 'Run Tests',
        type: 'shell',
        command: 'echo "Running tests..."',
        dependencies: ['task-2'],
        input: {},
      },
      {
        id: 'task-4',
        name: 'Build Project',
        type: 'shell',
        command: 'echo "Building project..."',
        dependencies: ['task-2'],
        input: {},
      },
      {
        id: 'task-5',
        name: 'Deploy',
        type: 'shell',
        command: 'echo "Deploying..."',
        dependencies: ['task-3', 'task-4'],
        input: {},
      },
    ];
    
    // Add tasks to DAG
    for (const taskDef of tasks) {
      const task: Task = {
        ...taskDef,
        status: 'pending',
      };
      dag.addTask(task);
    }
    
    // Validate DAG
    const validation = dag.validate();
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }
    
    // Track execution events
    const events: any[] = [];
    
    // Execute DAG
    const executor = new TaskExecutor(dag, {
      maxParallel: 2,
      timeout: 10000, // 10 seconds
      onTaskStart: (task) => {
        events.push({
          type: 'task_start',
          taskId: task.id,
          taskName: task.name,
          timestamp: Date.now(),
        });
      },
      onTaskComplete: (task) => {
        events.push({
          type: 'task_complete',
          taskId: task.id,
          taskName: task.name,
          duration: task.endTime! - task.startTime!,
          timestamp: Date.now(),
        });
      },
      onTaskFail: (task, error) => {
        events.push({
          type: 'task_fail',
          taskId: task.id,
          taskName: task.name,
          error: error.message,
          timestamp: Date.now(),
        });
      },
    });
    
    const startTime = Date.now();
    const { success, results } = await executor.execute();
    const endTime = Date.now();
    
    const stats = dag.getStats();
    const allTasks = dag.getAllTasks();
    
    return NextResponse.json({
      success,
      executionTime: endTime - startTime,
      stats,
      tasks: allTasks.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        duration: t.endTime && t.startTime ? t.endTime - t.startTime : null,
        error: t.error,
      })),
      events,
      visualization: dag.visualize(),
      executionPlan: dag.generateExecutionPlan(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        stack: IS_DEV ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}