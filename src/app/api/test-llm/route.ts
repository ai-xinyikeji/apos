import { NextRequest, NextResponse } from 'next/server';
import { getLLMClient, routeModel, isOllamaAvailable, type TaskType } from '@/lib/llm';
import { generateText } from '@/lib/llm';

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * POST /api/test-llm - Test LLM with different routing strategies (dev only)
 */
export async function POST(request: NextRequest) {
  if (!IS_DEV) {
    return NextResponse.json({ error: 'This endpoint is only available in development' }, { status: 403 });
  }

  try {
    const { prompt = 'Hello! Please respond in one sentence.', taskType = 'default', useRouter = false } = await request.json();
    
    const startTime = Date.now();
    
    // Get LLM client
    const llmConfig = useRouter 
      ? await routeModel(taskType as TaskType)
      : await getLLMClient();
    
    // Generate text
    const result = await generateText({
      model: llmConfig.model,
      prompt,
      maxOutputTokens: 100,
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Check LM Studio status
    const ollamaAvailable = await isOllamaAvailable();
    
    return NextResponse.json({
      success: true,
      provider: llmConfig.provider,
      response: result.text,
      usage: result.usage,
      duration: `${duration}ms`,
      ollamaAvailable,
      taskType: useRouter ? taskType : 'manual',
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
        stack: IS_DEV ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
