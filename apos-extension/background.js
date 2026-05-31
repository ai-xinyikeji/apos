// APOS Extension Background Service Worker

// ─────────────────────────────────────────────────────────────────────────────
// Extension LLM Proxy — 轮询服务器任务队列，在真实浏览器里执行 LLM 请求
// 这样可以完全绕过 ChatGPT / Gemini 的服务器端反爬检测
// ─────────────────────────────────────────────────────────────────────────────

const APOS_SERVER = 'http://localhost:3000';
const POLL_INTERVAL_MS = 2000; // 每 2 秒轮询一次

let llmProxyInterval = null;

function startLLMProxy() {
  if (llmProxyInterval) return;
  llmProxyInterval = setInterval(pollLLMTasks, POLL_INTERVAL_MS);
  // 立即执行一次（作为心跳）
  pollLLMTasks();
  console.log('[APOS Extension] LLM proxy polling started');
}

function stopLLMProxy() {
  if (llmProxyInterval) {
    clearInterval(llmProxyInterval);
    llmProxyInterval = null;
  }
}

async function pollLLMTasks() {
  try {
    const res = await fetch(`${APOS_SERVER}/api/ext/llm-request`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return;

    const data = await res.json();
    const tasks = data.tasks || [];

    for (const task of tasks) {
      // 每个任务独立执行，不阻塞轮询
      executeTask(task).catch(err => {
        console.error(`[APOS LLM Proxy] Task ${task.id} failed:`, err.message);
        submitResult({ taskId: task.id, error: err.message });
      });
    }
  } catch (err) {
    // 服务器不在线时静默失败
  }
}

async function executeTask(task) {
  console.log(`[APOS LLM Proxy] Executing task ${task.id} (${task.provider})`);

  // Delegate to the LLM content script running in the actual AI website page.
  // This ensures requests carry full browser fingerprint and bypass Cloudflare/Turnstile.
  let text = '';
  try {
    text = await executeViaContentScript(task.provider, task.prompt, task.cookies);
  } catch (err) {
    // Auth failure → re-sync cookies and retry once
    const isAuthError = /403|401|expired|session|cookie|token/i.test(err.message);
    if (isAuthError) {
      console.warn(`[APOS LLM Proxy] Auth error for ${task.provider}, re-syncing cookies and retrying...`);
      try {
        await performSync();
        const freshCookies = await fetchFreshCookies(task.provider);
        text = await executeViaContentScript(task.provider, task.prompt, freshCookies || task.cookies);
      } catch (retryErr) {
        throw retryErr;
      }
    } else {
      throw err;
    }
  }

  await submitResult({ taskId: task.id, text });
  console.log(`[APOS LLM Proxy] Task ${task.id} completed (${text.length} chars)`);
}

// 记录各 provider 的后台 tab，避免重复创建
const bgTabs = {};

const PROVIDER_URLS = {
  chatgpt: 'https://chatgpt.com/',
  gemini:  'https://gemini.google.com/app',
  kimi:    'https://kimi.moonshot.cn/',
};

/**
 * 找到或创建对应 AI 网站的 tab，通过 content script 在真实页面上下文里执行请求。
 * 优先复用用户已打开的 tab；没有则自动在后台创建一个，用完不关闭（下次复用）。
 */
async function executeViaContentScript(provider, prompt, cookies) {
  const urlPattern = {
    chatgpt: 'https://chatgpt.com/*',
    gemini:  'https://gemini.google.com/*',
    kimi:    'https://kimi.moonshot.cn/*',
  }[provider];

  if (!urlPattern) throw new Error(`Unknown provider: ${provider}`);

  // 1. 优先找用户已打开的 tab（活跃的优先）
  let tab = null;
  const existingTabs = await chrome.tabs.query({ url: urlPattern });
  tab = existingTabs.find(t => !t.discarded && t.status === 'complete')
     || existingTabs.find(t => !t.discarded)
     || existingTabs[0];

  // 2. 检查之前创建的后台 tab 是否还活着
  if (!tab && bgTabs[provider]) {
    try {
      const bgTab = await chrome.tabs.get(bgTabs[provider]);
      if (bgTab && !bgTab.discarded) tab = bgTab;
    } catch {
      delete bgTabs[provider]; // tab 已被关闭
    }
  }

  // 3. 没有可用 tab，自动在后台创建一个（不激活，用户不会看到它跳出来）
  if (!tab) {
    console.log(`[APOS LLM Proxy] Creating background tab for ${provider}...`);
    tab = await chrome.tabs.create({
      url: PROVIDER_URLS[provider],
      active: false,  // 后台打开，不切换焦点
    });
    bgTabs[provider] = tab.id;

    // 等待页面加载完成（最多 15 秒）
    await waitForTabReady(tab.id, 15000);
  }

  // 4. 发消息给 content script 执行
  return sendMessageToTab(tab.id, provider, prompt, cookies);
}

/**
 * 等待 tab 加载完成且 content script 就绪
 */
function waitForTabReady(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function check() {
      if (Date.now() > deadline) {
        reject(new Error('Tab load timeout'));
        return;
      }
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          reject(new Error('Tab closed during load'));
          return;
        }
        if (tab.status === 'complete') {
          // 额外等 500ms 让 content script 初始化
          setTimeout(resolve, 500);
        } else {
          setTimeout(check, 300);
        }
      });
    }
    check();
  });
}

/**
 * 向指定 tab 发送 execute_llm 消息，带重试（content script 可能还没注册）
 */
function sendMessageToTab(tabId, provider, prompt, cookies, retries = 3) {
  return new Promise((resolve, reject) => {
    function attempt(remaining) {
      chrome.tabs.sendMessage(
        tabId,
        { action: 'execute_llm', provider, prompt, cookies },
        (response) => {
          if (chrome.runtime.lastError) {
            if (remaining > 0) {
              console.warn(`[APOS LLM Proxy] Content script not ready, retrying... (${remaining} left)`);
              setTimeout(() => attempt(remaining - 1), 800);
            } else {
              reject(new Error(`Content script unreachable on tab ${tabId}: ${chrome.runtime.lastError.message}`));
            }
            return;
          }
          if (response?.error) reject(new Error(response.error));
          else resolve(response?.text || '');
        }
      );
    }
    attempt(retries);
  });
}

// 监听 tab 关闭，清理 bgTabs 记录
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [provider, id] of Object.entries(bgTabs)) {
    if (id === tabId) {
      delete bgTabs[provider];
      console.log(`[APOS LLM Proxy] Background tab for ${provider} was closed`);
    }
  }
});

/**
 * 从服务器读取最新存储的 Cookie（同步后的）
 */
async function fetchFreshCookies(provider) {
  try {
    const res = await fetch(`${APOS_SERVER}/api/ext/cookies?provider=${provider}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.cookies || null;
  } catch {
    return null;
  }
}

async function submitResult(result) {
  await fetch(`${APOS_SERVER}/api/ext/llm-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  });
}

// ── ChatGPT ──────────────────────────────────────────────────────────────────

async function executeChatGPT(prompt, cookies) {
  // Step 1: Get access token
  const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
    method: 'GET',
    headers: buildChatGPTHeaders(cookies),
  });
  if (!sessionRes.ok) {
    throw new Error(`ChatGPT session failed (${sessionRes.status})`);
  }
  const sessionData = await sessionRes.json();
  const accessToken = sessionData?.accessToken;
  if (!accessToken) {
    throw new Error('ChatGPT session expired — please re-sync cookies');
  }

  // Step 2: Get sentinel token (+ solve PoW if required)
  let chatToken = null;
  let powToken = null;
  try {
    const reqRes = await fetch('https://chatgpt.com/backend-api/sentinel/chat-requirements', {
      method: 'POST',
      headers: { ...buildChatGPTHeaders(cookies, accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (reqRes.ok) {
      const reqData = await reqRes.json();
      chatToken = reqData?.token;
      const pow = reqData?.proofofwork;
      if (pow?.required && pow.seed) {
        const answer = await solvePoW(pow.seed, pow.difficulty || 3);
        if (answer !== null) {
          // ChatGPT expects: "gAAAAAB" + base64(JSON.stringify([seed, answer, null, difficulty]))
          // The legacy "seed:answer" base64 format is no longer accepted.
          const powPayload = JSON.stringify([pow.seed, answer, null, pow.difficulty || 3]);
          powToken = 'gAAAAAB' + btoa(powPayload);
        }
      }
    }
  } catch (e) {
    console.warn('[APOS LLM Proxy] ChatGPT sentinel failed:', e.message);
  }

  // Step 3: Send conversation
  const headers = {
    ...buildChatGPTHeaders(cookies, accessToken),
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
  if (chatToken) headers['Openai-Sentinel-Chat-Requirements-Token'] = chatToken;
  if (powToken) headers['Openai-Sentinel-Proof-Token'] = powToken;

  const convRes = await fetch('https://chatgpt.com/backend-api/f/conversation', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'next',
      messages: [{
        id: crypto.randomUUID(),
        author: { role: 'user' },
        create_time: Date.now() / 1000,
        content: { content_type: 'text', parts: [prompt] },
        metadata: {},
      }],
      parent_message_id: crypto.randomUUID(),
      model: 'auto',
      timezone_offset_min: -480,
      timezone: 'Asia/Shanghai',
      conversation_mode: { kind: 'primary_assistant' },
      system_hints: [],
      supports_buffering: true,
      supported_encodings: ['v1'],
      client_contextual_info: { app_name: 'chatgpt.com' },
      history_and_training_disabled: true,
    }),
  });

  if (!convRes.ok) {
    const errText = await convRes.text();
    throw new Error(`ChatGPT conversation error (${convRes.status}): ${errText.slice(0, 200)}`);
  }

  const body = await convRes.text();
  let finalText = '';
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data: ')) continue;
    const d = t.slice(6).trim();
    if (d === '[DONE]') break;
    try {
      const parsed = JSON.parse(d);
      const parts = parsed.message?.content?.parts;
      if (parts?.length > 0 && typeof parts[0] === 'string') {
        finalText = parts[0];
      }
    } catch { /* skip */ }
  }

  if (!finalText) throw new Error('ChatGPT returned empty response');
  return finalText;
}

function buildChatGPTHeaders(cookies, accessToken) {
  const oaiDidMatch = cookies.match(/oai-did=([^;]+)/);
  const deviceId = oaiDidMatch ? oaiDidMatch[1] : crypto.randomUUID();
  const h = {
    'Cookie': cookies,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Oai-Device-Id': deviceId,
    'Oai-Language': 'en-US',
  };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
  return h;
}

/**
 * Solve ChatGPT proof-of-work: find counter N such that
 * SHA3-512(seed + N) starts with `difficulty` zero hex chars.
 *
 * SubtleCrypto does not support SHA-3, so we delegate to the APOS server
 * which uses Node's native crypto module (sha3-512).
 */
async function solvePoW(seed, difficulty) {
  try {
    const res = await fetch(`${APOS_SERVER}/api/ext/pow-solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, difficulty }),
    });
    if (!res.ok) {
      console.warn('[APOS LLM Proxy] PoW solve server error:', res.status);
      return null;
    }
    const data = await res.json();
    return data.answer; // number | null
  } catch (e) {
    console.warn('[APOS LLM Proxy] PoW solve request failed:', e.message);
    return null;
  }
}

// ── Gemini ───────────────────────────────────────────────────────────────────

async function executeGemini(prompt, cookies) {
  // Load Gemini page to get SNlM0e token
  const pageRes = await fetch('https://gemini.google.com/app', {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });
  if (!pageRes.ok) throw new Error(`Gemini page load failed (${pageRes.status})`);

  const html = await pageRes.text();
  const snlMatch = html.match(/"SNlM0e":"([^"]+)"/);
  const at = snlMatch?.[1];
  if (!at) throw new Error('Gemini SNlM0e token not found — cookies may be expired');

  const innerPayload = JSON.stringify([null, prompt, 'zh-CN', null, 2]);
  const fReq = JSON.stringify([[['XqA3Ic', innerPayload, null, 'generic']]]);
  const body = new URLSearchParams();
  body.append('f.req', fReq);
  body.append('at', at);

  const execRes = await fetch('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=XqA3Ic&rt=c', {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: body.toString(),
  });
  if (!execRes.ok) throw new Error(`Gemini batchexecute failed (${execRes.status})`);

  const text = await execRes.text();
  for (const line of text.split('\n')) {
    if (!line.includes('XqA3Ic')) continue;
    const match = line.match(/\[\[\["XqA3Ic".*/);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[0]);
      const inner = JSON.parse(parsed[0][0][1]);
      const result = extractGeminiText(inner, prompt);
      if (result) return result;
    } catch { /* skip */ }
  }
  throw new Error('Gemini returned empty response');
}

function extractGeminiText(data, prompt) {
  try {
    const txt = data?.[4]?.[0]?.[1]?.[0];
    if (txt && txt !== prompt) return txt;
  } catch { /* skip */ }
  let longest = '';
  function search(obj) {
    if (typeof obj === 'string') {
      const t = obj.trim();
      if (t.length > longest.length && t !== prompt && !t.startsWith('c_') && !t.startsWith('r_')) {
        longest = t;
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(search);
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(search);
    }
  }
  search(data);
  return longest;
}

// ── Kimi ─────────────────────────────────────────────────────────────────────

async function executeKimi(prompt, cookies) {
  // Refresh token
  const tokenRes = await fetch('https://kimi.moonshot.cn/api/auth/token/refresh', {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Referer': 'https://kimi.moonshot.cn/',
    },
  });
  if (!tokenRes.ok) throw new Error(`Kimi token refresh failed (${tokenRes.status})`);
  const tokenData = await tokenRes.json();
  const accessToken = tokenData?.access_token;
  if (!accessToken) throw new Error('Kimi access_token not found — cookies may be expired');

  // Create chat session
  const chatRes = await fetch('https://kimi.moonshot.cn/api/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ name: 'APOS Chat', is_example: false }),
  });
  if (!chatRes.ok) throw new Error(`Kimi chat session failed (${chatRes.status})`);
  const chatData = await chatRes.json();
  const chatId = chatData?.id;
  if (!chatId) throw new Error('Kimi chat ID not found');

  try {
    const compRes = await fetch(`https://kimi.moonshot.cn/api/chat/${chatId}/completion/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], use_search: false }),
    });
    if (!compRes.ok) throw new Error(`Kimi completion failed (${compRes.status})`);

    const text = await compRes.text();
    let lastEvent = '';
    let finalText = '';
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('event: ')) { lastEvent = t.slice(7).trim(); continue; }
      if (!t.startsWith('data: ')) continue;
      const d = t.slice(6).trim();
      if (d === '[DONE]') break;
      try {
        const parsed = JSON.parse(d);
        if ((lastEvent === 'text' || parsed.event === 'text') && typeof parsed.text === 'string') {
          finalText += parsed.text;
        }
      } catch { /* skip */ }
    }
    if (!finalText) throw new Error('Kimi returned empty response');
    return finalText;
  } finally {
    fetch(`https://kimi.moonshot.cn/api/chat/${chatId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'Mozilla/5.0' },
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 原有消息监听逻辑
// ─────────────────────────────────────────────────────────────────────────────

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_cookies') {
    handleGetCookies(sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'check_server') {
    handleCheckServer(sendResponse);
    return true;
  }
  
  if (request.action === 'toggle_auto_sync') {
    handleToggleAutoSync(request.enabled, sendResponse);
    return true;
  }
});

// Get cookies from ChatGPT and Gemini
async function handleGetCookies(sendResponse) {
  try {
    // Fetch ChatGPT cookies
    const chatgptCookies = await chrome.cookies.getAll({ 
      domain: 'chatgpt.com' 
    });
    
    // Also try openai.com domain
    const openaiCookies = await chrome.cookies.getAll({ 
      domain: 'openai.com' 
    });
    
    // Merge and deduplicate
    const allChatGPT = [...chatgptCookies, ...openaiCookies];
    const chatgptSeen = new Set();
    const chatgptFiltered = allChatGPT.filter(c => {
      const key = `${c.name}:${c.domain}`;
      if (chatgptSeen.has(key)) return false;
      chatgptSeen.add(key);
      return true;
    });
    
    // Fetch Gemini cookies
    const geminiCookies1 = await chrome.cookies.getAll({ 
      domain: 'gemini.google.com' 
    });
    const geminiCookies2 = await chrome.cookies.getAll({ 
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

    // Fetch Kimi cookies — try both international and CN domains
    const kimiCookies1 = await chrome.cookies.getAll({ 
      domain: 'kimi.moonshot.cn' 
    });
    const kimiCookies2 = await chrome.cookies.getAll({ 
      domain: 'moonshot.cn' 
    });
    const kimiCookies3 = await chrome.cookies.getAll({ 
      domain: 'kimi.com' 
    });
    const kimiCookies4 = await chrome.cookies.getAll({ 
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

    console.log('[APOS Extension] Cookies retrieved:', {
      chatgpt: chatgptFiltered.length,
      gemini: geminiFiltered.length,
      kimi: kimiFiltered.length
    });

    sendResponse({ 
      success: true, 
      chatgpt: chatgptFiltered, 
      gemini: geminiFiltered,
      kimi: kimiFiltered
    });
  } catch (err) {
    console.error('[APOS Extension] Failed to get cookies:', err);
    sendResponse({ 
      success: false, 
      error: err.message 
    });
  }
}

// Check if APOS server is running
async function handleCheckServer(sendResponse) {
  try {
    const response = await fetch('http://localhost:3000/api/settings/status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    sendResponse({ 
      success: response.ok,
      status: response.status
    });
  } catch (err) {
    sendResponse({ 
      success: false, 
      error: err.message 
    });
  }
}

// Handle toggle auto-sync
async function handleToggleAutoSync(enabled, sendResponse) {
  try {
    // Get current interval
    const result = await chrome.storage.sync.get(['syncInterval']);
    const interval = result.syncInterval || 5;
    
    // Save new state
    await chrome.storage.sync.set({ autoSync: enabled });
    
    // Start or stop auto-sync
    if (enabled) {
      startAutoSync(interval);
      console.log(`[APOS Extension] Auto-sync enabled (${interval} minutes)`);
    } else {
      stopAutoSync();
      console.log('[APOS Extension] Auto-sync disabled');
    }
    
    sendResponse({ success: true });
  } catch (err) {
    console.error('[APOS Extension] Failed to toggle auto-sync:', err);
    sendResponse({ 
      success: false, 
      error: err.message 
    });
  }
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[APOS Extension] Extension installed');
    
    // Open welcome page
    chrome.tabs.create({ 
      url: 'http://localhost:3000/settings?extension=installed' 
    });
  } else if (details.reason === 'update') {
    console.log('[APOS Extension] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Periodic cookie sync - enabled by default
let syncInterval = null;

/**
 * 执行一次 Cookie 同步：读取浏览器 Cookie 并 POST 到服务器。
 * 供 auto-sync 定时器和 LLM 认证失败重试共同调用。
 */
async function performSync() {
  console.log('[APOS Extension] Syncing cookies...');
  try {
    const cookies = await new Promise((resolve, reject) => {
      handleGetCookies((response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error));
      });
    });

    const chatgptCookieStr = cookies.chatgpt.map(c => `${c.name}=${c.value}`).join('; ');
    const geminiCookieStr  = cookies.gemini.map(c => `${c.name}=${c.value}`).join('; ');
    const kimiCookieStr    = cookies.kimi.map(c => `${c.name}=${c.value}`).join('; ');

    // Only include providers that actually have cookies — sending an empty
    // string would cause the server to DELETE the previously stored cookies.
    const payload = {};
    if (chatgptCookieStr) payload.chatgpt_cookies = chatgptCookieStr;
    if (geminiCookieStr)  payload.gemini_cookies  = geminiCookieStr;
    if (kimiCookieStr)    payload.kimi_cookies    = kimiCookieStr;

    if (Object.keys(payload).length === 0) {
      console.log('[APOS Extension] No cookies to sync, skipping...');
      return;
    }

    const response = await fetch(`${APOS_SERVER}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('[APOS Extension] Cookie sync successful');
    } else {
      console.error('[APOS Extension] Cookie sync failed:', await response.text());
    }
  } catch (err) {
    console.error('[APOS Extension] Cookie sync error:', err.message);
  }
}

// Initialize auto-sync on extension load
chrome.storage.sync.get(['autoSync', 'syncInterval'], (result) => {
  // Default: enable auto-sync with 2-minute interval
  const autoSync = result.autoSync !== undefined ? result.autoSync : true;
  const interval = result.syncInterval || 2; // Default 2 minutes (was 5)

  if (autoSync) {
    console.log(`[APOS Extension] Auto-sync enabled (${interval} minutes)`);
    startAutoSync(interval);
  }

  // Save default settings if not set
  if (result.autoSync === undefined) {
    chrome.storage.sync.set({ autoSync: true, syncInterval: 2 });
  }
});

function startAutoSync(intervalMinutes) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  // Execute immediately on start
  performSync();

  // Then set up interval for subsequent syncs
  syncInterval = setInterval(performSync, intervalMinutes * 60 * 1000);
}

function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// Listen for storage changes to update auto-sync
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.autoSync) {
      if (changes.autoSync.newValue) {
        const interval = changes.syncInterval?.newValue || 5; // Fixed: default to 5 minutes
        startAutoSync(interval);
      } else {
        stopAutoSync();
      }
    } else if (changes.syncInterval && syncInterval) {
      startAutoSync(changes.syncInterval.newValue);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 启动 LLM 代理轮询（扩展加载时立即启动）
// ─────────────────────────────────────────────────────────────────────────────
startLLMProxy();
