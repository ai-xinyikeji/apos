import { NextResponse } from 'next/server';
import { ReportGeneratorAgent } from '@/agents/report-generator';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { title } = body;
    
    // Trigger in the background
    const runId = crypto.randomUUID();
    const agent = new ReportGeneratorAgent();
    
    agent.execute({ title }, runId).catch(err => {
      console.error('ReportGenerator background execution failed:', err);
    });
    
    return NextResponse.json({ success: true, runId });
  } catch (error: any) {
    console.error('Failed to trigger report generator:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
