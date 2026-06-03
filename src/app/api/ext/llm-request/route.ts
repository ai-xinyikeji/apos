/**
 * GET /api/ext/llm-request
 *
 * 浏览器扩展轮询此接口取走待执行的 LLM 任务。
 * 同时作为心跳接口，每次调用都更新扩展在线状态。
 */

import { NextResponse } from 'next/server';
import { getExtProxyStore } from '@/lib/ext-proxy-store';
import { getExtStatusStore } from '@/lib/ext-status-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const store = getExtProxyStore();
  store.heartbeat();

  // Also update the status store so the settings page can show online state
  getExtStatusStore().heartbeat();

  const tasks = store.dequeue();

  if (tasks.length > 0) {
    getExtStatusStore().addLog('info', `下发 ${tasks.length} 个 LLM 任务：${tasks.map(t => `[${t.provider}] ${t.id}`).join(', ')}`);
  }

  return NextResponse.json({
    tasks,
    queueLength: store.queueLength(),
    pendingCount: store.pendingCount(),
  }, { headers: CORS_HEADERS });
}
