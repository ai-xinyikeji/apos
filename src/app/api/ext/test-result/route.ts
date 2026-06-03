/**
 * GET /api/ext/test-result?taskId=xxx
 *
 * 轮询测试任务的结果。
 * 使用 peekTaskStatus() 读取状态，不消费流，可安全多次调用。
 *
 * 返回:
 *   { status: 'pending' }                          — 任务进行中，尚无内容
 *   { status: 'streaming', result: string }        — 有部分内容，仍在接收
 *   { status: 'completed', result: string }        — 流结束，完整结果
 *   { status: 'failed',    error: string }         — 出错
 *   { status: 'not_found' }                        — taskId 不存在（已超时或从未创建）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExtProxyStore } from '@/lib/ext-proxy-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing taskId parameter' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const store = getExtProxyStore();
    const status = store.peekTaskStatus(taskId);

    // Task not found in pending map — either timed out or never existed
    if (!status.found) {
      return NextResponse.json(
        { status: 'not_found' },
        { headers: CORS_HEADERS }
      );
    }

    // Task failed
    if (status.error) {
      return NextResponse.json(
        { status: 'failed', error: status.error },
        { headers: CORS_HEADERS }
      );
    }

    // Stream finished
    if (status.done) {
      if (status.bufferedText.length > 0) {
        return NextResponse.json(
          { status: 'completed', result: status.bufferedText },
          { headers: CORS_HEADERS }
        );
      }
      return NextResponse.json(
        { status: 'failed', error: 'Task completed but no content received' },
        { headers: CORS_HEADERS }
      );
    }

    // Still streaming — return partial content if any
    if (status.bufferedText.length > 0) {
      return NextResponse.json(
        { status: 'streaming', result: status.bufferedText },
        { headers: CORS_HEADERS }
      );
    }

    // Pending, no content yet
    return NextResponse.json(
      { status: 'pending' },
      { headers: CORS_HEADERS }
    );

  } catch (error: any) {
    console.error('[Test Result] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
