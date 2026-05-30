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
const messageEl = document.getElementById('message');

// State
let cookiesData = {
  chatgpt: [],
  gemini: [],
  kimi: []
};

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

    // Send to APOS server
    const syncResponse = await fetch(`${APOS_SERVER_URL}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatgpt_cookies: chatgptCookieStr,
        gemini_cookies: geminiCookieStr,
        kimi_cookies: kimiCookieStr
      })
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

// Event listeners
syncBtn.addEventListener('click', syncCookies);
refreshBtn.addEventListener('click', refresh);
openSettingsBtn.addEventListener('click', openSettings);

// Initialize on load
refresh();
