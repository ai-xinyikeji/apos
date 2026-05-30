import { NextRequest, NextResponse } from 'next/server';
import { featureRanker } from '@/lib/growth/feature-ranking';

/**
 * GET /api/growth/report - Generate feature ranking report
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    
    const report = await featureRanker.generateReport(days);
    
    return NextResponse.json({
      success: true,
      report,
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
