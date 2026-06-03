import { db } from './db';
import { settings } from './schema';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText as aiGenerateText } from 'ai';
import { selectClaudeModel, type ClaudeModel } from './claude-model-selector';
import { getExtProxyStore, type ExtProxyProvider } from './ext-proxy-store';
import { getExtStatusStore } from './ext-status-store';

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
    if (selectedModel === 'chatgpt_web') {
      return {
        model: { isWebModel: true, type: 'chatgpt' },
        provider: 'web',
      };
    }
    if (selectedModel === 'gemini_web') {
      return {
        model: { isWebModel: true, type: 'gemini' },
        provider: 'web',
      };
    }
    if (selectedModel === 'kimi_web') {
      return {
        model: { isWebModel: true, type: 'kimi' },
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

  // Final fallback: check browser companion extension online status first
  const extStore = getExtProxyStore();
  const statusStore = getExtStatusStore();
  const statusSnapshot = statusStore.getSnapshot();

  const chatgptCookies = keysMap.get('chatgpt_cookies');
  const geminiCookies = keysMap.get('gemini_cookies');
  const kimiCookies = keysMap.get('kimi_cookies');

  if (extStore.isExtensionOnline()) {
    if (statusSnapshot.tabs.chatgpt?.open || chatgptCookies) {
      return { model: { isWebModel: true, type: 'chatgpt' }, provider: 'web' };
    }
    if (statusSnapshot.tabs.gemini?.open || geminiCookies) {
      return { model: { isWebModel: true, type: 'gemini' }, provider: 'web' };
    }
    if (statusSnapshot.tabs.kimi?.open || kimiCookies) {
      return { model: { isWebModel: true, type: 'kimi' }, provider: 'web' };
    }
    if ((statusSnapshot.tabs as any).google?.open) {
      return { model: { isWebModel: true, type: 'google' }, provider: 'web' };
    }
  }

  // Next fallback: try Ollama first before cloud API models
  if (ollamaModels.length > 0) {
    console.log('[APOS LLM Router] Using Ollama as final fallback');
    return { model: ollama(ollamaModels[0]), provider: 'ollama' };
  }

  // Final fallback: use cloud models
  return getLLMClient();
}

/**
 * Custom generateText function that acts as a gateway.
 *
 * If the model is a web session model, it dispatches the task to the browser
 * extension proxy (ExtProxyStore) instead of calling the web APIs directly
 * from the server. The extension executes the request inside a real browser
 * tab (with full cookies / Cloudflare fingerprint) and posts the result back.
 *
 * Falls back to the native Vercel AI SDK generateText for all other models.
 * 
 * NEW: Automatic fallback mechanism - if web model fails, automatically tries
 * to use an available fallback model (Ollama -> API models).
 */
export async function generateText(options: any): Promise<any> {
  const model = options.model;

  if (model && typeof model === 'object' && model.isWebModel) {
    // Build a single prompt string from whatever format the caller used
    let prompt = options.prompt || '';

    if (options.messages && Array.isArray(options.messages)) {
      prompt = options.messages
        .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${
          typeof m.content === 'string' ? m.content :
          Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join('') :
          ''
        }`)
        .join('\n\n');
    }

    if (options.system) {
      prompt = `System Instructions:\n${options.system}\n\nUser Prompt:\n${prompt}`;
    }

    const provider = model.type as ExtProxyProvider;

    const store = getExtProxyStore();

    // If the extension hasn't polled recently, dispatch anyway and let the
    // task timeout naturally — the extension may just have restarted or the
    // heartbeat window may have been missed due to a hot-reload.
    if (!store.isExtensionOnline()) {
      console.warn(
        `[APOS] Extension heartbeat not detected recently for provider "${provider}". ` +
        `Dispatching task anyway — will timeout in 120s if extension is truly offline.`
      );
    }

    try {
      const result = await store.dispatch(provider, prompt);

      if (result.error) {
        throw new Error(`Web model (${provider}) error: ${result.error}`);
      }

      return {
        text: result.text ?? '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    } catch (error: any) {
      console.error(`[APOS LLM] Web model (${provider}) failed:`, error.message);
      
      // Try to get a fallback model
      const fallback = await getFallbackModel(provider);
      
      if (fallback) {
        console.warn(`[APOS LLM] Falling back to ${fallback.provider} model`);
        
        // Retry with fallback model
        const fallbackOptions = {
          ...options,
          model: fallback.model,
        };
        
        return aiGenerateText(fallbackOptions);
      }
      
      // No fallback available, re-throw the original error
      throw error;
    }
  }

  try {
    return await aiGenerateText(options);
  } catch (error: any) {
    const msg: string = error?.message || '';
    // 404 / Not Found usually means the model name or base URL is wrong.
    // Try a fallback model before surfacing the error.
    const is404 =
      msg === 'Not Found' ||
      msg === '404' ||
      msg.startsWith('404 ') ||
      error?.status === 404 ||
      error?.statusCode === 404;

    if (is404) {
      console.warn('[APOS LLM] Primary model returned 404, attempting fallback...');
      const fallback = await getFallbackModel();
      if (fallback) {
        console.warn(`[APOS LLM] Falling back to ${fallback.provider} model`);
        return aiGenerateText({ ...options, model: fallback.model });
      }
    }
    throw error;
  }
}

/**
 * Get a fallback model when the primary model fails.
 * Priority: Ollama (local, free) -> Gemini API (cheap) -> OpenAI API -> Anthropic API
 * 
 * @param failedProvider - The provider that failed (to avoid retrying the same type)
 * @returns A fallback LLMConfig or null if no fallback is available
 */
async function getFallbackModel(failedProvider?: string): Promise<LLMConfig | null> {
  let keysMap = new Map<string, string>();
  
  try {
    const list = await db.select().from(settings);
    keysMap = new Map(list.map(s => [s.key, s.value]));
  } catch (error) {
    console.warn('Failed to read settings for fallback model', error);
    return null;
  }

  const openaiKey = keysMap.get('openai_api_key');
  const anthropicKey = keysMap.get('anthropic_api_key');
  const googleKey = keysMap.get('google_api_key');
  const deepseekKey = keysMap.get('deepseek_api_key');
  const customKey = keysMap.get('custom_openai_api_key');
  const customBase = keysMap.get('custom_openai_base_url');
  const customModel = keysMap.get('custom_openai_model');

  // 1. Try Ollama first (local, free, fast)
  const ollamaModels = await getOllamaModels();
  if (ollamaModels.length > 0) {
    console.log('[APOS LLM] Fallback: Using Ollama local model');
    return {
      model: ollama(ollamaModels[0]),
      provider: 'ollama',
    };
  }

  // 2. Try Gemini API (cheap, good quality)
  if (googleKey) {
    console.log('[APOS LLM] Fallback: Using Google Gemini API');
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return {
      model: google('gemini-1.5-flash-latest'), // Use flash for fallback (faster, cheaper)
      provider: 'google',
    };
  }

  // 3. Try DeepSeek API (cheap, good for coding)
  if (deepseekKey) {
    console.log('[APOS LLM] Fallback: Using DeepSeek API');
    const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: deepseekKey });
    return {
      model: ds('deepseek-chat'),
      provider: 'openai',
    };
  }

  // 4. Try OpenAI API
  if (openaiKey) {
    console.log('[APOS LLM] Fallback: Using OpenAI API');
    const openai = createOpenAI({ apiKey: openaiKey });
    return {
      model: openai('gpt-4o-mini'), // Use mini for fallback (cheaper)
      provider: 'openai',
    };
  }

  // 5. Try Anthropic API
  if (anthropicKey) {
    console.log('[APOS LLM] Fallback: Using Anthropic API');
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return {
      model: anthropic('claude-3-5-haiku-20241022'), // Use haiku for fallback (cheaper)
      provider: 'anthropic',
    };
  }

  // 6. Try custom OpenAI-compatible API
  if (customKey && customBase) {
    console.log('[APOS LLM] Fallback: Using custom OpenAI-compatible API');
    const custom = createOpenAI({ baseURL: customBase, apiKey: customKey });
    return {
      model: custom(customModel || 'gpt-4o'),
      provider: 'openai',
    };
  }

  // 7. Check environment variables as last resort
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) {
    console.log('[APOS LLM] Fallback: Using Google Gemini API from env');
    const google = createGoogleGenerativeAI({ 
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY 
    });
    return {
      model: google('gemini-1.5-flash-latest'),
      provider: 'google',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    console.log('[APOS LLM] Fallback: Using OpenAI API from env');
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return {
      model: openai('gpt-4o-mini'),
      provider: 'openai',
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[APOS LLM] Fallback: Using Anthropic API from env');
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return {
      model: anthropic('claude-3-5-haiku-20241022'),
      provider: 'anthropic',
    };
  }

  console.warn('[APOS LLM] No fallback model available');
  return null;
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
    if (selectedModel === 'chatgpt_web') {
      return { model: { isWebModel: true, type: 'chatgpt' }, provider: 'web' };
    }
    if (selectedModel === 'gemini_web') {
      return { model: { isWebModel: true, type: 'gemini' }, provider: 'web' };
    }
    if (selectedModel === 'kimi_web') {
      return { model: { isWebModel: true, type: 'kimi' }, provider: 'web' };
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

  // 新架构 (v3.0+)：如果浏览器伴侣插件在线，检测并自动路由到当前已打开的网页版标签页（免 Key）
  const extStore = getExtProxyStore();
  const statusStore = getExtStatusStore();
  const statusSnapshot = statusStore.getSnapshot();

  if (extStore.isExtensionOnline()) {
    if (statusSnapshot.tabs.chatgpt?.open || chatgptCookies) {
      return { model: { isWebModel: true, type: 'chatgpt' }, provider: 'web' };
    }
    if (statusSnapshot.tabs.gemini?.open || geminiCookies) {
      return { model: { isWebModel: true, type: 'gemini' }, provider: 'web' };
    }
    if (statusSnapshot.tabs.kimi?.open || kimiCookies) {
      return { model: { isWebModel: true, type: 'kimi' }, provider: 'web' };
    }
    if ((statusSnapshot.tabs as any).google?.open) {
      return { model: { isWebModel: true, type: 'google' }, provider: 'web' };
    }
  } else {
    // 兼容旧版基于 Cookie 的回退
    if (chatgptCookies) {
      return { model: { isWebModel: true, type: 'chatgpt' }, provider: 'web' };
    }
    if (geminiCookies) {
      return { model: { isWebModel: true, type: 'gemini' }, provider: 'web' };
    }
    if (kimiCookies) {
      return { model: { isWebModel: true, type: 'kimi' }, provider: 'web' };
    }
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
