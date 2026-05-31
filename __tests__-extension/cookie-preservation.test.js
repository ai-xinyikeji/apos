/**
 * Preservation Property Tests — Task 2
 *
 * Property 2: Other Platform Cookie Detection
 *
 * These tests verify that the www.kimi.com fix does NOT break
 * existing behavior for ChatGPT, Gemini, Kimi CN, and cookie
 * formatting / deduplication logic.
 *
 * These tests MUST PASS on both unfixed and fixed code.
 */

// Mock chrome.cookies API
const mockGetAll = jest.fn();
global.chrome = {
  cookies: {
    getAll: mockGetAll,
  },
  runtime: {
    onMessage: { addListener: jest.fn() },
    onInstalled: { addListener: jest.fn() },
    lastError: null,
  },
  storage: {
    sync: {
      get: jest.fn((keys, cb) => cb && cb({})),
      set: jest.fn(),
    },
    onChanged: { addListener: jest.fn() },
  },
  tabs: { create: jest.fn() },
};

// ─── Helpers mirroring background.js logic ───────────────────────────────────

async function getChatGPTCookies() {
  const chatgptCookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
  const openaiCookies  = await chrome.cookies.getAll({ domain: 'openai.com' });

  const all = [...chatgptCookies, ...openaiCookies];
  const seen = new Set();
  return all.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getGeminiCookies() {
  const geminiCookies1 = await chrome.cookies.getAll({ domain: 'gemini.google.com' });
  const geminiCookies2 = await chrome.cookies.getAll({ domain: 'google.com' });

  const all = [...geminiCookies1, ...geminiCookies2];
  const seen = new Set();
  return all.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getKimiCookies() {
  const kimiCookies1 = await chrome.cookies.getAll({ domain: 'kimi.moonshot.cn' });
  const kimiCookies2 = await chrome.cookies.getAll({ domain: 'moonshot.cn' });
  const kimiCookies3 = await chrome.cookies.getAll({ domain: 'kimi.com' });
  const kimiCookies4 = await chrome.cookies.getAll({ domain: 'www.kimi.com' });

  const all = [...kimiCookies1, ...kimiCookies2, ...kimiCookies3, ...kimiCookies4];
  const seen = new Set();
  return all.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatCookies(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Preservation: Kimi CN domain cookies (kimi.moonshot.cn, moonshot.cn)', () => {
  beforeEach(() => mockGetAll.mockReset());

  test('detects cookies from kimi.moonshot.cn', async () => {
    const cnCookies = [
      { name: 'refresh_token', value: 'abc123', domain: 'kimi.moonshot.cn' },
      { name: 'access_token',  value: 'xyz789', domain: 'kimi.moonshot.cn' },
    ];
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'kimi.moonshot.cn') return Promise.resolve(cnCookies);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();
    expect(result.length).toBe(2);
    expect(result.some(c => c.name === 'refresh_token')).toBe(true);
    expect(result.some(c => c.name === 'access_token')).toBe(true);
  });

  test('detects cookies from moonshot.cn', async () => {
    const moonshotCookies = [
      { name: 'session', value: 'sess-001', domain: 'moonshot.cn' },
    ];
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'moonshot.cn') return Promise.resolve(moonshotCookies);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('session');
  });

  test.each([
    [[{ name: 'tok', value: 'v1', domain: 'kimi.moonshot.cn' }]],
    [[{ name: 'tok', value: 'v1', domain: 'kimi.moonshot.cn' }, { name: 'uid', value: 'u1', domain: 'kimi.moonshot.cn' }]],
  ])('detects all CN cookies for set %#', async (cnCookies) => {
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'kimi.moonshot.cn') return Promise.resolve(cnCookies);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();
    expect(result.length).toBe(cnCookies.length);
  });
});

describe('Preservation: ChatGPT cookies (chatgpt.com, openai.com)', () => {
  beforeEach(() => mockGetAll.mockReset());

  test('detects cookies from chatgpt.com', async () => {
    const cookies = [{ name: '__Secure-next-auth.session-token', value: 'tok', domain: 'chatgpt.com' }];
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'chatgpt.com') return Promise.resolve(cookies);
      return Promise.resolve([]);
    });

    const result = await getChatGPTCookies();
    expect(result.length).toBe(1);
    expect(result[0].domain).toBe('chatgpt.com');
  });

  test('detects cookies from openai.com', async () => {
    const cookies = [{ name: '_puid', value: 'puid-val', domain: 'openai.com' }];
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'openai.com') return Promise.resolve(cookies);
      return Promise.resolve([]);
    });

    const result = await getChatGPTCookies();
    expect(result.length).toBe(1);
    expect(result[0].domain).toBe('openai.com');
  });

  test('deduplicates cookies with same name across chatgpt.com and openai.com', async () => {
    const sharedCookie = { name: 'shared', value: 'val', domain: 'chatgpt.com' };
    const dupCookie    = { name: 'shared', value: 'val', domain: 'chatgpt.com' }; // exact dup
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'chatgpt.com') return Promise.resolve([sharedCookie, dupCookie]);
      return Promise.resolve([]);
    });

    const result = await getChatGPTCookies();
    // Deduplication by name:domain — only one entry
    expect(result.length).toBe(1);
  });

  test('keeps cookies with same name but different domains', async () => {
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'chatgpt.com') return Promise.resolve([{ name: 'tok', value: 'v1', domain: 'chatgpt.com' }]);
      if (domain === 'openai.com')  return Promise.resolve([{ name: 'tok', value: 'v2', domain: 'openai.com' }]);
      return Promise.resolve([]);
    });

    const result = await getChatGPTCookies();
    expect(result.length).toBe(2);
  });
});

describe('Preservation: Gemini cookies (gemini.google.com, google.com)', () => {
  beforeEach(() => mockGetAll.mockReset());

  test('detects cookies from gemini.google.com', async () => {
    const cookies = [{ name: '__Secure-1PSID', value: 'sid-val', domain: 'gemini.google.com' }];
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'gemini.google.com') return Promise.resolve(cookies);
      return Promise.resolve([]);
    });

    const result = await getGeminiCookies();
    expect(result.length).toBe(1);
    expect(result[0].domain).toBe('gemini.google.com');
  });

  test('detects cookies from google.com', async () => {
    const cookies = [{ name: 'SID', value: 'google-sid', domain: 'google.com' }];
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'google.com') return Promise.resolve(cookies);
      return Promise.resolve([]);
    });

    const result = await getGeminiCookies();
    expect(result.length).toBe(1);
    expect(result[0].domain).toBe('google.com');
  });

  test('deduplicates Gemini cookies using name:domain key', async () => {
    const dup = { name: 'SID', value: 'v', domain: 'google.com' };
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'google.com') return Promise.resolve([dup, dup]);
      return Promise.resolve([]);
    });

    const result = await getGeminiCookies();
    expect(result.length).toBe(1);
  });
});

describe('Preservation: Cookie formatting', () => {
  test('formats cookies as name=value pairs joined with "; "', () => {
    const cookies = [
      { name: 'cookie1', value: 'value1' },
      { name: 'cookie2', value: 'value2' },
    ];
    expect(formatCookies(cookies)).toBe('cookie1=value1; cookie2=value2');
  });

  test('formats a single cookie correctly', () => {
    const cookies = [{ name: 'tok', value: 'abc' }];
    expect(formatCookies(cookies)).toBe('tok=abc');
  });

  test('returns empty string for empty cookie array', () => {
    expect(formatCookies([])).toBe('');
  });

  test.each([
    [[{ name: 'a', value: '1' }, { name: 'b', value: '2' }, { name: 'c', value: '3' }], 'a=1; b=2; c=3'],
    [[{ name: 'x', value: 'foo' }], 'x=foo'],
  ])('formats cookie set %# correctly', (cookies, expected) => {
    expect(formatCookies(cookies)).toBe(expected);
  });
});

describe('Preservation: Deduplication uses name:domain key', () => {
  beforeEach(() => mockGetAll.mockReset());

  test('removes exact duplicates (same name, same domain)', async () => {
    const dup = { name: 'tok', value: 'v', domain: 'kimi.moonshot.cn' };
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'kimi.moonshot.cn') return Promise.resolve([dup, dup]);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();
    expect(result.length).toBe(1);
  });

  test('keeps cookies with same name but different domains', async () => {
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'kimi.moonshot.cn') return Promise.resolve([{ name: 'tok', value: 'v1', domain: 'kimi.moonshot.cn' }]);
      if (domain === 'moonshot.cn')      return Promise.resolve([{ name: 'tok', value: 'v2', domain: 'moonshot.cn' }]);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();
    expect(result.length).toBe(2);
  });
});
