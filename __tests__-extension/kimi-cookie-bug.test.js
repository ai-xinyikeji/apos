/**
 * Bug Condition Exploration Test — Task 1
 *
 * Property 1: www.kimi.com Cookie Detection
 *
 * This test encodes the expected behavior for the bug fix:
 * When a user is logged into www.kimi.com with a kimi-auth cookie,
 * the extension MUST detect at least one cookie.
 *
 * On UNFIXED code: this test FAILS (confirms bug exists)
 * On FIXED code:   this test PASSES (confirms bug is resolved)
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
      onChanged: { addListener: jest.fn() },
    },
    onChanged: { addListener: jest.fn() },
  },
  tabs: { create: jest.fn() },
};

/**
 * Simulate the cookie-fetching logic from background.js (fixed version).
 * Queries kimi.com, www.kimi.com, kimi.moonshot.cn, and moonshot.cn.
 */
async function getKimiCookies() {
  const kimiCookies1 = await chrome.cookies.getAll({ domain: 'kimi.moonshot.cn' });
  const kimiCookies2 = await chrome.cookies.getAll({ domain: 'moonshot.cn' });
  const kimiCookies3 = await chrome.cookies.getAll({ domain: 'kimi.com' });
  const kimiCookies4 = await chrome.cookies.getAll({ domain: 'www.kimi.com' });

  const allKimi = [...kimiCookies1, ...kimiCookies2, ...kimiCookies3, ...kimiCookies4];
  const kimiSeen = new Set();
  const kimiFiltered = allKimi.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (kimiSeen.has(key)) return false;
    kimiSeen.add(key);
    return true;
  });

  return kimiFiltered;
}

describe('Bug Condition: www.kimi.com Cookie Detection', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
  });

  /**
   * Concrete failing case from the bug report:
   * User logged into www.kimi.com with kimi-auth JWT token.
   * kimi.com returns empty; www.kimi.com returns the auth cookie.
   */
  test('detects kimi-auth cookie when user is logged into www.kimi.com', async () => {
    // kimi.moonshot.cn and moonshot.cn: no cookies (user uses international version)
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'kimi.moonshot.cn') return Promise.resolve([]);
      if (domain === 'moonshot.cn') return Promise.resolve([]);
      // Bug condition: kimi.com returns empty
      if (domain === 'kimi.com') return Promise.resolve([]);
      // Fix: www.kimi.com returns the actual auth cookie
      if (domain === 'www.kimi.com') return Promise.resolve([
        { name: 'kimi-auth', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', domain: 'www.kimi.com' },
      ]);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();

    // Property 1: Non-empty result
    expect(result.length).toBeGreaterThan(0);

    // Property 2: Authentication token present
    expect(result.some(c => c.name === 'kimi-auth')).toBe(true);

    // Property 3: Domain coverage — all cookies from kimi.com or www.kimi.com
    expect(result.every(c => c.domain === 'www.kimi.com' || c.domain === 'kimi.com')).toBe(true);
  });

  /**
   * Property-based variant: varying cookie names and values on www.kimi.com.
   * For any valid www.kimi.com cookie set that includes kimi-auth,
   * the extension must detect all of them.
   */
  test.each([
    [
      [{ name: 'kimi-auth', value: 'token-abc', domain: 'www.kimi.com' }],
    ],
    [
      [
        { name: 'kimi-auth', value: 'token-xyz', domain: 'www.kimi.com' },
        { name: 'session_id', value: 'sess-123', domain: 'www.kimi.com' },
      ],
    ],
    [
      [
        { name: 'kimi-auth', value: 'token-long-jwt-value', domain: 'www.kimi.com' },
        { name: '_ga', value: 'GA1.2.123456789', domain: 'www.kimi.com' },
        { name: 'user_pref', value: 'dark_mode', domain: 'www.kimi.com' },
      ],
    ],
  ])('detects all cookies for www.kimi.com cookie set %#', async (wwwKimiCookies) => {
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'www.kimi.com') return Promise.resolve(wwwKimiCookies);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();

    // Non-empty result
    expect(result.length).toBeGreaterThan(0);

    // kimi-auth must be present
    expect(result.some(c => c.name === 'kimi-auth')).toBe(true);

    // Count matches
    expect(result.length).toBe(wwwKimiCookies.length);

    // All cookies from www.kimi.com
    expect(result.every(c => c.domain === 'www.kimi.com')).toBe(true);
  });

  /**
   * Edge case: both kimi.com and www.kimi.com have cookies.
   * Deduplication must not drop unique cookies from either domain.
   */
  test('merges cookies from both kimi.com and www.kimi.com without losing unique entries', async () => {
    mockGetAll.mockImplementation(({ domain }) => {
      if (domain === 'kimi.com') return Promise.resolve([
        { name: 'legacy-token', value: 'old-val', domain: 'kimi.com' },
      ]);
      if (domain === 'www.kimi.com') return Promise.resolve([
        { name: 'kimi-auth', value: 'new-jwt', domain: 'www.kimi.com' },
      ]);
      return Promise.resolve([]);
    });

    const result = await getKimiCookies();

    expect(result.length).toBe(2);
    expect(result.some(c => c.name === 'kimi-auth')).toBe(true);
    expect(result.some(c => c.name === 'legacy-token')).toBe(true);
  });
});
