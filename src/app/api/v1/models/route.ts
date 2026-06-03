import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';
import { getOllamaModels } from '@/lib/llm';

// Force dynamic execution
export const dynamic = 'force-dynamic';

// 模型列表缓存
let modelsCache: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL = 60000; // 1 分钟缓存

/**
 * GET /api/v1/models
 * Returns a list of available models in Anthropic API format
 * This endpoint is required by Claude Code CLI to validate model availability
 * 
 * 返回实际可用的模型（根据配置的 API Keys）
 */
export async function GET() {
  const now = Date.now();
  
  // 检查缓存
  if (modelsCache && (now - modelsCache.timestamp) < CACHE_TTL) {
    console.log('[APOS Models API] Returning cached models');
    return NextResponse.json({ data: modelsCache.data });
  }
  
  const models: any[] = [];
  
  try {
    // 读取配置
    const list = await db.select().from(settings);
    const keysMap = new Map(list.map(s => [s.key, s.value]));
    
    const anthropicKey = keysMap.get('anthropic_api_key');
    const openaiKey = keysMap.get('openai_api_key');
    const googleKey = keysMap.get('google_api_key');
    const deepseekKey = keysMap.get('deepseek_api_key');
    
    // Anthropic 模型
    if (anthropicKey) {
      models.push(
        {
          type: 'model',
          id: 'claude-3-5-sonnet-20241022',
          display_name: 'Claude 3.5 Sonnet',
          created_at: '2024-10-22T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-3-5-haiku-20241022',
          display_name: 'Claude 3.5 Haiku',
          created_at: '2024-10-22T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-3-opus-20240229',
          display_name: 'Claude 3 Opus',
          created_at: '2024-02-29T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-3-sonnet-20240229',
          display_name: 'Claude 3 Sonnet',
          created_at: '2024-02-29T00:00:00Z',
        },
        {
          type: 'model',
          id: 'claude-3-haiku-20240307',
          display_name: 'Claude 3 Haiku',
          created_at: '2024-03-07T00:00:00Z',
        }
      );
    }
    
    // OpenAI 模型
    if (openaiKey) {
      models.push(
        {
          type: 'model',
          id: 'gpt-4o',
          display_name: 'GPT-4o',
          created_at: '2024-05-13T00:00:00Z',
        },
        {
          type: 'model',
          id: 'gpt-4o-mini',
          display_name: 'GPT-4o Mini',
          created_at: '2024-07-18T00:00:00Z',
        },
        {
          type: 'model',
          id: 'gpt-4-turbo',
          display_name: 'GPT-4 Turbo',
          created_at: '2024-04-09T00:00:00Z',
        }
      );
    }
    
    // Google 模型
    if (googleKey) {
      models.push(
        {
          type: 'model',
          id: 'gemini-1.5-pro-latest',
          display_name: 'Gemini 1.5 Pro',
          created_at: '2024-02-15T00:00:00Z',
        },
        {
          type: 'model',
          id: 'gemini-1.5-flash-latest',
          display_name: 'Gemini 1.5 Flash',
          created_at: '2024-05-14T00:00:00Z',
        }
      );
    }
    
    // DeepSeek 模型
    if (deepseekKey) {
      models.push(
        {
          type: 'model',
          id: 'deepseek-chat',
          display_name: 'DeepSeek Chat',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          type: 'model',
          id: 'deepseek-reasoner',
          display_name: 'DeepSeek Reasoner',
          created_at: '2024-01-01T00:00:00Z',
        }
      );
    }
    
    // Ollama 本地模型
    const ollamaModels = await getOllamaModels();
    for (const modelId of ollamaModels) {
      models.push({
        type: 'model',
        id: modelId,
        display_name: `Ollama: ${modelId}`,
        created_at: '2024-01-01T00:00:00Z',
      });
    }
    
    // 如果没有配置任何模型，返回默认列表（避免 Claude Desktop 报错）
    if (models.length === 0) {
      models.push({
        type: 'model',
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet (需要配置 API Key)',
        created_at: '2024-10-22T00:00:00Z',
      });
    }
    
  } catch (error) {
    console.error('[APOS Models API] Error:', error);
    // 出错时返回默认列表
    models.push({
      type: 'model',
      id: 'claude-3-5-sonnet-20241022',
      display_name: 'Claude 3.5 Sonnet',
      created_at: '2024-10-22T00:00:00Z',
    });
  }
  
  // 更新缓存
  modelsCache = { data: models, timestamp: Date.now() };
  console.log(`[APOS Models API] Cached ${models.length} models`);
  
  return NextResponse.json({
    data: models,
  });
}
