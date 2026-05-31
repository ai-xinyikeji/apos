import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentTraces } from '@/lib/schema';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/compression/stats
 * 
 * Get compression statistics from agent traces
 * Query params:
 * - days: number of days to look back (default: 30)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let days = parseInt(searchParams.get('days') || '30', 10);
    if (isNaN(days)) {
      days = 30;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.toISOString();

    // Query agent traces with compression metadata
    const runs = await db
      .select()
      .from(agentTraces)
      .where(sql`${agentTraces.createdAt} >= ${cutoffTimestamp}`)
      .orderBy(sql`${agentTraces.createdAt} DESC`);

    // Extract compression stats from details
    let totalOriginalTokens = 0;
    let totalCompressedTokens = 0;
    let totalSavedTokens = 0;
    let compressionCount = 0;
    let astCompressionCount = 0;
    let llmCompressionCount = 0;
    let hybridCompressionCount = 0;
    
    const dailyStats: Record<string, {
      date: string;
      originalTokens: number;
      compressedTokens: number;
      savedTokens: number;
      count: number;
    }> = {};

    for (const run of runs) {
      if (run.details && typeof run.details === 'string') {
        try {
          const details = JSON.parse(run.details);
          
          // Check for compression stats in details
          if (details.compressionStats) {
            const stats = details.compressionStats;
            
            // Estimate tokens (rough: 1 token ≈ 4 characters)
            const originalTokens = Math.ceil((stats.originalChars || 0) / 4);
            const compressedTokens = Math.ceil((stats.compressedChars || 0) / 4);
            const savedTokens = originalTokens - compressedTokens;
            
            totalOriginalTokens += originalTokens;
            totalCompressedTokens += compressedTokens;
            totalSavedTokens += savedTokens;
            compressionCount++;
            
            // Count by method
            if (stats.method === 'ast') astCompressionCount++;
            else if (stats.method === 'llm') llmCompressionCount++;
            else if (stats.method === 'hybrid') hybridCompressionCount++;
            
            // Daily aggregation
            if (run.createdAt) {
              const date = run.createdAt.split('T')[0];
              if (!dailyStats[date]) {
                dailyStats[date] = {
                  date,
                  originalTokens: 0,
                  compressedTokens: 0,
                  savedTokens: 0,
                  count: 0,
                };
              }
              dailyStats[date].originalTokens += originalTokens;
              dailyStats[date].compressedTokens += compressedTokens;
              dailyStats[date].savedTokens += savedTokens;
              dailyStats[date].count++;
            }
          }
        } catch (err) {
          // Ignore JSON parse errors
        }
      }
    }

    // Calculate averages and percentages
    const avgCompressionRate = compressionCount > 0 && totalOriginalTokens > 0
      ? Math.round((totalSavedTokens / totalOriginalTokens) * 100)
      : 0;
    
    const avgSavedPerRun = compressionCount > 0
      ? Math.round(totalSavedTokens / compressionCount)
      : 0;

    // Estimate cost savings (Claude Sonnet 3.5 pricing: $3/1M input tokens)
    const costPerMillionTokens = 3; // USD
    const estimatedCostSavings = (totalSavedTokens / 1000000) * costPerMillionTokens;

    // Convert daily stats to array and sort by date
    const dailyStatsArray = Object.values(dailyStats).sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    return NextResponse.json({
      success: true,
      stats: {
        totalOriginalTokens,
        totalCompressedTokens,
        totalSavedTokens,
        compressionCount,
        avgCompressionRate,
        avgSavedPerRun,
        estimatedCostSavings: estimatedCostSavings.toFixed(2),
        methodBreakdown: {
          ast: astCompressionCount,
          llm: llmCompressionCount,
          hybrid: hybridCompressionCount,
        },
        dailyStats: dailyStatsArray,
      },
    });
  } catch (error: any) {
    console.error('[Compression Stats API] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to fetch compression stats' 
      },
      { status: 500 }
    );
  }
}
