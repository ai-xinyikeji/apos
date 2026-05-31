/**
 * Integration tests for SignalCollectorAgent — LLM provider paths.
 *
 * These tests do NOT mock `generateText` or `getLLM`. Instead they mock:
 *   - `fetch` (global) to simulate real HTTP responses from Gemini/OpenAI APIs
 *   - `@/lib/db` to avoid touching SQLite
 *   - `@/lib/discovery/social` to skip HN/Reddit sync
 *   - `@/mcp/claude-md-generator` to skip CLAUDE.md hot-reload
 *
 * This exercises the full path:
 *   SignalCollectorAgent.run()
 *     → getLLM() → getLLMClient() (reads DB settings)
 *     → generateText() (routes to web or API provider)
 *     → askGeminiWeb() / OpenAI SDK
 *     → parse JSON → db.insert()
 */

import { SignalCollectorAgent } from '../signal-collector';
import { db } from '@/lib/db';

// ── Static mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/db');
jest.mock('@/lib/discovery/social', () => ({
  socialListener: {
    syncToDatabase: jest.fn().mockResolvedValue(0),
  },
}));
jest.mock('@/mcp/claude-md-generator', () => ({
  updateClaudeMdIfConfigured: jest.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_RUN_ID = 'integration-test-run-001';

/** A valid JSON payload the LLM is expected to return. */
const VALID_SIGNALS_JSON = JSON.stringify([
  {
    title: '用户需要 CSV 导出功能',
    content: '多名付费用户反馈希望能将报告导出为 CSV 文件。',
    source: 'zendesk',
    sentiment: 'negative',
    url: 'https://zendesk.com/tickets/1084',
  },
  {
    title: 'Amplitude 登录漏斗流失率 45%',
    content: '登录流程第二步流失率异常偏高，需要优化。',
    source: 'amplitude',
    sentiment: 'negative',
  },
]);

const VALID_LLM_RESPONSE_TEXT = `\`\`\`json\n${VALID_SIGNALS_JSON}\n\`\`\``;

/**
 * Build a fetch Response-like object that satisfies the @ai-sdk/provider-utils
 * requirement that `response.headers` is iterable (like a real Headers object).
 */
function makeFetchResponse(body: string, status = 200, contentType = 'application/json') {
  const headers = new Headers({ 'content-type': contentType });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    headers,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

/**
 * Build a minimal OpenAI Chat Completions response body.
 * Uses prompt_tokens/completion_tokens (Chat API format, not Responses API).
 */
function makeOpenAIChatResponse(content: string) {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

/** Build a minimal Google Generative AI response body (generateContent). */
function makeGoogleAPIResponse(content: string) {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [{ text: content }],
          role: 'model',
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
  });
}

/**
 * Build a minimal Gemini Web batchexecute response.
 * The real response wraps data in a specific nested structure.
 */
function makeGeminiWebResponse(content: string) {
  // The inner JSON that extractGeminiText reads from innerData[4][0][1][0]
  const innerData = [null, null, null, null, [[null, [content]]]];
  const innerJson = JSON.stringify(innerData);
  // Outer batchexecute envelope
  const outerArray = [[['XqA3Ic', innerJson, null, 'generic']]];
  return `)]}'
${JSON.stringify(outerArray)}`;
}

/** Gemini Web HTML page containing a valid SNlM0e token. */
const GEMINI_APP_HTML = `<html><body>window.WIZ_global_data = {"SNlM0e":"test-snlm0e-token"};</body></html>`;

// ── Setup / teardown ──────────────────────────────────────────────────────────

let agent: SignalCollectorAgent;
let insertMock: jest.Mock;
let valuesMock: jest.Mock;

beforeEach(() => {
  agent = new SignalCollectorAgent();
  jest.clearAllMocks();

  // Mock db.insert chain: db.insert(table).values(data)
  valuesMock = jest.fn().mockResolvedValue(undefined);
  insertMock = jest.fn().mockReturnValue({ values: valuesMock });
  (db.insert as jest.Mock) = insertMock;

  // Restore fetch mock before each test
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Helper: configure getLLM to return a specific provider ────────────────────

/**
 * Spy on BaseAgent.getLLM to return a pre-built LLMConfig.
 * This avoids the DB settings lookup inside getLLMClient() while still
 * letting generateText() run its real routing logic.
 */
function mockLLMProvider(config: { provider: string; model: any }) {
  jest.spyOn(agent as any, 'getLLM').mockResolvedValue(config);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe('SignalCollectorAgent — OpenAI API integration', () => {
  beforeEach(() => {
    const { createOpenAI } = require('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey: 'test-openai-key' });
    // Use .chat() to target the Chat Completions API (/v1/chat/completions)
    // rather than the default Responses API (/v1/responses)
    mockLLMProvider({ provider: 'openai', model: openai.chat('gpt-4o') });
  });

  it('collects and saves signals when OpenAI returns valid JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeOpenAIChatResponse(VALID_LLM_RESPONSE_TEXT))
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    // db.insert should be called at least twice (once per signal, plus trace calls)
    expect(insertMock).toHaveBeenCalled();
  });

  it('returns failure when OpenAI returns an empty response body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeOpenAIChatResponse(''))
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    // Empty content → JSON parse fails → agent returns failure
    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when OpenAI API returns HTTP 429 (rate limit)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), 429)
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  }, 30000); // allow time for SDK retry backoff

  it('returns failure when OpenAI API returns HTTP 401 (invalid key)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(JSON.stringify({ error: { message: 'Invalid API key' } }), 401)
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when fetch throws a network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SignalCollectorAgent — Google Gemini API integration', () => {
  beforeEach(() => {
    const { createGoogleGenerativeAI } = require('@ai-sdk/google');
    const google = createGoogleGenerativeAI({ apiKey: 'test-google-key' });
    mockLLMProvider({ provider: 'google', model: google('gemini-1.5-pro-latest') });
  });

  it('collects and saves signals when Gemini API returns valid JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeGoogleAPIResponse(VALID_LLM_RESPONSE_TEXT))
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('returns failure when Gemini API returns an empty candidates array', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(JSON.stringify({ candidates: [] }))
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when Gemini API returns HTTP 400 (bad request)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(JSON.stringify({ error: { message: 'API key not valid' } }), 400)
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when Gemini API returns HTTP 503 (service unavailable)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse('Service Unavailable', 503, 'text/plain')
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  }, 30000); // allow time for SDK retry backoff
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SignalCollectorAgent — Gemini Web (cookie-based) integration', () => {
  const FAKE_COOKIES = 'SID=test-sid; HSID=test-hsid; SSID=test-ssid;';

  beforeEach(() => {
    // Gemini Web model config (isWebModel flag)
    mockLLMProvider({
      provider: 'web',
      model: { isWebModel: true, type: 'gemini', cookies: FAKE_COOKIES },
    });

    // Ext proxy store: always report extension as offline so we fall through to direct request
    jest.mock('@/lib/ext-proxy-store', () => ({
      getExtProxyStore: () => ({
        isExtensionOnline: () => false,
        dispatch: jest.fn(),
      }),
    }));
  });

  it('collects signals when Gemini Web returns a valid batchexecute response', async () => {
    (global.fetch as jest.Mock)
      // 1st call: GET gemini.google.com/app → HTML with SNlM0e token
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => GEMINI_APP_HTML,
      })
      // 2nd call: POST batchexecute → valid response
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeGeminiWebResponse(VALID_LLM_RESPONSE_TEXT),
      });

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('returns failure when Gemini page does not contain SNlM0e token (expired cookies)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      // HTML without SNlM0e — simulates expired/invalid cookies
      text: async () => '<html><body>Sign in to continue</body></html>',
    });

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when Gemini page fetch returns HTTP 403', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Forbidden',
    });

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when batchexecute response contains no XqA3Ic line (API structure changed)', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => GEMINI_APP_HTML,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        // Response body with no XqA3Ic line → extractGeminiText returns '' → empty response error
        text: async () => ')]}\'\n[["wrb.fr",null,null,null,0]]',
      });

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when batchexecute returns HTTP 429', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => GEMINI_APP_HTML,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Too Many Requests',
      });

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('returns failure when cookies are empty string', async () => {
    // Override getLLM to return empty cookies
    jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
      provider: 'web',
      model: { isWebModel: true, type: 'gemini', cookies: '' },
    });

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
    // fetch should never be called — error thrown before any network request
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('extractGeminiText — response structure parsing', () => {
  /**
   * We test the private extractGeminiText logic indirectly through askGeminiWeb
   * by controlling the batchexecute response body.
   */
  const { askGeminiWeb } = require('@/lib/web-llm');
  const COOKIES = 'SID=x;';

  beforeEach(() => {
    // Ext proxy always offline
    jest.mock('@/lib/ext-proxy-store', () => ({
      getExtProxyStore: () => ({
        isExtensionOnline: () => false,
        dispatch: jest.fn(),
      }),
    }));
  });

  it('extracts text from innerData[4][0][1][0] (primary path)', async () => {
    const expected = 'Primary path response text';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => GEMINI_APP_HTML })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => makeGeminiWebResponse(expected) });

    const result = await askGeminiWeb('test prompt', COOKIES);
    expect(result).toBe(expected);
  });

  it('falls back to longest-string heuristic when primary path is absent', async () => {
    // innerData without [4][0][1][0] — only a flat string in a nested array
    const expected = 'This is the fallback longest string in the response';
    const innerData = [null, null, null, null, [[null, null, null, [expected, 'short']]]];
    const innerJson = JSON.stringify(innerData);
    const outerArray = [[['XqA3Ic', innerJson, null, 'generic']]];
    const rawResponse = `)]}'
${JSON.stringify(outerArray)}`;

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => GEMINI_APP_HTML })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => rawResponse });

    const result = await askGeminiWeb('test prompt', COOKIES);
    expect(result).toBe(expected);
  });

  it('throws "empty response" error when no text can be extracted', async () => {
    // innerData with only short/empty strings
    const innerData = [null, null, null, null, [[null, null]]];
    const innerJson = JSON.stringify(innerData);
    const outerArray = [[['XqA3Ic', innerJson, null, 'generic']]];
    const rawResponse = `)]}'
${JSON.stringify(outerArray)}`;

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => GEMINI_APP_HTML })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => rawResponse });

    await expect(askGeminiWeb('test prompt', COOKIES)).rejects.toThrow(
      /empty response|response structure could not be parsed/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SignalCollectorAgent — provider-agnostic edge cases', () => {
  beforeEach(() => {
    const { createOpenAI } = require('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey: 'test-key' });
    // Use .chat() to target Chat Completions API
    mockLLMProvider({ provider: 'openai', model: openai.chat('gpt-4o') });
  });

  it('handles LLM returning JSON without code fence wrapper', async () => {
    const rawJson = JSON.stringify([
      {
        title: '无代码围栏的信号',
        content: '直接返回 JSON 数组',
        source: 'amplitude',
        sentiment: 'neutral',
      },
    ]);

    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeOpenAIChatResponse(rawJson))
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it('handles LLM returning an empty signals array', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeOpenAIChatResponse('```json\n[]\n```'))
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });

  it('handles LLM returning malformed JSON (not parseable)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeOpenAIChatResponse('This is not JSON at all'))
    );

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('handles DB insert failure gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeOpenAIChatResponse(VALID_LLM_RESPONSE_TEXT))
    );

    // Make db.insert throw on signal inserts
    (db.insert as jest.Mock) = jest.fn().mockReturnValue({
      values: jest.fn().mockRejectedValue(new Error('SQLITE_BUSY: database is locked')),
    });

    const result = await agent.run({}, MOCK_RUN_ID);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  it('uses custom sources when provided in input', async () => {
    const singleSignal = JSON.stringify([
      {
        title: '单一来源信号',
        content: '仅来自 amplitude 的信号',
        source: 'amplitude',
        sentiment: 'positive',
      },
    ]);

    (global.fetch as jest.Mock).mockResolvedValue(
      makeFetchResponse(makeOpenAIChatResponse(`\`\`\`json\n${singleSignal}\n\`\`\``))
    );

    const result = await agent.run({ sources: ['amplitude'] }, MOCK_RUN_ID);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });
});
