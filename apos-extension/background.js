// APOS Extension Background Service Worker

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_cookies') {
    handleGetCookies(sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'check_server') {
    handleCheckServer(sendResponse);
    return true;
  }
});

// Get cookies from ChatGPT and Gemini
async function handleGetCookies(sendResponse) {
  try {
    // Fetch ChatGPT cookies
    const chatgptCookies = await chrome.cookies.getAll({ 
      domain: 'chatgpt.com' 
    });
    
    // Also try openai.com domain
    const openaiCookies = await chrome.cookies.getAll({ 
      domain: 'openai.com' 
    });
    
    // Merge and deduplicate
    const allChatGPT = [...chatgptCookies, ...openaiCookies];
    const chatgptSeen = new Set();
    const chatgptFiltered = allChatGPT.filter(c => {
      const key = `${c.name}:${c.domain}`;
      if (chatgptSeen.has(key)) return false;
      chatgptSeen.add(key);
      return true;
    });
    
    // Fetch Gemini cookies
    const geminiCookies1 = await chrome.cookies.getAll({ 
      domain: 'gemini.google.com' 
    });
    const geminiCookies2 = await chrome.cookies.getAll({ 
      domain: 'google.com' 
    });
    
    const allGemini = [...geminiCookies1, ...geminiCookies2];
    const geminiSeen = new Set();
    const geminiFiltered = allGemini.filter(c => {
      const key = `${c.name}:${c.domain}`;
      if (geminiSeen.has(key)) return false;
      geminiSeen.add(key);
      return true;
    });

    // Fetch Kimi cookies
    const kimiCookies1 = await chrome.cookies.getAll({ 
      domain: 'kimi.moonshot.cn' 
    });
    const kimiCookies2 = await chrome.cookies.getAll({ 
      domain: 'moonshot.cn' 
    });
    
    const allKimi = [...kimiCookies1, ...kimiCookies2];
    const kimiSeen = new Set();
    const kimiFiltered = allKimi.filter(c => {
      const key = `${c.name}:${c.domain}`;
      if (kimiSeen.has(key)) return false;
      kimiSeen.add(key);
      return true;
    });

    console.log('[APOS Extension] Cookies retrieved:', {
      chatgpt: chatgptFiltered.length,
      gemini: geminiFiltered.length,
      kimi: kimiFiltered.length
    });

    sendResponse({ 
      success: true, 
      chatgpt: chatgptFiltered, 
      gemini: geminiFiltered,
      kimi: kimiFiltered
    });
  } catch (err) {
    console.error('[APOS Extension] Failed to get cookies:', err);
    sendResponse({ 
      success: false, 
      error: err.message 
    });
  }
}

// Check if APOS server is running
async function handleCheckServer(sendResponse) {
  try {
    const response = await fetch('http://localhost:3000/api/settings/status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    sendResponse({ 
      success: response.ok,
      status: response.status
    });
  } catch (err) {
    sendResponse({ 
      success: false, 
      error: err.message 
    });
  }
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[APOS Extension] Extension installed');
    
    // Open welcome page
    chrome.tabs.create({ 
      url: 'http://localhost:3000/settings?extension=installed' 
    });
  } else if (details.reason === 'update') {
    console.log('[APOS Extension] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Periodic cookie sync (optional, can be enabled by user)
let syncInterval = null;

chrome.storage.sync.get(['autoSync', 'syncInterval'], (result) => {
  if (result.autoSync) {
    startAutoSync(result.syncInterval || 30); // Default 30 minutes
  }
});

function startAutoSync(intervalMinutes) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(async () => {
    console.log('[APOS Extension] Auto-syncing cookies...');
    
    try {
      const cookies = await new Promise((resolve, reject) => {
        handleGetCookies((response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error));
          }
        });
      });

      // Format cookies
      const chatgptCookieStr = cookies.chatgpt
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
      
      const geminiCookieStr = cookies.gemini
        .map(c => `${c.name}=${c.value}`)
        .join('; ');

      const kimiCookieStr = cookies.kimi
        .map(c => `${c.name}=${c.value}`)
        .join('; ');

      // Sync to server
      const response = await fetch('http://localhost:3000/api/settings', {
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

      if (response.ok) {
        console.log('[APOS Extension] Auto-sync successful');
      } else {
        console.error('[APOS Extension] Auto-sync failed:', await response.text());
      }
    } catch (err) {
      console.error('[APOS Extension] Auto-sync error:', err);
    }
  }, intervalMinutes * 60 * 1000);
}

function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// Listen for storage changes to update auto-sync
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.autoSync) {
      if (changes.autoSync.newValue) {
        const interval = changes.syncInterval?.newValue || 30;
        startAutoSync(interval);
      } else {
        stopAutoSync();
      }
    } else if (changes.syncInterval && syncInterval) {
      startAutoSync(changes.syncInterval.newValue);
    }
  }
});
