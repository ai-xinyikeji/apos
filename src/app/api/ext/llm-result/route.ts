/**
 * POST /api/ext/llm-result
 *
 * 浏览器扩展在真实浏览器里执行完 LLM 请求后，把结果 POST 到这里。
 * 服务器端等待中的 Promise 会被 resolve。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExtProxyStore, type ExtProxyResult } from '@/lib/ext-proxy-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: ExtProxyResult;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
  }

  const store = getExtProxyStore();
  store.submitResult(body);

  return NextResponse.json({ ok: true });
}
