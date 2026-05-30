import { NextRequest, NextResponse } from 'next/server';
import { experimentEngine } from '@/lib/growth/experiments';
import { db } from '@/lib/db';
import { experiments } from '@/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/growth/experiments
 * Lists all experiments and their calculated metrics
 */
export async function GET(request: NextRequest) {
  try {
    const allExperiments = await db.select().from(experiments);
    
    // Analyze each experiment to get conversion rates, lift, and confidence
    const analyzed = await Promise.all(
      allExperiments.map(async (exp) => {
        const analysis = await experimentEngine.analyzeExperiment(exp.id);
        return {
          ...exp,
          analysis: analysis || {
            rateA: 0,
            rateB: 0,
            lift: 0,
            winner: 'Undecided',
            confidence: 'Low (under 90%)',
          },
        };
      })
    );
    
    return NextResponse.json({
      success: true,
      experiments: analyzed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/growth/experiments
 * Body: { action: 'create' | 'start' | 'complete', ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { success: false, error: 'action is required' },
        { status: 400 }
      );
    }
    
    if (action === 'create') {
      const { name, feature, variantA, variantB } = body;
      if (!name || !feature) {
        return NextResponse.json(
          { success: false, error: 'name and feature are required to create an experiment' },
          { status: 400 }
        );
      }
      
      const newId = await experimentEngine.createExperiment(
        name,
        feature,
        variantA || 'control',
        variantB || 'treatment'
      );
      
      return NextResponse.json({
        success: true,
        message: 'Experiment created in draft status',
        experimentId: newId,
      });
    }
    
    if (action === 'start') {
      const { id } = body;
      if (!id) {
        return NextResponse.json(
          { success: false, error: 'experiment id is required to start' },
          { status: 400 }
        );
      }
      
      await experimentEngine.startExperiment(id);
      return NextResponse.json({
        success: true,
        message: 'Experiment started and active',
      });
    }
    
    if (action === 'complete') {
      const { id } = body;
      if (!id) {
        return NextResponse.json(
          { success: false, error: 'experiment id is required to complete' },
          { status: 400 }
        );
      }
      
      await experimentEngine.completeExperiment(id);
      return NextResponse.json({
        success: true,
        message: 'Experiment completed',
      });
    }
    
    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
