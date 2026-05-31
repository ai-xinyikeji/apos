import { getGlobalCache } from '@/lib/agent-cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cache/stats
 * 
 * 获取缓存统计信息
 */
export async function GET() {
  try {
    const cache = getGlobalCache();
    const stats = cache.getStats();
    const sizeInBytes = cache.getSizeInBytes();
    const hotKeys = cache.getHotKeys(10);

    return Response.json({
      stats: {
        ...stats,
        sizeInBytes,
        sizeInMB: (sizeInBytes / 1024 / 1024).toFixed(2),
      },
      hotKeys,
    });
  } catch (error: any) {
    console.error('Failed to get cache stats:', error);
    return Response.json({
      error: 'Failed to get cache stats',
      details: error.message,
    }, { status: 500 });
  }
}

/**
 * DELETE /api/cache/stats
 * 
 * 清空缓存
 */
export async function DELETE() {
  try {
    const cache = getGlobalCache();
    await cache.clear();

    return Response.json({
      success: true,
      message: '缓存已清空',
    });
  } catch (error: any) {
    console.error('Failed to clear cache:', error);
    return Response.json({
      error: 'Failed to clear cache',
      details: error.message,
    }, { status: 500 });
  }
}
