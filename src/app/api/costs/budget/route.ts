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

    // Validate numeric budget values (stored as cents, so value is dollars here)
    const MAX_BUDGET_USD = 100_000; // $100k hard cap
    for (const [field, val] of [['daily', daily], ['weekly', weekly], ['monthly', monthly]] as const) {
      if (val !== undefined) {
        const n = Number(val);
        if (!isFinite(n) || n < 0) {
          return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
        }
        if (n > MAX_BUDGET_USD) {
          return NextResponse.json({ error: `${field} cannot exceed $${MAX_BUDGET_USD}` }, { status: 400 });
        }
      }
    }

    // Validate alertThresholds — must be array of numbers 1-100
    if (alertThresholds !== undefined) {
      if (!Array.isArray(alertThresholds) || alertThresholds.length > 10) {
        return NextResponse.json({ error: 'alertThresholds must be an array of up to 10 numbers' }, { status: 400 });
      }
      for (const t of alertThresholds) {
        const n = Number(t);
        if (!isFinite(n) || n < 1 || n > 100) {
          return NextResponse.json({ error: 'alertThresholds values must be between 1 and 100' }, { status: 400 });
        }
      }
    }

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
