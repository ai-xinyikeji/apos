/**
 * APOS LLM Content Script v5.3
 *
 * 注入到 chatgpt.com / gemini.google.com / kimi.moonshot.cn 页面。
 *
 * 统一方案（所有 provider）：
 * 1. 收到任务后，通过 postMessage 通知 MAIN world hook 触发真实对话
 * 2. MAIN world hook 拦截 SSE 流，通过 postMessage 把 chunks 传回来
 * 3. 通过 long-lived connection 把 chunks 转发到 background.js
 * 4. background.js 再 POST 到 APOS backend
 *
 * v5.0: 增强连接稳定性 - 自动重连、心跳保活、重试机制
 * v5.1: 修复扩展重载时的上下文失效问题
 * v5.2: 修复 bfcache (back/forward cache) 导致的连接断开问题
 * v5.3: 扩展重载后在页面显示提示，引导用户刷新页面
 */

// 建立与 background.js 的持久连接
let port = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;

// 心跳机制：定期 ping background.js 保持连接活跃
let heartbeatInterval = null;

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    try {
      // 先检查扩展上下文是否有效
      chrome.runtime.getURL('');
      
      chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError.message;
          if (error.includes('Extension context invalidated')) {
            console.warn('[APOS content] Extension context invalidated, stopping heartbeat');
            stopHeartbeat();
            notifyExtensionReloaded();
            return;
          }
          console.warn('[APOS content] Heartbeat failed, reconnecting...');
          reconnect();
        } else if (!response) {
          console.warn('[APOS content] Heartbeat failed, reconnecting...');
          reconnect();
        }
      });
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        console.warn('[APOS content] Extension context invalidated, stopping heartbeat');
        stopHeartbeat();
        notifyExtensionReloaded();
      } else {
        console.warn('[APOS content] Heartbeat error:', e.message);
        reconnect();
      }
    }
  }, 10_000); // 每10秒心跳一次
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function ensureConnection() {
  if (port) return port;
  
  try {
    port = chrome.runtime.connect({ name: 'llm-content' });
    reconnectAttempts = 0;
    
    port.onDisconnect.addListener(() => {
      console.log('[APOS content] Port disconnected');
      port = null;
      
      // 检查是否是因为扩展上下文失效
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message;
        if (error.includes('Extension context invalidated')) {
          console.warn('[APOS content] Extension reloaded, stopping reconnection attempts');
          stopHeartbeat();
          notifyExtensionReloaded();
          return;
        }
      }
      
      reconnect();
    });
    
    console.log('[APOS content] Connected to background.js');
    startHeartbeat();
    return port;
  } catch (e) {
    console.error('[APOS content] Failed to connect:', e.message);
    
    // 如果是扩展上下文失效，停止重连
    if (e.message.includes('Extension context invalidated')) {
      console.warn('[APOS content] Extension reloaded, stopping reconnection attempts');
      stopHeartbeat();
      notifyExtensionReloaded();
      return null;
    }
    
    port = null;
    reconnect();
    return null;
  }
}

function reconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[APOS content] Max reconnection attempts reached, giving up');
    stopHeartbeat();
    return;
  }
  
  reconnectAttempts++;
  console.log(`[APOS content] Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  setTimeout(() => {
    // 再次检查扩展上下文是否有效
    try {
      chrome.runtime.getURL(''); // 测试扩展上下文是否有效
      ensureConnection();
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        console.warn('[APOS content] Extension context invalidated, stopping reconnection');
        console.warn('[APOS content] 请刷新此页面（Cmd+R / Ctrl+R）以重新连接扩展');
        stopHeartbeat();
        notifyExtensionReloaded();
      }
    }
  }, RECONNECT_DELAY_MS * reconnectAttempts);
}

/**
 * 扩展重载后在页面上显示一个短暂提示，引导用户刷新页面。
 * 不影响 ChatGPT 正常使用，3 秒后自动消失。
 */
function notifyExtensionReloaded() {
  try {
    // 避免重复显示
    if (document.getElementById('apos-reload-notice')) return;

    const notice = document.createElement('div');
    notice.id = 'apos-reload-notice';
    notice.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
      'background:#1e293b', 'color:#f1f5f9', 'border:1px solid #334155',
      'border-radius:10px', 'padding:12px 16px', 'font-size:13px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.4)', 'display:flex',
      'align-items:center', 'gap:10px', 'max-width:320px',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    ].join(';');

    notice.innerHTML = `
      <span style="font-size:18px">🔄</span>
      <div>
        <div style="font-weight:600;margin-bottom:2px">APOS 扩展已重载</div>
        <div style="color:#94a3b8;font-size:12px">请刷新页面以重新连接</div>
      </div>
      <button onclick="location.reload()" style="
        margin-left:auto; background:#3b82f6; color:#fff; border:none;
        border-radius:6px; padding:5px 10px; font-size:12px; cursor:pointer;
        white-space:nowrap;
      ">刷新</button>
    `;

    document.body.appendChild(notice);

    // 5 秒后自动消失
    setTimeout(() => notice.remove(), 5000);
  } catch (_) {
    // 页面环境异常时静默失败
  }
}

/**
 * 通用流式执行函数：通知 MAIN world hook 触发对话，监听 SSE chunks 并转发到 backend。
 * v5.0: 增加重试机制，确保消息能够送达
 */
async function executeViaHook(prompt, taskId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`Stream timeout (90s) for task ${taskId}`));
    }, 90_000);

    let accumulatedText = '';

    // 带重试的消息发送函数
    async function sendWithRetry(message, maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const p = ensureConnection();
          if (!p) {
            throw new Error('No connection available');
          }
          p.postMessage(message);
          return true;
        } catch (err) {
          console.error(`[APOS content] Send attempt ${attempt}/${maxRetries} failed:`, err.message);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 * attempt));
            reconnect();
          } else {
            throw err;
          }
        }
      }
      return false;
    }

    function handler(event) {
      if (event.source !== window) return;
      const { type, taskId: tid, chunk, error } = event.data || {};
      if (tid !== taskId) return;

      if (type === 'APOS_STREAM_CHUNK') {
        console.log(`[APOS content] Received chunk for ${taskId}:`, chunk.slice(0, 20));
        accumulatedText += chunk;
        // 通过持久连接转发 chunk 到 background.js（带重试）
        sendWithRetry({ type: 'chunk', taskId, chunk }).catch(err => {
          console.error(`[APOS content] Failed to forward chunk after retries:`, err.message);
        });

      } else if (type === 'APOS_STREAM_DONE') {
        console.log(`[APOS content] Stream done for ${taskId}, total text:`, accumulatedText.length, 'chars');
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        // 通过持久连接通知 backend 流结束（带重试）
        sendWithRetry({ type: 'done', taskId }).catch(err => {
          console.error(`[APOS content] Failed to forward done after retries:`, err.message);
        });
        resolve(accumulatedText);

      } else if (type === 'APOS_STREAM_ERROR') {
        console.error(`[APOS content] Stream error for ${taskId}:`, error);
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        // 通过持久连接通知 backend 出错（带重试）
        sendWithRetry({ type: 'error', taskId, error: error || 'Stream error' }).catch(err => {
          console.error(`[APOS content] Failed to forward error after retries:`, err.message);
        });
        reject(new Error(error || 'Stream error'));
      }
    }

    window.addEventListener('message', handler);

    // 触发 MAIN world hook
    window.postMessage({ type: 'APOS_TRIGGER_CHAT', taskId, prompt }, '*');
    console.log(`[APOS content] Triggered chat for task: ${taskId} on ${location.hostname}`);
  });
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return false;
  }

  if (request.action !== 'execute_llm') return false;

  const { provider, prompt, taskId } = request;
  console.log(`[APOS LLM Content] Executing ${provider} request, taskId: ${taskId}`);

  // 立即 ack，让 background.js 知道任务已接收
  // 实际流数据通过 /api/ext/stream-chunk 异步推送
  sendResponse({ ack: true });

  // 异步执行，不阻塞 sendResponse
  executeViaHook(prompt, taskId).catch(err => {
    console.error(`[APOS LLM Content] Task ${taskId} failed:`, err.message);
    // 如果 executeViaHook 内部没有发送 error chunk，这里补发
    try {
      const p = ensureConnection();
      p.postMessage({ type: 'error', taskId, error: err.message });
    } catch (e) {
      console.error(`[APOS content] Failed to forward error:`, e.message);
    }
  });

  return false; // 已同步 sendResponse，不需要保持通道
});

// 初始化连接
ensureConnection();

// 处理 bfcache (back/forward cache) 事件
// 当页面从 bfcache 恢复时，重新建立连接
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // 页面从 bfcache 恢复
    console.log('[APOS content] Page restored from bfcache, reconnecting...');
    port = null; // 清除旧连接
    reconnectAttempts = 0;
    ensureConnection();
  }
});

// 检查是否存在由于跨页跳转挂起的搜索任务
try {
  const raw = sessionStorage.getItem('__apos_pending_search__');
  if (raw) {
    const { taskId, query } = JSON.parse(raw);
    console.log(`[APOS content] 发现跨页挂起的搜索任务: "${query}" (${taskId})`);
    sessionStorage.removeItem('__apos_pending_search__');
    
    // 延迟一小段时间执行，确保页面和 Hook 脚本完全加载就绪
    setTimeout(() => {
      executeViaHook(query, taskId).catch(err => {
        console.error(`[APOS content] 恢复执行任务失败:`, err.message);
        try {
          const p = ensureConnection();
          if (p) p.postMessage({ type: 'error', taskId, error: err.message });
        } catch (_) {}
      });
    }, 100);
  }
} catch (e) {
  console.error('[APOS content] 检查挂起任务失败:', e);
}

console.log('[APOS LLM Content] v5.3 Ready on', location.hostname);
