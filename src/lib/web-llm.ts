import crypto from 'crypto';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
 * Helper: write the Anthropic SSE envelope (start events + stop events) around a stream body.
 * The caller provides an async generator that yields text chunks.
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
    cancel() {
      // Client disconnected — nothing to clean up here, generators handle their own cleanup
    },
  });
}

/**
 * Call the ChatGPT Web API using session cookies.
 * Retrieves an access token from the session endpoint and then calls the conversation backend.
 */
export async function askChatGPTWeb(prompt: string, cookies: string): Promise<string> {
  if (!cookies) {
    throw new Error('ChatGPT Cookies are empty or not configured.');
  }

  // 1. Fetch Session Token
  const sessionUrl = 'https://chatgpt.com/api/auth/session';
  const sessionRes = await fetch(sessionUrl, {
    method: 'GET',
    headers: {
      'Cookie': cookies,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!sessionRes.ok) {
    const errText = await sessionRes.text();
    throw new Error(`Failed to fetch ChatGPT session token (Status ${sessionRes.status}): ${errText || sessionRes.statusText}`);
  }

  let sessionData: any;
  try {
    sessionData = await sessionRes.json();
  } catch (err: any) {
    throw new Error(`Failed to parse ChatGPT session response as JSON: ${err.message}`);
  }

  const accessToken = sessionData?.accessToken;
  if (!accessToken) {
    throw new Error('Could not find accessToken in ChatGPT session. Your ChatGPT cookies may have expired.');
  }

  // 2. Call backend-api/conversation
  const conversationUrl = 'https://chatgpt.com/backend-api/conversation';
  const messageId = crypto.randomUUID();
  const parentMessageId = crypto.randomUUID();

  const payload = {
    action: 'next',
    messages: [
      {
        id: messageId,
        author: { role: 'user' },
        content: {
          content_type: 'text',
          parts: [prompt],
        },
        metadata: {},
      },
    ],
    parent_message_id: parentMessageId,
    model: 'auto',
    timezone_offset_min: -480,
    history_and_training_disabled: true, // Don't save to history to keep account clean
  };

  const conversationRes = await fetch(conversationUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Cookie': cookies,
      'User-Agent': USER_AGENT,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!conversationRes.ok) {
    const errText = await conversationRes.text();
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
    // Check if the response was an error message in JSON format instead of SSE
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
 * The underlying ChatGPT backend-api/conversation endpoint is already SSE,
 * so we pipe it directly instead of buffering the full response.
 */
export async function streamChatGPTWeb(prompt: string, cookies: string): Promise<ReadableStream> {
  if (!cookies) throw new Error('ChatGPT Cookies are empty or not configured.');

  // 1. Fetch session token
  const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
    headers: { Cookie: cookies, 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!sessionRes.ok) throw new Error(`Failed to fetch ChatGPT session (${sessionRes.status})`);
  const sessionData = await sessionRes.json();
  const accessToken = sessionData?.accessToken;
  if (!accessToken) throw new Error('Could not find accessToken in ChatGPT session. Cookies may have expired.');

  // 2. Open streaming conversation
  const conversationRes = await fetch('https://chatgpt.com/backend-api/conversation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Cookie: cookies,
      'User-Agent': USER_AGENT,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      action: 'next',
      messages: [{
        id: crypto.randomUUID(),
        author: { role: 'user' },
        content: { content_type: 'text', parts: [prompt] },
        metadata: {},
      }],
      parent_message_id: crypto.randomUUID(),
      model: 'auto',
      timezone_offset_min: -480,
      history_and_training_disabled: true,
    }),
  });
  if (!conversationRes.ok) throw new Error(`ChatGPT conversation API error (${conversationRes.status})`);

  // 3. Pipe SSE stream, extracting incremental text deltas
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
            // ChatGPT sends cumulative text — yield only the new delta
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
 * Call the Gemini Web API using session cookies.
 * Fetches the gemini.google.com page to extract the anti-CSRF token (SNlM0e) and then calls batchexecute.
 */
export async function askGeminiWeb(prompt: string, cookies: string): Promise<string> {
  if (!cookies) {
    throw new Error('Gemini Cookies are empty or not configured.');
  }

  // 1. Fetch SNlM0e token
  const appUrl = 'https://gemini.google.com/app';
  const appRes = await fetch(appUrl, {
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

  // 2. Call batchexecute
  const executeUrl = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=XqA3Ic&rt=c';
  
  // Format f.req: [[["XqA3Ic", JSON.stringify([null, prompt, "zh-CN", null, 2])]]]
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
 * Supports multiple nested formats and falls back to a recursive search for the longest string.
 */
function extractGeminiText(innerData: any, prompt: string): string {
  try {
    if (innerData && innerData[4]?.[0]?.[1]?.[0]) {
      const txt = innerData[4][0][1][0];
      if (txt && txt !== prompt) return txt;
    }
  } catch (e) {}

  // Recursive fallback: search for the longest string in the JSON structure, excluding the prompt itself.
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
      for (const item of obj) {
        search(item);
      }
    } else if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          search(obj[key]);
        }
      }
    }
  }
  search(innerData);
  return longestString;
}

/**
 * Call the Kimi Web API using session cookies.
 * Exchanges the session cookies for a temporary access token, creates a chat,
 * posts the prompt to completion/stream, and parses the SSE events.
 * Finally cleans up the created chat session.
 */
export async function askKimiWeb(prompt: string, cookies: string): Promise<string> {
  if (!cookies) {
    throw new Error('Kimi Cookies are empty or not configured.');
  }

  // 1. Fetch access token from auth token endpoint
  const tokenUrl = 'https://kimi.moonshot.cn/api/auth/token';
  const tokenRes = await fetch(tokenUrl, {
    method: 'GET',
    headers: {
      'Cookie': cookies,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to refresh Kimi token (Status ${tokenRes.status}): ${errText || tokenRes.statusText}`);
  }

  let tokenData: any;
  try {
    tokenData = await tokenRes.json();
  } catch (err: any) {
    throw new Error(`Failed to parse Kimi token response as JSON: ${err.message}`);
  }

  const accessToken = tokenData?.access_token;
  if (!accessToken) {
    throw new Error('Could not find access_token in Kimi token response. Your Kimi cookies may have expired.');
  }

  // 2. Create temporary chat session
  const chatUrl = 'https://kimi.moonshot.cn/api/chat';
  const chatRes = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      name: 'APOS Chat',
      is_example: false,
    }),
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
    // 3. Post prompt to chat completion stream
    const completionUrl = `https://kimi.moonshot.cn/api/chat/${chatId}/completion/stream`;
    const completionRes = await fetch(completionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
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
          // If the event type is 'text' or if it contains a 'text' property
          if (lastEvent === 'text' && typeof parsed.text === 'string') {
            finalText += parsed.text;
          } else if (parsed.event === 'text' && typeof parsed.text === 'string') {
            finalText += parsed.text;
          } else if (!lastEvent && typeof parsed.text === 'string') {
            finalText += parsed.text;
          }
        } catch (e) {
          // If data isn't JSON but event is text, treat as raw text chunk
          if (lastEvent === 'text') {
            finalText += dataStr;
          }
        }
      }
    }

    if (!finalText) {
      throw new Error(`Kimi Web API returned an empty response. Raw response: ${text.slice(0, 500)}`);
    }

    return finalText;

  } finally {
    // 4. Delete the temporary chat session to keep history clean
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
 * Kimi's completion/stream endpoint is native SSE, so we pipe it directly.
 */
export async function streamKimiWeb(prompt: string, cookies: string): Promise<ReadableStream> {
  if (!cookies) throw new Error('Kimi Cookies are empty or not configured.');

  // 1. Fetch access token
  const tokenRes = await fetch('https://kimi.moonshot.cn/api/auth/token', {
    headers: { Cookie: cookies, 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!tokenRes.ok) throw new Error(`Failed to refresh Kimi token (${tokenRes.status})`);
  const tokenData = await tokenRes.json();
  const accessToken = tokenData?.access_token;
  if (!accessToken) throw new Error('Could not find access_token in Kimi response. Cookies may have expired.');

  // 2. Create temporary chat session
  const chatRes = await fetch('https://kimi.moonshot.cn/api/chat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ name: 'APOS Chat', is_example: false }),
  });
  if (!chatRes.ok) throw new Error(`Failed to create Kimi chat session (${chatRes.status})`);
  const chatData = await chatRes.json();
  const chatId = chatData?.id;
  if (!chatId) throw new Error('Could not find chat ID in Kimi response.');

  // 3. Open streaming completion
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

  // 4. Pipe SSE stream, clean up chat session when done
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
      // Clean up chat session
      fetch(`https://kimi.moonshot.cn/api/chat/${chatId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
      }).catch(e => console.warn(`Failed to delete Kimi chat session ${chatId}:`, e));
    }
  }

  return buildAnthropicStream(parseChunks(), 'kimi-web');
}

