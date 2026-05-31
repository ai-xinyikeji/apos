import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentTraces } from '@/lib/schema';
import { eq, like, desc, and } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branchName = searchParams.get('branchName');
    
    if (!branchName) {
      return NextResponse.json({ error: '分支名称 (branchName) 为必填项' }, { status: 400 });
    }

    // 1. Find the latest start trace for this branch to resolve runId
    const startTraces = await db.select()
      .from(agentTraces)
      .where(and(
        eq(agentTraces.agentName, 'ReviewBot'),
        eq(agentTraces.step, 'Start'),
        like(agentTraces.message, `%[${branchName}]%`)
      ))
      .orderBy(desc(agentTraces.createdAt))
      .limit(1);

    if (startTraces.length === 0) {
      return NextResponse.json({ report: null });
    }

    const runId = startTraces[0].runId;

    // 2. Fetch the corresponding Review Report Output
    const reports = await db.select()
      .from(agentTraces)
      .where(and(
        eq(agentTraces.runId, runId),
        eq(agentTraces.step, 'Review Report Output')
      ))
      .limit(1);

    if (reports.length === 0) {
      return NextResponse.json({ report: null });
    }

    return NextResponse.json({ 
      report: reports[0].details,
      createdAt: reports[0].createdAt 
    });
  } catch (error: any) {
    console.error('Failed to get review report:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
