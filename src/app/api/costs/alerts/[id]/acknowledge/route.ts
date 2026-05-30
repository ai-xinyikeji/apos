/**
 * POST /api/costs/alerts/:id/acknowledge  - acknowledge a budget alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { BudgetMonitor } from '@/lib/cost/budget-monitor';

export const dynamic = 'force-dynamic';

const monitor = new BudgetMonitor();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await monitor.acknowledgeAlert(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/costs/alerts/:id/acknowledge]', error);
    return NextResponse.json(
      { error: 'Failed to acknowledge alert', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
