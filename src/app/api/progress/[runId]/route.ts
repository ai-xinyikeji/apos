/**
 * SSE 端点 - 实时推送进度更新
 */

import { NextRequest } from 'next/server';
import { getGlobalProgressTracker, loadProgressHistory } from '@/lib/progress-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/progress/[runId]
 * 建立 SSE 连接，实时推送进度更新
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  // 创建 SSE 响应
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const tracker = getGlobalProgressTracker();

      // 1. 发送历史进度（如果有）
      try {
        const history = await loadProgressHistory(runId);
        for (const update of history) {
          const data = `data: ${JSON.stringify(update)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (error) {
        console.error('Failed to load progress history:', error);
      }

      // 2. 订阅实时更新
      const unsubscribe = tracker.subscribe(runId, (update) => {
        try {
          const data = `data: ${JSON.stringify(update)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // 如果任务完成，关闭连接
          if (update.progress >= 100 || update.status === 'error') {
            setTimeout(() => {
              controller.close();
            }, 1000);
          }
        } catch (error) {
          console.error('Failed to send progress update:', error);
        }
      });

      // 3. 发送心跳，保持连接
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (error) {
          clearInterval(heartbeat);
        }
      }, 15000);

      // 4. 清理
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
