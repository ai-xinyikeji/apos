# Bugfix Requirements Document

## Introduction

The APOS browser extension fails to synchronize cookies from the Kimi international version (www.kimi.com). The extension attempts to read cookies from `kimi.com` domain, but Kimi's international version stores authentication cookies under the `www.kimi.com` subdomain. This causes the extension to report 0 Kimi cookies even when the user is logged into www.kimi.com, preventing successful authentication synchronization to the APOS server.

The bug affects users who rely on the extension to automatically sync their Kimi authentication state, requiring them to manually configure cookies instead.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the extension queries cookies from domain `kimi.com` THEN the system returns an empty array because cookies are stored under `www.kimi.com`

1.2 WHEN the user is logged into www.kimi.com with valid authentication cookies (including `kimi-auth` JWT token) THEN the extension popup displays "Kimi Cookies: 0" and status "未检测" (Not Detected)

1.3 WHEN the user attempts to sync cookies to APOS while logged into www.kimi.com THEN the system syncs an empty string for `kimi_cookies` instead of the actual authentication cookies

1.4 WHEN the extension checks for Kimi cookies during auto-sync THEN the system fails to detect www.kimi.com cookies and skips Kimi authentication synchronization

### Expected Behavior (Correct)

2.1 WHEN the extension queries cookies from the Kimi international version THEN the system SHALL read cookies from both `kimi.com` and `www.kimi.com` domains to capture all authentication data

2.2 WHEN the user is logged into www.kimi.com with valid authentication cookies THEN the extension popup SHALL display the correct cookie count (including `kimi-auth` and other session cookies) and status "已检测" (Detected)

2.3 WHEN the user attempts to sync cookies to APOS while logged into www.kimi.com THEN the system SHALL sync all www.kimi.com cookies as a properly formatted cookie string to the APOS server

2.4 WHEN the extension checks for Kimi cookies during auto-sync THEN the system SHALL detect and sync www.kimi.com cookies automatically

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the extension queries cookies from kimi.moonshot.cn (Chinese version) THEN the system SHALL CONTINUE TO read and sync those cookies correctly

3.2 WHEN the extension queries cookies from moonshot.cn domain THEN the system SHALL CONTINUE TO read and sync those cookies correctly

3.3 WHEN the extension queries cookies from ChatGPT (chatgpt.com, openai.com) THEN the system SHALL CONTINUE TO read and sync those cookies correctly

3.4 WHEN the extension queries cookies from Gemini (gemini.google.com, google.com) THEN the system SHALL CONTINUE TO read and sync those cookies correctly

3.5 WHEN multiple Kimi domains have cookies with the same name THEN the system SHALL CONTINUE TO deduplicate them using the `name:domain` key pattern

3.6 WHEN the extension formats cookies for APOS server sync THEN the system SHALL CONTINUE TO format them as `name=value` pairs joined with `; ` separator

3.7 WHEN the extension performs auto-sync at configured intervals THEN the system SHALL CONTINUE TO sync all detected platform cookies including the fixed Kimi cookies
