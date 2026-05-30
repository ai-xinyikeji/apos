/**
 * GET  /api/costs/budget  - get budget status for all periods
 * POST /api/costs/budget  - update budget configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { BudgetMonitor } from '@/lib/cost/budget-monitor';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const monitor = new BudgetMonitor();

export async function GET() {
  try {
    const config = await monitor.getBudgetConfig();

    const [daily, weekly, monthly] = await Promise.all([
      config.daily ? monitor.getCurrentSpend('daily') : Promise.resolve(0),
      config.weekly ? monitor.getCurrentSpend('weekly') : Promise.resolve(0),
      config.monthly ? monitor.getCurrentSpend('monthly') : Promise.resolve(0),
    ]);

    const toStatus = (current: number, limit?: number) => {
      if (!limit) return null;
      return {
        limit: limit / 100,
        current: current / 100,
        percentage: Math.round((current / limit) * 100),
      };
    };

    // Fetch unacknowledged alerts
    const { budgetAlerts } = await import('@/lib/schema');
    const { eq } = await import('drizzle-orm');
    const alerts = await db
      .select()
      .from(budgetAlerts)
      .where(eq(budgetAlerts.acknowledged, 0));

    return NextResponse.json({
      daily:   toStatus(daily,   config.daily),
      weekly:  toStatus(weekly,  config.weekly),
      monthly: toStatus(monthly, config.monthly),
      config: {
        alertThresholds: config.alertThresholds,
        autoDowngrade: config.autoDowngrade,
      },
      alerts,
    });
  } catch (error) {
    console.error('[GET /api/costs/budget]', error);
    return NextResponse.json(
      { error: 'Failed to fetch budget status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { daily, weekly, monthly, alertThresholds, autoDowngrade } = body;

    const upsert = async (key: string, value: string) => {
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    };

    if (daily !== undefined)           await upsert('budget_daily',            String(daily));
    if (weekly !== undefined)          await upsert('budget_weekly',           String(weekly));
    if (monthly !== undefined)         await upsert('budget_monthly',          String(monthly));
    if (alertThresholds !== undefined) await upsert('budget_alert_thresholds', JSON.stringify(alertThresholds));
    if (autoDowngrade !== undefined)   await upsert('budget_auto_downgrade',   String(autoDowngrade));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/costs/budget]', error);
    return NextResponse.json(
      { error: 'Failed to update budget', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
