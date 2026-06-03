/**
 * APOS Extension Content Script v2.0
 *
 * 注入到 localhost:3000 页面。
 * 功能：标记插件已安装，供 APOS 前端检测。
 * 
 * v2.0 变更：移除 cookie 同步相关功能（新架构不再需要）
 */

// ── 立即标记插件已安装（document_start 时执行，早于 React） ──────────────────
document.documentElement.setAttribute('data-apos-extension-installed', 'true');

// ── 等 DOM ready 后再派发事件（React 可能还没挂载） ──────────────────────────
function dispatchInstalled() {
  window.dispatchEvent(new CustomEvent('apos-extension-installed', {
    detail: { version: '2.0.0' }
  }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', dispatchInstalled);
} else {
  dispatchInstalled();
}

// 额外：延迟再派发一次，确保 React hydration 完成后也能收到
setTimeout(dispatchInstalled, 500);
setTimeout(dispatchInstalled, 1500);

console.log('[APOS Content] 已就绪 (v2.0.0)');
