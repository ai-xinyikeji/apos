/**
 * 本地模型优化器 - 为 Ollama 提供类似 Claude 的优化功能
 * 
 * 功能：
 * 1. 智能模型选择 - 根据任务类型选择最优本地模型
 * 2. 上下文管理优化 - 针对本地模型的上下文窗口优化
 * 3. 缓存策略 - 本地缓存机制（不同于 Claude 的 Prompt Caching）
 * 4. 性能优化 - 减少推理时间
 */

import { getLMStudioModels } from './llm';

export interface LocalModelInfo {
  modelId: string;
  contextWindow: number;
  speed: number;  // 1-5, 5 最快
  quality: number;  // 1-5, 5 最好
  bestFor: string[];
}

export interface LocalOptimizerConfig {
  // 上下文管理配置
  maxMessages: number;
  summarizationThreshold: number;
  
  // 缓存配置
  enableLocalCache: boolean;
  cacheExpiry: number;  // 缓存过期时间（秒）
  
  // 性能配置
  maxTokens: number;
  temperature: number;
}

export interface OptimizedLocalResult {
  text: string;
  model: string;
  stats: {
    context: {
      originalMessages: number;
      finalMessages: number;
      informationRetention: number;
    };
    performance: {
      inferenceTime: number;
      tokensPerSecond: number;
    };
    cache: {
      hit: boolean;
      saved: number;  // 节省的推理时间（毫秒）
    };
  };
}

const DEFAULT_CONFIG: LocalOptimizerConfig = {
  maxMessages: 10,  // 本地模型上下文较小，保留 10 条
  summarizationThreshold: 24_000,  // 24K tokens（本地模型通常是 32K）
  enableLocalCache: true,
  cacheExpiry: 300,  // 5 分钟
  maxTokens: 2048,
  temperature: 0.7,
};

// 本地模型特征库
const LOCAL_MODEL_PROFILES: Record<string, Partial<LocalModelInfo>> = {
  'qwen': {
    contextWindow: 32_000,
    speed: 4,
    quality: 4,
    bestFor: ['coding', 'refactor', 'review', 'explain'],
  },
  'deepseek': {
    contextWindow: 32_000,
    speed: 4,
    quality: 5,
    bestFor: ['coding', 'reasoning', 'planning'],
  },
  'llama': {
    contextWindow: 8_000,
    speed: 5,
    quality: 3,
    bestFor: ['summarize', 'format', 'translate'],
  },
  'gemma': {
    contextWindow: 8_000,
    speed: 5,
    quality: 3,
    bestFor: ['summarize', 'simple-qa'],
  },
  'mistral': {
    contextWindow: 32_000,
    speed: 4,
    quality: 4,
    bestFor: ['coding', 'explain', 'review'],
  },
  'phi': {
    contextWindow: 4_000,
    speed: 5,
    quality: 3,
    bestFor: ['summarize', 'format'],
  },
};

// 简单的内存缓存
const localCache = new Map<string, { result: string; timestamp: number }>();

export class LocalModelOptimizer {
  private config: LocalOptimizerConfig;
  private baseUrl: string;

  constructor(config: Partial<LocalOptimizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.baseUrl = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234';
  }

  /**
   * 根据任务类型选择最优本地模型
   */
  async selectBestModel(taskType: string): Promise<string> {
    const availableModels = await getLMStudioModels();
    
    if (availableModels.length === 0) {
      throw new Error('No local models available in Ollama');
    }

    // 任务类型到模型偏好的映射
    const taskPreferences: Record<string, string[]> = {
      'coding': ['deepseek', 'qwen', 'mistral'],
      'reasoning': ['deepseek', 'qwen'],
      'summarize': ['llama', 'gemma', 'phi'],
      'refactor': ['qwen', 'deepseek', 'mistral'],
      'review': ['qwen', 'deepseek', 'mistral'],
      'explain': ['qwen', 'mistral', 'deepseek'],
      'planning': ['deepseek', 'qwen'],
      'default': ['qwen', 'deepseek', 'mistral'],
    };

    const preferences = taskPreferences[taskType] || taskPreferences['default'];

    // 按偏好顺序查找可用模型
    for (const pref of preferences) {
      const model = availableModels.find(m => m.toLowerCase().includes(pref));
      if (model) {
        console.log(`[Local Optimizer] Selected model: ${model} for task: ${taskType}`);
        return model;
      }
    }

    // 如果没有匹配的偏好，返回第一个可用模型
    console.log(`[Local Optimizer] Using fallback model: ${availableModels[0]} for task: ${taskType}`);
    return availableModels[0];
  }

  /**
   * 优化上下文（针对本地模型的小上下文窗口）
   */
  optimizeContext(messages: any[], system: string): {
    messages: any[];
    system: string;
    stats: {
      originalMessages: number;
      finalMessages: number;
      informationRetention: number;
    };
  } {
    const originalMessages = messages.length;

    // 估算 token 数量
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);
    const totalTokens = estimateTokens(system) + 
      messages.reduce((sum, m) => sum + estimateTokens(JSON.stringify(m.content)), 0);

    let finalMessages = [...messages];
    let informationRetention = 100;

    // 如果超过阈值，只保留最近的消息
    if (totalTokens > this.config.summarizationThreshold || messages.length > this.config.maxMessages) {
      finalMessages = messages.slice(-this.config.maxMessages);
      informationRetention = (this.config.maxMessages / originalMessages) * 100;
      
      console.log(`[Local Optimizer] Context optimized: ${originalMessages} → ${finalMessages.length} messages`);
    }

    return {
      messages: finalMessages,
      system,
      stats: {
        originalMessages,
        finalMessages: finalMessages.length,
        informationRetention,
      },
    };
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(messages: any[], system: string, model: string): string {
    const content = JSON.stringify({ messages, system, model });
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return `local_${Math.abs(hash).toString(36)}`;
  }

  /**
   * 检查缓存
   */
  private checkCache(cacheKey: string): string | null {
    if (!this.config.enableLocalCache) return null;

    const cached = localCache.get(cacheKey);
    if (!cached) return null;

    const now = Date.now();
    const age = (now - cached.timestamp) / 1000;

    if (age > this.config.cacheExpiry) {
      localCache.delete(cacheKey);
      return null;
    }

    console.log(`[Local Optimizer] Cache hit! Age: ${age.toFixed(1)}s`);
    return cached.result;
  }

  /**
   * 保存到缓存
   */
  private saveCache(cacheKey: string, result: string): void {
    if (!this.config.enableLocalCache) return;

    localCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    // 清理过期缓存
    const now = Date.now();
    for (const [key, value] of localCache.entries()) {
      const age = (now - value.timestamp) / 1000;
      if (age > this.config.cacheExpiry) {
        localCache.delete(key);
      }
    }
  }

  /**
   * 生成文本（集成所有优化）
   */
  async generate(
    messages: any[],
    system: string,
    taskType: string = 'default'
  ): Promise<OptimizedLocalResult> {
    const startTime = Date.now();

    // 第 1 步：选择最优模型
    const selectedModel = await this.selectBestModel(taskType);

    // 第 2 步：优化上下文
    const optimized = this.optimizeContext(messages, system);

    // 第 3 步：检查缓存
    const cacheKey = this.getCacheKey(optimized.messages, optimized.system, selectedModel);
    const cachedResult = this.checkCache(cacheKey);

    if (cachedResult) {
      const inferenceTime = Date.now() - startTime;
      return {
        text: cachedResult,
        model: selectedModel,
        stats: {
          context: optimized.stats,
          performance: {
            inferenceTime,
            tokensPerSecond: 0,  // 缓存命中，无推理
          },
          cache: {
            hit: true,
            saved: 5000,  // 假设节省 5 秒推理时间
          },
        },
      };
    }

    // 第 4 步：调用 Ollama API
    const inferenceStart = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: optimized.system },
            ...optimized.messages,
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};

      const inferenceTime = Date.now() - inferenceStart;
      const tokensPerSecond = usage.completion_tokens 
        ? (usage.completion_tokens / (inferenceTime / 1000))
        : 0;

      // 保存到缓存
      this.saveCache(cacheKey, text);

      return {
        text,
        model: selectedModel,
        stats: {
          context: optimized.stats,
          performance: {
            inferenceTime,
            tokensPerSecond,
          },
          cache: {
            hit: false,
            saved: 0,
          },
        },
      };
    } catch (error: any) {
      console.error('[Local Optimizer] Generation failed:', error.message);
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    localCache.clear();
    console.log('[Local Optimizer] Cache cleared');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: localCache.size,
      keys: Array.from(localCache.keys()),
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LocalOptimizerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): LocalOptimizerConfig {
    return { ...this.config };
  }
}

/**
 * 便捷函数：快速生成
 */
export async function optimizedLocalGenerate(
  messages: any[],
  system: string,
  taskType: string = 'default',
  config: Partial<LocalOptimizerConfig> = {}
): Promise<OptimizedLocalResult> {
  const optimizer = new LocalModelOptimizer(config);
  return await optimizer.generate(messages, system, taskType);
}

/**
 * 获取模型信息
 */
export function getLocalModelInfo(modelId: string): Partial<LocalModelInfo> {
  const lowerModelId = modelId.toLowerCase();
  
  for (const [key, info] of Object.entries(LOCAL_MODEL_PROFILES)) {
    if (lowerModelId.includes(key)) {
      return { ...info, modelId };
    }
  }
  
  // 默认配置
  return {
    modelId,
    contextWindow: 8_000,
    speed: 3,
    quality: 3,
    bestFor: ['default'],
  };
}
