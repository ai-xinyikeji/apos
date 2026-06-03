/**
 * APOS Gemini MAIN World Hook v1.0
 *
 * 运行在 gemini.google.com 页面的 MAIN world。
 *
 * 方案：
 * 1. 接收来自 llm-content.js 的触发指令（通过 postMessage）
 * 2. 用 DOM 操作触发 Gemini 真实对话
 * 3. 拦截 batchexecute / StreamGenerate 的 SSE response stream
 * 4. 把文本 chunks 通过 postMessage 传给 llm-content.js
 */
(function () {
  'use strict';

  const origFetch = window.fetch.bind(window);

  let _activeTaskId = null;

  // ── Hook fetch to intercept Gemini SSE stream ─────────────────────────────
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');

    if (_activeTaskId && (
      url.includes('batchexecute') ||
      url.includes('StreamGenerate') ||
      url.includes('GenerateContent')
    )) {
      const taskId = _activeTaskId;
      console.log('[APOS Gemini hook] Intercepting Gemini stream for task:', taskId);

      const response = await origFetch(input, init);

      if (!response.ok) {
        const errText = await response.clone().text().catch(() => '');
        window.postMessage({
          type: 'APOS_STREAM_ERROR',
          taskId,
          error: `Gemini error (${response.status}): ${errText.slice(0, 200)}`,
        }, '*');
        return response;
      }

      const contentType = response.headers.get('content-type') || '';

      // Only intercept streaming responses
      if (!contentType.includes('text/plain') && !contentType.includes('application/json') &&
          !contentType.includes('text/event-stream')) {
        return response;
      }

      const [stream1, stream2] = response.body.tee();

      (async () => {
        const reader = stream2.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastExtractedLength = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Gemini batchexecute returns chunked JSON arrays
            // Try to extract text from the accumulated buffer
            const extracted = extractGeminiText(buffer, lastExtractedLength);
            if (extracted.text && extracted.text.length > 0) {
              window.postMessage({ type: 'APOS_STREAM_CHUNK', taskId, chunk: extracted.text }, '*');
              lastExtractedLength = extracted.totalLength;
            }
          }
          window.postMessage({ type: 'APOS_STREAM_DONE', taskId }, '*');
          _activeTaskId = null;
        } catch (e) {
          window.postMessage({ type: 'APOS_STREAM_ERROR', taskId, error: e.message }, '*');
          _activeTaskId = null;
        }
      })();

      return new Response(stream1, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return origFetch(input, init);
  };

  /**
   * Extract text delta from Gemini's batchexecute response buffer.
   * Returns { text: newDelta, totalLength: newCumulativeLength }
   */
  function extractGeminiText(buffer, lastLength) {
    let fullText = '';

    // Try to find all complete JSON arrays in the buffer
    // Gemini wraps responses in: )]}'\n\n[...]\n\n[...]\n
    const matches = buffer.matchAll(/\[\[\["[^"]+","(.*?)","generic"\]\]\]/gs);
    for (const match of matches) {
      try {
        const inner = JSON.parse(match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'));
        const parsed = typeof inner === 'string' ? JSON.parse(inner) : inner;
        const txt = parsed?.[4]?.[0]?.[1]?.[0] || parsed?.[0]?.[0] || '';
        if (typeof txt === 'string' && txt.length > fullText.length) {
          fullText = txt;
        }
      } catch { /* skip */ }
    }

    if (fullText.length > lastLength) {
      return { text: fullText.slice(lastLength), totalLength: fullText.length };
    }
    return { text: '', totalLength: lastLength };
  }

  // ── Listen for trigger commands ───────────────────────────────────────────
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'APOS_TRIGGER_CHAT') {
      const { taskId, prompt } = event.data;
      console.log('[APOS Gemini hook] Received trigger for task:', taskId);

      _activeTaskId = taskId;

      try {
        await triggerGeminiMessage(prompt);
      } catch (e) {
        console.error('[APOS Gemini hook] Failed to trigger message:', e);
        window.postMessage({ type: 'APOS_STREAM_ERROR', taskId, error: e.message }, '*');
        _activeTaskId = null;
      }
    }
    // _activeTaskId is cleared by the fetch hook after stream ends, not here.
  });

  /**
   * Trigger a Gemini message via DOM manipulation.
   */
  async function triggerGeminiMessage(prompt) {
    // Gemini uses a rich text input
    const input = document.querySelector('.ql-editor') ||
                  document.querySelector('[contenteditable="true"]') ||
                  document.querySelector('rich-textarea') ||
                  document.querySelector('textarea');

    if (!input) {
      throw new Error('Could not find Gemini input element');
    }

    input.focus();

    // Clear existing content
    if (input.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      // contenteditable
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, prompt);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }));
    }

    await new Promise(r => setTimeout(r, 400));

    // Find send button
    const sendButton = document.querySelector('[data-mat-icon-name="send"]')?.closest('button') ||
                       document.querySelector('button[aria-label="Send message"]') ||
                       document.querySelector('button[aria-label="发送消息"]') ||
                       document.querySelector('.send-button') ||
                       document.querySelector('button.send');

    if (!sendButton) {
      // Try pressing Enter as fallback
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      console.log('[APOS Gemini hook] Sent via Enter key');
      return;
    }

    if (sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true') {
      throw new Error('Gemini send button is disabled');
    }

    sendButton.click();
    console.log('[APOS Gemini hook] Clicked send button for task:', _activeTaskId);
  }

  console.log('[APOS Gemini hook] v1.0 installed on', location.hostname);
})();
