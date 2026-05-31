# Bugfix Design Document

## Bug Condition Specification

### Bug Condition: C(X)

The bug occurs when the extension queries cookies for Kimi international version users.

```pseudocode
function isBugCondition(input):
  // input = { queryDomain: string, userLoggedInDomain: string }
  return (
    input.queryDomain === "kimi.com" AND
    input.userLoggedInDomain === "www.kimi.com"
  )
```

**Explanation**: The bug manifests when the extension queries `kimi.com` but the user's authentication cookies are stored under `www.kimi.com`. This domain mismatch causes the cookie query to return an empty array.

**Concrete Failing Cases**:
- User logged into `www.kimi.com` with `kimi-auth` JWT token
- Extension queries `chrome.cookies.getAll({ domain: 'kimi.com' })`
- Result: Empty array (0 cookies found)

### Expected Behavior Properties: P(result)

For all inputs satisfying the bug condition C(X), the fixed function F' must satisfy:

```pseudocode
function expectedBehavior(result):
  // result = { cookies: Cookie[], count: number }
  return (
    result.cookies.length > 0 AND
    result.cookies.some(c => c.name === "kimi-auth") AND
    result.count === result.cookies.length AND
    result.cookies.every(c => 
      c.domain === "www.kimi.com" OR 
      c.domain === "kimi.com"
    )
  )
```

**Properties**:
1. **Non-empty result**: The cookie query returns at least one cookie when user is logged into www.kimi.com
2. **Authentication token present**: The result includes the `kimi-auth` JWT token
3. **Correct count**: The cookie count matches the actual number of cookies retrieved
4. **Domain coverage**: Cookies from both `kimi.com` and `www.kimi.com` are captured

## Preservation Requirements

### Non-Bug Condition: ¬C(X)

```pseudocode
function isNonBugCondition(input):
  // Cases that should preserve existing behavior
  return (
    input.platform === "kimi.moonshot.cn" OR
    input.platform === "moonshot.cn" OR
    input.platform === "chatgpt.com" OR
    input.platform === "openai.com" OR
    input.platform === "gemini.google.com" OR
    input.platform === "google.com"
  )
```

### Preservation Properties

For all inputs satisfying ¬C(X), the behavior must remain unchanged:

```pseudocode
function preservationBehavior(input, resultBefore, resultAfter):
  return (
    // Cookie retrieval still works for other platforms
    resultAfter.cookies.length === resultBefore.cookies.length AND
    
    // Deduplication logic unchanged
    resultAfter.cookies.every(c => 
      hasUniqueKey(c, `${c.name}:${c.domain}`)
    ) AND
    
    // Cookie formatting unchanged
    formatCookies(resultAfter.cookies) === 
      resultAfter.cookies.map(c => `${c.name}=${c.value}`).join('; ') AND
    
    // Auto-sync continues to work
    autoSyncBehavior(resultAfter) === autoSyncBehavior(resultBefore)
  )
```

**Specific Preservation Requirements**:

1. **Kimi CN domain cookies** (kimi.moonshot.cn, moonshot.cn):
   - Query: `chrome.cookies.getAll({ domain: 'kimi.moonshot.cn' })`
   - Expected: Returns all cookies from kimi.moonshot.cn
   - Query: `chrome.cookies.getAll({ domain: 'moonshot.cn' })`
   - Expected: Returns all cookies from moonshot.cn

2. **ChatGPT cookies** (chatgpt.com, openai.com):
   - Query: `chrome.cookies.getAll({ domain: 'chatgpt.com' })`
   - Expected: Returns all cookies from chatgpt.com
   - Query: `chrome.cookies.getAll({ domain: 'openai.com' })`
   - Expected: Returns all cookies from openai.com
   - Deduplication: Uses `name:domain` key pattern

3. **Gemini cookies** (gemini.google.com, google.com):
   - Query: `chrome.cookies.getAll({ domain: 'gemini.google.com' })`
   - Expected: Returns all cookies from gemini.google.com
   - Query: `chrome.cookies.getAll({ domain: 'google.com' })`
   - Expected: Returns all cookies from google.com
   - Deduplication: Uses `name:domain` key pattern

4. **Cookie formatting**:
   - Format: `name=value` pairs joined with `; ` separator
   - Example: `cookie1=value1; cookie2=value2`

5. **Auto-sync functionality**:
   - Continues to sync at configured intervals
   - Syncs all platform cookies including fixed Kimi cookies
   - Sends to `/api/settings` endpoint with correct payload structure

## Implementation Strategy

### Fix Approach

Add `www.kimi.com` domain to the Kimi cookie query logic in `background.js`:

**Current Code** (lines 62-64):
```javascript
const kimiCookies3 = await chrome.cookies.getAll({ 
  domain: 'kimi.com' 
});
```

**Fixed Code**:
```javascript
const kimiCookies3 = await chrome.cookies.getAll({ 
  domain: 'kimi.com' 
});
const kimiCookies4 = await chrome.cookies.getAll({ 
  domain: 'www.kimi.com' 
});
```

**Merge Logic** (line 66):
```javascript
const allKimi = [...kimiCookies1, ...kimiCookies2, ...kimiCookies3, ...kimiCookies4];
```

### Verification Strategy

1. **Bug Condition Test** (Property 1):
   - Test on UNFIXED code with user logged into www.kimi.com
   - Expected: Test FAILS (confirms bug exists)
   - After fix: Test PASSES (confirms bug is resolved)

2. **Preservation Tests** (Property 2):
   - Test on UNFIXED code with other platforms
   - Expected: Tests PASS (confirms baseline behavior)
   - After fix: Tests still PASS (confirms no regressions)

## Test Data

### Bug Condition Test Cases

**Input**: User logged into www.kimi.com
- Cookie: `kimi-auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- Domain: `www.kimi.com`

**Expected Query Results**:
- Before fix: `[]` (empty array)
- After fix: `[{ name: 'kimi-auth', value: '...', domain: 'www.kimi.com' }, ...]`

### Preservation Test Cases

**Input**: User logged into kimi.moonshot.cn
- Cookie: `refresh_token=abc123`
- Domain: `kimi.moonshot.cn`

**Expected Query Results**:
- Before fix: `[{ name: 'refresh_token', value: 'abc123', domain: 'kimi.moonshot.cn' }]`
- After fix: `[{ name: 'refresh_token', value: 'abc123', domain: 'kimi.moonshot.cn' }]` (unchanged)

## Risk Analysis

### Low Risk
- The fix only adds an additional domain query for Kimi
- Existing domain queries remain unchanged
- Deduplication logic handles overlapping cookies

### Mitigation
- Property-based tests verify preservation of existing behavior
- Bug condition test confirms the fix works for www.kimi.com users
- No changes to cookie formatting or sync logic
