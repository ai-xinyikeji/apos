# Implementation Plan

## Overview

This implementation plan follows the bugfix workflow methodology to fix the Kimi cookie synchronization issue in the APOS browser extension. The bug prevents the extension from detecting cookies from www.kimi.com (Kimi international version), causing authentication synchronization failures.

The fix adds support for querying cookies from the www.kimi.com domain in addition to the existing kimi.com domain query, ensuring users logged into the international version can successfully sync their authentication state.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - www.kimi.com Cookie Detection
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For this deterministic bug, scope the property to the concrete failing case: user logged into www.kimi.com with kimi-auth cookie
  - Create test file: `apos-extension/__tests__/kimi-cookie-bug.test.js`
  - Test that when user is logged into www.kimi.com with kimi-auth cookie, the extension detects at least one cookie
  - Use property-based testing to verify for all valid www.kimi.com cookies (varying cookie names, values, domains)
  - The test assertions should match the Expected Behavior Properties from design:
    - `result.cookies.length > 0` (non-empty result)
    - `result.cookies.some(c => c.name === "kimi-auth")` (authentication token present)
    - `result.cookies.every(c => c.domain === "www.kimi.com" OR c.domain === "kimi.com")` (domain coverage)
  - Run test on UNFIXED code (current background.js)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: "Extension queries kimi.com but returns 0 cookies when user has kimi-auth cookie on www.kimi.com"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Other Platform Cookie Detection
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (other platforms)
  - Create test file: `apos-extension/__tests__/cookie-preservation.test.js`
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - **Kimi CN domains**: For all cookies on kimi.moonshot.cn and moonshot.cn, extension detects them correctly
    - **ChatGPT domains**: For all cookies on chatgpt.com and openai.com, extension detects and deduplicates them correctly
    - **Gemini domains**: For all cookies on gemini.google.com and google.com, extension detects and deduplicates them correctly
    - **Cookie formatting**: For all detected cookies, formatting follows `name=value; name2=value2` pattern
    - **Deduplication**: For all duplicate cookies across domains, deduplication uses `name:domain` key pattern
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code (current background.js)
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for www.kimi.com cookie synchronization

  - [x] 3.1 Implement the fix in background.js
    - Add query for www.kimi.com domain cookies
    - Locate the Kimi cookie query section (around line 62-66)
    - Add new query: `const kimiCookies4 = await chrome.cookies.getAll({ domain: 'www.kimi.com' });`
    - Update merge logic: `const allKimi = [...kimiCookies1, ...kimiCookies2, ...kimiCookies3, ...kimiCookies4];`
    - Existing deduplication logic will handle any overlapping cookies using `name:domain` key pattern
    - _Bug_Condition: isBugCondition(input) where input.queryDomain === "kimi.com" AND input.userLoggedInDomain === "www.kimi.com"_
    - _Expected_Behavior: expectedBehavior(result) from design - cookies.length > 0, includes kimi-auth token, covers both domains_
    - _Preservation: Preservation Requirements from design - other platforms unchanged, deduplication unchanged, formatting unchanged, auto-sync unchanged_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - www.kimi.com Cookie Detection
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1: `npm test apos-extension/__tests__/kimi-cookie-bug.test.js`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify all assertions pass:
      - Non-empty cookie array returned
      - kimi-auth token detected
      - Cookies from www.kimi.com domain captured
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Other Platform Cookie Detection
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2: `npm test apos-extension/__tests__/cookie-preservation.test.js`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation properties still hold:
      - Kimi CN domain cookies still detected correctly
      - ChatGPT cookies still detected and deduplicated correctly
      - Gemini cookies still detected and deduplicated correctly
      - Cookie formatting unchanged
      - Deduplication logic unchanged
      - Auto-sync functionality unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm test`
  - Verify bug condition test passes (confirms fix works)
  - Verify preservation tests pass (confirms no regressions)
  - If any test fails, investigate and fix before proceeding
  - Ask the user if questions arise

## Notes

- All tasks have been completed successfully
- The bug condition exploration test (task 1) initially failed on unfixed code as expected, confirming the bug existed
- After implementing the fix (task 3.1), the bug condition test passed, validating the fix
- All preservation tests (task 2) passed both before and after the fix, confirming no regressions
- The fix adds a single additional domain query for www.kimi.com without modifying existing logic
- Existing deduplication logic handles any overlapping cookies between kimi.com and www.kimi.com domains

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests before implementing fix"
    },
    {
      "wave": 2,
      "tasks": ["3.1"],
      "description": "Implement the fix in background.js"
    },
    {
      "wave": 3,
      "tasks": ["3.2", "3.3"],
      "description": "Verify fix works and no regressions introduced"
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Final checkpoint - ensure all tests pass"
    }
  ]
}
```
