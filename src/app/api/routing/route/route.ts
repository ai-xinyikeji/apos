/**
 * POST /api/routing/route
 *
 * Make a routing decision for a given prompt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { EnhancedRoutingSystem } from '@/lib/routing/enhanced-routing-system';
import { TaskType } from '@/lib/routing/task-classifier';

export const dynamic = 'force-dynamic';

const routingSystem = new EnhancedRoutingSystem();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, taskType, manualModel, userId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'prompt is required and must be a string' },
        { status: 400 }
      );
    }

    const result = await routingSystem.route({
      prompt,
      taskType: taskType as TaskType | undefined,
      manualModel,
      userId,
    });

    return NextResponse.json({
      decisionId: result.decisionId,
      decision: {
        provider: result.selection.provider,
        model: result.selection.modelName,
        reason: result.selection.reason,
        estimatedCost: result.selection.estimatedCost,
        usesExtendedThinking: result.selection.usesExtendedThinking,
        usesPromptCaching: result.selection.usesPromptCaching,
      },
      explanation: result.explanation,
      budgetStatus: result.budgetStatus,
      taskType: result.taskType,
      routingTimeMs: result.routingTimeMs,
    });
  } catch (error) {
    console.error('[POST /api/routing/route]', error);
    return NextResponse.json(
      { error: 'Routing failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
