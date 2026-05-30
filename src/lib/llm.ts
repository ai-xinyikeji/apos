import { db } from './db';
import { settings } from './schema';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText as aiGenerateText } from 'ai';
import { askChatGPTWeb, askGeminiWeb, askKimiWeb } from './web-llm';
import { selectClaudeModel, type ClaudeModel } from './claude-model-selector';

// Ollama base URL — configurable via OLLAMA_BASE_URL env var
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// Ollama client (OpenAI-compatible API)
const ollama = createOpenAI({
  baseURL: `${OLLAMA_BASE_URL}/v1`,
  apiKey: 'ollama', // Ollama doesn't require a real key
});

export interface LLMConfig {
  model: any;
  provider: 'openai' | 'anthropic' | 'google' | 'web' | 'ollama';
}

export type TaskType = 'reasoning' | 'coding' | 'summarize' | 'refactor' | 'review' | 'planning' | 'explain' | 'default';

/**
 * Fetch Ollama models in a single request.
 * Returns empty array if unavailable. Use this instead of calling
 * isOllamaAvailable() + getOllamaModels() separately to avoid double requests.
 */
export async function getOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  } catch {
    return [];
  }
}

/**
 * Check if Ollama is available.
 * Reuses getOllamaModels() to avoid an extra HTTP request.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  const models = await getOllamaModels();
  return models.length > 0;
}

// Aliases for backward compatibility
export const getLMStudioModels = getOllamaModels;
export const isLMStudioAvailable = isOllamaAvailable;

/**
 * Smart router: automatically select the best model based on task type
 * Priority: Ollama (free) > Gemini (cheap) > Claude (expensive)
 */
export async function routeModel(taskType: TaskType = 'default'): Promise<LLMConfig> {
  let keysMap = new Map<string, string>();
  try {
    const list = await db.select().from(settings);
    keysMap = new Map(list.map(s => [s.key, s.value]));
  } catch (error) {
    console.warn('Failed to read settings from database in routeModel, falling back', error);
  }

  // Map taskType to DB key
  let dbKey = 'model_task_retrieval';
  if (taskType === 'reasoning' || taskType === 'explain') dbKey = 'model_task_reasoning';
  else if (taskType === 'coding') dbKey = 'model_task_coding';
  else if (taskType === 'summarize' || taskType === 'default') dbKey = 'model_task_retrieval';
  else if (taskType === 'refactor' || taskType === 'review') dbKey = 'model_task_refactor';
  else if (taskType === 'planning') dbKey = 'model_task_planning';

  const selectedModel = keysMap.get(dbKey);

  if (selectedModel && selectedModel !== 'default') {
    const chatgptCookies = keysMap.get('chatgpt_cookies');
    const geminiCookies = keysMap.get('gemini_cookies');
    const kimiCookies = keysMap.get('kimi_cookies');
    const openaiKey = keysMap.get('openai_api_key');
    const anthropicKey = keysMap.get('anthropic_api_key');
    const googleKey = keysMap.get('google_api_key');
    const deepseekKey = keysMap.get('deepseek_api_key');
    const customKey = keysMap.get('custom_openai_api_key');
    const customBase = keysMap.get('custom_openai_base_url');
    const customModel = keysMap.get('custom_openai_model');

    if (selectedModel === 'ollama' || selectedModel === 'lmstudio') {
      const models = await getOllamaModels();
      if (models.length > 0) {
        const model = models[0];
        return {
          model: ollama(model),
          provider: 'ollama',
        };
      }
    }
    if (selectedModel === 'chatgpt_web' && chatgptCookies) {
      return {
        model: { isWebModel: true, type: 'chatgpt', cookies: chatgptCookies },
        provider: 'web',
      };
    }
    if (selectedModel === 'gemini_web' && geminiCookies) {
      return {
        model: { isWebModel: true, type: 'gemini', cookies: geminiCookies },
        provider: 'web',
      };
    }
    if (selectedModel === 'kimi_web' && kimiCookies) {
      return {
        model: { isWebModel: true, type: 'kimi', cookies: kimiCookies },
        provider: 'web',
      };
    }
    if (selectedModel === 'anthropic_api' && anthropicKey) {
      const anthropic = createAnthropic({ apiKey: anthropicKey });
      const claudeModel = selectClaudeModel(taskType);
      return { model: anthropic(claudeModel), provider: 'anthropic' };
    }
    if (selectedModel === 'openai_api' && openaiKey) {
      const openai = createOpenAI({ apiKey: openaiKey });
      return { model: openai('gpt-4o'), provider: 'openai' };
    }
    if (selectedModel === 'google_api' && googleKey) {
      const google = createGoogleGenerativeAI({ apiKey: googleKey });
      return { model: google('gemini-1.5-pro-latest'), provider: 'google' };
    }
    if (selectedModel === 'deepseek_api' && deepseekKey) {
      const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: deepseekKey });
      const modelName = (taskType === 'reasoning' || taskType === 'explain') ? 'deepseek-reasoner' : 'deepseek-chat';
      return { model: ds(modelName), provider: 'openai' };
    }
    if (selectedModel === 'custom_openai_api' && customKey && customBase) {
      const custom = createOpenAI({ baseURL: customBase, apiKey: customKey });
      return { model: custom(customModel || 'gpt-4o'), provider: 'openai' };
    }
  }

  // Fallback: check if Ollama is available for summarization/review
  const ollamaModels = await getOllamaModels();
  if (['summarize', 'refactor', 'review'].includes(taskType) && ollamaModels.length > 0) {
    const codeModel = ollamaModels.find(m => m.includes('qwen') || m.includes('deepseek') || m.includes('coder'));
    if (codeModel) {
      return { model: ollama(codeModel), provider: 'ollama' };
    }
  }

  // For high-reasoning tasks, use cloud models
  return getLLMClient();
}

/**
 * Custom generateText function that acts as a gateway.
 * If the model option is a special web-session model, it calls the web APIs.
 * Otherwise, it falls back to the native Vercel AI SDK generateText.
 */
export async function generateText(options: any): Promise<any> {
  const model = options.model;

  if (model && typeof model === 'object' && model.isWebModel) {
    let prompt = options.prompt || '';

    if (options.messages && Array.isArray(options.messages)) {
      prompt = options.messages
        .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
    }

    if (options.system) {
      prompt = `System Instructions:\n${options.system}\n\nUser Prompt:\n${prompt}`;
    }

    let text = '';
    if (model.type === 'chatgpt') {
      text = await askChatGPTWeb(prompt, model.cookies);
    } else if (model.type === 'gemini') {
      text = await askGeminiWeb(prompt, model.cookies);
    } else if (model.type === 'kimi') {
      text = await askKimiWeb(prompt, model.cookies);
    } else {
      throw new Error(`Unsupported web model type: ${model.type}`);
    }

    return {
      text,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  return aiGenerateText(options);
}

/**
 * Retrieves a configured LLM model instance based on SQLite database settings.
 * Prioritizes: Ollama (local) -> ChatGPT Web -> Gemini Web -> Anthropic -> OpenAI -> Google
 * Falls back to process.env if SQLite database has no values.
 */
export async function getLLMClient(agentName?: string): Promise<LLMConfig> {
  let keysMap = new Map<string, string>();

  try {
    const list = await db.select().from(settings);
    keysMap = new Map(list.map(s => [s.key, s.value]));
  } catch (error) {
    console.warn('Failed to read LLM keys from database, relying on env fallback', error);
  }

  const chatgptCookies = keysMap.get('chatgpt_cookies');
  const geminiCookies = keysMap.get('gemini_cookies');
  const kimiCookies = keysMap.get('kimi_cookies');
  const openaiKey = keysMap.get('openai_api_key');
  const anthropicKey = keysMap.get('anthropic_api_key');
  const googleKey = keysMap.get('google_api_key');
  const deepseekKey = keysMap.get('deepseek_api_key');
  const customKey = keysMap.get('custom_openai_api_key');
  const customBase = keysMap.get('custom_openai_base_url');
  const customModel = keysMap.get('custom_openai_model');
  // Support both new 'use_ollama' and legacy 'use_lmstudio' settings keys
  const useOllama = keysMap.get('use_ollama') === 'true' || keysMap.get('use_lmstudio') === 'true';

  const selectedModel = agentName ? keysMap.get(`model_${agentName}`) : null;

  if (selectedModel && selectedModel !== 'default') {
    if (selectedModel === 'ollama' || selectedModel === 'lmstudio') {
      const models = await getOllamaModels();
      if (models.length > 0) {
        const model = models[0];
        return { model: ollama(model), provider: 'ollama' };
      }
    }
    if (selectedModel === 'chatgpt_web' && chatgptCookies) {
      return { model: { isWebModel: true, type: 'chatgpt', cookies: chatgptCookies }, provider: 'web' };
    }
    if (selectedModel === 'gemini_web' && geminiCookies) {
      return { model: { isWebModel: true, type: 'gemini', cookies: geminiCookies }, provider: 'web' };
    }
    if (selectedModel === 'kimi_web' && kimiCookies) {
      return { model: { isWebModel: true, type: 'kimi', cookies: kimiCookies }, provider: 'web' };
    }
    if (selectedModel === 'anthropic_api' && anthropicKey) {
      const anthropic = createAnthropic({ apiKey: anthropicKey });
      const claudeModel = selectClaudeModel('default');
      return { model: anthropic(claudeModel), provider: 'anthropic' };
    }
    if (selectedModel === 'openai_api' && openaiKey) {
      const openai = createOpenAI({ apiKey: openaiKey });
      return { model: openai('gpt-4o'), provider: 'openai' };
    }
    if (selectedModel === 'google_api' && googleKey) {
      const google = createGoogleGenerativeAI({ apiKey: googleKey });
      return { model: google('gemini-1.5-pro-latest'), provider: 'google' };
    }
    if (selectedModel === 'deepseek_api' && deepseekKey) {
      const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: deepseekKey });
      return { model: ds('deepseek-chat'), provider: 'openai' };
    }
    if (selectedModel === 'custom_openai_api' && customKey && customBase) {
      const custom = createOpenAI({ baseURL: customBase, apiKey: customKey });
      return { model: custom(customModel || 'gpt-4o'), provider: 'openai' };
    }
  }

  // Auto-detect and prioritize Ollama if enabled
  if (useOllama) {
    const models = await getOllamaModels();
    if (models.length > 0) {
      const model = models[0];
      console.log(`🚀 Using Ollama local model: ${model}`);
      return { model: ollama(model), provider: 'ollama' };
    }
  }

  if (chatgptCookies) {
    return { model: { isWebModel: true, type: 'chatgpt', cookies: chatgptCookies }, provider: 'web' };
  }
  if (geminiCookies) {
    return { model: { isWebModel: true, type: 'gemini', cookies: geminiCookies }, provider: 'web' };
  }
  if (kimiCookies) {
    return { model: { isWebModel: true, type: 'kimi', cookies: kimiCookies }, provider: 'web' };
  }

  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    const claudeModel = selectClaudeModel('default');
    return { model: anthropic(claudeModel), provider: 'anthropic' };
  }
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return { model: openai('gpt-4o'), provider: 'openai' };
  }
  if (deepseekKey) {
    const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: deepseekKey });
    return { model: ds('deepseek-chat'), provider: 'openai' };
  }
  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return { model: google('gemini-1.5-pro-latest'), provider: 'google' };
  }
  if (customKey && customBase) {
    const custom = createOpenAI({ baseURL: customBase, apiKey: customKey });
    return { model: custom(customModel || 'gpt-4o'), provider: 'openai' };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const claudeModel = selectClaudeModel('default');
    return { model: anthropic(claudeModel), provider: 'anthropic' };
  }
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return { model: openai('gpt-4o'), provider: 'openai' };
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    return { model: google('gemini-1.5-pro-latest'), provider: 'google' };
  }

  throw new Error('未配置大模型 API 密钥或网页版 Cookies。请先在"配置中心"进行配置或使用浏览器伴侣同步。');
}
