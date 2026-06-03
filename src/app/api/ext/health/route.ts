/**
 * GET /api/ext/health
 *
 * 健康检查端点，返回扩展和任务队列的状态信息。
 * 用于监控和诊断。
 */

import { NextResponse } from 'next/server';
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

export async function GET() {
  const store = getExtProxyStore();
  const isOnline = store.isExtensionOnline();
  const queueLength = store.queueLength();
  const pendingCount = store.pendingCount();
  
  // 收集警告
  const warnings: string[] = [];
  
  if (!isOnline) {
    warnings.push('Extension offline - 扩展离线');
  }
  
  if (queueLength > 10) {
    warnings.push(`Task queue backlog: ${queueLength} tasks - 任务队列积压`);
  }
  
  if (pendingCount > 5) {
    warnings.push(`Many pending tasks: ${pendingCount} - 大量待处理任务`);
  }
  
  // 确定整体状态
  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (warnings.length === 0) {
    status = 'healthy';
  } else if (!isOnline) {
    status = 'unhealthy';
  } else {
    status = 'degraded';
  }
  
  const health = {
    status,
    timestamp: Date.now(),
    extension: {
      online: isOnline,
      lastHeartbeat: store.isExtensionOnline() ? 'recent' : 'stale',
    },
    tasks: {
      queueLength,
      pendingCount,
    },
    warnings,
  };
  
  return NextResponse.json(health, { headers: CORS_HEADERS });
}
