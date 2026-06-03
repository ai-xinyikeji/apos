import { generateText, getLLMClient } from '../llm';
import { db } from '../db';
import { generateText as aiGenerateText } from 'ai';
import { getExtProxyStore } from '../ext-proxy-store';

// Mock dependencies
jest.mock('../db');
jest.mock('../web-llm');   // keep mock to avoid import errors in llm.ts
jest.mock('ai');
jest.mock('@ai-sdk/openai');
jest.mock('@ai-sdk/anthropic');
jest.mock('@ai-sdk/google');
jest.mock('../ext-proxy-store');

describe('LLM Module', () => {
  let mockStore: {
    isExtensionOnline: jest.Mock;
    dispatch: jest.Mock;
    dispatchStreaming: jest.Mock;
    heartbeat: jest.Mock;
    dequeue: jest.Mock;
    submitResult: jest.Mock;
    appendStreamChunk: jest.Mock;
    submitStreamDone: jest.Mock;
    streamChunks: jest.Mock;
    queueLength: jest.Mock;
    pendingCount: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock store: extension online, dispatch resolves immediately
    mockStore = {
      isExtensionOnline: jest.fn().mockReturnValue(true),
      dispatch: jest.fn().mockResolvedValue({ taskId: 'task_1', text: '' }),
      dispatchStreaming: jest.fn().mockReturnValue('task_1'),
      heartbeat: jest.fn(),
      dequeue: jest.fn().mockReturnValue([]),
      submitResult: jest.fn(),
      appendStreamChunk: jest.fn(),
      submitStreamDone: jest.fn(),
      streamChunks: jest.fn(),
      queueLength: jest.fn().mockReturnValue(0),
      pendingCount: jest.fn().mockReturnValue(0),
    };
    (getExtProxyStore as jest.Mock).mockReturnValue(mockStore);
  });

  describe('generateText', () => {
    it('should dispatch to ExtProxyStore for web ChatGPT model', async () => {
      const mockModel = { isWebModel: true, type: 'chatgpt' };
      mockStore.dispatch.mockResolvedValue({ taskId: 'task_1', text: 'ChatGPT response' });

      const result = await generateText({ model: mockModel, prompt: 'Test prompt' });

      expect(mockStore.dispatch).toHaveBeenCalledWith('chatgpt', 'Test prompt');
      expect(result.text).toBe('ChatGPT response');
    });

    it('should dispatch to ExtProxyStore for web Gemini model', async () => {
      const mockModel = { isWebModel: true, type: 'gemini' };
      mockStore.dispatch.mockResolvedValue({ taskId: 'task_1', text: 'Gemini response' });

      const result = await generateText({ model: mockModel, prompt: 'Test prompt' });

      expect(mockStore.dispatch).toHaveBeenCalledWith('gemini', 'Test prompt');
      expect(result.text).toBe('Gemini response');
    });

    it('should dispatch to ExtProxyStore for web Kimi model', async () => {
      const mockModel = { isWebModel: true, type: 'kimi' };
      mockStore.dispatch.mockResolvedValue({ taskId: 'task_1', text: 'Kimi response' });

      const result = await generateText({ model: mockModel, prompt: 'Test prompt' });

      expect(mockStore.dispatch).toHaveBeenCalledWith('kimi', 'Test prompt');
      expect(result.text).toBe('Kimi response');
    });

    it('should dispatch to ExtProxyStore for web Google model', async () => {
      const mockModel = { isWebModel: true, type: 'google' };
      mockStore.dispatch.mockResolvedValue({ taskId: 'task_1', text: 'Google response' });

      const result = await generateText({ model: mockModel, prompt: 'Test prompt' });

      expect(mockStore.dispatch).toHaveBeenCalledWith('google', 'Test prompt');
      expect(result.text).toBe('Google response');
    });

    it('should convert messages array to prompt string for web models', async () => {
      const mockModel = { isWebModel: true, type: 'chatgpt' };
      mockStore.dispatch.mockResolvedValue({ taskId: 'task_1', text: 'Response' });

      await generateText({
        model: mockModel,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        'chatgpt',
        'User: Hello\n\nAssistant: Hi there\n\nUser: How are you?'
      );
    });

    it('should prepend system instructions for web models', async () => {
      const mockModel = { isWebModel: true, type: 'chatgpt' };
      mockStore.dispatch.mockResolvedValue({ taskId: 'task_1', text: 'Response' });

      await generateText({
        model: mockModel,
        system: 'You are a helpful assistant',
        prompt: 'Test prompt',
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        'chatgpt',
        'System Instructions:\nYou are a helpful assistant\n\nUser Prompt:\nTest prompt'
      );
    });

    it('should throw when ExtProxyStore returns an error', async () => {
      const mockModel = { isWebModel: true, type: 'chatgpt' };
      mockStore.dispatch.mockResolvedValue({ taskId: 'task_1', error: 'Extension offline' });

      // llm.ts catches the error and tries a fallback; if no fallback it re-throws
      // With no API keys configured the fallback also fails, so we expect a rejection
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      await expect(
        generateText({ model: mockModel, prompt: 'Test prompt' })
      ).rejects.toThrow();
    });

    it('should fallback to AI SDK for non-web models', async () => {
      const mockModel = { provider: 'openai', modelId: 'gpt-4o' };

      (aiGenerateText as jest.Mock).mockResolvedValue({
        text: 'AI SDK response',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const result = await generateText({ model: mockModel, prompt: 'Test prompt' });

      expect(aiGenerateText).toHaveBeenCalledWith({ model: mockModel, prompt: 'Test prompt' });
      expect(result.text).toBe('AI SDK response');
    });
  });

  describe('getLLMClient', () => {
    let savedEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      savedEnv = process.env;
      process.env = { NODE_ENV: 'test' };
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
        model: { isWebModel: true, type: 'chatgpt' },
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
        model: { isWebModel: true, type: 'gemini' },
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
        model: { isWebModel: true, type: 'kimi' },
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

      expect(result.provider).toBe('web');
      expect(result.model.type).toBe('chatgpt');
    });

    it('should throw error when no API keys configured', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      await expect(getLLMClient()).rejects.toThrow();
    });

    it('should handle database read errors gracefully', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockRejectedValue(new Error('DB connection failed')),
      });

      await expect(getLLMClient()).rejects.toThrow();
    });

    it('should support GOOGLE_GENERATIVE_AI_API_KEY env variable', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'env_google_key';

      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const mockGoogleModel = { provider: 'google', modelId: 'gemini-1.5-pro-latest' };
      const mockGoogle = jest.fn().mockReturnValue(mockGoogleModel);
      (createGoogleGenerativeAI as jest.Mock).mockReturnValue(mockGoogle);

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      const result = await getLLMClient();

      expect(result.provider).toBe('google');
    });

    it('should use DeepSeek API when selectedModel is deepseek_api', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'deepseek_api_key', value: 'ds_key' },
          { key: 'model_proto_builder', value: 'deepseek_api' },
        ]),
      });

      const { createOpenAI } = await import('@ai-sdk/openai');
      const mockModel = { provider: 'openai', modelId: 'deepseek-chat' };
      const mockOpenAI = jest.fn().mockReturnValue(mockModel);
      (createOpenAI as jest.Mock).mockReturnValue(mockOpenAI);

      const result = await getLLMClient('proto_builder');

      // llm.ts uses createOpenAI for DeepSeek (OpenAI-compatible), so provider is 'openai'
      expect(result.provider).toBe('openai');
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.deepseek.com/v1', apiKey: 'ds_key' })
      );
    });

    it('should use Custom OpenAI API when selectedModel is custom_openai_api', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'custom_openai_base_url', value: 'https://api.custom.com/v1' },
          { key: 'custom_openai_api_key', value: 'custom_key' },
          { key: 'custom_openai_model', value: 'custom-model' },
          { key: 'model_proto_builder', value: 'custom_openai_api' },
        ]),
      });

      const { createOpenAI } = await import('@ai-sdk/openai');
      const mockModel = { provider: 'openai', modelId: 'custom-model' };
      const mockOpenAI = jest.fn().mockReturnValue(mockModel);
      (createOpenAI as jest.Mock).mockReturnValue(mockOpenAI);

      const result = await getLLMClient('proto_builder');

      // llm.ts uses createOpenAI for custom APIs, so provider is 'openai'
      expect(result.provider).toBe('openai');
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.custom.com/v1', apiKey: 'custom_key' })
      );
    });
  });
});
