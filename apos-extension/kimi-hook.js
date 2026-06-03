/**
 * APOS Kimi MAIN World Hook v1.0
 *
 * 运行在 kimi.moonshot.cn 页面的 MAIN world。
 *
 * 方案：
 * 1. 接收来自 llm-content.js 的触发指令（通过 postMessage）
 * 2. 用 DOM 操作触发 Kimi 真实对话
 * 3. 拦截 /api/chat/.../completion/stream 的 SSE response stream
 * 4. 把文本 chunks 通过 postMessage 传给 llm-content.js
 */
(function () {
  'use strict';

  const origFetch = window.fetch.bind(window);

  let _activeTaskId = null;

  // ── Hook fetch to intercept Kimi SSE stream ───────────────────────────────
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');

    if (_activeTaskId && (
      url.includes('/completion/stream') ||
      (url.includes('/api/chat/') && url.includes('stream'))
    )) {
      const taskId = _activeTaskId;
      console.log('[APOS Kimi hook] Intercepting Kimi stream for task:', taskId);

      const response = await origFetch(input, init);

      if (!response.ok) {
        const errText = await response.clone().text().catch(() => '');
        window.postMessage({
          type: 'APOS_STREAM_ERROR',
          taskId,
          error: `Kimi error (${response.status}): ${errText.slice(0, 200)}`,
        }, '*');
        return response;
      }

      const [stream1, stream2] = response.body.tee();

      (async () => {
        const reader = stream2.getReader();
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
              const t = line.trim();
              if (!t) continue;
              if (t.startsWith('event: ')) { lastEvent = t.slice(7).trim(); continue; }
              if (!t.startsWith('data: ')) continue;
              const d = t.slice(6).trim();
              if (d === '[DONE]') {
                window.postMessage({ type: 'APOS_STREAM_DONE', taskId }, '*');
                _activeTaskId = null;
                return;
              }
              try {
                const parsed = JSON.parse(d);
                if ((lastEvent === 'text' || parsed.event === 'text') && typeof parsed.text === 'string') {
                  window.postMessage({ type: 'APOS_STREAM_CHUNK', taskId, chunk: parsed.text }, '*');
                }
              } catch { /* skip */ }
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

  // ── Listen for trigger commands ───────────────────────────────────────────
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'APOS_TRIGGER_CHAT') {
      const { taskId, prompt } = event.data;
      console.log('[APOS Kimi hook] Received trigger for task:', taskId);

      _activeTaskId = taskId;

      try {
        await triggerKimiMessage(prompt);
      } catch (e) {
        console.error('[APOS Kimi hook] Failed to trigger message:', e);
        window.postMessage({ type: 'APOS_STREAM_ERROR', taskId, error: e.message }, '*');
        _activeTaskId = null;
      }
    }
    // _activeTaskId is cleared by the fetch hook after stream ends, not here.
  });

  /**
   * Trigger a Kimi message via DOM manipulation.
   */
  async function triggerKimiMessage(prompt) {
    // Kimi uses a contenteditable div or textarea
    const input = document.querySelector('#msh-chatinput-editor') ||
                  document.querySelector('[contenteditable="true"]') ||
                  document.querySelector('textarea.chat-input') ||
                  document.querySelector('textarea');

    if (!input) {
      throw new Error('Could not find Kimi input element');
    }

    input.focus();

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
    const sendButton = document.querySelector('[data-testid="send-button"]') ||
                       document.querySelector('button[aria-label="发送"]') ||
                       document.querySelector('button[aria-label="Send"]') ||
                       document.querySelector('.send-btn') ||
                       document.querySelector('button.send');

    if (!sendButton) {
      // Fallback: press Enter
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      console.log('[APOS Kimi hook] Sent via Enter key');
      return;
    }

    if (sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true') {
      throw new Error('Kimi send button is disabled');
    }

    sendButton.click();
    console.log('[APOS Kimi hook] Clicked send button for task:', _activeTaskId);
  }

  console.log('[APOS Kimi hook] v1.0 installed on', location.hostname);
})();
