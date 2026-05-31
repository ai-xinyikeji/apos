console.log('[AI Product OS Extension] Content script loaded.');

// ── Extension context validity check ─────────────────────────────────────────
// After an extension reload, the old content script instance stays in the page
// but chrome.runtime becomes invalid. Detect this and stop acting as if the
// extension is installed so the page falls back gracefully.

function isExtensionContextValid() {
  try {
    // Accessing chrome.runtime.id throws if the context is invalidated
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// ── Tell the page the extension is installed ──────────────────────────────────

function markExtensionInstalled() {
  if (!isExtensionContextValid()) return;
  document.documentElement.setAttribute('data-apos-extension-installed', 'true');
  window.dispatchEvent(new CustomEvent('apos-extension-installed'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', markExtensionInstalled);
} else {
  // DOM already ready — still defer one tick so React hydration runs first
  setTimeout(markExtensionInstalled, 0);
}

// Also respond to explicit "are you there?" queries from the page.
// This handles the race condition where the page's React useEffect registers
// its listener AFTER the one-shot 'apos-extension-installed' event already fired.
window.addEventListener('apos-check-extension', () => {
  markExtensionInstalled();
});

// ── Cookie sync ───────────────────────────────────────────────────────────────

// Listen for a custom event from the page to trigger sync
window.addEventListener('apos-sync-cookies-request', async () => {
  console.log('[AI Product OS Extension] Sync request received.');

  // Guard: if the extension was reloaded, this old script's context is dead.
  // Notify the page so it can show the "extension not detected" state instead
  // of hanging indefinitely.
  if (!isExtensionContextValid()) {
    console.warn('[AI Product OS Extension] Context invalidated (extension was reloaded). Please refresh the page.');
    // Remove the installed marker so the page UI reflects reality
    document.documentElement.removeAttribute('data-apos-extension-installed');
    window.dispatchEvent(new CustomEvent('apos-sync-cookies-response', {
      detail: { success: false, error: '扩展已重新加载，请刷新页面后重试' }
    }));
    return;
  }

  chrome.runtime.sendMessage({ action: 'get_cookies' }, async (response) => {
    if (chrome.runtime.lastError) {
      console.error('[AI Product OS Extension] Runtime error:', chrome.runtime.lastError.message);
      window.dispatchEvent(new CustomEvent('apos-sync-cookies-response', {
        detail: { success: false, error: '扩展通信失败，请刷新页面后重试' }
      }));
      return;
    }

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
    const geminiCookieStr  = response.gemini.map(c => `${c.name}=${c.value}`).join('; ');
    const kimiCookieStr    = response.kimi.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Only include providers that actually have cookies — sending an empty
    // string would cause the server to DELETE the previously stored cookies.
    const payload = {};
    if (chatgptCookieStr) payload.chatgpt_cookies = chatgptCookieStr;
    if (geminiCookieStr)  payload.gemini_cookies  = geminiCookieStr;
    if (kimiCookieStr)    payload.kimi_cookies    = kimiCookieStr;

    // If no cookies were found for any provider, report back without hitting the server
    if (Object.keys(payload).length === 0) {
      console.warn('[AI Product OS Extension] No cookies found for any provider. Are you logged in to ChatGPT / Gemini / Kimi?');
      window.dispatchEvent(new CustomEvent('apos-sync-cookies-response', {
        detail: { success: false, error: '未找到任何平台的 Cookie，请确认已在 Chrome 中登录 ChatGPT / Gemini / Kimi' }
      }));
      return;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
