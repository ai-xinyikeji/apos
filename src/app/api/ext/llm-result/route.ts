/**
 * POST /api/ext/llm-result
 *
 * 浏览器扩展在真实浏览器里执行完 LLM 请求后，把结果 POST 到这里。
 * 服务器端等待中的 Promise 会被 resolve。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExtProxyStore, type ExtProxyResult } from '@/lib/ext-proxy-store';
import { getExtStatusStore } from '@/lib/ext-status-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: ExtProxyResult;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400, headers: CORS_HEADERS });
  }

  const statusStore = getExtStatusStore();

  if (body.error) {
    statusStore.addLog('error', `任务 ${body.taskId} 失败: ${body.error}`);
  } else {
    const preview = (body.text || '').slice(0, 60).replace(/\n/g, ' ');
    statusStore.addLog('success', `任务 ${body.taskId} 完成，回传 ${(body.text || '').length} 字符："${preview}${(body.text || '').length > 60 ? '…' : ''}"`);
  }

  const store = getExtProxyStore();
  store.submitResult(body);

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
