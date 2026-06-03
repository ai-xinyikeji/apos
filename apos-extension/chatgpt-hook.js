/**
 * APOS ChatGPT MAIN World Hook v2.1
 *
 * 运行在 chatgpt.com 页面的 MAIN world（与 ChatGPT 自己的 JS 同一环境）。
 *
 * 新方案：
 * 1. 接收来自 llm-content.js 的触发指令（通过 postMessage）
 * 2. 用 DOM 操作触发 ChatGPT 真实对话
 * 3. 拦截 f/conversation 的 SSE response stream
 * 4. 把 SSE chunks 通过 postMessage 传给 llm-content.js
 * 5. llm-content.js 再把 chunks POST 到 APOS backend
 *
 * v2.1:
 * - 修复 _activeTaskId 单全局变量导致的并发竞争（改为任务队列）
 * - 修复 TextDecoder 末尾未 flush 导致 CJK 字符截断
 * - 修复 SSE buffer 末尾残留行未解析
 * - 减少 console.log 噪音（仅保留关键节点日志）
 */
(function () {
  'use strict';

  const DEBUG = false; // 设为 true 可开启详细日志

  const origFetch = window.fetch.bind(window);

  // ── 任务队列（替代单全局 _activeTaskId，支持并发安全）────────────────────
  // 同一时刻只有一个任务在执行，后续任务排队等待
  const _taskQueue = [];
  let _activeTaskId = null;

  function _enqueueTask(taskId, prompt) {
    _taskQueue.push({ taskId, prompt });
    if (!_activeTaskId) _processNextTask();
  }

  async function _processNextTask() {
    if (_taskQueue.length === 0) { _activeTaskId = null; return; }
    const { taskId, prompt } = _taskQueue.shift();
    _activeTaskId = taskId;
    try {
      await triggerChatGPTMessage(prompt);
    } catch (e) {
      console.error('[APOS MAIN hook] Failed to trigger ChatGPT message:', e);
      window.postMessage({ type: 'APOS_STREAM_ERROR', taskId, error: e.message }, '*');
      _activeTaskId = null;
      _processNextTask();
    }
  }

  // ── Hook fetch to intercept f/conversation SSE stream ────────────────────
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');

    // Intercept the conversation SSE stream
    if (_activeTaskId && (url.includes('/backend-api/f/conversation') || url.includes('/backend-api/conversation')) && !url.includes('/prepare') && !url.includes('/stream_status')) {
      const taskId = _activeTaskId;
      if (DEBUG) console.log('[APOS MAIN hook] Intercepting conversation SSE for task:', taskId);

      const response = await origFetch(input, init);

      if (!response.ok) {
        const errText = await response.clone().text().catch(() => '');
        window.postMessage({
          type: 'APOS_STREAM_ERROR',
          taskId,
          error: `ChatGPT conversation error (${response.status}): ${errText.slice(0, 200)}`,
        }, '*');
        _activeTaskId = null;
        _processNextTask();
        return response;
      }

      // Tee the stream: one for ChatGPT's own processing, one for us
      const [stream1, stream2] = response.body.tee();

      // Read our copy and extract text chunks
      (async () => {
        const reader = stream2.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastText = '';
        let chunkCount = 0;

        if (DEBUG) console.log('[APOS MAIN hook] Starting to read SSE stream for task:', taskId);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Flush any remaining bytes in the TextDecoder
              buffer += decoder.decode();
              if (DEBUG) console.log('[APOS MAIN hook] Stream done, total chunks:', chunkCount);
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith('data: ')) continue;
              const d = t.slice(6).trim();
              
              if (d === '[DONE]') {
                console.log('[APOS MAIN hook] Received [DONE], total chunks:', chunkCount);
                window.postMessage({ type: 'APOS_STREAM_DONE', taskId }, '*');
                _activeTaskId = null;
                _processNextTask();
                return;
              }
              
              try {
                const parsed = JSON.parse(d);

                if (DEBUG && chunkCount < 3) {
                  console.log('[APOS MAIN hook] SSE event structure:', JSON.stringify(parsed).slice(0, 200));
                }

                // NEW: Nested JSON-Patch format (outer patch with array of operations)
                if (parsed.o === 'patch' && Array.isArray(parsed.v)) {
                  for (const op of parsed.v) {
                    if (op.o === 'append' && op.p?.includes('/message/content/parts/') && typeof op.v === 'string') {
                      chunkCount++;
                      if (DEBUG) console.log('[APOS MAIN hook] Chunk', chunkCount, '(nested patch):', op.v.slice(0, 20));
                      window.postMessage({ type: 'APOS_STREAM_CHUNK', taskId, chunk: op.v }, '*');
                    }
                  }
                  continue;
                }

                // JSON-Patch delta format (direct)
                if (parsed.p !== undefined && parsed.o !== undefined) {
                  const val = parsed.v;
                  if (typeof val === 'string' && parsed.p.includes('content/parts')) {
                    if (parsed.o === 'add' || parsed.o === 'append') {
                      chunkCount++;
                      if (DEBUG) console.log('[APOS MAIN hook] Chunk', chunkCount, '(direct patch):', val.slice(0, 20));
                      window.postMessage({ type: 'APOS_STREAM_CHUNK', taskId, chunk: val }, '*');
                    }
                  }
                  continue;
                }

                // Legacy format — cumulative text, send delta
                const parts = parsed.message?.content?.parts;
                if (parts?.length > 0 && typeof parts[0] === 'string') {
                  const current = parts[0];
                  if (current.length > lastText.length) {
                    const delta = current.slice(lastText.length);
                    chunkCount++;
                    if (DEBUG) console.log('[APOS MAIN hook] Chunk', chunkCount, '(legacy):', delta.slice(0, 20));
                    window.postMessage({ type: 'APOS_STREAM_CHUNK', taskId, chunk: delta }, '*');
                    lastText = current;
                  }
                }
              } catch (e) {
                if (DEBUG) console.warn('[APOS MAIN hook] Failed to parse SSE line:', e.message, 'data:', d.slice(0, 100));
              }
            }
          }

          // 尝试解析 buffer 中残留的最后一行（stream 结束时可能没有 \n 结尾）
          if (buffer.trim().startsWith('data: ')) {
            const d = buffer.trim().slice(6).trim();
            if (d && d !== '[DONE]') {
              try {
                const parsed = JSON.parse(d);
                if (parsed.o === 'patch' && Array.isArray(parsed.v)) {
                  for (const op of parsed.v) {
                    if (op.o === 'append' && op.p?.includes('/message/content/parts/') && typeof op.v === 'string') {
                      window.postMessage({ type: 'APOS_STREAM_CHUNK', taskId, chunk: op.v }, '*');
                    }
                  }
                }
              } catch (_) { /* ignore malformed trailing line */ }
            }
          }

          // Stream ended without [DONE]
          console.log('[APOS MAIN hook] Stream ended without [DONE], sending done signal');
          window.postMessage({ type: 'APOS_STREAM_DONE', taskId }, '*');
          _activeTaskId = null;
          _processNextTask();
        } catch (e) {
          console.error('[APOS MAIN hook] Stream read error:', e);
          window.postMessage({ type: 'APOS_STREAM_ERROR', taskId, error: e.message }, '*');
          _activeTaskId = null;
          _processNextTask();
        }
      })();

      // Return response with the first tee'd stream for ChatGPT's own processing
      return new Response(stream1, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return origFetch(input, init);
  };

  // ── Listen for trigger commands from llm-content.js ───────────────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'APOS_TRIGGER_CHAT') {
      const { taskId, prompt } = event.data;
      console.log('[APOS MAIN hook] Queuing task:', taskId, 'prompt:', prompt.slice(0, 50));
      _enqueueTask(taskId, prompt);
    }
  });

  /**
   * Trigger a ChatGPT message via DOM manipulation.
   * Finds the textarea, sets the value, and clicks the send button.
   */
  async function triggerChatGPTMessage(prompt) {
    // Find the textarea (ChatGPT uses a contenteditable div or textarea)
    const textarea = document.querySelector('#prompt-textarea') ||
                     document.querySelector('textarea[data-id="root"]') ||
                     document.querySelector('div[contenteditable="true"]') ||
                     document.querySelector('textarea');

    if (!textarea) {
      throw new Error('Could not find ChatGPT input textarea');
    }

    // Set the value using React's synthetic event system
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      textarea.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLDivElement.prototype,
      'value'
    )?.set;

    if (textarea.tagName === 'TEXTAREA' && nativeInputValueSetter) {
      nativeInputValueSetter.call(textarea, prompt);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable div
      textarea.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, prompt);
    }

    // Wait for React to process the input
    await new Promise(r => setTimeout(r, 300));

    // Find and click the send button
    const sendButton = document.querySelector('[data-testid="send-button"]') ||
                       document.querySelector('button[aria-label="Send message"]') ||
                       document.querySelector('button[aria-label="发送消息"]') ||
                       document.querySelector('button[type="submit"]');

    if (!sendButton) {
      throw new Error('Could not find ChatGPT send button');
    }

    if (sendButton.disabled) {
      throw new Error('ChatGPT send button is disabled — input may not have been set correctly');
    }

    sendButton.click();
    console.log('[APOS MAIN hook] Clicked send button for task:', _activeTaskId);
  }

  console.log('[APOS MAIN hook] v2.1 installed on', location.hostname);
  window.__APOS_CHATGPT_HOOK_VERSION__ = '2.1';
})();
