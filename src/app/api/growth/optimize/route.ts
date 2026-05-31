import { NextRequest, NextResponse } from 'next/server';
import { uiOptimizer } from '@/lib/growth/optimizer';
import path from 'path';

/**
 * POST /api/growth/optimize
 * Body: { componentName: string, filePath: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { componentName, filePath } = await request.json();
    
    if (!componentName || !filePath) {
      return NextResponse.json(
        { success: false, error: 'componentName and filePath are required' },
        { status: 400 }
      );
    }
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(/* turbopackIgnore: true */ process.cwd(), filePath);
      
    const result = await uiOptimizer.optimizeComponent(componentName, absolutePath);
    
    if (!result) {
      return NextResponse.json(
        { success: false, error: `Component file not found at ${absolutePath}` },
        { status: 404 }
      );
    }
    
    // Normalize codeSuggestions to ensure file paths are relative for clean UI presentation
    if (result.codeSuggestions) {
      result.codeSuggestions = result.codeSuggestions.map(suggestion => ({
        ...suggestion,
        filePath: path.relative(/* turbopackIgnore: true */ process.cwd(), suggestion.filePath),
      }));
    }
    
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
