/**
 * APOS LLM Content Script
 *
 * 注入到 chatgpt.com / gemini.google.com / kimi.moonshot.cn 页面。
 * 在真实浏览器页面上下文里执行 LLM 请求，带完整浏览器指纹，
 * 绕过 Cloudflare / Turnstile 对 Service Worker fetch 的检测。
 *
 * background.js 通过 chrome.tabs.sendMessage 发送任务，
 * 本脚本执行后通过 sendResponse 返回结果。
 */

const APOS_SERVER = 'http://localhost:3000';

// ── PoW helper ────────────────────────────────────────────────────────────────

async function solvePoW(seed, difficulty) {
  try {
    const res = await fetch(`${APOS_SERVER}/api/ext/pow-solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, difficulty }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.answer;
  } catch {
    return null;
  }
}

// ── ChatGPT ───────────────────────────────────────────────────────────────────

async function executeChatGPT(prompt, cookies) {
  // Step 1: access token — fetch from same-origin, no Cookie header needed
  // (browser automatically sends cookies for chatgpt.com)
  const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
  if (!sessionRes.ok) throw new Error(`ChatGPT session failed (${sessionRes.status})`);
  const sessionData = await sessionRes.json();
  const accessToken = sessionData?.accessToken;
  if (!accessToken) throw new Error('ChatGPT session expired — please re-sync cookies');

  // Step 2: sentinel token + PoW
  let chatToken = null;
  let powToken = null;
  try {
    const reqRes = await fetch('/backend-api/sentinel/chat-requirements', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({}),
    });
    if (reqRes.ok) {
      const reqData = await reqRes.json();
      chatToken = reqData?.token;
      const pow = reqData?.proofofwork;
      if (pow?.required && pow.seed) {
        const answer = await solvePoW(pow.seed, pow.difficulty || 3);
        if (answer !== null) {
          const powPayload = JSON.stringify([pow.seed, answer, null, pow.difficulty || 3]);
          powToken = 'gAAAAAB' + btoa(powPayload);
        }
      }
    }
  } catch (e) {
    console.warn('[APOS LLM Content] ChatGPT sentinel failed:', e.message);
  }

  // Step 3: conversation
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${accessToken}`,
  };
  if (chatToken) headers['Openai-Sentinel-Chat-Requirements-Token'] = chatToken;
  if (powToken)  headers['Openai-Sentinel-Proof-Token'] = powToken;

  const convRes = await fetch('/backend-api/f/conversation', {
    method: 'POST',
    credentials: 'include',
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
      if (parts?.length > 0 && typeof parts[0] === 'string') finalText = parts[0];
    } catch { /* skip */ }
  }
  if (!finalText) throw new Error('ChatGPT returned empty response');
  return finalText;
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function executeGemini(prompt) {
  // SNlM0e token is already in the page's JS globals — no need to re-fetch the page
  let at = null;
  try {
    // Try to extract from window (Gemini embeds it as a JS variable)
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const m = s.textContent.match(/"SNlM0e":"([^"]+)"/);
      if (m) { at = m[1]; break; }
    }
  } catch { /* ignore */ }

  if (!at) {
    // Fallback: fetch the page (same-origin, browser sends cookies automatically)
    const pageRes = await fetch('/app', { credentials: 'include' });
    if (!pageRes.ok) throw new Error(`Gemini page load failed (${pageRes.status})`);
    const html = await pageRes.text();
    const m = html.match(/"SNlM0e":"([^"]+)"/);
    if (!m) throw new Error('Gemini SNlM0e token not found — cookies may be expired');
    at = m[1];
  }

  const innerPayload = JSON.stringify([null, prompt, 'zh-CN', null, 2]);
  const fReq = JSON.stringify([[['XqA3Ic', innerPayload, null, 'generic']]]);
  const bodyParams = new URLSearchParams();
  bodyParams.append('f.req', fReq);
  bodyParams.append('at', at);

  const execRes = await fetch('/_/BardChatUi/data/batchexecute?rpcids=XqA3Ic&rt=c', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: bodyParams.toString(),
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
    } else if (Array.isArray(obj)) { obj.forEach(search); }
    else if (obj && typeof obj === 'object') { Object.values(obj).forEach(search); }
  }
  search(data);
  return longest;
}

// ── Kimi ──────────────────────────────────────────────────────────────────────

async function executeKimi(prompt) {
  // Token refresh — same-origin, browser sends cookies automatically
  const tokenRes = await fetch('/api/auth/token/refresh', {
    credentials: 'include',
    headers: { 'Accept': 'application/json', 'Referer': 'https://kimi.moonshot.cn/' },
  });
  if (!tokenRes.ok) throw new Error(`Kimi token refresh failed (${tokenRes.status})`);
  const tokenData = await tokenRes.json();
  const accessToken = tokenData?.access_token;
  if (!accessToken) throw new Error('Kimi access_token not found — cookies may be expired');

  const chatRes = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'APOS Chat', is_example: false }),
  });
  if (!chatRes.ok) throw new Error(`Kimi chat session failed (${chatRes.status})`);
  const chatData = await chatRes.json();
  const chatId = chatData?.id;
  if (!chatId) throw new Error('Kimi chat ID not found');

  try {
    const compRes = await fetch(`/api/chat/${chatId}/completion/stream`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
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
    fetch(`/api/chat/${chatId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }).catch(() => {});
  }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'execute_llm') return false;

  const { provider, prompt, cookies } = request;
  console.log(`[APOS LLM Content] Executing ${provider} request in page context`);

  let task;
  if (provider === 'chatgpt') {
    task = executeChatGPT(prompt, cookies);
  } else if (provider === 'gemini') {
    task = executeGemini(prompt);
  } else if (provider === 'kimi') {
    task = executeKimi(prompt);
  } else {
    sendResponse({ error: `Unknown provider: ${provider}` });
    return false;
  }

  task
    .then(text => sendResponse({ text }))
    .catch(err => sendResponse({ error: err.message }));

  return true; // keep channel open for async response
});

console.log('[APOS LLM Content] Ready on', location.hostname);
