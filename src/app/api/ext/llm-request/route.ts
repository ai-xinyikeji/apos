/**
 * GET /api/ext/llm-request
 *
 * 浏览器扩展轮询此接口取走待执行的 LLM 任务。
 * 同时作为心跳接口，每次调用都更新扩展在线状态。
 */

import { NextResponse } from 'next/server';
import { getExtProxyStore } from '@/lib/ext-proxy-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = getExtProxyStore();
  store.heartbeat();

  const tasks = store.dequeue();

  return NextResponse.json({
    tasks,
    queueLength: store.queueLength(),
    pendingCount: store.pendingCount(),
  });
}
