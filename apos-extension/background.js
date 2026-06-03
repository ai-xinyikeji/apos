/**
 * APOS Extension Background Service Worker v2.1
 *
 * 功能：
 * 1. 轮询 /api/ext/llm-request，把任务分发给对应网站的 llm-content.js 执行
 * 2. 定期上报状态日志到 /api/ext/status，供设置页实时展示
 *
 * v2.1 优化：
 * - chunk 批量发送（50ms debounce），减少 HTTP 请求数量
 * - keep-alive 改用 chrome.alarms（setInterval 在 SW 休眠时无法触发）
 * - 自适应轮询（空闲时退避到 5s，有任务时立即恢复 500ms）
 * - 修复 executeTaskInTab ping/reload 逻辑（之前是死代码）
 * - 减少 console.log 噪音
 */

const APOS_SERVER = 'http://localhost:3000';
const VERSION = chrome.runtime.getManifest().version;

const DEBUG = false; // 设为 true 开启详细日志

// ── provider → tab URL 模式 ───────────────────────────────────────────────────
const PROVIDER_URL_PATTERNS = {
  chatgpt: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  gemini:  ['https://gemini.google.com/*'],
  kimi:    ['https://kimi.moonshot.cn/*'],
  google:  ['https://www.google.com/*', 'https://google.com/*'],
};

// ── 自适应轮询 ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_ACTIVE_MS = 500;   // 有任务时快速轮询
const POLL_INTERVAL_IDLE_MS   = 5000;  // 空闲时退避
const IDLE_THRESHOLD          = 5;     // 连续 N 次空轮询后切换到慢速
let emptyPollCount = 0;
let pollTimer = null;

function schedulePoll(delayMs) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    pollForTasks().finally(() => {
      // 下一次轮询间隔由 pollForTasks 内部决定
    });
  }, delayMs);
}

// ── 待上报的日志缓冲 ──────────────────────────────────────────────────────────
const pendingLogs = [];
let reportTimer = null;
const REPORT_INTERVAL_MS = 3000;

// ── chunk 批量缓冲（按 taskId 分组，50ms debounce 后批量 POST）────────────────
// inflightPromise: 保证同一 taskId 的请求按顺序到达服务器
const chunkBuffers = new Map(); // taskId → { chunks: string[], timer: TimeoutId }
const inflightChains = new Map(); // taskId → Promise (串行化 fetch)
const CHUNK_BATCH_DELAY_MS = 50;

/** 把 fetch 串联到该 taskId 的 promise chain，保证顺序 */
function chainFetch(taskId, fetchFn) {
  const prev = inflightChains.get(taskId) ?? Promise.resolve();
  const next = prev.then(fetchFn).catch(() => {}); // 错误不中断链
  inflightChains.set(taskId, next);
  return next;
}

function bufferChunk(taskId, chunk) {
  if (!chunkBuffers.has(taskId)) {
    chunkBuffers.set(taskId, { chunks: [], timer: null });
  }
  const buf = chunkBuffers.get(taskId);
  buf.chunks.push(chunk);

  // Debounce: reset timer on each new chunk
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => flushChunks(taskId), CHUNK_BATCH_DELAY_MS);
}

async function flushChunks(taskId, done = false, error = null) {
  const buf = chunkBuffers.get(taskId);
  if (buf?.timer) { clearTimeout(buf.timer); buf.timer = null; }

  const chunks = buf?.chunks?.splice(0) ?? [];
  chunkBuffers.delete(taskId);

  const body = error
    ? { taskId, error }
    : done
      ? { taskId, chunks: chunks.length > 0 ? chunks : undefined, done: true }
      : { taskId, chunks };

  // Skip empty batch (no chunks, not done, no error)
  if (!error && !done && chunks.length === 0) return;

  // done 时清理 chain（任务结束后不再需要）
  if (done || error) {
    setTimeout(() => inflightChains.delete(taskId), 5000);
  }
  try {
    const res = await chainFetch(taskId, () => fetch(`${APOS_SERVER}/api/ext/stream-chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    if (res && !res.ok) {
      log('error', `转发 chunk 失败 (${taskId}): HTTP ${res.status}`);
    } else if (DEBUG) {
      console.log(`[APOS BG] Flushed ${chunks.length} chunks for ${taskId}${done ? ' (done)' : ''}`);
    }
  } catch (err) {
    log('error', `转发 chunk 失败 (${taskId}): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 日志工具
// ═══════════════════════════════════════════════════════════════════════════════

function log(level, msg) {
  const prefix = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' }[level] || '';
  if (level === 'error' || level === 'warn' || DEBUG) {
    console.log(`[APOS ${level.toUpperCase()}] ${msg}`);
  }
  pendingLogs.push({ level, msg: `${prefix} ${msg}` });
  scheduleReport();
}

function scheduleReport() {
  if (reportTimer) return;
  reportTimer = setTimeout(flushReport, REPORT_INTERVAL_MS);
}

async function flushReport() {
  reportTimer = null;
  if (pendingLogs.length === 0) return;

  const logsToSend = pendingLogs.splice(0, pendingLogs.length);
  const tabs = await getTabStatuses();

  try {
    await fetch(`${APOS_SERVER}/api/ext/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'report', version: VERSION, tabs, logs: logsToSend }),
    });
  } catch {
    // 服务器未启动时静默失败
  }
}

async function getTabStatuses() {
  const result = {};
  for (const [provider, patterns] of Object.entries(PROVIDER_URL_PATTERNS)) {
    let found = null;
    for (const pattern of patterns) {
      const tabs = await chrome.tabs.query({ url: pattern }).catch(() => []);
      if (tabs.length > 0) { found = tabs[0]; break; }
    }
    result[provider] = found
      ? { open: true, tabId: found.id, url: found.url, lastSeenAt: Date.now() }
      : { open: false };
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 一、LLM 任务轮询 & 分发
// ═══════════════════════════════════════════════════════════════════════════════

async function findTabForProvider(provider) {
  const patterns = PROVIDER_URL_PATTERNS[provider];
  if (!patterns) return null;
  for (const pattern of patterns) {
    const tabs = await chrome.tabs.query({ url: pattern }).catch(() => []);
    if (tabs.length > 0) {
      const active = tabs.find(t => t.active);
      return active || tabs[0];
    }
  }
  return null;
}

function pingTab(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 1500);
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError || !response) resolve(false);
      else resolve(true);
    });
  });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 8000);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendMessageToTab(tabId, task) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tab ack 超时（10s），provider: ${task.provider}`));
    }, 10_000);

    chrome.tabs.sendMessage(
      tabId,
      { action: 'execute_llm', provider: task.provider, prompt: task.prompt, taskId: task.id },
      (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(`sendMessage 失败: ${chrome.runtime.lastError.message}`));
          return;
        }
        if (!response) { reject(new Error('llm-content.js 无响应')); return; }
        if (response.error) reject(new Error(response.error));
        else resolve(response.ack || response.text || '');
      }
    );
  });
}

async function submitError(taskId, error) {
  try {
    await fetch(`${APOS_SERVER}/api/ext/llm-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, error }),
    });
  } catch (err) {
    log('error', `回传错误失败: ${err.message}`);
  }
}

async function processTask(task) {
  log('info', `收到任务 ${task.id}，provider: ${task.provider}，prompt 长度: ${task.prompt.length} 字符`);

  const tab = await findTabForProvider(task.provider);

  if (!tab) {
    const siteMap = { chatgpt: 'chatgpt.com', gemini: 'gemini.google.com', kimi: 'kimi.moonshot.cn', google: 'www.google.com' };
    const errMsg = task.provider === 'google'
      ? `未找到 Google 搜索的 Tab。请在 Chrome 中打开 ${siteMap.google}（无需登录）`
      : `未找到 ${task.provider} 的 Tab。请在 Chrome 中打开并登录 ${siteMap[task.provider]}`;
    log('error', errMsg);
    await submitError(task.id, errMsg);
    return;
  }

  if (DEBUG) log('info', `找到 ${task.provider} Tab: [${tab.id}] ${tab.url}`);

  // 检查 content script 是否就绪，不就绪则刷新页面等待注入
  const alive = await pingTab(tab.id);
  if (!alive) {
    log('warn', `Tab ${tab.id} content script 未就绪，刷新页面等待注入...`);
    await chrome.tabs.reload(tab.id);
    await waitForTabLoad(tab.id);
    await new Promise(r => setTimeout(r, 1500));
  }

  try {
    await sendMessageToTab(tab.id, task);
    log('success', `任务 ${task.id} 已交由 content script 处理`);
  } catch (err) {
    log('error', `任务 ${task.id} 执行失败: ${err.message}`);
    await submitError(task.id, err.message);
  }
}

async function pollForTasks() {
  try {
    const res = await fetch(`${APOS_SERVER}/api/ext/llm-request`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      schedulePoll(POLL_INTERVAL_IDLE_MS);
      return;
    }

    const data = await res.json();
    const tasks = data.tasks || [];

    if (tasks.length > 0) {
      emptyPollCount = 0;
      log('info', `轮询到 ${tasks.length} 个待执行任务`);
      for (const task of tasks) {
        processTask(task).catch(err =>
          log('error', `processTask 未捕获异常: ${err.message}`)
        );
      }
      // 有任务时快速轮询，尽快取走下一个
      schedulePoll(POLL_INTERVAL_ACTIVE_MS);
    } else {
      emptyPollCount++;
      // 连续空轮询超过阈值后退避
      const delay = emptyPollCount >= IDLE_THRESHOLD
        ? POLL_INTERVAL_IDLE_MS
        : POLL_INTERVAL_ACTIVE_MS * 4; // 2s 过渡期
      schedulePoll(delay);
    }
  } catch (err) {
    if (!err.message.includes('Failed to fetch') && !err.message.includes('timed out')) {
      log('warn', `轮询异常: ${err.message}`);
    }
    schedulePoll(POLL_INTERVAL_IDLE_MS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 二、持久连接处理（用于接收 content script 的流数据）
// ═══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'llm-content') return;

  const tabId = port.sender?.tab?.id || 'unknown';
  if (DEBUG) console.log(`[APOS BG] Content script connected from tab ${tabId}`);

  port.onMessage.addListener((msg) => {
    const { type, taskId, chunk, error } = msg;

    if (type === 'chunk') {
      // 批量缓冲，50ms 后统一 POST
      bufferChunk(taskId, chunk);
    } else if (type === 'done') {
      // 立即 flush 剩余 chunks + done 标记
      flushChunks(taskId, true, null);
    } else if (type === 'error') {
      // 立即 flush 错误
      flushChunks(taskId, false, error);
    }
  });

  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
      const error = chrome.runtime.lastError.message;
      if (error.includes('back/forward cache')) {
        if (DEBUG) console.log(`[APOS BG] Content script moved to bfcache from tab ${tabId}`);
        return;
      }
    }
    if (DEBUG) console.log(`[APOS BG] Content script disconnected from tab ${tabId}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 三、消息处理（用于 popup 和其他一次性请求）
// ═══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ pong: true, version: VERSION });
    return false;
  }

  if (request.action === 'check_server') {
    fetch(`${APOS_SERVER}/api/settings/status`)
      .then(res => sendResponse({ success: res.ok, status: res.status }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'report_status_now') {
    getTabStatuses().then(async (tabs) => {
      const logsToSend = pendingLogs.splice(0, pendingLogs.length);
      try {
        await fetch(`${APOS_SERVER}/api/ext/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'report', version: VERSION, tabs, logs: logsToSend }),
        });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // 异步发送响应
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 四、Keep-alive via chrome.alarms（setInterval 在 SW 休眠时无法触发）
// ═══════════════════════════════════════════════════════════════════════════════

chrome.alarms.create('apos-keepalive', { periodInMinutes: 0.4 }); // ~24s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'apos-keepalive') {
    // 唤醒 SW 并触发一次轮询（如果当前没有待处理的 pollTimer）
    if (!pollTimer) schedulePoll(0);
    
    // 定期上报一次标签页状态和心跳，保证服务器状态最新
    getTabStatuses().then(async (tabs) => {
      const logsToSend = pendingLogs.splice(0, pendingLogs.length);
      try {
        await fetch(`${APOS_SERVER}/api/ext/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'report', version: VERSION, tabs, logs: logsToSend }),
        });
      } catch (_) {}
    }).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 五、初始化
// ═══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    log('info', `插件已安装 v${VERSION}`);
    chrome.tabs.create({ url: `${APOS_SERVER}/settings?extension=installed` });
  } else if (details.reason === 'update') {
    log('info', `插件已更新至 v${VERSION}`);
  }
});

console.log(`[APOS BG] Service Worker 启动 v${VERSION}`);

// 立即开始轮询
schedulePoll(0);
