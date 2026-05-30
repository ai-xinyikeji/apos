import { generateText, getLLMClient } from '../llm';
import { db } from '../db';
import { askChatGPTWeb, askGeminiWeb, askKimiWeb } from '../web-llm';
import { generateText as aiGenerateText } from 'ai';

// Mock dependencies
jest.mock('../db');
jest.mock('../web-llm');
jest.mock('ai');
jest.mock('@ai-sdk/openai');
jest.mock('@ai-sdk/anthropic');
jest.mock('@ai-sdk/google');

describe('LLM Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateText', () => {
    it('should call web ChatGPT when model is web ChatGPT', async () => {
      const mockModel = {
        isWebModel: true,
        type: 'chatgpt',
        cookies: 'test_cookies',
      };

      (askChatGPTWeb as jest.Mock).mockResolvedValue('ChatGPT response');

      const result = await generateText({
        model: mockModel,
        prompt: 'Test prompt',
      });

      expect(askChatGPTWeb).toHaveBeenCalledWith('Test prompt', 'test_cookies');
      expect(result).toEqual({
        text: 'ChatGPT response',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });
    });

    it('should call web Gemini when model is web Gemini', async () => {
      const mockModel = {
        isWebModel: true,
        type: 'gemini',
        cookies: 'gemini_cookies',
      };

      (askGeminiWeb as jest.Mock).mockResolvedValue('Gemini response');

      const result = await generateText({
        model: mockModel,
        prompt: 'Test prompt',
      });

      expect(askGeminiWeb).toHaveBeenCalledWith('Test prompt', 'gemini_cookies');
      expect(result.text).toBe('Gemini response');
    });

    it('should call web Kimi when model is web Kimi', async () => {
      const mockModel = {
        isWebModel: true,
        type: 'kimi',
        cookies: 'kimi_cookies',
      };

      (askKimiWeb as jest.Mock).mockResolvedValue('Kimi response');

      const result = await generateText({
        model: mockModel,
        prompt: 'Test prompt',
      });

      expect(askKimiWeb).toHaveBeenCalledWith('Test prompt', 'kimi_cookies');
      expect(result.text).toBe('Kimi response');
    });

    it('should convert messages to prompt for web models', async () => {
      const mockModel = {
        isWebModel: true,
        type: 'chatgpt',
        cookies: 'test_cookies',
      };

      (askChatGPTWeb as jest.Mock).mockResolvedValue('Response');

      await generateText({
        model: mockModel,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      expect(askChatGPTWeb).toHaveBeenCalledWith(
        'User: Hello\n\nAssistant: Hi there\n\nUser: How are you?',
        'test_cookies'
      );
    });

    it('should prepend system instructions for web models', async () => {
      const mockModel = {
        isWebModel: true,
        type: 'chatgpt',
        cookies: 'test_cookies',
      };

      (askChatGPTWeb as jest.Mock).mockResolvedValue('Response');

      await generateText({
        model: mockModel,
        system: 'You are a helpful assistant',
        prompt: 'Test prompt',
      });

      expect(askChatGPTWeb).toHaveBeenCalledWith(
        'System Instructions:\nYou are a helpful assistant\n\nUser Prompt:\nTest prompt',
        'test_cookies'
      );
    });

    it('should throw error for unsupported web model type', async () => {
      const mockModel = {
        isWebModel: true,
        type: 'unknown',
        cookies: 'test_cookies',
      };

      await expect(
        generateText({
          model: mockModel,
          prompt: 'Test prompt',
        })
      ).rejects.toThrow('Unsupported web model type: unknown');
    });

    it('should fallback to AI SDK for non-web models', async () => {
      const mockModel = { provider: 'openai', modelId: 'gpt-4o' };

      (aiGenerateText as jest.Mock).mockResolvedValue({
        text: 'AI SDK response',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const result = await generateText({
        model: mockModel,
        prompt: 'Test prompt',
      });

      expect(aiGenerateText).toHaveBeenCalledWith({
        model: mockModel,
        prompt: 'Test prompt',
      });
      expect(result.text).toBe('AI SDK response');
    });
  });

  describe('getLLMClient', () => {
    let savedEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Capture env AFTER jest.setup.js has run, then strip all LLM keys
      savedEnv = process.env;
      process.env = {
        NODE_ENV: 'test',
        // intentionally no API keys — each test sets what it needs
      };
    });

    afterEach(() => {
      process.env = savedEnv;
    });

    it('should prioritize ChatGPT web cookies', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'chatgpt_cookies', value: 'chatgpt_test_cookies' },
          { key: 'openai_api_key', value: 'openai_key' },
        ]),
      });

      const result = await getLLMClient();

      expect(result).toEqual({
        model: {
          isWebModel: true,
          type: 'chatgpt',
          cookies: 'chatgpt_test_cookies',
        },
        provider: 'web',
      });
    });

    it('should use Gemini web cookies when ChatGPT not available', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'gemini_cookies', value: 'gemini_test_cookies' },
          { key: 'openai_api_key', value: 'openai_key' },
        ]),
      });

      const result = await getLLMClient();

      expect(result).toEqual({
        model: {
          isWebModel: true,
          type: 'gemini',
          cookies: 'gemini_test_cookies',
        },
        provider: 'web',
      });
    });

    it('should use Kimi web cookies when ChatGPT and Gemini not available', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'kimi_cookies', value: 'kimi_test_cookies' },
          { key: 'openai_api_key', value: 'openai_key' },
        ]),
      });

      const result = await getLLMClient();

      expect(result).toEqual({
        model: {
          isWebModel: true,
          type: 'kimi',
          cookies: 'kimi_test_cookies',
        },
        provider: 'web',
      });
    });

    it('should use Anthropic API when web cookies not available', async () => {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const mockAnthropicModel = { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' };
      const mockAnthropic = jest.fn().mockReturnValue(mockAnthropicModel);
      (createAnthropic as jest.Mock).mockReturnValue(mockAnthropic);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'anthropic_api_key', value: 'anthropic_key' },
        ]),
      });

      const result = await getLLMClient();

      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'anthropic_key' });
      expect(result.provider).toBe('anthropic');
    });

    it('should use OpenAI API when Anthropic not available', async () => {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const mockOpenAIModel = { provider: 'openai', modelId: 'gpt-4o' };
      const mockOpenAI = jest.fn().mockReturnValue(mockOpenAIModel);
      (createOpenAI as jest.Mock).mockReturnValue(mockOpenAI);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'openai_api_key', value: 'openai_key' },
        ]),
      });

      const result = await getLLMClient();

      expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'openai_key' });
      expect(result.provider).toBe('openai');
    });

    it('should use Google API when OpenAI not available', async () => {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const mockGoogleModel = { provider: 'google', modelId: 'gemini-1.5-pro-latest' };
      const mockGoogle = jest.fn().mockReturnValue(mockGoogleModel);
      (createGoogleGenerativeAI as jest.Mock).mockReturnValue(mockGoogle);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'google_api_key', value: 'google_key' },
        ]),
      });

      const result = await getLLMClient();

      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'google_key' });
      expect(result.provider).toBe('google');
    });

    it('should fallback to environment variables', async () => {
      process.env.ANTHROPIC_API_KEY = 'env_anthropic_key';

      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const mockAnthropicModel = { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' };
      const mockAnthropic = jest.fn().mockReturnValue(mockAnthropicModel);
      (createAnthropic as jest.Mock).mockReturnValue(mockAnthropic);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      const result = await getLLMClient();

      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'env_anthropic_key' });
      expect(result.provider).toBe('anthropic');
    });

    it('should use agent-specific model override', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'chatgpt_cookies', value: 'chatgpt_cookies' },
          { key: 'anthropic_api_key', value: 'anthropic_key' },
          { key: 'model_proto_builder', value: 'anthropic_api' },
        ]),
      });

      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const mockAnthropicModel = { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' };
      const mockAnthropic = jest.fn().mockReturnValue(mockAnthropicModel);
      (createAnthropic as jest.Mock).mockReturnValue(mockAnthropic);

      const result = await getLLMClient('proto_builder');

      // Should use Anthropic API instead of default ChatGPT web
      expect(result.provider).toBe('anthropic');
    });

    it('should ignore agent-specific override if set to default', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'chatgpt_cookies', value: 'chatgpt_cookies' },
          { key: 'model_proto_builder', value: 'default' },
        ]),
      });

      const result = await getLLMClient('proto_builder');

      // Should use default priority (ChatGPT web)
      expect(result.provider).toBe('web');
      expect(result.model.type).toBe('chatgpt');
    });

    it('should throw error when no API keys configured', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      await expect(getLLMClient()).rejects.toThrow(
        '未配置大模型 API 密钥或网页版 Cookies'
      );
    });

    it('should handle database read errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      // Only set OpenAI key — no Anthropic key so OpenAI is picked
      process.env.OPENAI_API_KEY = 'env_openai_key';

      const { createOpenAI } = await import('@ai-sdk/openai');
      const mockOpenAIModel = { provider: 'openai', modelId: 'gpt-4o' };
      const mockOpenAI = jest.fn().mockReturnValue(mockOpenAIModel);
      (createOpenAI as jest.Mock).mockReturnValue(mockOpenAI);

      const result = await getLLMClient();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to read LLM keys from database, relying on env fallback',
        expect.any(Error)
      );
      expect(result.provider).toBe('openai');

      consoleWarnSpy.mockRestore();
    });

    it('should support GOOGLE_GENERATIVE_AI_API_KEY env variable', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'google_key';

      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const mockGoogleModel = { provider: 'google', modelId: 'gemini-1.5-pro-latest' };
      const mockGoogle = jest.fn().mockReturnValue(mockGoogleModel);
      (createGoogleGenerativeAI as jest.Mock).mockReturnValue(mockGoogle);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      const result = await getLLMClient();

      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'google_key' });
      expect(result.provider).toBe('google');
    });

    it('should use DeepSeek API when selectedModel is deepseek_api', async () => {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const mockDeepSeekModel = { provider: 'openai', modelId: 'deepseek-chat' };
      const mockOpenAI = jest.fn().mockReturnValue(mockDeepSeekModel);
      (createOpenAI as jest.Mock).mockReturnValue(mockOpenAI);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'deepseek_api_key', value: 'ds_key' },
          { key: 'model_proto_builder', value: 'deepseek_api' },
        ]),
      });

      const result = await getLLMClient('proto_builder');

      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'ds_key',
      });
      expect(result.provider).toBe('openai');
    });

    it('should use Custom OpenAI API when selectedModel is custom_openai_api', async () => {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const mockCustomModel = { provider: 'openai', modelId: 'custom-model' };
      const mockOpenAI = jest.fn().mockReturnValue(mockCustomModel);
      (createOpenAI as jest.Mock).mockReturnValue(mockOpenAI);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'custom_openai_base_url', value: 'https://api.custom.com/v1' },
          { key: 'custom_openai_api_key', value: 'custom_key' },
          { key: 'custom_openai_model', value: 'custom-model' },
          { key: 'model_proto_builder', value: 'custom_openai_api' },
        ]),
      });

      const result = await getLLMClient('proto_builder');

      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'https://api.custom.com/v1',
        apiKey: 'custom_key',
      });
      expect(result.provider).toBe('openai');
    });
  });
});
