import { db } from '@/lib/db';
import { agentTraces } from '@/lib/schema';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/costs
 * 
 * 获取 AI 成本统计数据
 * 
 * 返回:
 * - costs: 按日期和 Agent 分组的成本明细
 * - total: 总计统计
 * - cacheSavings: 缓存节省统计
 */
export async function GET() {
  try {
    // 按日期和 Agent 统计成本
    const costs = await db
      .select({
        date: sql<string>`DATE(created_at)`,
        agent: agentTraces.agentName,
        provider: sql<string>`json_extract(details, '$.provider')`,
        inputTokens: sql<number>`COALESCE(SUM(CAST(json_extract(details, '$.usage.promptTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.usage.inputTokens') AS INTEGER)), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(CAST(json_extract(details, '$.usage.completionTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.usage.outputTokens') AS INTEGER)), 0)`,
        cacheReadTokens: sql<number>`COALESCE(SUM(CAST(json_extract(details, '$.usage.cacheReadTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.cacheReadTokens') AS INTEGER)), 0)`,
        cacheCreationTokens: sql<number>`COALESCE(SUM(CAST(json_extract(details, '$.usage.cacheCreationTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.cacheCreationTokens') AS INTEGER)), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(CAST(json_extract(details, '$.usage.totalTokens') AS INTEGER)), 0)`,
        estimatedCost: sql<number>`
          CASE 
            WHEN json_extract(details, '$.provider') = 'anthropic' THEN 
              (COALESCE(SUM(CAST(json_extract(details, '$.usage.promptTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.usage.inputTokens') AS INTEGER)), 0)) * 0.000003 +
              (COALESCE(SUM(CAST(json_extract(details, '$.usage.completionTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.usage.outputTokens') AS INTEGER)), 0)) * 0.000015 +
              (COALESCE(SUM(CAST(json_extract(details, '$.usage.cacheCreationTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.cacheCreationTokens') AS INTEGER)), 0)) * 0.00000375 +
              (COALESCE(SUM(CAST(json_extract(details, '$.usage.cacheReadTokens') AS INTEGER)), 0) + COALESCE(SUM(CAST(json_extract(details, '$.cacheReadTokens') AS INTEGER)), 0)) * 0.0000003
            WHEN json_extract(details, '$.provider') = 'openai' THEN 
              COALESCE(SUM(CAST(json_extract(details, '$.usage.totalTokens') AS INTEGER)), 0) * 0.00001
            WHEN json_extract(details, '$.provider') = 'google' THEN 
              COALESCE(SUM(CAST(json_extract(details, '$.usage.totalTokens') AS INTEGER)), 0) * 0.000001
            WHEN json_extract(details, '$.provider') = 'lmstudio' THEN 
              0
            ELSE 0
          END
        `,
      })
      .from(agentTraces)
      .where(sql`json_valid(details) = 1 AND (json_extract(details, '$.usage') IS NOT NULL OR json_extract(details, '$.promptTokens') IS NOT NULL)`)
      .groupBy(
        sql`DATE(created_at)`,
        agentTraces.agentName,
        sql`json_extract(details, '$.provider')`
      )
      .orderBy(sql`DATE(created_at) DESC`)
      .limit(100);

    // 计算总计
    const total = costs.reduce(
      (acc, row) => ({
        totalCost: acc.totalCost + row.estimatedCost,
        totalTokens: acc.totalTokens + row.totalTokens,
        totalInputTokens: acc.totalInputTokens + row.inputTokens,
        totalOutputTokens: acc.totalOutputTokens + row.outputTokens,
        totalCacheRead: acc.totalCacheRead + row.cacheReadTokens,
        totalCacheCreation: acc.totalCacheCreation + row.cacheCreationTokens,
      }),
      { 
        totalCost: 0, 
        totalTokens: 0, 
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheRead: 0, 
        totalCacheCreation: 0 
      }
    );

    // 计算缓存节省
    const cacheSavings = {
      normalCost: (total.totalCacheRead + total.totalCacheCreation) * 0.000003,
      cacheCost: total.totalCacheCreation * 0.00000375 + total.totalCacheRead * 0.0000003,
      savings: 0,
      savingsPercent: 0,
    };
    cacheSavings.savings = cacheSavings.normalCost - cacheSavings.cacheCost;
    cacheSavings.savingsPercent = cacheSavings.normalCost > 0 
      ? (cacheSavings.savings / cacheSavings.normalCost) * 100 
      : 0;

    // 按 Provider 统计
    const byProvider = costs.reduce((acc, row) => {
      const provider = row.provider || 'unknown';
      if (!acc[provider]) {
        acc[provider] = {
          provider,
          totalCost: 0,
          totalTokens: 0,
          count: 0,
        };
      }
      acc[provider].totalCost += row.estimatedCost;
      acc[provider].totalTokens += row.totalTokens;
      acc[provider].count += 1;
      return acc;
    }, {} as Record<string, any>);

    // 按 Agent 统计
    const byAgent = costs.reduce((acc, row) => {
      const agent = row.agent || 'unknown';
      if (!acc[agent]) {
        acc[agent] = {
          agent,
          totalCost: 0,
          totalTokens: 0,
          count: 0,
        };
      }
      acc[agent].totalCost += row.estimatedCost;
      acc[agent].totalTokens += row.totalTokens;
      acc[agent].count += 1;
      return acc;
    }, {} as Record<string, any>);

    return Response.json({
      costs,
      total,
      cacheSavings,
      byProvider: Object.values(byProvider),
      byAgent: Object.values(byAgent),
    });
  } catch (error) {
    console.error('Failed to fetch costs:', error);
    return Response.json({ 
      error: 'Failed to fetch costs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
