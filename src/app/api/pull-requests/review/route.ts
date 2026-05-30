import { NextResponse } from 'next/server';
import { ReviewBotAgent } from '@/agents/review-bot';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prototypeId, branchName, prNumber } = body;
    
    if (!prototypeId || !branchName) {
      return NextResponse.json({ error: '原型 ID (prototypeId) 和分支名称 (branchName) 为必填项' }, { status: 400 });
    }
    
    // Trigger ReviewBot in background
    const runId = crypto.randomUUID();
    const agent = new ReviewBotAgent();
    
    agent.execute({
      prototypeId,
      branchName,
      prNumber: prNumber ? Number(prNumber) : null,
    }, runId).catch(err => {
      console.error(`ReviewBot background execution failed for prototype ${prototypeId}:`, err);
    });
    
    return NextResponse.json({ success: true, runId });
  } catch (error: any) {
    console.error('Failed to trigger review run:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
