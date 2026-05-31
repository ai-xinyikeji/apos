// APOS Extension Popup Script

const APOS_SERVER_URL = 'http://localhost:3000';

// DOM Elements
const serverStatus = document.getElementById('serverStatus');
const chatgptStatus = document.getElementById('chatgptStatus');
const geminiStatus = document.getElementById('geminiStatus');
const kimiStatus = document.getElementById('kimiStatus');
const chatgptCount = document.getElementById('chatgptCount');
const geminiCount = document.getElementById('geminiCount');
const kimiCount = document.getElementById('kimiCount');
const syncBtn = document.getElementById('syncBtn');
const refreshBtn = document.getElementById('refreshBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const toggleAutoSyncBtn = document.getElementById('toggleAutoSyncBtn');
const autoSyncStatus = document.getElementById('autoSyncStatus');
const messageEl = document.getElementById('message');

// State
let cookiesData = {
  chatgpt: [],
  gemini: [],
  kimi: []
};
let autoSyncEnabled = true;
let syncIntervalMinutes = 5;

// Show message
function showMessage(text, type = 'info') {
  messageEl.textContent = text;
  messageEl.className = `message message-${type} show`;
  
  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 5000);
}

// Update status display
function updateStatus() {
  // Update counts
  chatgptCount.textContent = cookiesData.chatgpt.length;
  geminiCount.textContent = cookiesData.gemini.length;
  kimiCount.textContent = cookiesData.kimi.length;

  // Update status indicators
  if (cookiesData.chatgpt.length > 0) {
    chatgptStatus.textContent = '已检测';
    chatgptStatus.className = 'status-value status-connected';
  } else {
    chatgptStatus.textContent = '未检测';
    chatgptStatus.className = 'status-value status-warning';
  }

  if (cookiesData.gemini.length > 0) {
    geminiStatus.textContent = '已检测';
    geminiStatus.className = 'status-value status-connected';
  } else {
    geminiStatus.textContent = '未检测';
    geminiStatus.className = 'status-value status-warning';
  }

  if (cookiesData.kimi.length > 0) {
    kimiStatus.textContent = '已检测';
    kimiStatus.className = 'status-value status-connected';
  } else {
    kimiStatus.textContent = '未检测';
    kimiStatus.className = 'status-value status-warning';
  }
}

// Check server status
async function checkServerStatus() {
  try {
    const response = await fetch(`${APOS_SERVER_URL}/api/settings/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      serverStatus.textContent = '已连接';
      serverStatus.className = 'status-value status-connected';
      return true;
    } else {
      throw new Error('Server returned error');
    }
  } catch (error) {
    serverStatus.textContent = '未连接';
    serverStatus.className = 'status-value status-disconnected';
    return false;
  }
}

// Get cookies from background script
async function getCookies() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'get_cookies' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response || !response.success) {
        reject(new Error(response?.error || 'Failed to get cookies'));
        return;
      }

      resolve(response);
    });
  });
}

// Refresh cookies and status
async function refresh() {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="spinner"></span>刷新中...';

  try {
    // Check server
    await checkServerStatus();

    // Get cookies
    const response = await getCookies();
    cookiesData.chatgpt = response.chatgpt || [];
    cookiesData.gemini = response.gemini || [];
    cookiesData.kimi = response.kimi || [];

    updateStatus();
    showMessage('状态已刷新', 'success');
  } catch (error) {
    console.error('Refresh failed:', error);
    showMessage(`刷新失败: ${error.message}`, 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '刷新状态';
  }
}

// Sync cookies to APOS server
async function syncCookies() {
  syncBtn.disabled = true;
  syncBtn.innerHTML = '<span class="spinner"></span>同步中...';

  try {
    // Check server first
    const serverOk = await checkServerStatus();
    if (!serverOk) {
      throw new Error('APOS 服务器未运行，请先启动 APOS');
    }

    // Get latest cookies
    const response = await getCookies();
    cookiesData.chatgpt = response.chatgpt || [];
    cookiesData.gemini = response.gemini || [];
    cookiesData.kimi = response.kimi || [];

    updateStatus();

    if (cookiesData.chatgpt.length === 0 && cookiesData.gemini.length === 0 && cookiesData.kimi.length === 0) {
      throw new Error('未检测到任何 Cookies，请先登录 ChatGPT, Gemini 或 Kimi');
    }

    // Format cookies as strings
    const chatgptCookieStr = cookiesData.chatgpt
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
    
    const geminiCookieStr = cookiesData.gemini
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    const kimiCookieStr = cookiesData.kimi
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    // Send to APOS server — only include providers that actually have cookies.
    // Sending an empty string would cause the server to DELETE stored cookies.
    const payload = {};
    if (chatgptCookieStr) payload.chatgpt_cookies = chatgptCookieStr;
    if (geminiCookieStr)  payload.gemini_cookies  = geminiCookieStr;
    if (kimiCookieStr)    payload.kimi_cookies    = kimiCookieStr;

    const syncResponse = await fetch(`${APOS_SERVER_URL}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      throw new Error(`服务器返回错误: ${errorText}`);
    }

    showMessage('✅ Cookies 同步成功！', 'success');
  } catch (error) {
    console.error('Sync failed:', error);
    showMessage(`❌ 同步失败: ${error.message}`, 'error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = '同步 Cookies 到 APOS';
  }
}

// Open APOS settings page
function openSettings() {
  chrome.tabs.create({ url: `${APOS_SERVER_URL}/settings` });
}

// Update auto-sync status display
async function updateAutoSyncStatus() {
  try {
    const result = await chrome.storage.sync.get(['autoSync', 'syncInterval']);
    autoSyncEnabled = result.autoSync !== undefined ? result.autoSync : true;
    syncIntervalMinutes = result.syncInterval || 5;

    if (autoSyncEnabled) {
      autoSyncStatus.textContent = `已启用 (每 ${syncIntervalMinutes} 分钟)`;
      autoSyncStatus.className = 'status-value status-connected';
      toggleAutoSyncBtn.textContent = '禁用自动同步';
    } else {
      autoSyncStatus.textContent = '已禁用';
      autoSyncStatus.className = 'status-value status-warning';
      toggleAutoSyncBtn.textContent = '启用自动同步';
    }
  } catch (error) {
    console.error('Failed to load auto-sync status:', error);
  }
}

// Toggle auto-sync
async function toggleAutoSync() {
  try {
    const newState = !autoSyncEnabled;
    
    // Send message to background script
    chrome.runtime.sendMessage({ 
      action: 'toggle_auto_sync', 
      enabled: newState 
    }, (response) => {
      if (chrome.runtime.lastError) {
        showMessage(`切换失败: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      
      if (response && response.success) {
        autoSyncEnabled = newState;
        updateAutoSyncStatus();
        showMessage(newState ? '自动同步已启用' : '自动同步已禁用', 'success');
      } else {
        showMessage(`切换失败: ${response?.error || '未知错误'}`, 'error');
      }
    });
  } catch (error) {
    console.error('Toggle auto-sync failed:', error);
    showMessage(`切换失败: ${error.message}`, 'error');
  }
}

// Event listeners
syncBtn.addEventListener('click', syncCookies);
refreshBtn.addEventListener('click', refresh);
openSettingsBtn.addEventListener('click', openSettings);
toggleAutoSyncBtn.addEventListener('click', toggleAutoSync);

// Initialize on load
refresh();
updateAutoSyncStatus();
