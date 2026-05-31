import { NextRequest, NextResponse } from 'next/server';
import { metricsCollector } from '@/lib/growth/metrics';
import { featureRanker } from '@/lib/growth/feature-ranking';

/**
 * GET /api/growth - Get growth metrics and feature rankings
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    
    // Get all metrics
    const [
      featureUsage,
      agentStats,
      pageViews,
      dailyUsage,
      featureRankings,
    ] = await Promise.all([
      metricsCollector.getFeatureUsage(days),
      metricsCollector.getAgentStats(days),
      metricsCollector.getPageViews(days),
      metricsCollector.getDailyActiveUsage(days),
      featureRanker.rankFeatures(days),
    ]);
    
    return NextResponse.json({
      success: true,
      period: `${days} days`,
      metrics: {
        featureUsage,
        agentStats,
        pageViews,
        dailyUsage,
      },
      rankings: {
        all: featureRankings,
        top: featureRankings.slice(0, 10),
        toImprove: featureRankings.filter(f => f.recommendation === 'improve'),
        toDeprecate: featureRankings.filter(f => f.recommendation === 'deprecate'),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/growth - Track a metric event
 */
export async function POST(request: NextRequest) {
  try {
    const { event, properties = {} } = await request.json();
    
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'event is required' },
        { status: 400 }
      );
    }
    
    await metricsCollector.track(event, properties);
    
    return NextResponse.json({
      success: true,
      message: 'Metric tracked successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
