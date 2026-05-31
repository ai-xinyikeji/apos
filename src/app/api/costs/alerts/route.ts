/**
 * GET /api/costs/alerts  - list unacknowledged budget alerts
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { budgetAlerts } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const alerts = await db
      .select()
      .from(budgetAlerts)
      .where(eq(budgetAlerts.acknowledged, 0))
      .orderBy(desc(budgetAlerts.timestamp));

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('[GET /api/costs/alerts]', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
