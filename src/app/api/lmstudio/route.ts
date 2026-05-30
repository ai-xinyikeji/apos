import { NextRequest, NextResponse } from 'next/server';
import { isOllamaAvailable, getOllamaModels } from '@/lib/llm';

/**
 * GET /api/lmstudio - Check LM Studio status and available models
 */
export async function GET(request: NextRequest) {
  try {
    const available = await isOllamaAvailable();
    
    if (!available) {
      return NextResponse.json({
        available: false,
        message: 'LM Studio is not running or not accessible at http://localhost:1234',
        models: [],
      });
    }
    
    const models = await getOllamaModels();
    
    return NextResponse.json({
      available: true,
      message: 'LM Studio is running',
      models,
      endpoint: `${process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234'}/v1`,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        available: false,
        error: error.message,
        models: [],
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lmstudio - Test LM Studio with a simple prompt
 */
export async function POST(request: NextRequest) {
  try {
    const { prompt = 'Hello, how are you?', model: requestedModel, max_tokens = 512 } = await request.json();
    
    const available = await isOllamaAvailable();
    if (!available) {
      return NextResponse.json(
        { error: 'LM Studio is not running' },
        { status: 503 }
      );
    }
    
    const models = await getOllamaModels();
    if (models.length === 0) {
      return NextResponse.json(
        { error: 'No models loaded in LM Studio' },
        { status: 400 }
      );
    }
    
    const model = requestedModel || models[0];

    // Test with the selected model
    const response = await fetch(`${process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        // Only set max_tokens if explicitly provided
        ...(max_tokens ? { max_tokens } : {}),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`LM Studio API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const message = data.choices[0]?.message;
    // Gemma 4 and other reasoning models put output in reasoning_content instead of content
    const responseText = message?.content || message?.reasoning_content || '';

    return NextResponse.json({
      success: true,
      model,
      prompt,
      response: responseText,
      usage: data.usage,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
