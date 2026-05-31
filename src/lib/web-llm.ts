import crypto from 'crypto';
import { getExtProxyStore, type ExtProxyProvider } from './ext-proxy-store';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

/**
 * 通过浏览器扩展代理执行 LLM 请求。
 * 扩展在真实 Chrome 环境里发请求，完全绕过 Cloudflare/Arkose 检测。
 */
async function askViaExtension(provider: ExtProxyProvider, prompt: string, cookies: string): Promise<string> {
  const store = getExtProxyStore();
  if (!store.isExtensionOnline()) {
    throw new Error('EXTENSION_OFFLINE');
  }
  const result = await store.dispatch(provider, prompt, cookies);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.text || '';
}

/**
 * Helper: encode a text chunk as an Anthropic SSE content_block_delta event
 */
function encodeAnthropicDelta(encoder: TextEncoder, text: string): Uint8Array {
  return encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text },
  })}\n\n`);
}

/**
 * Helper: write the Anthropic SSE envelope around a stream body.
 */
function buildAnthropicStream(
  chunks: AsyncIterable<string>,
  modelName = 'apos-web-model',
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const enqueue = (data: Uint8Array) => {
        try { controller.enqueue(data); } catch { /* client disconnected */ }
      };

      enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', content: [], model: modelName, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
      })}\n\n`));

      enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
      })}\n\n`));

      try {
        for await (const chunk of chunks) {
          if (chunk) enqueue(encodeAnthropicDelta(encoder, chunk));
        }
      } catch (err: any) {
        console.error('[APOS Web Stream] Error during streaming:', err.message);
      }

      enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`));
      enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`));
      enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
      try { controller.close(); } catch { /* already closed */ }
    },
    cancel() {},
  });
}

/**
 * Build common headers for ChatGPT requests.
 * Extracts oai-did from cookies if present.
 */
function buildChatGPTHeaders(cookies: string, accessToken?: string) {
  const oaiDidMatch = cookies.match(/oai-did=([^;]+)/);
  const deviceId = oaiDidMatch ? oaiDidMatch[1] : crypto.randomUUID();

  const base: Record<string, string> = {
    'Cookie': cookies,
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Ch-Ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Oai-Device-Id': deviceId,
    'Oai-Language': 'en-US',
    'Oai-Client-Build-Number': '7022011',
    'Oai-Client-Version': 'prod-938b17ddad47af377f3f6c1fa84ec33e3379c73d',
  };

  if (accessToken) {
    base['Authorization'] = `Bearer ${accessToken}`;
  }

  return base;
}

/**
 * Get ChatGPT access token from session endpoint.
 */
async function getChatGPTAccessToken(cookies: string): Promise<string> {
  const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
    method: 'GET',
    headers: {
      ...buildChatGPTHeaders(cookies),
      'Accept': 'application/json',
    },
  });

  if (!sessionRes.ok) {
    const errText = await sessionRes.text();
    throw new Error(`Failed to fetch ChatGPT session token (Status ${sessionRes.status}): ${errText || sessionRes.statusText}`);
  }

  const sessionData = await sessionRes.json();
  const accessToken = sessionData?.accessToken;
  if (!accessToken) {
    throw new Error('Could not find accessToken in ChatGPT session. Your ChatGPT cookies may have expired.');
  }
  return accessToken;
}

/**
 * Solve ChatGPT proof-of-work challenge.
 * ChatGPT requires a SHA-3 (or SHA-256) PoW to be solved before sending messages.
 * The challenge format: find a seed such that sha3_512(seed + message) starts with `difficulty` zeros.
 */
async function solveProofOfWork(seed: string, difficulty: number): Promise<string> {
  // ChatGPT uses a simple counter-based PoW: find N such that
  // hex(sha3_512(seed + N)) starts with `difficulty` zero characters.
  // We use Node's crypto module with SHA-512 as a fallback since sha3 may not be available.
  const target = '0'.repeat(difficulty);
  let counter = 0;
  const maxAttempts = 500_000;

  while (counter < maxAttempts) {
    const attempt = `${seed}${counter}`;
    const hash = crypto.createHash('sha3-512').update(attempt).digest('hex');
    if (hash.startsWith(target)) {
      return String(counter);
    }
    counter++;
  }
  // If we can't solve it (very high difficulty), return empty string
  // The request may still work without it in some cases
  console.warn(`[ChatGPT Web] Could not solve PoW challenge (difficulty=${difficulty}) within ${maxAttempts} attempts`);
  return '';
}

/**
 * Get ChatGPT sentinel chat requirements token, including solving PoW if required.
 */
async function getChatGPTSentinelToken(
  cookies: string,
  accessToken: string,
): Promise<{ token: string; powToken?: string } | undefined> {
  try {
    const requirementsRes = await fetch('https://chatgpt.com/backend-api/sentinel/chat-requirements', {
      method: 'POST',
      headers: {
        ...buildChatGPTHeaders(cookies, accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!requirementsRes.ok) {
      console.warn(`[ChatGPT Web] sentinel/chat-requirements returned ${requirementsRes.status}`);
      return undefined;
    }
    const reqData = await requirementsRes.json();
    const token = reqData?.token;
    if (!token) return undefined;

    // Check for proof-of-work challenge
    const pow = reqData?.proofofwork;
    if (pow?.required) {
      console.log(`[ChatGPT Web] PoW challenge required (difficulty=${pow.difficulty}), solving...`);
      const powAnswer = await solveProofOfWork(pow.seed, pow.difficulty);
      console.log(`[ChatGPT Web] PoW solved: counter=${powAnswer}`);
      // Encode the PoW answer as base64: "gAAAAAB" + base64(seed + ":" + answer)
      const powToken = powAnswer
        ? Buffer.from(`${pow.seed}:${powAnswer}`).toString('base64')
        : undefined;
      return { token, powToken };
    }

    return { token };
  } catch (e) {
    console.warn('[ChatGPT Web] Failed to get chat requirements:', e);
  }
  return undefined;
}

/**
 * Call the ChatGPT Web API.
 * Prefers the browser extension proxy (bypasses Cloudflare detection).
 * Falls back to direct server-side request if extension is offline.
 */
export async function askChatGPTWeb(prompt: string, cookies: string): Promise<string> {
  if (!cookies) {
    throw new Error('ChatGPT Cookies are empty or not configured.');
  }

  // Try extension proxy first
  try {
    const text = await askViaExtension('chatgpt', prompt, cookies);
    console.log('[ChatGPT Web] Response via extension proxy');
    return text;
  } catch (err: any) {
    if (err.message !== 'EXTENSION_OFFLINE') {
      // Extension is online but returned an error — surface it directly
      throw err;
    }
    console.log('[ChatGPT Web] Extension offline, falling back to direct request...');
  }

  // Fallback: direct server-side request
  const accessToken = await getChatGPTAccessToken(cookies);
  console.log('[ChatGPT Web] Access token obtained:', accessToken.substring(0, 20) + '...');

  console.log('[ChatGPT Web] Step 2: Getting sentinel token...');
  const sentinelResult = await getChatGPTSentinelToken(cookies, accessToken);
  const chatToken = sentinelResult?.token;
  const powToken = sentinelResult?.powToken;
  console.log('[ChatGPT Web] Sentinel token:', chatToken ? 'obtained' : 'not available');
  if (powToken) console.log('[ChatGPT Web] PoW token: obtained');

  const messageId = crypto.randomUUID();
  const parentMessageId = crypto.randomUUID();

  const payload = {
    action: 'next',
    messages: [
      {
        id: messageId,
        author: { role: 'user' },
        create_time: Date.now() / 1000,
        content: { content_type: 'text', parts: [prompt] },
        metadata: {},
      },
    ],
    parent_message_id: parentMessageId,
    model: 'auto',
    timezone_offset_min: -480,
    timezone: 'Asia/Shanghai',
    conversation_mode: { kind: 'primary_assistant' },
    enable_message_followups: true,
    system_hints: [],
    supports_buffering: true,
    supported_encodings: ['v1'],
    client_contextual_info: {
      is_dark_mode: false,
      time_since_loaded: 300,
      page_height: 734,
      page_width: 275,
      pixel_ratio: 1,
      screen_height: 1080,
      screen_width: 1920,
      app_name: 'chatgpt.com',
    },
    history_and_training_disabled: true,
  };

  const conversationHeaders: Record<string, string> = {
    ...buildChatGPTHeaders(cookies, accessToken),
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };

  if (chatToken) {
    conversationHeaders['Openai-Sentinel-Chat-Requirements-Token'] = chatToken;
  }
  if (powToken) {
    conversationHeaders['Openai-Sentinel-Proof-Token'] = powToken;
  }

  const conversationRes = await fetch('https://chatgpt.com/backend-api/f/conversation', {
    method: 'POST',
    headers: conversationHeaders,
    body: JSON.stringify(payload),
  });

  console.log('[ChatGPT Web] Conversation response status:', conversationRes.status);

  if (!conversationRes.ok) {
    const errText = await conversationRes.text();
    console.error('[ChatGPT Web] Conversation error response:', errText);
    throw new Error(`ChatGPT conversation API returned error (Status ${conversationRes.status}): ${errText || conversationRes.statusText}`);
  }

  const text = await conversationRes.text();
  const lines = text.split('\n');
  let finalText = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('data: ')) {
      const dataStr = trimmed.slice(6).trim();
      if (dataStr === '[DONE]') break;
      try {
        const parsed = JSON.parse(dataStr);
        const parts = parsed.message?.content?.parts;
        if (parts && parts.length > 0 && typeof parts[0] === 'string') {
          finalText = parts[0];
        }
      } catch (e) {
        // Ignore JSON parse errors for incomplete chunks
      }
    }
  }

  if (!finalText) {
    if (text.trim().startsWith('{')) {
      try {
        const parsedErr = JSON.parse(text);
        if (parsedErr.detail) {
          throw new Error(`ChatGPT Web API error: ${parsedErr.detail}`);
        }
      } catch (e) {}
    }
    throw new Error(`ChatGPT Web API returned an empty response. Raw response: ${text.slice(0, 500)}`);
  }

  return finalText;
}

/**
 * Stream ChatGPT Web response as an Anthropic-compatible SSE ReadableStream.
 * Uses the new /backend-api/f/conversation endpoint with sentinel tokens.
 */
export async function streamChatGPTWeb(prompt: string, cookies: string): Promise<ReadableStream> {
  if (!cookies) throw new Error('ChatGPT Cookies are empty or not configured.');

  const accessToken = await getChatGPTAccessToken(cookies);
  const sentinelResult = await getChatGPTSentinelToken(cookies, accessToken);
  const chatToken = sentinelResult?.token;
  const powToken = sentinelResult?.powToken;

  const conversationHeaders: Record<string, string> = {
    ...buildChatGPTHeaders(cookies, accessToken),
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (chatToken) {
    conversationHeaders['Openai-Sentinel-Chat-Requirements-Token'] = chatToken;
  }
  if (powToken) {
    conversationHeaders['Openai-Sentinel-Proof-Token'] = powToken;
  }

  const conversationRes = await fetch('https://chatgpt.com/backend-api/f/conversation', {
    method: 'POST',
    headers: conversationHeaders,
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
  if (!conversationRes.ok) throw new Error(`ChatGPT conversation API error (${conversationRes.status})`);

  async function* parseChunks(): AsyncIterable<string> {
    const reader = conversationRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastParts = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') return;
        try {
          const parsed = JSON.parse(dataStr);
          const parts = parsed.message?.content?.parts;
          if (parts?.length > 0 && typeof parts[0] === 'string') {
            const current = parts[0];
            if (current.length > lastParts.length) {
              yield current.slice(lastParts.length);
              lastParts = current;
            }
          }
        } catch { /* skip malformed chunks */ }
      }
    }
  }

  return buildAnthropicStream(parseChunks(), 'chatgpt-web');
}

/**
 * Call the Gemini Web API.
 * Prefers the browser extension proxy. Falls back to direct request.
 */
export async function askGeminiWeb(prompt: string, cookies: string): Promise<string> {
  if (!cookies) {
    throw new Error('Gemini Cookies are empty or not configured.');
  }

  // Try extension proxy first
  try {
    const text = await askViaExtension('gemini', prompt, cookies);
    console.log('[Gemini Web] Response via extension proxy');
    return text;
  } catch (err: any) {
    if (err.message !== 'EXTENSION_OFFLINE') {
      throw err;
    }
    console.log('[Gemini Web] Extension offline, falling back to direct request...');
  }

  // Fallback: direct server-side request
  const appRes = await fetch('https://gemini.google.com/app', {
    method: 'GET',
    headers: {
      'Cookie': cookies,
      'User-Agent': USER_AGENT,
    },
  });

  if (!appRes.ok) {
    const errText = await appRes.text();
    throw new Error(`Failed to load Gemini page (Status ${appRes.status}): ${errText || appRes.statusText}`);
  }

  const html = await appRes.text();
  const snlMatch = html.match(/"SNlM0e":"([^"]+)"/);
  const at = snlMatch ? snlMatch[1] : null;

  if (!at) {
    throw new Error('Could not extract SNlM0e token from Gemini page. Your Gemini cookies may be invalid or expired.');
  }

  const executeUrl = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=XqA3Ic&rt=c';
  const innerPayload = JSON.stringify([null, prompt, 'zh-CN', null, 2]);
  const fReq = JSON.stringify([[['XqA3Ic', innerPayload, null, 'generic']]]);

  const bodyParams = new URLSearchParams();
  bodyParams.append('f.req', fReq);
  bodyParams.append('at', at);

  const executeRes = await fetch(executeUrl, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: bodyParams.toString(),
  });

  if (!executeRes.ok) {
    const errText = await executeRes.text();
    throw new Error(`Gemini batchexecute API returned error (Status ${executeRes.status}): ${errText || executeRes.statusText}`);
  }

  const responseText = await executeRes.text();
  const lines = responseText.split('\n');
  let finalText = '';

  for (const line of lines) {
    if (line.includes('XqA3Ic')) {
      const match = line.match(/\[\[\["XqA3Ic".*/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const responseData = parsed[0][0][1];
          const responseJson = JSON.parse(responseData);
          finalText = extractGeminiText(responseJson, prompt);
          if (finalText) break;
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    }
  }

  if (!finalText) {
    throw new Error(`Gemini Web API returned an empty response or response structure could not be parsed. Raw response: ${responseText.slice(0, 500)}`);
  }

  return finalText;
}

/**
 * Safely extracts the text response from the Gemini JSON structure.
 */
function extractGeminiText(innerData: any, prompt: string): string {
  try {
    if (innerData && innerData[4]?.[0]?.[1]?.[0]) {
      const txt = innerData[4][0][1][0];
      if (txt && txt !== prompt) return txt;
    }
  } catch (e) {}

  let longestString = '';
  function search(obj: any) {
    if (typeof obj === 'string') {
      const trimmed = obj.trim();
      if (
        trimmed.length > longestString.length &&
        trimmed !== prompt &&
        !trimmed.startsWith('c_') &&
        !trimmed.startsWith('r_')
      ) {
        longestString = trimmed;
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) search(item);
    } else if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) search(obj[key]);
      }
    }
  }
  search(innerData);
  return longestString;
}

/**
 * Call the Kimi Web API.
 * Prefers the browser extension proxy. Falls back to direct request.
 */
export async function askKimiWeb(prompt: string, cookies: string): Promise<string> {
  if (!cookies) {
    throw new Error('Kimi Cookies are empty or not configured.');
  }

  // Try extension proxy first
  try {
    const text = await askViaExtension('kimi', prompt, cookies);
    console.log('[Kimi Web] Response via extension proxy');
    return text;
  } catch (err: any) {
    if (err.message !== 'EXTENSION_OFFLINE') {
      throw err;
    }
    console.log('[Kimi Web] Extension offline, falling back to direct request...');
  }

  // Fallback: direct server-side request
  const tokenRes = await fetch('https://kimi.moonshot.cn/api/auth/token/refresh', {
    method: 'GET',
    headers: {
      'Cookie': cookies,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Referer': 'https://kimi.moonshot.cn/',
      'Origin': 'https://kimi.moonshot.cn',
    },
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to refresh Kimi token (Status ${tokenRes.status}): ${errText || tokenRes.statusText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData?.access_token;
  if (!accessToken) {
    throw new Error('Could not find access_token in Kimi token response. Your Kimi cookies may have expired.');
  }

  const chatRes = await fetch('https://kimi.moonshot.cn/api/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ name: 'APOS Chat', is_example: false }),
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    throw new Error(`Failed to create Kimi chat session (Status ${chatRes.status}): ${errText || chatRes.statusText}`);
  }

  const chatData = await chatRes.json();
  const chatId = chatData?.id;
  if (!chatId) {
    throw new Error('Could not find chat ID in Kimi chat session response.');
  }

  try {
    const completionRes = await fetch(`https://kimi.moonshot.cn/api/chat/${chatId}/completion/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        use_search: true,
      }),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      throw new Error(`Kimi completion API returned error (Status ${completionRes.status}): ${errText || completionRes.statusText}`);
    }

    const text = await completionRes.text();
    const lines = text.split('\n');
    let lastEvent = '';
    let finalText = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('event: ')) {
        lastEvent = trimmed.slice(7).trim();
      } else if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          if (lastEvent === 'text' && typeof parsed.text === 'string') {
            finalText += parsed.text;
          } else if (parsed.event === 'text' && typeof parsed.text === 'string') {
            finalText += parsed.text;
          } else if (!lastEvent && typeof parsed.text === 'string') {
            finalText += parsed.text;
          }
        } catch (e) {
          if (lastEvent === 'text') finalText += dataStr;
        }
      }
    }

    if (!finalText) {
      throw new Error(`Kimi Web API returned an empty response. Raw response: ${text.slice(0, 500)}`);
    }

    return finalText;

  } finally {
    try {
      await fetch(`https://kimi.moonshot.cn/api/chat/${chatId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': USER_AGENT,
        },
      });
    } catch (e) {
      console.warn(`Failed to delete temporary Kimi chat session ${chatId}:`, e);
    }
  }
}

/**
 * Stream Kimi Web response as an Anthropic-compatible SSE ReadableStream.
 */
export async function streamKimiWeb(prompt: string, cookies: string): Promise<ReadableStream> {
  if (!cookies) throw new Error('Kimi Cookies are empty or not configured.');

  const tokenRes = await fetch('https://kimi.moonshot.cn/api/auth/token/refresh', {
    headers: { Cookie: cookies, 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: 'https://kimi.moonshot.cn/', Origin: 'https://kimi.moonshot.cn' },
  });
  if (!tokenRes.ok) throw new Error(`Failed to refresh Kimi token (${tokenRes.status})`);
  const tokenData = await tokenRes.json();
  const accessToken = tokenData?.access_token;
  if (!accessToken) throw new Error('Could not find access_token in Kimi response. Cookies may have expired.');

  const chatRes = await fetch('https://kimi.moonshot.cn/api/chat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ name: 'APOS Chat', is_example: false }),
  });
  if (!chatRes.ok) throw new Error(`Failed to create Kimi chat session (${chatRes.status})`);
  const chatData = await chatRes.json();
  const chatId = chatData?.id;
  if (!chatId) throw new Error('Could not find chat ID in Kimi response.');

  const completionRes = await fetch(`https://kimi.moonshot.cn/api/chat/${chatId}/completion/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], use_search: true }),
  });
  if (!completionRes.ok) throw new Error(`Kimi completion API error (${completionRes.status})`);

  async function* parseChunks(): AsyncIterable<string> {
    const reader = completionRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastEvent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('event: ')) { lastEvent = trimmed.slice(7).trim(); continue; }
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') return;
          try {
            const parsed = JSON.parse(dataStr);
            if ((lastEvent === 'text' || parsed.event === 'text') && typeof parsed.text === 'string') {
              yield parsed.text;
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } finally {
      fetch(`https://kimi.moonshot.cn/api/chat/${chatId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
      }).catch(e => console.warn(`Failed to delete Kimi chat session ${chatId}:`, e));
    }
  }

  return buildAnthropicStream(parseChunks(), 'kimi-web');
}
