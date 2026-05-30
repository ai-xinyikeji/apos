/**
 * PATCH /api/routing/rules/:id/toggle  - enable or disable a rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { CustomRulesEngine } from '@/lib/routing/custom-rules-engine';

export const dynamic = 'force-dynamic';

const engine = new CustomRulesEngine();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled (boolean) is required' },
        { status: 400 }
      );
    }

    await engine.toggleRule(id, body.enabled);
    return NextResponse.json({ success: true, enabled: body.enabled });
  } catch (error) {
    console.error('[PATCH /api/routing/rules/:id/toggle]', error);
    return NextResponse.json(
      { error: 'Failed to toggle rule', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
