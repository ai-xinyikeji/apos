import { NextRequest, NextResponse } from 'next/server';
import { getLLMClient, routeModel, isOllamaAvailable, type TaskType } from '@/lib/llm';
import { generateText } from '@/lib/llm';

/**
 * POST /api/test-llm - Test LLM with different routing strategies
 */
export async function POST(request: NextRequest) {
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
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
