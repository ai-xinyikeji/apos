/**
 * GET /api/costs/summary
 *
 * Returns cost summary for a given period.
 * Query params: period=today|week|month|custom, startDate, endDate
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { costRecords } from '@/lib/schema';
import { gte, lte, and, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

function getPeriodRange(period: string, startDate?: string, endDate?: string): { from: string; to: string } {
  const now = new Date();
  if (period === 'custom' && startDate && endDate) {
    return { from: startDate, to: endDate };
  }
  if (period === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (period === 'week') {
    const from = new Date(now); from.setDate(from.getDate() - from.getDay()); from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  // default: month
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString(), to: now.toISOString() };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const period    = searchParams.get('period') ?? 'month';
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate   = searchParams.get('endDate') ?? undefined;

    const { from, to } = getPeriodRange(period, startDate, endDate);

    const rows = await db
      .select()
      .from(costRecords)
      .where(and(gte(costRecords.timestamp, from), lte(costRecords.timestamp, to)));

    // Total cost and cache savings (cents → dollars)
    const totalCostCents   = rows.reduce((s, r) => s + r.totalCost, 0);
    const cacheSavingsCents = rows.reduce((s, r) => s + (r.cacheSavings ?? 0), 0);

    // By provider
    const byProvider: Record<string, number> = {};
    for (const r of rows) {
      byProvider[r.provider] = (byProvider[r.provider] ?? 0) + r.totalCost / 100;
    }

    // By task type
    const byTaskType: Record<string, number> = {};
    for (const r of rows) {
      byTaskType[r.taskType] = (byTaskType[r.taskType] ?? 0) + r.totalCost / 100;
    }

    // Daily trend (last 30 days)
    const trendMap: Record<string, number> = {};
    for (const r of rows) {
      const day = r.timestamp.slice(0, 10);
      trendMap[day] = (trendMap[day] ?? 0) + r.totalCost / 100;
    }
    const trend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost }));

    return NextResponse.json({
      totalCost: totalCostCents / 100,
      cacheSavings: cacheSavingsCents / 100,
      byProvider,
      byTaskType,
      trend,
      period,
      from,
      to,
    });
  } catch (error) {
    console.error('[GET /api/costs/summary]', error);
    return NextResponse.json(
      { error: 'Failed to fetch cost summary', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
