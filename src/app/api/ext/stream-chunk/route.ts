/**
 * POST /api/ext/stream-chunk
 *
 * 浏览器扩展把 ChatGPT SSE 流的 chunks 实时推送到这里。
 * 服务器端通过 ExtProxyStore 把 chunks 转发给等待中的 Promise。
 *
 * Request body (支持单 chunk 和批量 chunks 两种格式):
 *   { taskId: string, chunk: string }              — 单个 chunk（旧格式，兼容）
 *   { taskId: string, chunks: string[] }           — 批量 chunks（新格式）
 *   { taskId: string, chunks?: string[], done: true } — 最后一批 + 结束标记
 *   { taskId: string, error: string }              — 错误
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExtProxyStore } from '@/lib/ext-proxy-store';

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
  let body: {
    taskId?: string;
    chunk?: string;
    chunks?: string[];
    done?: boolean;
    error?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400, headers: CORS_HEADERS });
  }

  const store = getExtProxyStore();

  if (body.error) {
    store.submitResult({ taskId: body.taskId, error: body.error });
  } else {
    // 追加 chunks（支持单个和批量）
    if (body.chunks && body.chunks.length > 0) {
      for (const chunk of body.chunks) {
        store.appendStreamChunk(body.taskId, chunk);
      }
    } else if (body.chunk !== undefined) {
      // 兼容旧格式
      store.appendStreamChunk(body.taskId, body.chunk);
    }

    // 结束标记
    if (body.done) {
      store.submitStreamDone(body.taskId);
    }
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
