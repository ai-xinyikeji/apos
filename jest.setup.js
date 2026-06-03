// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill structuredClone — not available in jsdom/older Node environments
// but used internally by the Vercel AI SDK (generate-text.ts)
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = function(obj) { return JSON.parse(JSON.stringify(obj)); };
}

// Mock environment variables
process.env.ANTHROPIC_API_KEY = 'test-key'
process.env.NODE_ENV = 'test'

// Mock fetch globally
global.fetch = jest.fn()

// Mock TransformStream for AI SDK
if (typeof TransformStream === 'undefined') {
  class MockTransformStream {
    constructor() {
      this.readable = {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
          releaseLock: () => {},
        }),
      };
      this.writable = {
        getWriter: () => ({
          write: async () => {},
          close: async () => {},
          releaseLock: () => {},
        }),
      };
    }
  }
  global.TransformStream = MockTransformStream;
}

// Mock Next.js Request and Response for API route testing
if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(url, init) {
      this.url = url;
      this.init = init;
    }
    async json() {
      return JSON.parse((this.init?.body) || '{}');
    }
    async text() {
      return (this.init?.body) || '';
    }
  }
}

if (typeof Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init) {
      this.body = body;
      this.init = init;
    }
    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
    }
    async text() {
      return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
    }
    get status() {
      return this.init?.status || 200;
    }
    static json(data, init) {
      return new Response(JSON.stringify(data), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
    }
  }
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  usePathname() {
    return '/'
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// Mock next/server globally to avoid edge-runtime cookie exceptions in Jest
jest.mock('next/server', () => {
  class MockNextRequest {
    constructor(input, init) {
      this.url = typeof input === 'string' ? input : input?.url || '';
      this.method = init?.method || 'GET';
      this._body = init?.body;
    }
    async json() {
      if (typeof this._body === 'string') {
        return JSON.parse(this._body);
      }
      return this._body || {};
    }
    async text() {
      return typeof this._body === 'string' ? this._body : JSON.stringify(this._body);
    }
  }

  const jsonMock = jest.fn((body, init) => {
    return {
      status: init?.status || 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: {
        get: () => null,
        set: () => {},
      },
    };
  });

  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: jsonMock,
    },
  };
})

// Suppress console errors in tests (optional)
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})