/**
 * Input size limit and validation tests for API routes that accept large payloads.
 * Covers: /api/v1/messages, /api/prototypes/run, /api/compression/compress
 */

// ─── /api/v1/messages size limits ────────────────────────────────────────────

jest.mock('@/lib/llm', () => ({
  routeModel: jest.fn().mockResolvedValue({ model: {}, provider: 'openai' }),
  generateText: jest.fn().mockResolvedValue({ text: 'ok', usage: {} }),
  getOllamaModels: jest.fn().mockResolvedValue([]),
  getLLMClient: jest.fn().mockResolvedValue({ model: {}, provider: 'openai' }),
}));
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn().mockReturnValue({ from: jest.fn().mockResolvedValue([]) }),
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) }),
    delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
  },
}));
jest.mock('@/lib/schema', () => ({ settings: {}, prototypes: {}, agentTraces: {} }));
jest.mock('@/lib/routing/enhanced-routing-system', () => ({
  EnhancedRoutingSystem: jest.fn().mockImplementation(() => ({
    route: jest.fn().mockRejectedValue(new Error('routing disabled')),
  })),
}));
jest.mock('@/lib/cost/cost-recorder', () => ({
  CostRecorder: jest.fn().mockImplementation(() => ({ record: jest.fn() })),
}));
jest.mock('@/lib/context-manager', () => ({
  manageContext: jest.fn().mockResolvedValue({
    messages: [{ role: 'user', content: 'test' }],
    system: '',
    stats: { originalTokenEstimate: 10, finalTokenEstimate: 10, reductionPercent: 0 },
  }),
}));
jest.mock('@/lib/ext-proxy-store', () => ({
  getExtProxyStore: jest.fn().mockReturnValue({
    isExtensionOnline: jest.fn().mockReturnValue(false),
    dispatch: jest.fn(),
    dispatchStreaming: jest.fn(),
    streamChunks: jest.fn(),
  }),
}));
jest.mock('ai', () => ({
  streamText: jest.fn(),
}));

function makeMessagesRequest(body: object) {
  return {
    headers: {
      get: jest.fn().mockReturnValue(null),
    },
    json: async () => body,
    url: 'http://localhost/api/v1/messages',
  } as any;
}

describe('POST /api/v1/messages — size limits', () => {
  let POST: any;

  beforeEach(() => {
    jest.resetModules();
    // Re-apply mocks after resetModules
    jest.mock('@/lib/llm', () => ({
      routeModel: jest.fn().mockResolvedValue({ model: {}, provider: 'openai' }),
      generateText: jest.fn().mockResolvedValue({ text: 'ok', usage: {} }),
      getOllamaModels: jest.fn().mockResolvedValue([]),
      getLLMClient: jest.fn().mockResolvedValue({ model: {}, provider: 'openai' }),
    }));
    ({ POST } = require('../v1/messages/route'));
  });

  it('should reject more than 500 messages', async () => {
    const messages = Array.from({ length: 501 }, (_, i) => ({
      role: 'user',
      content: `message ${i}`,
    }));
    const res = await POST(makeMessagesRequest({ messages }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain('500');
  });

  it('should reject payload exceeding 2MB of text', async () => {
    const bigContent = 'x'.repeat(2_100_000);
    const res = await POST(makeMessagesRequest({
      messages: [{ role: 'user', content: bigContent }],
    }));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error.type).toBe('invalid_request_error');
  });

  it('should accept normal payload within limits', async () => {
    const res = await POST(makeMessagesRequest({
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    }));
    // Should not be rejected for size (may fail for other reasons like LLM)
    expect([200, 500]).toContain(res.status);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(413);
  });
});

// ─── /api/prototypes/run image size limit ────────────────────────────────────

jest.mock('@/agents/proto-builder', () => ({
  ProtoBuilderAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true }),
  })),
}));
jest.mock('@/lib/errors', () => ({
  ...jest.requireActual('@/lib/errors'),
  logError: jest.fn(),
}));

function makeRunRequest(body: object) {
  return { json: async () => body } as any;
}

describe('POST /api/prototypes/run — image size limit', () => {
  let POST: any;

  beforeEach(() => {
    jest.resetModules();
    ({ POST } = require('../prototypes/run/route'));
  });

  it('should reject base64 image larger than 7MB', async () => {
    const bigImage = `data:image/png;base64,${'A'.repeat(7 * 1024 * 1024 + 1)}`;
    const res = await POST(makeRunRequest({
      prototypeId: 1,
      image: bigImage,
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('过大');
  });

  it('should accept image within 7MB limit', async () => {
    const okImage = `data:image/png;base64,${'A'.repeat(100)}`;
    const res = await POST(makeRunRequest({
      prototypeId: 1,
      image: okImage,
    }));
    // Rejected for other reasons (no DB record) but not size
    expect(res.status).not.toBe(413);
    const data = await res.json();
    expect(data.error).not.toContain('过大');
  });

  it('should still reject invalid image format', async () => {
    const res = await POST(makeRunRequest({
      prototypeId: 1,
      image: 'not-a-valid-base64-url',
    }));
    expect(res.status).toBe(400);
  });
});

// ─── /api/compression/compress size limits ───────────────────────────────────

jest.mock('@/lib/compression', () => ({
  compressMessages: jest.fn().mockResolvedValue({ compressedMessages: [], compressedSystem: '', stats: {} }),
  compressFile: jest.fn().mockResolvedValue({ compressed: '', stats: {} }),
  compressFiles: jest.fn().mockResolvedValue({ files: [], totalStats: {} }),
  smartCompress: jest.fn().mockResolvedValue({ compressed: '', level: 'medium', stats: {} }),
}));

function makeCompressRequest(body: object) {
  return { json: async () => body } as any;
}

describe('POST /api/compression/compress — size limits', () => {
  let POST: any;

  beforeEach(() => {
    jest.resetModules();
    ({ POST } = require('../compression/compress/route'));
  });

  it('should reject content larger than 500KB', async () => {
    const res = await POST(makeCompressRequest({
      mode: 'file',
      content: 'x'.repeat(500_001),
    }));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain('500000');
  });

  it('should reject files array with more than 50 files', async () => {
    const files = Array.from({ length: 51 }, (_, i) => ({
      path: `file${i}.ts`,
      content: 'const x = 1;',
    }));
    const res = await POST(makeCompressRequest({ mode: 'files', files }));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain('50');
  });

  it('should reject individual file larger than 200KB', async () => {
    const files = [{ path: 'big.ts', content: 'x'.repeat(200_001) }];
    const res = await POST(makeCompressRequest({ mode: 'files', files }));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain('big.ts');
  });

  it('should accept content within 500KB', async () => {
    const res = await POST(makeCompressRequest({
      mode: 'file',
      content: 'const x = 1;',
    }));
    expect(res.status).toBe(200);
  });

  it('should accept files array within limits', async () => {
    const files = [{ path: 'a.ts', content: 'const x = 1;' }];
    const res = await POST(makeCompressRequest({ mode: 'files', files }));
    expect(res.status).toBe(200);
  });
});
