import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentTraces } from '@/lib/schema';

export async function GET() {
  try {
    // 1. Fetch all trace logs
    const allTraces = await db.select().from(agentTraces).orderBy(agentTraces.createdAt);
    
    // 2. Group traces by runId and calculate totals
    const runsMap = new Map<string, {
      runId: string;
      agentName: string;
      createdAt: string;
      status: string;
      steps: any[];
      tokens: { prompt: number; completion: number; total: number };
    }>();

    let totalPrompt = 0;
    let totalCompletion = 0;

    for (const trace of allTraces) {
      const runId = trace.runId;
      
      // Parse prompt & completion tokens from the 'Token Usage' step
      if (trace.step === 'Token Usage' && trace.details) {
        try {
          const usage = JSON.parse(trace.details);
          if (usage && typeof usage === 'object') {
            totalPrompt += usage.promptTokens || 0;
            totalCompletion += usage.completionTokens || 0;
          }
        } catch {}
      }

      if (!runsMap.has(runId)) {
        runsMap.set(runId, {
          runId,
          agentName: trace.agentName,
          createdAt: trace.createdAt || new Date().toISOString(),
          status: 'info',
          steps: [],
          tokens: { prompt: 0, completion: 0, total: 0 },
        });
      }

      const run = runsMap.get(runId)!;
      run.steps.push(trace);
      
      // Update run overall status based on final step outcomes
      if (trace.status === 'success') {
        run.status = 'success';
      } else if (trace.status === 'error') {
        run.status = 'error';
      }

      // Add tokens to the individual run
      if (trace.step === 'Token Usage' && trace.details) {
        try {
          const usage = JSON.parse(trace.details);
          if (usage) {
            run.tokens.prompt += usage.promptTokens || 0;
            run.tokens.completion += usage.completionTokens || 0;
            run.tokens.total += (usage.promptTokens || 0) + (usage.completionTokens || 0);
          }
        } catch {}
      }
    }

    // Convert map to array sorted by date desc
    const runsList = Array.from(runsMap.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      summary: {
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion,
        // Mock estimate using average API pricing (e.g. $3 per million input, $15 per million output)
        estimatedCostUSD: (totalPrompt * 0.000003) + (totalCompletion * 0.000015),
      },
      runs: runsList,
    });
  } catch (error: any) {
    console.error('Failed to calculate usage statistics:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
