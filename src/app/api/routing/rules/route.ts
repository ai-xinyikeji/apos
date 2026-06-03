/**
 * GET  /api/routing/rules  - list all custom rules
 * POST /api/routing/rules  - create a new custom rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { CustomRulesEngine, CustomRule } from '@/lib/routing/custom-rules-engine';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const engine = new CustomRulesEngine();

export async function GET() {
  try {
    await engine.loadRules();
    // Re-expose the internal rules list via a public getter
    const rules = await getRules();
    return NextResponse.json({ rules });
  } catch (error) {
    console.error('[GET /api/routing/rules]', error);
    return NextResponse.json(
      { error: 'Failed to fetch rules', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, priority, conditions, targetProvider, targetModel } = body;

    if (!name || !targetProvider || !targetModel) {
      return NextResponse.json(
        { error: 'name, targetProvider, and targetModel are required' },
        { status: 400 }
      );
    }

    // Validate priority range
    if (priority !== undefined) {
      const p = Number(priority);
      if (!isFinite(p) || p < 1 || p > 100) {
        return NextResponse.json({ error: 'priority must be a number between 1 and 100' }, { status: 400 });
      }
    }

    const rule: CustomRule = {
      id: randomUUID(),
      name,
      priority: priority ?? 50,
      enabled: true,
      conditions: conditions ?? {},
      targetProvider,
      targetModel,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await engine.addRule(rule);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/routing/rules]', error);
    return NextResponse.json(
      { error: 'Failed to create rule', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Helper: query rules directly from DB for the GET response
async function getRules() {
  const { db } = await import('@/lib/db');
  const { customRules } = await import('@/lib/schema');
  const rows = await db.select().from(customRules);
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    enabled: r.enabled === 1,
    conditions: {
      taskTypes: r.taskTypes ? JSON.parse(r.taskTypes) : undefined,
      contextSizeMin: r.contextSizeMin ?? undefined,
      contextSizeMax: r.contextSizeMax ?? undefined,
      codeComplexityMin: r.codeComplexityMin ?? undefined,
      codeComplexityMax: r.codeComplexityMax ?? undefined,
    },
    targetProvider: r.targetProvider,
    targetModel: r.targetModel,
    matchCount: r.matchCount ?? 0,
    lastMatchedAt: r.lastMatchedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
