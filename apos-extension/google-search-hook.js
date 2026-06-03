/**
 * APOS Google Search Hook v2.0 — 三层防线策略
 *
 * 与 chatgpt-hook.js 同样的可靠性思路：
 * 拦截网络请求 > 解析原始 HTML > DOM 语义查询
 *
 * ═══════════════════════════════════════════════════════════════
 * 第 1 层：网络拦截（最可靠 95%+）
 *   - Hook fetch/XHR，捕获 Google 异步加载的搜索数据
 *   - 包括 AI Overview 懒加载、SPA 导航等场景
 *   - 与 chatgpt-hook.js 拦截 SSE 流一样的思路
 *
 * 第 2 层：HTML 快照提取（很可靠 85%+）
 *   - 取 document.documentElement.outerHTML 快照
 *   - 用 DOMParser 在沙箱 Document 中查询语义标签
 *   - 不受 JS 动态修改、class 混淆的影响
 *   - 正则 fallback 用于 DOMParser 失败的场景
 *
 * 第 3 层：Live DOM 语义查询（保底 70%+）
 *   - 在当前 DOM 中查询 h3、a[href]、data-attrid
 *   - 只用语义属性，不依赖 class 名
 *   - 作为前两层都失败时的最后保底
 * ═══════════════════════════════════════════════════════════════
 *
 * 输出格式（直接 JSON，服务端零解析成本）：
 *   {
 *     "query": "搜索词",
 *     "aiOverview": "AI 概览文本 或 null",
 *     "results": [
 *       { "title": "...", "url": "...", "snippet": "..." }
 *     ]
 *   }
 */

(function () {
  'use strict';

  if (window.__APOS_GOOGLE_HOOK__) return;
  window.__APOS_GOOGLE_HOOK__ = true;

  // ══════════════════════════════════════════════════════════════
  // 第 1 层：网络拦截 — Hook fetch/XHR
  // ══════════════════════════════════════════════════════════════

  const origFetch = window.fetch.bind(window);
  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;

  /**
   * 从异步请求中拦截到的数据
   * 每次 scrapeAndSend 后重置
   */
  const _net = { results: [], aiOverview: null };

  // ── Hook fetch ────────────────────────────────────────────────
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const response = await origFetch(input, init);

    if (_isAsyncSearchURL(url)) {
      try {
        const text = await response.clone().text();
        if (text && text.length > 200) {
          _parseNetworkResponse(text);
        }
      } catch (_) { /* 静默失败，不影响 Google 正常工作 */ }
    }

    return response;
  };

  // ── Hook XHR ──────────────────────────────────────────────────
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._aposUrl = typeof url === 'string' ? url : '';
    return origXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._aposUrl && _isAsyncSearchURL(this._aposUrl)) {
      this.addEventListener('load', function () {
        try {
          if (this.responseText && this.responseText.length > 200) {
            _parseNetworkResponse(this.responseText);
          }
        } catch (_) {}
      });
    }
    return origXHRSend.apply(this, args);
  };

  /**
   * 识别 Google 搜索的异步数据请求 URL
   * 这些请求用于：SPA 导航、AI Overview 懒加载、动态搜索结果
   */
  function _isAsyncSearchURL(url) {
    if (!url) return false;
    return (
      // Google 异步搜索请求（SPA 导航、懒加载）
      (url.includes('/search') && url.includes('async=')) ||
      // Google 搜索的 AJAX 请求
      (url.includes('/search') && url.includes('asearch=')) ||
      // AI Overview 的专用请求
      (url.includes('/search') && url.includes('udm='))
    );
  }

  /**
   * 解析从网络拦截到的响应文本
   */
  function _parseNetworkResponse(text) {
    // 尝试 1: 纯 JSON 响应
    if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
      try {
        const json = JSON.parse(text);
        _extractFromJSON(json);
        return;
      } catch (_) {}
    }

    // 尝试 2: 从 HTML 片段中提取 — 交给第 2 层逻辑
    _extractFromHTMLText(text, _net);

    if (_net.results.length > 0 || _net.aiOverview) {
      console.log(`[APOS Google v2] 🌐 网络拦截: ${_net.results.length} 条, AI=${!!_net.aiOverview}`);
    }
  }

  /**
   * 从纯 JSON 响应中提取搜索数据
   * Google 的某些异步请求返回 JSON 格式
   */
  function _extractFromJSON(json) {
    if (!json) return;

    // JSON-LD SearchResultsPage
    if (json['@type'] === 'SearchResultsPage' || json['@type'] === 'ItemList') {
      const items = json.itemListElement || json.mainEntity?.itemListElement || [];
      for (const item of items) {
        if (item.url && item.name) {
          _net.results.push({
            title: item.name,
            url: item.url,
            snippet: item.description || '',
            _src: 'json',
          });
        }
      }
    }

    // 递归检查嵌套结构
    if (typeof json === 'object') {
      for (const val of Object.values(json)) {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object') _extractFromJSON(item);
          }
        } else if (val && typeof val === 'object') {
          _extractFromJSON(val);
        }
      }
    }
  }


  // ══════════════════════════════════════════════════════════════
  // 第 2 层：HTML 文本提取 — DOMParser 沙箱解析
  // ══════════════════════════════════════════════════════════════

  /**
   * 从 HTML 文本中提取搜索结果和 AI Overview
   * 使用 DOMParser 创建沙箱 Document，避免 class 混淆和 JS 干扰
   *
   * @param {string} html - 原始 HTML 文本
   * @param {object} target - 存放结果的对象 { results: [], aiOverview: null }
   */
  function _extractFromHTMLText(html, target) {
    console.log(`[APOS Google v2] _extractFromHTMLText 开始...`);
    const existingUrls = new Set(target.results.map(r => r.url));

    // ── AI Overview (正则优先) ─────────────────────────────
    if (!target.aiOverview) {
      target.aiOverview = _extractAIOverviewFromHTML(html);
      console.log(`[APOS Google v2] _extractAIOverviewFromHTML 正则提取结果:`, !!target.aiOverview);
    }

    // ── DOMParser 方式 ──────────────────────────────────────
    try {
      console.log(`[APOS Google v2] DOMParser 解析开始...`);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      console.log(`[APOS Google v2] DOMParser 解析成功...`);
      
      // 移除沙箱文档中所有的 script 和 style 标签，防止 textContent 提取到垃圾 JS/CSS 代码
      const badTags = doc.querySelectorAll('script, style');
      for (const t of badTags) t.remove();
      
      // 如果正则没提取出来，用 DOMParser 进行多策略提取
      if (!target.aiOverview) {
        console.log(`[APOS Google v2] 尝试 DOMParser _extractAIOverviewFromDoc 提取...`);
        target.aiOverview = _extractAIOverviewFromDoc(doc);
        console.log(`[APOS Google v2] DOMParser _extractAIOverviewFromDoc 提取结果:`, !!target.aiOverview);
      }
      
      _extractResultsFromParsedDoc(doc, target, existingUrls);
      console.log(`[APOS Google v2] DOMParser 提取结果数:`, target.results.length);
    } catch (e) {
      // DOMParser 失败，降级到正则
      console.warn('[APOS Google v2] DOMParser 失败，降级正则:', e.message);
      _extractResultsByRegex(html, target, existingUrls);
    }
  }

  /**
   * 从 DOMParser 创建 of Document 中提取搜索结果
   * 关键：只用语义属性（h3, a[href], cite, data-hveid），不用 class 名
   */
  function _extractResultsFromParsedDoc(doc, target, seen) {
    // 需要排除的噪音区域
    const noiseSelectors = [
      '#hdtb',        // 工具栏
      '#appbar',      // 应用栏
      '#botstuff',    // 底部区域
      '#footcnt',     // 页脚
      '#tads',        // 顶部广告
      '#bottomads',   // 底部广告
      '#rhs',         // 右侧知识面板（可能包含有用信息，但容易误判）
    ];

    const h3s = doc.querySelectorAll('h3');

    for (const h3 of h3s) {
      if (target.results.length >= 8) break;

      // 跳过噪音区域内的 h3
      if (noiseSelectors.some(sel => h3.closest(sel))) continue;

      // 跳过广告区域的 h3（多语言兼容）
      if (h3.closest('[aria-label*="广告"], [aria-label*="Ad"], [aria-label*="Ads"], [data-text-ad]')) continue;

      // 跳过 "People also ask"（通常在 data-sgrd 容器内）
      if (h3.closest('[data-sgrd], [jsname="yEVEwb"]')) continue;

      const title = (h3.textContent || '').trim();
      if (!title || title.length < 3) continue;

      // ── 找链接 ──
      let url = _findResultURL(h3);
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // ── 找摘要 ──
      const snippet = _findSnippet(h3, title);

      target.results.push({ title, url, snippet, _src: 'html-parser' });
    }

    // Fallback: 如果通过 h3 提取到的结果少于 3 条（多见于 AI Mode (udm=50) 网页），
    // 则在主内容列提取所有指向非 Google 站点的外部 <a> 链接作为搜索结果
    if (target.results.length < 3) {
      const mainCol = doc.querySelector('#center_col') || doc.querySelector('#rso') || doc.querySelector('[role="main"]') || doc.querySelector('main') || doc.querySelector('body') || doc;
      if (mainCol) {
        const links = mainCol.querySelectorAll('a[href]');
        for (const link of links) {
          if (target.results.length >= 8) break;
          
          let url = link.getAttribute('href') || '';
          if (url.startsWith('/url?')) {
            try {
              const params = new URL(url, 'https://www.google.com').searchParams;
              url = params.get('q') || url;
            } catch (_) {}
          }
          
          // 排除广告、Google 自有服务
          if (!url.startsWith('http') || url.includes('google.com') || url.includes('google.co') || url.includes('google.cn')) continue;
          if (seen.has(url)) continue;
          
          const title = (link.textContent || '').trim();
          // 过滤掉“更多”、“全部显示”等没有实际内容的标签文字
          if (title.length < 5 || title.includes('更多') || title.includes('全部') || title.includes('网站') || title.includes('+')) continue;
          
          seen.add(url);
          target.results.push({
            title: title.slice(0, 100),
            url,
            snippet: '',
            _src: 'html-parser-fallback'
          });
        }
      }
    }
  }

  /**
   * 从 h3 元素向上/向下查找关联的搜索结果 URL
   */
  function _findResultURL(h3) {
    // 情况 1: h3 在 <a> 内部（最常见）
    let linkEl = h3.closest('a[href]');

    // 情况 2: h3 旁边有 <a>
    if (!linkEl) {
      linkEl = h3.parentElement?.querySelector('a[href]')
            || h3.parentElement?.parentElement?.querySelector('a[href]');
    }

    if (!linkEl) return null;

    let url = linkEl.getAttribute('href') || '';

    // 处理 Google 的 /url?q=... 重定向链接
    if (url.startsWith('/url?')) {
      try {
        const params = new URL(url, 'https://www.google.com').searchParams;
        url = params.get('q') || url;
      } catch (_) {}
    }

    // 过滤无效链接
    if (!url.startsWith('http')) return null;
    if (url.includes('google.com/search')) return null;
    if (url.includes('accounts.google.com')) return null;
    if (url.includes('support.google.com')) return null;
    if (url.includes('policies.google.com')) return null;

    return url;
  }

  /**
   * 在搜索结果容器内查找摘要文本
   */
  function _findSnippet(h3, title) {
    // 找到结果的容器：[data-hveid] 或距离 h3 最近的有意义祖先
    const container = h3.closest('[data-hveid]')
                    || h3.closest('[data-sokoban-container]')
                    || h3.parentElement?.parentElement?.parentElement;

    if (!container) return '';

    let bestSnippet = '';
    let bestLen = 0;

    // 遍历容器内的 span 和 div，找最长的纯文本片段
    for (const node of container.querySelectorAll('span, div, em')) {
      // 跳过含子链接、h3、cite 的节点（它们不是摘要）
      if (node.querySelector('a, h3, cite')) continue;

      // 跳过太深的嵌套（可能是子组件的文本）
      if (node.closest('#hdtb, [data-text-ad]')) continue;

      const text = (node.textContent || '').trim();

      // 摘要的特征：
      // - 长度在 30-500 字符之间
      // - 不等于标题
      // - 不是纯 URL
      if (text.length > bestLen &&
          text.length >= 30 &&
          text.length < 500 &&
          text !== title &&
          !text.startsWith('http') &&
          !text.match(/^[a-z]+\.[a-z]+/i) // 排除域名
      ) {
        bestLen = text.length;
        bestSnippet = text;
      }
    }

    return bestSnippet;
  }

  /**
   * 从原始 HTML 中提取 AI Overview 内容
   * 多重策略，任一命中即返回
   * 采用极其安全的局部定位截取算法，完全规避大 HTML 全文正则回溯风险
   */
  function _extractAIOverviewFromHTML(html) {
    // 策略 1: data-attrid="ai_overview"
    const idx = html.indexOf('data-attrid="ai_overview"');
    if (idx !== -1) {
      // 仅截取包含标签后 6000 字符，避免在整个 HTML 进行大回溯
      const sub = html.substring(idx, idx + 6000);
      const match = sub.match(/>([^<]{50,})</);
      if (match) {
        const text = _stripHTMLTags(match[1]).trim();
        if (text.length > 50) return text.slice(0, 3000);
      }
    }

    // 策略 2: data-citation
    const citIdx = html.indexOf('data-citation');
    if (citIdx !== -1) {
      const start = Math.max(0, citIdx - 3000);
      const sub = html.substring(start, citIdx + 3000);
      const match = sub.match(/>([^<]{100,})</);
      if (match) {
        const text = _stripHTMLTags(match[1]).trim();
        if (text.length > 100) return text.slice(0, 3000);
      }
    }

    return null;
  }

  /**
   * 正则 fallback — 当 DOMParser 不可用时使用
   * 安全机制：先提取 <a> 标签局部，再从中分析 <h3>，避免大面积跨标签正则回溯
   */
  function _extractResultsByRegex(html, target, seen) {
    // 限制 <a> 标签长度为最多 2000 字符，防止跨越大片 DOM 搜索
    const aPattern = /<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]{1,2000}?)<\/a>/gi;
    let match;
    while ((match = aPattern.exec(html)) !== null && target.results.length < 8) {
      const rawUrl = match[1];
      const innerHTML = match[2];
      
      // 排除 Google 域名链接
      if (rawUrl.includes('google.com') || rawUrl.includes('google.co') || rawUrl.includes('google.cn')) continue;
      
      let url = rawUrl;
      if (url.startsWith('/url?')) {
        try {
          const params = new URL(url, 'https://www.google.com').searchParams;
          url = params.get('q') || url;
        } catch (_) {}
      }
      if (!url.startsWith('http') || seen.has(url)) continue;

      // 提取 <h3>
      const h3Match = innerHTML.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (h3Match) {
        const title = h3Match[1].replace(/<[^>]+>/g, '').trim();
        if (title.length >= 3) {
          seen.add(url);
          target.results.push({ title, url, snippet: '', _src: 'regex-safe' });
        }
      }
    }
  }

  /**
   * 清除 HTML 标签，提取纯文本
   */
  function _stripHTMLTags(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


  // ══════════════════════════════════════════════════════════════
  // 第 3 层：Live DOM 语义查询（保底）
  // ══════════════════════════════════════════════════════════════

  /**
   * 从 Document 或 Element 节点提取 AI Overview / AI Mode 内容
   * 多重策略，任一命中即返回
   */
  function _extractAIOverviewFromDoc(root) {
    if (!root) return null;
    console.log(`[APOS Google v2] _extractAIOverviewFromDoc 开始提取...`);

    // 策略 A: data-attrid="ai_overview"
    console.log(`[APOS Google v2] AI Overview 提取 - 策略 A 开始...`);
    const byAttr = root.querySelector('[data-attrid="ai_overview"]');
    if (byAttr) {
      const t = _cleanDOMText(byAttr);
      if (t.length > 80) {
        console.log(`[APOS Google v2] 策略 A 命中!`);
        return t.slice(0, 5000);
      }
    }

    // 策略 B: data-citation 反向定位
    console.log(`[APOS Google v2] AI Overview 提取 - 策略 B 开始...`);
    const firstCitation = root.querySelector('[data-citation]');
    if (firstCitation) {
      console.log(`[APOS Google v2] 发现 data-citation, 向上攀爬寻找容器...`);
      let el = firstCitation.parentElement;
      let depth = 0;
      while (el && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
        depth++;
        const t = _cleanDOMText(el);
        if (t.length > 200 && t.length < 5000) {
          const h3Count = el.querySelectorAll('h3').length;
          if (h3Count <= 1) {
            console.log(`[APOS Google v2] 策略 B 命中! 深度: ${depth}, 长度: ${t.length}`);
            return t.slice(0, 5000);
          }
        }
        el = el.parentElement;
      }
    }

    // 策略 C: 智能段落提取（最适合 udm=50 AI Mode）
    console.log(`[APOS Google v2] AI Overview 提取 - 策略 C 开始...`);
    const mainCol = root.querySelector('#center_col') || root.querySelector('#rso') || root.querySelector('[role="main"]') || root.querySelector('main') || root.querySelector('body') || root;
    if (mainCol) {
      console.log(`[APOS Google v2] 发现主内容列, 收集段落...`);
      const paragraphs = Array.from(mainCol.querySelectorAll('p'));
      console.log(`[APOS Google v2] 段落数: ${paragraphs.length}`);
      if (paragraphs.length > 0) {
        const parentGroups = new Map();
        for (const p of paragraphs) {
          if (p.closest('#rhs, #botstuff, #footcnt, #hdtb, [aria-label*="广告"], [aria-label*="Ad"], [aria-label*="Ads"]')) continue;
          const parent = p.parentElement;
          if (!parent) continue;
          if (!parentGroups.has(parent)) {
            parentGroups.set(parent, []);
          }
          parentGroups.get(parent).push(p);
        }

        let bestParent = null;
        let maxTextLen = 0;
        console.log(`[APOS Google v2] 扫描段落父级组... 数量: ${parentGroups.size}`);
        for (const [parent, pList] of parentGroups.entries()) {
          const text = pList.map(p => (p.textContent || '').trim()).join('\n\n');
          if (text.length > maxTextLen && text.length > 100) {
            const linkCount = parent.querySelectorAll('a[href^="http"]').length;
            if (linkCount < 6) {
              maxTextLen = text.length;
              bestParent = parent;
            }
          }
        }

        if (bestParent) {
          console.log(`[APOS Google v2] 策略 C 命中!`);
          return _cleanDOMText(bestParent).slice(0, 5000);
        }
      }
    }

    // 策略 D: 智能文本块扫描
    console.log(`[APOS Google v2] AI Overview 提取 - 策略 D 开始...`);
    const noiseSelectors = ['#hdtb', '#appbar', '#botstuff', '#footcnt', '#tads', '#bottomads', '#rhs', 'header', 'footer', 'nav'];
    let best = { text: '', score: 0 };

    // 限制仅在主内容列中扫描文本块，防止提取到左侧的对话历史记录菜单和侧边栏
    const searchRoot = mainCol || root;
    const blocks = Array.from(searchRoot.querySelectorAll('[data-hveid], #center_col > div, #rso > div'));
    
    console.log(`[APOS Google v2] 扫描文本块... 数量: ${blocks.length}`);
    for (const block of blocks) {
      if (noiseSelectors.some(sel => block.closest(sel))) continue;
      if (block.closest('[aria-label*="广告"], [aria-label*="Ad"], [aria-label*="Ads"]')) continue;

      const t = _cleanDOMText(block);
      if (t.length < 200) continue;

      const linkCount = block.querySelectorAll('a[href^="http"]').length;
      const score = t.length - linkCount * 80;

      if (score > best.score) {
        best = { text: t, score };
      }
    }

    if (best.score > 200) {
      console.log(`[APOS Google v2] 策略 D 命中! 分数: ${best.score}`);
      return best.text.slice(0, 5000);
    }

    // 策略 E: 全局 Div 深度扫描（保底，适合没有 data-hveid 且没有 p 标签的常规/Gemini 聊天页）
    console.log(`[APOS Google v2] AI Overview 提取 - 策略 E 开始...`);
    const allDivs = Array.from(root.querySelectorAll('div, section, article'));
    let bestDiv = { text: '', score: 0 };
    console.log(`[APOS Google v2] 扫描全局容器数量: ${allDivs.length}`);
    for (const div of allDivs) {
      // 排除噪音区域
      if (noiseSelectors.some(sel => div.closest(sel))) continue;
      if (div.closest('[aria-label*="广告"], [aria-label*="Ad"], [aria-label*="Ads"]')) continue;
      
      const t = _cleanDOMText(div);
      if (t.length < 200 || t.length > 10000) continue;
      
      // 过滤掉包含侧边栏或历史记录的容器，以找到最小的/最精确的内容容器
      if (t.includes('AI 模式历史记录') || t.includes('AI Mode History') ||
          t.includes('管理公开链接') || t.includes('Manage public links') ||
          t.includes('要删除所有搜索记录吗')) {
        continue;
      }

      const linkCount = div.querySelectorAll('a[href^="http"]').length;
      const score = t.length - linkCount * 80;

      if (score > bestDiv.score) {
        bestDiv = { text: t, score };
      }
    }

    if (bestDiv.score > 200) {
      console.log(`[APOS Google v2] 策略 E 命中! 分数: ${bestDiv.score}`);
      return bestDiv.text.slice(0, 5000);
    }

    console.log(`[APOS Google v2] AI Overview 提取 - 所有策略未命中.`);
    return null;
  }

  /**
   * 从 Live DOM 提取 AI Overview
   */
  function _extractAIOverviewFromDOM() {
    return _extractAIOverviewFromDoc(document);
  }

  /**
   * 从 Live DOM 提取搜索结果
   * 只用语义标签（h3, a[href]），不依赖 class
   */
  function _extractSearchResultsFromDOM() {
    const results = [];
    const seen = new Set();

    for (const h3 of document.querySelectorAll('h3')) {
      // 跳过噪音区域
      if (h3.closest('#hdtb, #appbar, #tads, #bottomads')) continue;
      if (h3.closest('[aria-label*="广告"], [aria-label*="Ad"], [aria-label*="Ads"], [data-text-ad]')) continue;
      if (h3.closest('[data-sgrd]')) continue; // "People also ask"

      const title = (h3.innerText || h3.textContent || '').trim();
      if (!title || title.length < 3) continue;

      // 找链接
      const linkEl = h3.closest('a[href]')
                  || h3.querySelector('a[href]')
                  || h3.parentElement?.querySelector('a[href]')
                  || h3.parentElement?.parentElement?.querySelector('a[href]');

      let url = linkEl?.getAttribute('href') || '';
      if (url.startsWith('/url?')) {
        try {
          const params = new URL(url, 'https://www.google.com').searchParams;
          url = params.get('q') || url;
        } catch (_) {}
      }
      if (!url.startsWith('http') || seen.has(url)) continue;
      if (url.includes('google.com/search') || url.includes('accounts.google.com')) continue;
      seen.add(url);

      // 找摘要
      const container = h3.closest('[data-hveid]') || h3.parentElement?.parentElement;
      let snippet = '';
      if (container) {
        let maxLen = 0;
        for (const node of container.querySelectorAll('span, div')) {
          if (node.querySelector('a')) continue;
          const t = (node.innerText || '').trim();
          if (t.length > maxLen && t.length >= 30 && t.length < 400 && t !== title) {
            maxLen = t.length;
            snippet = t;
          }
        }
      }

      results.push({ title, url, snippet, _src: 'dom' });
      if (results.length >= 5) break;
    }

    // Fallback: 如果通过 h3 提取到的结果少于 3 条，则在主内容列中提取外部 <a> 链接作为搜索结果
    if (results.length < 3) {
      const mainCol = document.querySelector('#center_col') || document.querySelector('#rso') || document.querySelector('[role="main"]') || document.querySelector('main') || document.querySelector('body') || document;
      if (mainCol) {
        const links = mainCol.querySelectorAll('a[href]');
        for (const link of links) {
          if (results.length >= 5) break;
          let url = link.getAttribute('href') || '';
          if (url.startsWith('/url?')) {
            try {
              const params = new URL(url, 'https://www.google.com').searchParams;
              url = params.get('q') || url;
            } catch (_) {}
          }
          if (!url.startsWith('http')) continue;
          if (url.includes('google.com') || url.includes('google.co') || url.includes('google.cn')) continue;
          if (seen.has(url)) continue;
          
          const title = (link.innerText || link.textContent || '').trim();
          if (title.length < 5 || title.includes('更多') || title.includes('全部') || title.includes('网站') || title.includes('+')) continue;
          
          seen.add(url);
          results.push({
            title: title.slice(0, 100),
            url,
            snippet: '',
            _src: 'dom-fallback'
          });
        }
      }
    }

    return results;
  }

  function _cleanDOMText(el) {
    if (!el) return '';
    
    // 复制节点并在内存中清除 script 和 style 标签，防止 textContent 提取到垃圾 JS/CSS 代码
    let tempEl = el;
    try {
      tempEl = el.cloneNode(true);
      const badTags = tempEl.querySelectorAll('script, style');
      for (const t of badTags) t.remove();
    } catch (_) {}

    const rawText = tempEl.innerText || tempEl.textContent || '';
    return rawText
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * 清理 AI Overview / AI Chat 中的噪音文本（侧边栏、历史记录、反馈按钮等）
   */
  function _cleanAIOverviewText(text, query) {
    if (!text) return '';

    let cleanText = text;

    // 1. 优先使用 "您说：" 或 "you said" 定位聊天气泡的起点，丢弃前面的聊天历史和侧边栏 UI
    // 支持中文 "您说：" 和英文 "you said:", "you:", "user:" 等
    const bubbleRegex = /(?:您说[：:]|you\s*said\s*[:：]|you\s*[:：]|user\s*[:：])/gi;
    let matchBubble;
    let lastBubbleIdx = -1;
    
    // 找到最后一个 "您说：" / "You said:" 的匹配起点
    while ((matchBubble = bubbleRegex.exec(cleanText)) !== null) {
      lastBubbleIdx = matchBubble.index + matchBubble[0].length;
    }

    if (lastBubbleIdx !== -1) {
      cleanText = cleanText.substring(lastBubbleIdx).trim();
    } else {
      // Fallback: 如果没有找到 "您说：" 标签，尝试直接用 query 定位
      if (query) {
        const queryLower = query.toLowerCase().trim();
        const textLower = cleanText.toLowerCase();
        const queryIdx = textLower.lastIndexOf(queryLower);
        if (queryIdx !== -1) {
          cleanText = cleanText.substring(queryIdx).trim();
        }
      }
    }

    // 2. 如果开头是 query 词本身，将其剥离
    if (query) {
      const queryTrim = query.trim().toLowerCase();
      if (cleanText.toLowerCase().startsWith(queryTrim)) {
        cleanText = cleanText.substring(queryTrim.length).trim();
      }
    }

    // 3. 清除开头的任何时间戳/冒号/空白字符
    // 例如： "上午9:23", "下午 4:15", "9:23 AM", "12:00"
    cleanText = cleanText.replace(/^(?:\s*上午|\s*下午|\s*AM|\s*PM|\s*\d+:\d+|\s|：|:|`)+/i, '');

    // 4. 截断尾部 Google AI Chat 的各种反馈、分享、导出等 UI 按钮文字
    const cutoffMarkers = [
      '复制分享公开链接',
      '此公开链接用于分享',
      '目前无法复制',
      '分享公开链接',
      '响应良好',
      '响应较差',
      '详细信息',
      '导出到 Google',
      '导出为 Gmail',
      '省时',
      '清除',
      '此对话记录',
      '您的反馈将附上',
      '感谢您告诉我们',
      'Google 可能会遵循',
      '若有法律问题',
      '全部显示',
      'Share public link',
      'Good response',
      'Bad response',
      'Export to Google',
      'Export to Gmail',
      'Privacy Policy',
      'Terms of Service',
      'Show all'
    ];

    let earliestCutoff = cleanText.length;
    for (const marker of cutoffMarkers) {
      const idx = cleanText.indexOf(marker);
      if (idx !== -1 && idx < earliestCutoff) {
        earliestCutoff = idx;
      }
    }

    // 正则截断：网站/来源列表，例如 "15 个网站", "12 sources" 等
    const websiteRegex = /\b\d+\s*(?:个网站|websites|sources?|site?s)\b/i;
    const match = cleanText.match(websiteRegex);
    if (match && match.index !== undefined && match.index < earliestCutoff) {
      earliestCutoff = match.index;
    }

    cleanText = cleanText.substring(0, earliestCutoff).trim();

    return cleanText;
  }


  // ══════════════════════════════════════════════════════════════
  // 通用工具
  // ══════════════════════════════════════════════════════════════

  /**
   * 等待任意一个选择器命中，或超时
   */
  function waitForAny(selectors, maxMs) {
    return new Promise((resolve) => {
      let resolved = false;
      let obs = null;
      const done = (val) => {
        if (resolved) return;
        resolved = true;
        if (obs) obs.disconnect();
        resolve(val);
      };

      const check = () => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { done(el); return; }
        }
      };

      obs = new MutationObserver(check); // Initialize MutationObserver first to avoid Temporal Dead Zone (TDZ)
      check();
      if (resolved) return;

      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => done(null), maxMs);
    });
  }


  // ══════════════════════════════════════════════════════════════
  // 主逻辑：合并三层数据并发送
  // ══════════════════════════════════════════════════════════════

  async function scrapeAndSend(query, taskId) {
    try {
      console.log(`[APOS Google v2] scrapeAndSend 开始: "${query}" (taskId: ${taskId})`);
      // 等待页面加载搜索结果
      await waitForAny([
        '[data-attrid="ai_overview"]',
        'h3',
        '#rso',          // 搜索结果容器
        '#search',       // 备选容器
      ], 8000);
      console.log(`[APOS Google v2] waitForAny 结束，等待 1500ms...`);

      // 额外等待 AI Overview 懒加载（它通常比搜索结果慢 1-2 秒）
      await new Promise(r => setTimeout(r, 1500));
      console.log(`[APOS Google v2] 延迟等待结束，开始提取数据...`);

      // ── 第 2 层：HTML 快照提取 ──────────────────────────────
      const snapshot = { results: [], aiOverview: null };
      try {
        const htmlText = document.documentElement.outerHTML;
        _extractFromHTMLText(htmlText, snapshot);
        console.log(`[APOS Google v2] 📸 快照提取: ${snapshot.results.length} 条, AI=${!!snapshot.aiOverview}`);
      } catch (e) {
        console.warn('[APOS Google v2] 快照提取异常:', e.message);
      }

      // ── 第 3 层：Live DOM 提取 ──────────────────────────────
      const domAI = _extractAIOverviewFromDOM();
      const domResults = _extractSearchResultsFromDOM();
      console.log(`[APOS Google v2] 🔍 DOM 提取: ${domResults.length} 条, AI=${!!domAI}`);

      // ── 合并三层数据 ────────────────────────────────────────
      // AI Overview 优先级：网络拦截 > HTML 快照 > DOM
      const rawAiOverview = _net.aiOverview || snapshot.aiOverview || domAI || null;
      let aiOverview = _cleanAIOverviewText(rawAiOverview, query);

      // 搜索结果去重合并（优先级：网络拦截 > HTML 快照 > DOM）
      const seen = new Set();
      const merged = [];
      const allResults = [..._net.results, ...snapshot.results, ...domResults];

      for (const r of allResults) {
        if (seen.has(r.url) || !r.title || !r.url) continue;
        seen.add(r.url);

        // 如果当前结果没有 snippet，看看其他层有没有
        let snippet = r.snippet || '';
        if (!snippet) {
          const alt = allResults.find(x => x.url === r.url && x.snippet);
          if (alt) snippet = alt.snippet;
        }

        merged.push({ title: r.title, url: r.url, snippet });
        if (merged.length >= 5) break;
      }

      // ── 保底策略 W：Google 快捷卡片/小工具提取（计算器、翻译、单位换算等） ────
      if (!aiOverview && merged.length === 0) {
        console.log(`[APOS Google v2] 正在尝试 Google 快捷卡片/工具提取 (Strategy W)...`);
        
        // 1. 计算器结果
        const calculatorResult = document.getElementById('cwos');
        const calculatorEquation = document.querySelector('.cwtltblr, #cwtltblr');
        if (calculatorResult) {
          const eqText = calculatorEquation ? (calculatorEquation.innerText || calculatorEquation.textContent || '').trim() : '';
          const resText = (calculatorResult.innerText || calculatorResult.textContent || '').trim();
          aiOverview = `Google Calculator Result:\n${eqText} ${resText}`;
          console.log(`[APOS Google v2] 策略 W (计算器) 命中! 结果: ${aiOverview}`);
        }
        
        // 2. 翻译卡片
        if (!aiOverview) {
          const translationBox = document.querySelector('[data-attrid="tw-ob-res"]');
          if (translationBox) {
            aiOverview = `Google Translation Result:\n${_cleanDOMText(translationBox)}`;
            console.log(`[APOS Google v2] 策略 W (翻译) 命中!`);
          }
        }
        
        // 3. 汇率/单位换算
        if (!aiOverview) {
          const converterBox = document.querySelector('[data-attrid="currency"], [data-attrid="converter"], .obg_card');
          if (converterBox) {
            aiOverview = `Google Converter Result:\n${_cleanDOMText(converterBox)}`;
            console.log(`[APOS Google v2] 策略 W (换算器) 命中!`);
          }
        }

        // 4. 精选摘要 (Featured Snippet) / 知识卡片 (Knowledge Card)
        if (!aiOverview) {
          const featuredSnippet = document.querySelector('[data-attrid="wa:/featured-snippet"], .LGOjfa, .kp-blk, [data-attrid^="kc:/"]');
          if (featuredSnippet) {
            aiOverview = `Google Featured Snippet / Knowledge Card:\n${_cleanDOMText(featuredSnippet)}`;
            console.log(`[APOS Google v2] 策略 W (精选摘要/知识卡片) 命中!`);
          }
        }
      }

      // ── 保底策略 F：页面主内容文本提取 ─────────────────────────────
      if (!aiOverview && merged.length === 0) {
        console.log(`[APOS Google v2] 正在尝试保底页面文本提取 (Strategy F)...`);
        const mainCol = document.querySelector('#center_col') || document.querySelector('#rso') || document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
        if (mainCol) {
          const rawText = _cleanDOMText(mainCol);
          // 确保不是验证码页面，且提取到了有意义的文本
          if (rawText.length > 50 && !rawText.includes('reCAPTCHA') && !rawText.includes('检测到异常流量') && !rawText.includes('机器人') && !location.href.includes('google.com/sorry/')) {
            aiOverview = `Based on Google Search page content:\n\n${rawText.slice(0, 3000)}`;
            console.log(`[APOS Google v2] 保底页面文本提取成功，长度: ${rawText.length}`);
          }
        }
      }

      // 生成来源报告
      const sources = new Set();
      if (_net.results.length > 0 || _net.aiOverview) sources.add('net');
      if (snapshot.results.length > 0 || snapshot.aiOverview) sources.add('html');
      if (domResults.length > 0 || domAI) sources.add('dom');

      // 重置网络拦截缓存（为下一次搜索准备）
      _net.results = [];
      _net.aiOverview = null;

      // ── 结果校验 ────────────────────────────────────────────
      if (!aiOverview && merged.length === 0) {
        const title = document.title || '无标题';
        const h3Count = document.querySelectorAll('h3').length;
        const hasCenterCol = !!document.querySelector('#center_col');
        const hasRso = !!document.querySelector('#rso');
        const bodyText = document.body?.innerText || '';
        const isCaptcha = bodyText.includes('reCAPTCHA') || bodyText.includes('检测到异常流量') || bodyText.includes('机器人') || location.href.includes('google.com/sorry/');
        
        const diagnosticMsg = `未能从页面提取内容（三层策略全部失败）。` +
          `页面标题: "${title}", ` +
          `h3 数量: ${h3Count}, ` +
          `是否有 center_col: ${hasCenterCol}, ` +
          `是否有 rso: ${hasRso}, ` +
          `是否检测到验证码/人机拦截: ${isCaptcha}, ` +
          `URL: ${location.href}`;

        window.postMessage({
          type: 'APOS_STREAM_ERROR',
          taskId,
          error: diagnosticMsg,
        }, '*');
        return;
      }

      // ── 格式化为 Markdown ────────────────────────────────────
      let markdown = '';
      if (aiOverview) {
        markdown += `${aiOverview}\n\n`;
      }
      markdown += `## References\n`;
      for (const r of merged) {
        markdown += `- [${r.title}](${r.url})${r.snippet ? `: ${r.snippet}` : ''}\n`;
      }

      // ── 发送结果 ────────────────────────────────────────────
      // 流式分块发送（避免 postMessage 单次传输过大数据）
      const chunkSize = 200; // 较小的分块大小，呈现更平滑的打字机流式效果
      for (let i = 0; i < markdown.length; i += chunkSize) {
        window.postMessage({
          type: 'APOS_STREAM_CHUNK',
          taskId,
          chunk: markdown.slice(i, i + chunkSize),
        }, '*');
        await new Promise(r => setTimeout(r, 10));
      }
      window.postMessage({ type: 'APOS_STREAM_DONE', taskId }, '*');

      console.log(
        `[APOS Google v2] ✅ 完成: ` +
        `AI=${!!aiOverview}, ${merged.length} 条结果, ` +
        `来源=[${[...sources].join('+')}]`
      );
    } catch (err) {
      console.error('[APOS Google v2] ❌ scrapeAndSend 异常:', err);
      window.postMessage({ type: 'APOS_STREAM_ERROR', taskId, error: err.message }, '*');
    }
  }


  // ══════════════════════════════════════════════════════════════
  // 任务处理
  // ══════════════════════════════════════════════════════════════

  // 比较两个查询词是否实质相同（忽略大小写、首尾空格、连续空格）
  function isSameQuery(q1, q2) {
    if (!q1 || !q2) return false;
    const clean = q => q.trim().toLowerCase().replace(/\s+/g, ' ');
    return clean(q1) === clean(q2);
  }

  async function handleTask(query, taskId) {
    // 检查是否是 Google 验证码/人机拦截页面
    if (location.pathname === '/sorry/index' || location.href.includes('google.com/sorry/')) {
      console.error('[APOS Google v2] ❌ 检测到 Google 人机验证 (reCAPTCHA) 页面，停止任务并报错');
      window.postMessage({
        type: 'APOS_STREAM_ERROR',
        taskId,
        error: `Google Search triggered reCAPTCHA. Please solve it in your open Chrome tab. URL: ${location.href}`,
      }, '*');
      return;
    }

    const params = new URLSearchParams(location.search);
    const currentQ = params.get('q');
    const currentUdm = params.get('udm');
    const isOnSearchPage = location.pathname === '/search';
    const queryMatched = isSameQuery(currentQ, query);

    console.log(
      `[APOS Google v2] 📋 收到任务: "${query}" (${taskId}). ` +
      `当前状态: isOnSearchPage=${isOnSearchPage}, currentQ="${currentQ}", currentUdm="${currentUdm}", 匹配=${queryMatched}`
    );

    if (!isOnSearchPage || !queryMatched || currentUdm !== '50') {
      // 不在对应的搜索结果页或不是 AI 模式，需要跳转
      try {
        sessionStorage.setItem('__apos_pending_search__', JSON.stringify({ taskId, query }));
      } catch (_) {}
      console.log(`[APOS Google v2] 🔄 正在重定向到 AI 搜索页面...`);
      window.location.assign(
        `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=50&hl=zh-CN`
      );
    } else {
      // 已在搜索结果页，直接抓取
      await scrapeAndSend(query, taskId);
    }
  }

  // ── 监听触发指令（来自 llm-content.js）────────────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const { type, taskId, prompt } = event.data || {};
    if (type === 'APOS_TRIGGER_CHAT') handleTask(prompt, taskId);
  });

  console.log('[APOS Google v2] 🛡️ 三层防线已就绪 (net + html + dom)');
})();
