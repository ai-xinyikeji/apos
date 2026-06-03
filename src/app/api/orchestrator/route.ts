import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/orchestrator';

/**
 * GET /api/orchestrator - Get all registered workflows
 */
export async function GET(request: NextRequest) {
  try {
    const workflows = await orchestrator.getWorkflows();
    
    return NextResponse.json({
      success: true,
      workflows: workflows.map(w => ({
        name: w.name,
        description: w.description,
        taskCount: w.tasks.length,
        isCustom: w.isCustom || false,
        tasks: w.tasks,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orchestrator - Execute a workflow
 */
export async function POST(request: NextRequest) {
  try {
    const { workflowName, maxParallel = 3 } = await request.json();
    
    if (!workflowName) {
      return NextResponse.json(
        { success: false, error: 'workflowName is required' },
        { status: 400 }
      );
    }

    // Clamp maxParallel to a safe range
    const safeMaxParallel = Math.max(1, Math.min(Number(maxParallel) || 3, 10));
    
    // Track execution progress
    const events: any[] = [];
    
    const { success, results, dag } = await orchestrator.executeWorkflow(workflowName, {
      maxParallel: safeMaxParallel,
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
    
    const stats = dag.getStats();
    const allTasks = dag.getAllTasks();
    
    return NextResponse.json({
      success,
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
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
