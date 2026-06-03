/**
 * APOS Extension Popup Script v3.0.3
 * 展示插件在线状态 + Provider Tab 状态 + 健康检查 + 连接测试
 * 
 * 新架构：不再需要 cookie 同步，直接在浏览器页面内触发真实对话
 */

const APOS_SERVER_URL = 'http://localhost:3000';

// DOM Elements
const serverStatus = document.getElementById('serverStatus');
const extensionStatus = document.getElementById('extensionStatus');
const queueInfo = document.getElementById('queueInfo');
const chatgptTabStatus = document.getElementById('chatgptTabStatus');
const geminiTabStatus = document.getElementById('geminiTabStatus');
const kimiTabStatus = document.getElementById('kimiTabStatus');
const refreshBtn = document.getElementById('refreshBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const messageEl = document.getElementById('message');
const warningsBox = document.getElementById('warningsBox');
const warningsList = document.getElementById('warningsList');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const lastUpdateEl = document.getElementById('lastUpdate');

// Test buttons and results
const testChatgptBtn = document.getElementById('testChatgptBtn');
const testGeminiBtn = document.getElementById('testGeminiBtn');
const testKimiBtn = document.getElementById('testKimiBtn');
const testGoogleBtn = document.getElementById('testGoogleBtn');
const chatgptTestResult = document.getElementById('chatgptTestResult');
const geminiTestResult = document.getElementById('geminiTestResult');
const kimiTestResult = document.getElementById('kimiTestResult');
const googleTabStatus = document.getElementById('googleTabStatus');
const googleTestResult = document.getElementById('googleTestResult');

// Track tab open status
let tabsOpen = {
  chatgpt: false,
  gemini: false,
  kimi: false,
  google: false,
};

function showMessage(text, type = 'info') {
  messageEl.textContent = text;
  messageEl.className = `message message-${type} show`;
  setTimeout(() => messageEl.classList.remove('show'), 5000);
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateLastUpdate() {
  lastUpdateEl.textContent = formatTime(Date.now());
}

function updateTabStatus(el, tabData, provider) {
  const testBtn = document.getElementById(`test${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn`);
  
  if (tabData.open) {
    el.textContent = `✅ 已打开 · ${formatTime(tabData.lastSeenAt)}`;
    el.className = 'tab-status tab-status-ok';
    tabsOpen[provider] = true;
    if (testBtn) {
      testBtn.style.display = 'inline-block';
    }
  } else {
    el.textContent = '⚠️ 未打开（请访问对应网站）';
    el.className = 'tab-status tab-status-pending';
    tabsOpen[provider] = false;
    if (testBtn) {
      testBtn.style.display = 'none';
    }
  }
}

function updateWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    warningsBox.classList.remove('show');
    return;
  }
  
  warningsList.innerHTML = warnings.map(w => `<li>${w}</li>`).join('');
  warningsBox.classList.add('show');
}

async function testConnection(provider) {
  const testBtn = document.getElementById(`test${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn`);
  const resultEl = document.getElementById(`${provider}TestResult`);
  
  // Disable button and show loading
  testBtn.disabled = true;
  testBtn.innerHTML = '<span class="spinner"></span> 测试中...';
  resultEl.style.display = 'none';
  
  try {
    // Create test task
    const testPrompt = '你好，请简单回复"测试成功"即可';
    const createRes = await fetch(`${APOS_SERVER_URL}/api/ext/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
      }),
    });
    
    if (!createRes.ok) {
      const errorData = await createRes.json();
      throw new Error(errorData.error || '创建任务失败');
    }
    
    const { taskId } = await createRes.json();
    
    // Poll for result (max 30 seconds)
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds with 500ms interval
    
    const checkResult = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error('测试超时（30秒）');
      }
      
      const resultRes = await fetch(`${APOS_SERVER_URL}/api/ext/test-result?taskId=${taskId}`);
      if (resultRes.ok) {
        const resultData = await resultRes.json();
        
        if (resultData.status === 'completed' && resultData.result) {
          // Success
          resultEl.textContent = `✅ 测试成功！响应: ${resultData.result.slice(0, 30)}...`;
          resultEl.className = 'test-result test-result-success';
          resultEl.style.display = 'block';
          showMessage(`${provider.toUpperCase()} 测试成功`, 'success');
          return true;
        } else if (resultData.status === 'streaming' && resultData.result) {
          // Still streaming, but we have partial result - show it
          resultEl.textContent = `⏳ 接收中... ${resultData.result.slice(0, 30)}...`;
          resultEl.className = 'test-result test-result-success';
          resultEl.style.display = 'block';
        } else if (resultData.status === 'failed') {
          throw new Error(resultData.error || '任务执行失败');
        }
      }
      
      // Continue polling
      await new Promise(resolve => setTimeout(resolve, 500));
      return checkResult();
    };
    
    await checkResult();
    
  } catch (err) {
    // Show error
    resultEl.textContent = `❌ 测试失败: ${err.message}`;
    resultEl.className = 'test-result test-result-error';
    resultEl.style.display = 'block';
    showMessage(`${provider.toUpperCase()} 测试失败: ${err.message}`, 'error');
  } finally {
    // Re-enable button
    testBtn.disabled = false;
    testBtn.textContent = '🧪 测试';
  }
}

async function fetchStatus() {
  try {
    // 首先检查 Service Worker
    const swResponse = await chrome.runtime.sendMessage({ action: 'ping' });
    if (swResponse?.pong) {
      extensionStatus.textContent = `✅ 在线 (v${swResponse.version})`;
      extensionStatus.className = 'status-value status-connected';
      
      // 立即触发后台检测并上报标签页状态，保证服务器中的状态是最新的
      await chrome.runtime.sendMessage({ action: 'report_status_now' }).catch(() => {});
    } else {
      extensionStatus.textContent = '❌ Service Worker 离线';
      extensionStatus.className = 'status-value status-disconnected';
    }
    
    // 获取健康检查数据
    const healthRes = await fetch(`${APOS_SERVER_URL}/api/ext/health`);
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    
    const health = await healthRes.json();
    
    // Server status
    if (health.status === 'healthy') {
      serverStatus.textContent = '✅ 正常';
      serverStatus.className = 'status-value status-connected';
    } else if (health.status === 'degraded') {
      serverStatus.textContent = '⚠️ 异常';
      serverStatus.className = 'status-value status-warning';
    } else {
      serverStatus.textContent = '❌ 故障';
      serverStatus.className = 'status-value status-disconnected';
    }
    
    // Queue info
    const queueLen = health.tasks.queueLength || 0;
    const pendingLen = health.tasks.pendingCount || 0;
    if (queueLen > 0 || pendingLen > 0) {
      queueInfo.textContent = `队列: ${queueLen} | 处理中: ${pendingLen}`;
      queueInfo.className = 'queue-info queue-active';
    } else {
      queueInfo.textContent = '空闲';
      queueInfo.className = 'queue-info queue-idle';
    }
    
    // Warnings
    updateWarnings(health.warnings);
    
    // 获取详细状态（包含 tab 信息）
    const statusRes = await fetch(`${APOS_SERVER_URL}/api/settings/status`);
    if (statusRes.ok) {
      const data = await statusRes.json();
      
      // Tab statuses
      if (data.tabs) {
        updateTabStatus(chatgptTabStatus, data.tabs.chatgpt || { open: false }, 'chatgpt');
        updateTabStatus(geminiTabStatus, data.tabs.gemini || { open: false }, 'gemini');
        updateTabStatus(kimiTabStatus, data.tabs.kimi || { open: false }, 'kimi');
        updateTabStatus(googleTabStatus, data.tabs.google || { open: false }, 'google');
      }
    }
    
    updateLastUpdate();
    return true;
  } catch (err) {
    serverStatus.textContent = '❌ 未连接';
    serverStatus.className = 'status-value status-disconnected';
    queueInfo.textContent = '—';
    queueInfo.className = 'queue-info';
    updateWarnings(['无法连接到 APOS 服务器']);
    throw err;
  }
}

async function refresh() {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="spinner"></span>刷新中...';

  try {
    await fetchStatus();
    showMessage('状态已刷新', 'success');
  } catch (err) {
    showMessage(`刷新失败: ${err.message}`, 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '🔄 刷新状态';
  }
}

/**
 * Test Google Search functionality
 */
async function testGoogleSearch() {
  const testBtn = testGoogleBtn;
  const resultEl = googleTestResult;
  
  testBtn.disabled = true;
  testBtn.innerHTML = '<span class="spinner"></span> 测试中...';
  resultEl.style.display = 'none';
  
  try {
    // 测试查询（使用有 AI Overview 的查询词）
    const query = 'what is artificial intelligence';
    const createRes = await fetch(`${APOS_SERVER_URL}/api/ext/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google', prompt: query })
    });
    
    if (!createRes.ok) {
      throw new Error(`请求失败: HTTP ${createRes.status}`);
    }
    
    const data = await createRes.json();
    const taskId = data.taskId;
    
    if (!taskId) {
      throw new Error('未返回 taskId');
    }
    
    // 轮询结果（最多 30 秒）
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
      
      const resultRes = await fetch(`${APOS_SERVER_URL}/api/ext/test-result?taskId=${taskId}`);
      if (!resultRes.ok) continue;
      
      const resultData = await resultRes.json();
      
      if (resultData.status === 'completed') {
        // 解析结果 (Markdown 格式)
        try {
          const raw = resultData.result;
          const refSplit = raw.split(/\n## (?:References|参考来源)\n/);
          const aiOverview = refSplit[0]?.trim() || null;
          
          const results = [];
          if (refSplit[1]) {
            const linePattern = /- \[(.+?)\]\((.+?)\)(?::\s*(.+))?/g;
            let match;
            while ((match = linePattern.exec(refSplit[1])) !== null) {
              results.push({
                title: match[1],
                url: match[2],
                snippet: (match[3] || '').trim(),
              });
            }
          }
          
          const hasAI = aiOverview && aiOverview.length > 20 ? '✅ 有 AI Overview' : '⚠️ 无 AI Overview';
          const resultCount = results.length;
          const aiLength = aiOverview ? aiOverview.length : 0;
          
          let message = `✅ 测试成功！\n${hasAI}`;
          if (aiLength > 0) {
            message += ` (${aiLength} 字符)`;
          }
          message += `\n${resultCount} 条搜索结果\n\n📄 原始响应内容 (Markdown 格式)：\n${raw}`;
          
          resultEl.textContent = message;
          resultEl.className = 'test-result test-result-success';
          resultEl.style.display = 'block';
          showMessage('Google 搜索测试成功', 'success');
        } catch (parseErr) {
          resultEl.textContent = `⚠️ 测试完成，但结果解析失败: ${parseErr.message}\n原始结果: ${resultData.result.slice(0, 100)}...`;
          resultEl.className = 'test-result test-result-error';
          resultEl.style.display = 'block';
        }
        break;
      } else if (resultData.status === 'failed') {
        throw new Error(resultData.error || '任务失败');
      }
      
      // 显示进度
      if (attempts % 5 === 0) {
        resultEl.textContent = `⏳ 等待中... (${attempts}/${maxAttempts}秒)`;
        resultEl.className = 'test-result';
        resultEl.style.display = 'block';
      }
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('测试超时（30秒）\n\n可能原因：\n1. 扩展未在 google.com 标签页\n2. 网络问题\n3. Google DOM 结构变化');
    }
    
  } catch (err) {
    resultEl.textContent = `❌ 测试失败: ${err.message}`;
    resultEl.className = 'test-result test-result-error';
    resultEl.style.display = 'block';
    showMessage(`Google 搜索测试失败: ${err.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '🧪 测试';
  }
}

function openSettings() {
  chrome.tabs.create({ url: `${APOS_SERVER_URL}/settings` });
}

// Provider website mapping and URL patterns for queries
const PROVIDER_URLS = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/',
  kimi: 'https://kimi.moonshot.cn/',
  google: 'https://www.google.com/',
};

const PROVIDER_PATTERNS = {
  chatgpt: ['*://chatgpt.com/*', '*://chat.openai.com/*'],
  gemini: ['*://gemini.google.com/*'],
  kimi: ['*://kimi.moonshot.cn/*'],
  google: ['*://www.google.com/*', '*://google.com/*', '*://www.google.com.hk/*', '*://google.com.hk/*'],
};

// Open or switch/focus to the corresponding provider's tab
async function openProviderTab(provider) {
  const url = PROVIDER_URLS[provider];
  if (!url) return;

  const patterns = PROVIDER_PATTERNS[provider] || [url];
  
  try {
    // Attempt to search for already opened tab matching the pattern
    const tabs = await chrome.tabs.query({ url: patterns });
    if (tabs && tabs.length > 0) {
      // Focus on the existing tab
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { drawAttention: true, focused: true });
      showMessage(`已聚焦到已打开的 ${provider} 标签页`, 'success');
    } else {
      // Create new tab if none exist
      await chrome.tabs.create({ url });
      showMessage(`已打开 ${provider} 标签页，请保持其处于打开状态`, 'success');
    }
    // Instantly refresh state shortly after
    setTimeout(refresh, 1000);
  } catch (err) {
    console.error(`打开标签页失败:`, err.message);
    try {
      chrome.tabs.create({ url });
    } catch (_) {
      window.open(url, '_blank');
    }
  }
}

// Click on provider card to open/focus tab
document.querySelectorAll('.provider-card').forEach(card => {
  card.addEventListener('click', (e) => {
    // If click was on the test button, do not open tab
    if (e.target.classList.contains('btn-test') || e.target.closest('.btn-test')) {
      return;
    }
    const provider = card.getAttribute('data-provider');
    if (provider) {
      openProviderTab(provider);
    }
  });
});

// Event listeners
refreshBtn.addEventListener('click', refresh);
openSettingsBtn.addEventListener('click', openSettings);
testChatgptBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  testConnection('chatgpt');
});
testGeminiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  testConnection('gemini');
});
testKimiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  testConnection('kimi');
});
testGoogleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  testGoogleSearch();
});

clearQueueBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  clearQueueBtn.disabled = true;
  clearQueueBtn.innerHTML = '<span class="spinner"></span> 清除中...';
  try {
    const res = await fetch(`${APOS_SERVER_URL}/api/ext/clear-queue`, { method: 'POST' });
    if (res.ok) {
      showMessage('队列及挂起任务已全部清除！', 'success');
      await fetchStatus();
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    showMessage(`清除队列失败: ${err.message}`, 'error');
  } finally {
    clearQueueBtn.disabled = false;
    clearQueueBtn.innerHTML = '🧹 清除积压任务';
  }
});

// Initialize and auto-refresh every 5 seconds
refresh();
setInterval(refresh, 5000);
