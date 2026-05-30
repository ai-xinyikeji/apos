import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentTraces } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');
    
    let list;
    if (runId) {
      list = await db.select()
        .from(agentTraces)
        .where(eq(agentTraces.runId, runId))
        .orderBy(agentTraces.createdAt);
    } else {
      list = await db.select()
        .from(agentTraces)
        .orderBy(desc(agentTraces.createdAt))
        .limit(50);
    }
    
    return NextResponse.json(list);
  } catch (error: any) {
    console.error('Failed to get traces:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
