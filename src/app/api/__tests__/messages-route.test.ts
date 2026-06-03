if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = require('stream/web').ReadableStream;
}

import { POST } from '../v1/messages/route';
import { routeModel, getOllamaModels } from '@/lib/llm';
import { streamText } from 'ai';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('@/lib/llm');
jest.mock('ai');
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }));
jest.mock('@/lib/schema', () => ({ settings: {} }));
jest.mock('@/lib/ext-proxy-store', () => ({
  getExtProxyStore: jest.fn(() => ({
    isExtensionOnline: jest.fn().mockReturnValue(false),
    dispatch: jest.fn(),
    dispatchStreaming: jest.fn(),
  })),
}));
jest.mock('@/lib/context-manager', () => ({
  manageContext: jest.fn(async (messages: any[], system: string) => ({
    messages,
    system,
    stats: {
      originalTokenEstimate: 10,
      finalTokenEstimate: 10,
      reductionPercent: 0,
      layer1_codeCompression: false,
      layer2_summarization: false,
      layer3_memoryRetrieval: false,
      memoriesRetrieved: 0,
    },
  })),
}));
jest.mock('@/lib/local-model-optimizer', () => ({
  LocalModelOptimizer: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockRejectedValue(new Error('not used in stream mode')),
  })),
}));
jest.mock('@/lib/routing/enhanced-routing-system', () => ({
  EnhancedRoutingSystem: jest.fn().mockImplementation(() => ({
    route: jest.fn().mockResolvedValue({
      selection: { provider: 'openai', modelName: 'gpt-4o', estimatedCost: 0 },
      taskType: 'coding',
      routingTimeMs: 1,
      decisionId: 'dec_test',
    }),
  })),
}));
jest.mock('@/lib/cost/cost-recorder', () => ({
  CostRecorder: jest.fn().mockImplementation(() => ({ record: jest.fn() })),
}));
jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => jest.fn((m: string) => ({ modelId: m, provider: 'openai' }))),
}));
jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => jest.fn((m: string) => ({ modelId: m, provider: 'anthropic' }))),
}));
jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(() => jest.fn((m: string) => ({ modelId: m, provider: 'google' }))),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal NextRequest-compatible mock */
function makeMockRequest(body: any): any {
  const headers = new Map<string, string>([
    ['content-type', 'application/json'],
  ]);
  return {
    json: async () => body,
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Messages Route Proxy API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no Ollama, no API keys → routeModel is the final fallback
    (getOllamaModels as jest.Mock).mockResolvedValue([]);
    const { db } = require('@/lib/db');
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockResolvedValue([]),
    });

    (routeModel as jest.Mock).mockResolvedValue({
      provider: 'openai',
      model: { modelId: 'gpt-4o', provider: 'openai' },
    });

    (streamText as jest.Mock).mockReturnValue({
      textStream: (async function* () { yield 'test response'; })(),
    });
  });

  it('returns 200 for a valid streaming request', async () => {
    const req = makeMockRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  it('classifies coding task and routes correctly', async () => {
    const req = makeMockRequest({
      messages: [{ role: 'user', content: 'Please write a login page component in React' }],
      stream: true,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    // EnhancedRoutingSystem mock returns taskType: 'coding'
    // SmartModelSelector falls back to routeModel when no models configured
    expect(routeModel).toHaveBeenCalled();
  });

  it('classifies task when content is an array of blocks', async () => {
    const req = makeMockRequest({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Can you search for API files?' }],
        },
      ],
      stream: true,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  it('handles nested tool_result content', async () => {
    const req = makeMockRequest({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_1',
              content: 'Failed to compile. Error: Type mismatch at line 42',
            },
          ],
        },
      ],
      stream: true,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  it('returns 400 for empty messages array', async () => {
    const req = makeMockRequest({ messages: [], stream: false });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 when messages is not an array', async () => {
    const req = makeMockRequest({ messages: 'not an array', stream: false });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 when last message is not from user', async () => {
    const req = makeMockRequest({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
      stream: false,
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid temperature', async () => {
    const req = makeMockRequest({
      messages: [{ role: 'user', content: 'test' }],
      temperature: 5,
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid max_tokens', async () => {
    const req = makeMockRequest({
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: -1,
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const req = makeMockRequest({
      messages: [{ role: 'user', content: 'test' }],
    });
    // Override headers to use a specific IP so we can exhaust its quota
    const ip = `test-ip-${Date.now()}`;
    req.headers.get = (key: string) =>
      key === 'x-forwarded-for' ? ip : null;

    // Exhaust the 60 req/min limit
    const promises = Array.from({ length: 61 }, () => POST({ ...req }));
    const responses = await Promise.all(promises);
    const statuses = responses.map((r: any) => r.status);
    expect(statuses).toContain(429);
  });

  it('returns 401 when API key auth is enabled and key is missing', async () => {
    process.env.APOS_API_KEYS = 'sk-test-key';
    try {
      const req = makeMockRequest({
        messages: [{ role: 'user', content: 'test' }],
      });
      const response = await POST(req);
      expect(response.status).toBe(401);
    } finally {
      delete process.env.APOS_API_KEYS;
    }
  });

  it('accepts request when valid API key is provided', async () => {
    process.env.APOS_API_KEYS = 'sk-valid-key';
    try {
      const req = makeMockRequest({
        messages: [{ role: 'user', content: 'test' }],
        stream: true,
      });
      req.headers.get = (key: string) =>
        key === 'x-api-key' ? 'sk-valid-key' : null;

      const response = await POST(req);
      expect(response.status).toBe(200);
    } finally {
      delete process.env.APOS_API_KEYS;
    }
  });

  // OPTIONS uses NextResponse which is not available in the Jest/Node environment.
  // It is tested via integration/e2e tests instead.
  it.skip('OPTIONS handler returns 204 with CORS headers', async () => {
    const { OPTIONS } = await import('../v1/messages/route');
    const req = makeMockRequest({});
    await expect(OPTIONS(req)).resolves.toBeDefined();
  });
});
