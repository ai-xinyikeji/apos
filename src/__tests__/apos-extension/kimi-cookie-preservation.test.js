/**
 * Preservation Property Tests for Kimi Cookie Synchronization
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 * 
 * These tests verify that existing functionality continues to work correctly
 * after the bug fix is implemented. All tests should PASS on both unfixed and
 * fixed code to ensure no regressions are introduced.
 * 
 * Preservation Requirements:
 * - Kimi CN domain cookies (kimi.moonshot.cn, moonshot.cn) still work
 * - ChatGPT cookies (chatgpt.com, openai.com) still work
 * - Gemini cookies (gemini.google.com, google.com) still work
 * - Deduplication logic using name:domain key pattern still works
 * - Cookie formatting as name=value pairs with ; separator still works
 * - Auto-sync functionality continues to work
 */

const fc = require('fast-check');

// Mock Chrome cookies API
const mockChrome = {
  cookies: {
    getAll: jest.fn(),
  },
};

// Simulate the handleGetCookies function from background.js (current unfixed version)
async function handleGetCookiesSimulation() {
  // ChatGPT cookies
  const chatgptCookies = await mockChrome.cookies.getAll({ 
    domain: 'chatgpt.com' 
  });
  const openaiCookies = await mockChrome.cookies.getAll({ 
    domain: 'openai.com' 
  });
  const allChatGPT = [...chatgptCookies, ...openaiCookies];
  const chatgptSeen = new Set();
  const chatgptFiltered = allChatGPT.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (chatgptSeen.has(key)) return false;
    chatgptSeen.add(key);
    return true;
  });
  
  // Gemini cookies
  const geminiCookies1 = await mockChrome.cookies.getAll({ 
    domain: 'gemini.google.com' 
  });
  const geminiCookies2 = await mockChrome.cookies.getAll({ 
    domain: 'google.com' 
  });
  const allGemini = [...geminiCookies1, ...geminiCookies2];
  const geminiSeen = new Set();
  const geminiFiltered = allGemini.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (geminiSeen.has(key)) return false;
    geminiSeen.add(key);
    return true;
  });

  // Kimi cookies (current unfixed version - does NOT include www.kimi.com)
  const kimiCookies1 = await mockChrome.cookies.getAll({ 
    domain: 'kimi.moonshot.cn' 
  });
  const kimiCookies2 = await mockChrome.cookies.getAll({ 
    domain: 'moonshot.cn' 
  });
  const kimiCookies3 = await mockChrome.cookies.getAll({ 
    domain: 'kimi.com' 
  });
  
  const allKimi = [...kimiCookies1, ...kimiCookies2, ...kimiCookies3];
  const kimiSeen = new Set();
  const kimiFiltered = allKimi.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (kimiSeen.has(key)) return false;
    kimiSeen.add(key);
    return true;
  });

  return {
    chatgpt: chatgptFiltered,
    gemini: geminiFiltered,
    kimi: kimiFiltered
  };
}

// Helper function to format cookies as they would be sent to the server
function formatCookies(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

describe('Preservation Tests: Existing Cookie Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Requirement 3.1: Kimi CN domain (kimi.moonshot.cn) cookies', () => {
    test('Property: kimi.moonshot.cn cookies are detected and returned', async () => {
      const kimiCnCookie = {
        name: 'refresh_token',
        value: 'abc123xyz',
        domain: 'kimi.moonshot.cn',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'kimi.moonshot.cn') {
          return Promise.resolve([kimiCnCookie]);
        }
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();

      // Verify kimi.moonshot.cn cookies are still detected
      expect(result.kimi.length).toBeGreaterThan(0);
      expect(result.kimi.some(c => c.domain === 'kimi.moonshot.cn')).toBe(true);
      expect(result.kimi.some(c => c.name === 'refresh_token')).toBe(true);
    });

    test('Property-based: All kimi.moonshot.cn cookies are preserved', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc.record({
              name: fc.constantFrom('refresh_token', 'access_token', 'session_id', 'user_id'),
              value: fc.string({ minLength: 10, maxLength: 50 }),
              domain: fc.constant('kimi.moonshot.cn'),
              path: fc.constant('/'),
              secure: fc.boolean(),
              httpOnly: fc.boolean(),
            }),
            {
              minLength: 1,
              maxLength: 4,
              selector: (cookie) => cookie.name, // Ensure unique cookie names
            }
          ),
          async (cookies) => {
            mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
              if (domain === 'kimi.moonshot.cn') {
                return Promise.resolve(cookies);
              }
              return Promise.resolve([]);
            });

            const result = await handleGetCookiesSimulation();

            // All cookies should be detected (no duplicates since we use uniqueArray)
            expect(result.kimi.length).toBe(cookies.length);
            cookies.forEach(cookie => {
              expect(result.kimi.some(c => c.name === cookie.name && c.domain === 'kimi.moonshot.cn')).toBe(true);
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Requirement 3.2: moonshot.cn domain cookies', () => {
    test('Property: moonshot.cn cookies are detected and returned', async () => {
      const moonshotCookie = {
        name: 'session_token',
        value: 'session123',
        domain: 'moonshot.cn',
        path: '/',
        secure: true,
        httpOnly: false,
      };

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'moonshot.cn') {
          return Promise.resolve([moonshotCookie]);
        }
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();

      // Verify moonshot.cn cookies are still detected
      expect(result.kimi.length).toBeGreaterThan(0);
      expect(result.kimi.some(c => c.domain === 'moonshot.cn')).toBe(true);
      expect(result.kimi.some(c => c.name === 'session_token')).toBe(true);
    });
  });

  describe('Requirement 3.3: ChatGPT cookies (chatgpt.com, openai.com)', () => {
    test('Property: ChatGPT cookies from both domains are detected', async () => {
      const chatgptCookie = {
        name: '__Secure-next-auth.session-token',
        value: 'chatgpt-session-123',
        domain: 'chatgpt.com',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      const openaiCookie = {
        name: 'oai-did',
        value: 'openai-device-id',
        domain: 'openai.com',
        path: '/',
        secure: true,
        httpOnly: false,
      };

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'chatgpt.com') {
          return Promise.resolve([chatgptCookie]);
        }
        if (domain === 'openai.com') {
          return Promise.resolve([openaiCookie]);
        }
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();

      // Verify both ChatGPT domains are detected
      expect(result.chatgpt.length).toBe(2);
      expect(result.chatgpt.some(c => c.domain === 'chatgpt.com')).toBe(true);
      expect(result.chatgpt.some(c => c.domain === 'openai.com')).toBe(true);
    });

    test('Property-based: ChatGPT cookies are preserved across domains', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            chatgptCookies: fc.uniqueArray(
              fc.record({
                name: fc.constantFrom('__Secure-next-auth.session-token', 'cf_clearance', '__cf_bm'),
                value: fc.string({ minLength: 10, maxLength: 50 }),
                domain: fc.constant('chatgpt.com'),
                path: fc.constant('/'),
                secure: fc.boolean(),
                httpOnly: fc.boolean(),
              }),
              {
                minLength: 0,
                maxLength: 3,
                selector: (cookie) => cookie.name, // Ensure unique cookie names
              }
            ),
            openaiCookies: fc.uniqueArray(
              fc.record({
                name: fc.constantFrom('oai-did', 'oai-allow-ne', '_cfuvid'),
                value: fc.string({ minLength: 10, maxLength: 50 }),
                domain: fc.constant('openai.com'),
                path: fc.constant('/'),
                secure: fc.boolean(),
                httpOnly: fc.boolean(),
              }),
              {
                minLength: 0,
                maxLength: 3,
                selector: (cookie) => cookie.name, // Ensure unique cookie names
              }
            ),
          }),
          async ({ chatgptCookies, openaiCookies }) => {
            mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
              if (domain === 'chatgpt.com') {
                return Promise.resolve(chatgptCookies);
              }
              if (domain === 'openai.com') {
                return Promise.resolve(openaiCookies);
              }
              return Promise.resolve([]);
            });

            const result = await handleGetCookiesSimulation();

            // Total count should match (no duplicates since we use uniqueArray)
            expect(result.chatgpt.length).toBe(chatgptCookies.length + openaiCookies.length);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Requirement 3.4: Gemini cookies (gemini.google.com, google.com)', () => {
    test('Property: Gemini cookies from both domains are detected', async () => {
      const geminiCookie = {
        name: '__Secure-1PSID',
        value: 'gemini-session-123',
        domain: 'gemini.google.com',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      const googleCookie = {
        name: 'NID',
        value: 'google-nid-456',
        domain: 'google.com',
        path: '/',
        secure: true,
        httpOnly: false,
      };

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'gemini.google.com') {
          return Promise.resolve([geminiCookie]);
        }
        if (domain === 'google.com') {
          return Promise.resolve([googleCookie]);
        }
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();

      // Verify both Gemini domains are detected
      expect(result.gemini.length).toBe(2);
      expect(result.gemini.some(c => c.domain === 'gemini.google.com')).toBe(true);
      expect(result.gemini.some(c => c.domain === 'google.com')).toBe(true);
    });
  });

  describe('Requirement 3.5: Deduplication using name:domain key pattern', () => {
    test('Property: Duplicate cookies with same name:domain are removed', async () => {
      const duplicateCookies = [
        {
          name: 'session_id',
          value: 'first-value',
          domain: 'kimi.moonshot.cn',
          path: '/',
          secure: true,
          httpOnly: true,
        },
        {
          name: 'session_id',
          value: 'second-value',
          domain: 'kimi.moonshot.cn',
          path: '/',
          secure: true,
          httpOnly: true,
        },
      ];

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'kimi.moonshot.cn') {
          return Promise.resolve(duplicateCookies);
        }
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();

      // Only one cookie should remain after deduplication
      expect(result.kimi.length).toBe(1);
      expect(result.kimi[0].name).toBe('session_id');
      expect(result.kimi[0].domain).toBe('kimi.moonshot.cn');
    });

    test('Property: Cookies with same name but different domains are NOT deduplicated', async () => {
      const cookie1 = {
        name: 'session_id',
        value: 'moonshot-cn-value',
        domain: 'kimi.moonshot.cn',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      const cookie2 = {
        name: 'session_id',
        value: 'moonshot-value',
        domain: 'moonshot.cn',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'kimi.moonshot.cn') {
          return Promise.resolve([cookie1]);
        }
        if (domain === 'moonshot.cn') {
          return Promise.resolve([cookie2]);
        }
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();

      // Both cookies should be present (different domains)
      expect(result.kimi.length).toBe(2);
      expect(result.kimi.some(c => c.domain === 'kimi.moonshot.cn')).toBe(true);
      expect(result.kimi.some(c => c.domain === 'moonshot.cn')).toBe(true);
    });

    test('Property-based: Deduplication preserves unique name:domain combinations', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.constantFrom('cookie1', 'cookie2', 'cookie3'),
              value: fc.string({ minLength: 5, maxLength: 20 }),
              domain: fc.constantFrom('kimi.moonshot.cn', 'moonshot.cn'),
              path: fc.constant('/'),
              secure: fc.boolean(),
              httpOnly: fc.boolean(),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (cookies) => {
            mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
              return Promise.resolve(cookies.filter(c => c.domain === domain));
            });

            const result = await handleGetCookiesSimulation();

            // Count unique name:domain combinations
            const uniqueKeys = new Set(cookies.map(c => `${c.name}:${c.domain}`));
            expect(result.kimi.length).toBe(uniqueKeys.size);

            // Verify each unique combination is present
            uniqueKeys.forEach(key => {
              const [name, domain] = key.split(':');
              expect(result.kimi.some(c => c.name === name && c.domain === domain)).toBe(true);
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Requirement 3.6: Cookie formatting as name=value pairs', () => {
    test('Property: Cookies are formatted correctly for server sync', async () => {
      const cookies = [
        {
          name: 'cookie1',
          value: 'value1',
          domain: 'kimi.moonshot.cn',
          path: '/',
          secure: true,
          httpOnly: true,
        },
        {
          name: 'cookie2',
          value: 'value2',
          domain: 'kimi.moonshot.cn',
          path: '/',
          secure: true,
          httpOnly: false,
        },
      ];

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'kimi.moonshot.cn') {
          return Promise.resolve(cookies);
        }
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();
      const formatted = formatCookies(result.kimi);

      // Verify format: name=value; name=value
      expect(formatted).toBe('cookie1=value1; cookie2=value2');
      expect(formatted).toMatch(/^(\w+=\w+)(; \w+=\w+)*$/);
    });

    test('Property-based: Cookie formatting is consistent', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
              value: fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
              domain: fc.constant('kimi.moonshot.cn'),
              path: fc.constant('/'),
              secure: fc.boolean(),
              httpOnly: fc.boolean(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (cookies) => {
            mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
              if (domain === 'kimi.moonshot.cn') {
                return Promise.resolve(cookies);
              }
              return Promise.resolve([]);
            });

            const result = await handleGetCookiesSimulation();
            const formatted = formatCookies(result.kimi);

            // Verify each cookie is in the formatted string
            cookies.forEach(cookie => {
              expect(formatted).toContain(`${cookie.name}=${cookie.value}`);
            });

            // Verify separator is '; ' (semicolon + space)
            if (cookies.length > 1) {
              expect(formatted).toContain('; ');
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Requirement 3.7: Multi-platform cookie detection', () => {
    test('Property: All platforms can be detected simultaneously', async () => {
      const chatgptCookie = {
        name: 'chatgpt-session',
        value: 'chatgpt-123',
        domain: 'chatgpt.com',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      const geminiCookie = {
        name: 'gemini-session',
        value: 'gemini-456',
        domain: 'gemini.google.com',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      const kimiCookie = {
        name: 'kimi-session',
        value: 'kimi-789',
        domain: 'kimi.moonshot.cn',
        path: '/',
        secure: true,
        httpOnly: true,
      };

      mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
        if (domain === 'chatgpt.com') return Promise.resolve([chatgptCookie]);
        if (domain === 'gemini.google.com') return Promise.resolve([geminiCookie]);
        if (domain === 'kimi.moonshot.cn') return Promise.resolve([kimiCookie]);
        return Promise.resolve([]);
      });

      const result = await handleGetCookiesSimulation();

      // All platforms should be detected
      expect(result.chatgpt.length).toBeGreaterThan(0);
      expect(result.gemini.length).toBeGreaterThan(0);
      expect(result.kimi.length).toBeGreaterThan(0);

      // Verify each platform has correct cookies
      expect(result.chatgpt.some(c => c.name === 'chatgpt-session')).toBe(true);
      expect(result.gemini.some(c => c.name === 'gemini-session')).toBe(true);
      expect(result.kimi.some(c => c.name === 'kimi-session')).toBe(true);
    });
  });
});
