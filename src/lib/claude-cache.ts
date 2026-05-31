/**
 * Optional feature: Requires Anthropic API key to use
 *
 * This module provides Claude-specific optimizations including prompt caching,
 * model selection, context management, and error recovery. These features are
 * not used by default and require an Anthropic API key to function.
 *
 * To enable: Set ANTHROPIC_API_KEY environment variable or configure in settings.
 */

/**
 * Claude Prompt Caching 实现
 * 
 * 功能：
 * - 缓存 system prompt 和消息历史
 * - 降低 80-90% 的成本
 * - 5 分钟缓存有效期
 * 
 * 使用场景：
 * - 长对话（多轮对话）
 * - 重复的 system prompt
 * - 大量上下文
 */

import Anthropic from '@anthropic-ai/sdk';

export interface CacheStats {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  cache_hit_rate: number;
  cost_saved: number;
}

export interface ClaudeCacheConfig {
  enableCache: boolean;
  cacheSystemPrompt: boolean;
  cacheMessages: boolean;
  minTokensForCache: number;  // 最小 token 数才启用缓存
}

const DEFAULT_CONFIG: ClaudeCacheConfig = {
  enableCache: true,
  cacheSystemPrompt: true,
  cacheMessages: true,
  minTokensForCache: 1024,  // Claude 要求至少 1024 tokens
};

/**
 * 估算文本的 token 数量
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 使用 Prompt Caching 生成文本
 */
export async function generateTextWithCache(
  messages: any[],
  system: string,
  apiKey: string,
  config: Partial<ClaudeCacheConfig> = {}
): Promise<{ text: string; usage: CacheStats }> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (!finalConfig.enableCache) {
    // 如果禁用缓存，使用标准 API
    return generateTextWithoutCache(messages, system, apiKey);
  }

  const client = new Anthropic({ apiKey });

  // 构建带缓存的 system prompt
  const systemBlocks: any[] = [];
  
  if (system) {
    const systemTokens = estimateTokens(system);
    
    if (finalConfig.cacheSystemPrompt && systemTokens >= finalConfig.minTokensForCache) {
      // 启用缓存
      systemBlocks.push({
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' }
      });
    } else {
      // 不启用缓存
      systemBlocks.push({
        type: 'text',
        text: system
      });
    }
  }

  // 构建带缓存的消息
  const processedMessages = messages.map((msg, index) => {
    const isLastUserMessage = 
      msg.role === 'user' && 
      index === messages.length - 1;
    
    const messageTokens = estimateTokens(
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    );

    // 只缓存最后一条用户消息之前的消息
    const shouldCache = 
      finalConfig.cacheMessages &&
      !isLastUserMessage &&
      messageTokens >= finalConfig.minTokensForCache;

    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        content: shouldCache ? [
          {
            type: 'text',
            text: msg.content,
            cache_control: { type: 'ephemeral' }
          }
        ] : msg.content
      };
    } else {
      // 处理复杂的 content 结构
      return {
        role: msg.role,
        content: Array.isArray(msg.content) 
          ? msg.content.map((block: any, blockIndex: number) => {
              // 只在最后一个 block 添加缓存控制
              if (shouldCache && blockIndex === msg.content.length - 1) {
                return {
                  ...block,
                  cache_control: { type: 'ephemeral' }
                };
              }
              return block;
            })
          : msg.content
      };
    }
  });

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemBlocks.length > 0 ? systemBlocks : undefined,
      messages: processedMessages,
    });

    // 计算缓存统计
    const usage = response.usage as any;
    const cacheHitRate = usage.cache_read_input_tokens > 0
      ? (usage.cache_read_input_tokens / (usage.input_tokens + usage.cache_read_input_tokens)) * 100
      : 0;

    // 计算节省的成本（假设 input token 价格为 $3/1M）
    const standardCost = (usage.input_tokens + usage.cache_read_input_tokens) * 0.000003;
    const actualCost = 
      (usage.input_tokens * 0.000003) + 
      (usage.cache_creation_input_tokens * 0.00000375) +  // 25% 增加
      (usage.cache_read_input_tokens * 0.0000003);  // 90% 折扣
    const costSaved = standardCost - actualCost;

    const stats: CacheStats = {
      input_tokens: usage.input_tokens || 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_hit_rate: cacheHitRate,
      cost_saved: costSaved,
    };

    console.log('[Claude Cache] Stats:', {
      cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
      costSaved: `$${costSaved.toFixed(6)}`,
      cacheRead: usage.cache_read_input_tokens,
      cacheCreation: usage.cache_creation_input_tokens,
    });

    return {
      text: response.content[0].type === 'text' ? response.content[0].text : '',
      usage: stats,
    };
  } catch (error: any) {
    console.error('[Claude Cache] Error:', error.message);
    throw error;
  }
}

/**
 * 不使用缓存的标准生成（回退方案）
 */
async function generateTextWithoutCache(
  messages: any[],
  system: string,
  apiKey: string
): Promise<{ text: string; usage: CacheStats }> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    system,
    messages,
  });

  const usage = response.usage as any;

  return {
    text: response.content[0].type === 'text' ? response.content[0].text : '',
    usage: {
      input_tokens: usage.input_tokens || 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: usage.output_tokens || 0,
      cache_hit_rate: 0,
      cost_saved: 0,
    },
  };
}

/**
 * 流式生成（带缓存）
 */
export async function streamTextWithCache(
  messages: any[],
  system: string,
  apiKey: string,
  config: Partial<ClaudeCacheConfig> = {}
): Promise<AsyncIterable<string>> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const client = new Anthropic({ apiKey });

  // 构建带缓存的 system prompt
  const systemBlocks: any[] = [];
  
  if (system) {
    const systemTokens = estimateTokens(system);
    
    if (finalConfig.cacheSystemPrompt && systemTokens >= finalConfig.minTokensForCache) {
      systemBlocks.push({
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' }
      });
    } else {
      systemBlocks.push({
        type: 'text',
        text: system
      });
    }
  }

  const stream = await client.messages.stream({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    system: systemBlocks.length > 0 ? systemBlocks : undefined,
    messages,
  });

  return (async function* () {
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  })();
}
