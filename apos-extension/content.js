console.log('[AI Product OS Extension] Content script loaded.');

// Tell the page that the extension is installed
document.documentElement.setAttribute('data-apos-extension-installed', 'true');
window.dispatchEvent(new CustomEvent('apos-extension-installed'));

// Listen for a custom event from the page to trigger sync
window.addEventListener('apos-sync-cookies-request', async () => {
  console.log('[AI Product OS Extension] Sync request received.');
  
  chrome.runtime.sendMessage({ action: 'get_cookies' }, async (response) => {
    if (!response || !response.success) {
      const errMsg = response ? response.error : 'Unknown error';
      console.error('[AI Product OS Extension] Failed to get cookies:', errMsg);
      window.dispatchEvent(new CustomEvent('apos-sync-cookies-response', { 
        detail: { success: false, error: errMsg } 
      }));
      return;
    }

    console.log('[AI Product OS Extension] Cookies retrieved successfully. Syncing to local server...');
    
    // Format cookies as strings for the API
    const chatgptCookieStr = response.chatgpt.map(c => `${c.name}=${c.value}`).join('; ');
    const geminiCookieStr = response.gemini.map(c => `${c.name}=${c.value}`).join('; ');
    const kimiCookieStr = response.kimi.map(c => `${c.name}=${c.value}`).join('; ');
    
    try {
      const res = await fetch('/api/settings', {
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

      if (res.ok) {
        console.log('[AI Product OS Extension] Cookies synced successfully!');
        window.dispatchEvent(new CustomEvent('apos-sync-cookies-response', { 
          detail: { success: true } 
        }));
      } else {
        const errText = await res.text();
        console.error('[AI Product OS Extension] Server returned error:', errText);
        window.dispatchEvent(new CustomEvent('apos-sync-cookies-response', { 
          detail: { success: false, error: errText } 
        }));
      }
    } catch (err) {
      console.error('[AI Product OS Extension] Network error:', err);
      window.dispatchEvent(new CustomEvent('apos-sync-cookies-response', { 
        detail: { success: false, error: err.message } 
      }));
    }
  });
});
