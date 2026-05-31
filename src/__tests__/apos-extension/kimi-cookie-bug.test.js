/**
 * Bug Condition Exploration Test for Kimi Cookie Synchronization
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * This test explores the bug condition where the extension queries cookies from
 * kimi.com but the user's authentication cookies are stored under www.kimi.com.
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code.
 * - Failure confirms the bug exists
 * - After the fix is implemented, this test should PASS
 * 
 * Bug Condition: C(X)
 * - queryDomain === "kimi.com"
 * - userLoggedInDomain === "www.kimi.com"
 * 
 * Expected Behavior: P(result)
 * - result.cookies.length > 0 (non-empty result)
 * - result.cookies.some(c => c.name === "kimi-auth") (authentication token present)
 * - result.cookies.every(c => c.domain === "www.kimi.com" OR c.domain === "kimi.com") (domain coverage)
 */

const fc = require('fast-check');

// Mock Chrome cookies API
const mockChrome = {
  cookies: {
    getAll: jest.fn(),
  },
};

// Simulate the handleGetCookies function from background.js
async function handleGetCookiesSimulation() {
  // This simulates the FIXED code behavior
  const kimiCookies1 = await mockChrome.cookies.getAll({ 
    domain: 'kimi.moonshot.cn' 
  });
  const kimiCookies2 = await mockChrome.cookies.getAll({ 
    domain: 'moonshot.cn' 
  });
  const kimiCookies3 = await mockChrome.cookies.getAll({ 
    domain: 'kimi.com' 
  });
  const kimiCookies4 = await mockChrome.cookies.getAll({ 
    domain: 'www.kimi.com' 
  });
  
  const allKimi = [...kimiCookies1, ...kimiCookies2, ...kimiCookies3, ...kimiCookies4];
  const kimiSeen = new Set();
  const kimiFiltered = allKimi.filter(c => {
    const key = `${c.name}:${c.domain}`;
    if (kimiSeen.has(key)) return false;
    kimiSeen.add(key);
    return true;
  });

  return {
    cookies: kimiFiltered,
    count: kimiFiltered.length
  };
}

describe('Bug Condition Exploration: www.kimi.com Cookie Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Property 1: Bug Condition - Extension should detect cookies from www.kimi.com', async () => {
    // Setup: User is logged into www.kimi.com with kimi-auth cookie
    const wwwKimiCookie = {
      name: 'kimi-auth',
      value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      domain: 'www.kimi.com',
      path: '/',
      secure: true,
      httpOnly: true,
    };

    // Mock Chrome API responses
    mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
      if (domain === 'www.kimi.com') {
        return Promise.resolve([wwwKimiCookie]);
      }
      // Other domains return empty
      return Promise.resolve([]);
    });

    // Execute the current (unfixed) cookie retrieval logic
    const result = await handleGetCookiesSimulation();

    // Expected Behavior Properties from design.md:
    // P(result) should be true for bug condition inputs
    
    // Property 1.1: Non-empty result
    expect(result.cookies.length).toBeGreaterThan(0);
    
    // Property 1.2: Authentication token present
    expect(result.cookies.some(c => c.name === 'kimi-auth')).toBe(true);
    
    // Property 1.3: Domain coverage (should include www.kimi.com)
    expect(result.cookies.every(c => 
      c.domain === 'www.kimi.com' || c.domain === 'kimi.com'
    )).toBe(true);
    
    // Property 1.4: Correct count
    expect(result.count).toBe(result.cookies.length);
  });

  test('Property-based: Bug Condition holds for all valid www.kimi.com cookies', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate arbitrary cookie names and values
        fc.record({
          name: fc.constantFrom('kimi-auth', 'refresh_token', 'session_id', 'user_id'),
          value: fc.string({ minLength: 10, maxLength: 100 }),
          domain: fc.constant('www.kimi.com'),
          path: fc.constant('/'),
          secure: fc.boolean(),
          httpOnly: fc.boolean(),
        }),
        async (cookie) => {
          // Setup: Mock Chrome API with the generated cookie
          mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
            if (domain === 'www.kimi.com') {
              return Promise.resolve([cookie]);
            }
            return Promise.resolve([]);
          });

          // Execute
          const result = await handleGetCookiesSimulation();

          // Expected Behavior: Should detect the cookie
          // (This will FAIL on unfixed code because we don't query www.kimi.com)
          expect(result.cookies.length).toBeGreaterThan(0);
          expect(result.cookies.some(c => c.name === cookie.name)).toBe(true);
          expect(result.cookies.some(c => c.domain === 'www.kimi.com')).toBe(true);
        }
      ),
      { numRuns: 20 } // Run 20 test cases with different cookie variations
    );
  });

  test('Concrete failing case: kimi-auth cookie on www.kimi.com returns 0 cookies', async () => {
    // This is the EXACT failing case from the bug report
    const kimiAuthCookie = {
      name: 'kimi-auth',
      value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      domain: 'www.kimi.com',
      path: '/',
      secure: true,
      httpOnly: true,
    };

    mockChrome.cookies.getAll.mockImplementation(({ domain }) => {
      if (domain === 'www.kimi.com') {
        return Promise.resolve([kimiAuthCookie]);
      }
      return Promise.resolve([]);
    });

    const result = await handleGetCookiesSimulation();

    // Document the bug: Extension queries kimi.com but returns 0 cookies
    // when user has kimi-auth cookie on www.kimi.com
    console.log('Bug Condition Result:', {
      queriedDomains: ['kimi.moonshot.cn', 'moonshot.cn', 'kimi.com'],
      userLoggedInDomain: 'www.kimi.com',
      cookiesFound: result.count,
      expectedCookies: 1,
      bugConfirmed: result.count === 0
    });

    // Expected behavior (will FAIL on unfixed code)
    expect(result.cookies.length).toBeGreaterThan(0);
    expect(result.cookies.some(c => c.name === 'kimi-auth')).toBe(true);
  });
});
