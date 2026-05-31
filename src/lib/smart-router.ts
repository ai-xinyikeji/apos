import { getLLMClient, isOllamaAvailable, getOllamaModels, LLMConfig } from './llm';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { db } from './db';
import { settings } from './schema';

export type TaskComplexity = 'low' | 'medium' | 'high';

export interface Task {
  type: 'reasoning' | 'coding' | 'summarize' | 'refactor' | 'review' | 'planning' | 'format' | 'default';
  codeLength?: number;
  contextSize?: number;
  requiresCreativity?: boolean;
  requiresMultiStep?: boolean;
}

export interface RoutedLLMConfig extends LLMConfig {
  reasoning: string;
  complexity: TaskComplexity;
  estimatedCost: number;
}

/**
 * Smart Model Router - 根据任务自动选择最优模型
 * 
 * 路由策略:
 * - 简单任务 (format, summarize) -> 本地模型 (免费)
 * - 中等任务 (coding, refactor) -> Gemini Flash (便宜)
 * - 复杂任务 (reasoning, planning) -> Claude (准确)
 * 
 * 成本对比:
 * - 本地模型: $0
 * - Gemini Flash: $0.075 per 1M tokens
 * - Claude Sonnet: $3.00 per 1M tokens
 */
export class SmartModelRouter {
  /**
   * 根据任务自动选择最优模型
   * 原则: 能用便宜的就不用贵的
   */
  async route(task: Task): Promise<RoutedLLMConfig> {
    const complexity = this.analyzeComplexity(task);
    const reasoning = this.explainRouting(task, complexity);

    console.log(`[SmartRouter] ${reasoning}`);

    // 获取配置
    const settingsList = await db.select().from(settings);
    const settingsMap = new Map(settingsList.map(s => [s.key, s.value]));
    const routingEnabled = settingsMap.get('enable_smart_routing') !== 'false'; // 默认启用

    if (!routingEnabled) {
      // 如果禁用智能路由，使用默认配置
      const fallback = await getLLMClient();
      return {
        ...fallback,
        reasoning: `智能路由已禁用，使用默认配置`,
        complexity,
        estimatedCost: this.estimateCost(fallback.provider, 1000),
      };
    }

    // 1. 简单任务 -> 本地模型 (免费)
    if (complexity === 'low') {
      const ollamaAvailable = await isOllamaAvailable();
      if (ollamaAvailable) {
        const ollamaClient = createOpenAI({
          baseURL: `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/v1`,
          apiKey: 'ollama',
        });

        // 获取可用模型
        try {
          const models = await getOllamaModels();
          const model = models[0] || 'qwen2.5-coder';

          return {
            model: ollamaClient(model),
            provider: 'ollama',
            reasoning: `${reasoning} | 使用本地模型: ${model}`,
            complexity,
            estimatedCost: 0,
          };
        } catch {
          // Ollama 不可用，继续下一级
        }
      }
    }

    // 2. 中等任务 -> Gemini Flash (便宜)
    if (complexity === 'medium') {
      const googleKey = settingsMap.get('google_api_key') || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (googleKey) {
        try {
          const google = createGoogleGenerativeAI({ apiKey: googleKey });
          return {
            model: google('gemini-1.5-flash'),
            provider: 'google',
            reasoning: `${reasoning} | 使用 Gemini Flash (成本优化)`,
            complexity,
            estimatedCost: 0.000075, // $0.075 per 1M tokens
          };
        } catch {
          // Gemini 不可用，继续下一级
        }
      }
    }

    // 3. 复杂任务 -> Claude (准确)
    if (complexity === 'high') {
      const anthropicKey = settingsMap.get('anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        try {
          const anthropic = createAnthropic({ apiKey: anthropicKey });
          return {
            model: anthropic('claude-3-5-sonnet-20241022'),
            provider: 'anthropic',
            reasoning: `${reasoning} | 使用 Claude Sonnet (质量优先)`,
            complexity,
            estimatedCost: 0.003, // $3 per 1M tokens
          };
        } catch {
          // Claude 不可用，回退
        }
      }
    }

    // 4. 回退到默认配置
    const fallback = await getLLMClient();
    return {
      ...fallback,
      reasoning: `${reasoning} | 回退到默认配置`,
      complexity,
      estimatedCost: this.estimateCost(fallback.provider, 1000),
    };
  }

  /**
   * 分析任务复杂度
   */
  private analyzeComplexity(task: Task): TaskComplexity {
    let score = 0;

    // 任务类型评分
    if (task.type === 'reasoning' || task.type === 'planning') score += 3;
    if (task.type === 'coding') score += 2;
    if (task.type === 'refactor' || task.type === 'review') score += 1;
    if (task.type === 'summarize' || task.type === 'format') score += 0;

    // 代码长度评分
    if (task.codeLength && task.codeLength > 5000) score += 1;
    if (task.codeLength && task.codeLength > 10000) score += 1;

    // 上下文大小评分
    if (task.contextSize && task.contextSize > 10000) score += 1;
    if (task.contextSize && task.contextSize > 50000) score += 1;

    // 其他因素
    if (task.requiresCreativity) score += 2;
    if (task.requiresMultiStep) score += 1;

    // 复杂度判定
    if (score >= 5) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /**
   * 解释路由决策
   */
  private explainRouting(task: Task, complexity: TaskComplexity): string {
    const reasons: string[] = [];

    reasons.push(`任务类型: ${task.type}`);
    reasons.push(`复杂度: ${complexity}`);

    if (complexity === 'low') {
      reasons.push('策略: 本地模型 (免费)');
    } else if (complexity === 'medium') {
      reasons.push('策略: Gemini Flash (便宜)');
    } else {
      reasons.push('策略: Claude Sonnet (准确)');
    }

    return reasons.join(' | ');
  }

  /**
   * 估算成本 (per 1000 tokens)
   */
  private estimateCost(provider: string, tokens: number): number {
    const rates: Record<string, number> = {
      'ollama': 0,
      'google': 0.000075,
      'anthropic': 0.003,
      'openai': 0.00001,
    };

    return (rates[provider] || 0.00001) * (tokens / 1000);
  }

  /**
   * 格式化路由信息
   */
  formatRouting(config: RoutedLLMConfig): string {
    return `${config.reasoning} | 预估成本: $${config.estimatedCost.toFixed(6)}/1K tokens`;
  }
}
