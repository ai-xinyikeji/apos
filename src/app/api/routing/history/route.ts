/**
 * GET /api/routing/history
 *
 * Query routing decision history with optional filters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { routingDecisions } from '@/lib/schema';
import { and, gte, lte, eq, desc, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const startDate  = searchParams.get('startDate');
    const endDate    = searchParams.get('endDate');
    const taskType   = searchParams.get('taskType');
    const provider   = searchParams.get('provider');
    const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const offset     = parseInt(searchParams.get('offset') ?? '0');

    const conditions = [];
    if (startDate) conditions.push(gte(routingDecisions.timestamp, startDate));
    if (endDate)   conditions.push(lte(routingDecisions.timestamp, endDate));
    if (taskType)  conditions.push(eq(routingDecisions.taskType, taskType));
    if (provider)  conditions.push(eq(routingDecisions.selectedProvider, provider));

    const [decisions, countResult] = await Promise.all([
      db.select()
        .from(routingDecisions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(routingDecisions.timestamp))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`COUNT(*)` })
        .from(routingDecisions)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    // Compute accuracy stats (estimated vs actual cost deviation)
    const withActual = decisions.filter(d => d.actualCost !== null && d.estimatedCost !== null);
    const accuracy = withActual.length > 0
      ? withActual.reduce((sum, d) => {
          const deviation = Math.abs((d.actualCost! - d.estimatedCost) / (d.estimatedCost || 1));
          return sum + (1 - Math.min(deviation, 1));
        }, 0) / withActual.length
      : null;

    const avgCost = decisions.length > 0
      ? decisions.reduce((sum, d) => sum + d.estimatedCost, 0) / decisions.length
      : 0;

    const withTime = decisions.filter(d => d.actualTime !== null);
    const avgTime = withTime.length > 0
      ? withTime.reduce((sum, d) => sum + d.actualTime!, 0) / withTime.length
      : null;

    return NextResponse.json({
      decisions,
      total,
      limit,
      offset,
      stats: {
        accuracy,
        avgCost,
        avgTime,
      },
    });
  } catch (error) {
    console.error('[GET /api/routing/history]', error);
    return NextResponse.json(
      { error: 'Failed to fetch routing history', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
