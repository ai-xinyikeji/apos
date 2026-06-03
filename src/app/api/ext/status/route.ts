/**
 * GET  /api/ext/status          — 获取插件实时状态快照（设置页轮询）
 * POST /api/ext/status          — 插件上报日志 / tab 状态
 * DELETE /api/ext/status        — 清空日志
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExtStatusStore } from '@/lib/ext-status-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const store = getExtStatusStore();
  return NextResponse.json(store.getSnapshot(), { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const store = getExtStatusStore();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS_HEADERS });
  }

  // Heartbeat
  if (body.type === 'heartbeat') {
    store.heartbeat(body.version);
  }

  // Tab status update
  if (body.type === 'tabs' && body.tabs) {
    store.updateTabs(body.tabs);
  }

  // Log entry
  if (body.type === 'log' && body.level && body.msg) {
    store.addLog(body.level, body.msg);
  }

  // Batch: heartbeat + tabs + logs in one request
  if (body.type === 'report') {
    if (body.version) store.heartbeat(body.version);
    if (body.tabs)    store.updateTabs(body.tabs);
    if (Array.isArray(body.logs)) {
      for (const entry of body.logs) {
        if (entry.level && entry.msg) store.addLog(entry.level, entry.msg);
      }
    }
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

export async function DELETE() {
  getExtStatusStore().clearLogs();
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
