/**
 * PUT    /api/routing/rules/:id  - update a rule
 * DELETE /api/routing/rules/:id  - delete a rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { CustomRulesEngine } from '@/lib/routing/custom-rules-engine';

export const dynamic = 'force-dynamic';

const engine = new CustomRulesEngine();

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await req.json();

    await engine.updateRule(id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PUT /api/routing/rules/:id]', error);
    return NextResponse.json(
      { error: 'Failed to update rule', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await engine.deleteRule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/routing/rules/:id]', error);
    return NextResponse.json(
      { error: 'Failed to delete rule', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
