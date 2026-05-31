import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signals } from '@/lib/schema';
import { desc } from 'drizzle-orm';
import { SignalCollectorAgent } from '@/agents/signal-collector';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // 1. Query all signals
    const allSignals = await db.select().from(signals).orderBy(desc(signals.createdAt));
    
    // 2. Scan data/reports folder for Markdown weekly reports
    const reportsDir = path.join(process.cwd(), 'data', 'reports');
    let reportsList: any[] = [];
    
    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.md'));
      
      reportsList = files.map(file => {
        const filePath = path.join(reportsDir, file);
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Extract title from the first header line (e.g. # title)
        const match = content.match(/^#\s+(.*)/);
        const title = match ? match[1] : file;
        
        return {
          filename: file,
          title,
          createdAt: stat.birthtime.toISOString(),
          content,
        };
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return NextResponse.json({
      signals: allSignals,
      reports: reportsList,
    });
  } catch (error: any) {
    console.error('Failed to retrieve insights data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const runId = crypto.randomUUID();
    const agent = new SignalCollectorAgent();
    
    // Trigger in the background
    agent.execute({}, runId).catch(err => {
      console.error('SignalCollector background execution error:', err);
    });
    
    return NextResponse.json({ success: true, runId });
  } catch (error: any) {
    console.error('Failed to trigger signal collection:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
