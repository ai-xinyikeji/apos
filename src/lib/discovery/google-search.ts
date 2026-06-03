/**
 * Google Search Discovery
 *
 * 通过浏览器扩展在 Google 搜索页面直接解析结果，
 * 扩展输出格式化 JSON，服务端直接存库。
 *
 * 完全不消耗 LLM token —— 这就是接入 Google 搜索的目的。
 */

import { db } from '../db';
import { signals } from '../schema';
import { getExtProxyStore } from '../ext-proxy-store';

export interface GoogleSearchResult {
  query: string;
  aiOverview: string | null;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
}

export class GoogleSearchDiscovery {
  /**
   * 通过浏览器扩展搜索 Google，返回已格式化的结构化结果。
   * 扩展在浏览器里直接解析，服务端收到纯 JSON，零 token 消耗。
   */
  async search(query: string): Promise<GoogleSearchResult> {
    const store = getExtProxyStore();

    if (!store.isExtensionOnline()) {
      throw new Error(
        'Google 搜索需要浏览器扩展在线。请确保：\n' +
        '1. Chrome 中已加载 APOS 扩展\n' +
        '2. Chrome 中已打开 www.google.com（无需登录）\n' +
        '3. 扩展 Service Worker 处于活跃状态'
      );
    }

    const result = await store.dispatch('google', query);

    if (result.error) {
      throw new Error(`Google 搜索失败: ${result.error}`);
    }

    const raw = result.text ?? '';
    if (!raw) {
      throw new Error('Google 搜索返回内容为空');
    }

    // 扩展返回 Markdown 或 JSON，解析为结构化结果，无需 LLM
    return this.parseResponse(raw, query);
  }

  /**
   * 解析扩展返回的响应（Markdown 优先，兼容旧 JSON 格式）。
   *
   * 新格式（Markdown）：
   *   AI Overview 文本
   *   ## References
   *   - [title](url): snippet
   *
   * 旧格式（JSON）：
   *   { query, aiOverview, results: [{title, url, snippet}] }
   */
  private parseResponse(raw: string, query: string): GoogleSearchResult {
    // 新格式：Markdown 文本
    // AI Overview = ## References 之前的所有内容
    // Results = ## References 之后的 [title](url): snippet 行

    const refSplit = raw.split(/\n## (?:References|参考来源)\n/);
    const aiOverview = refSplit[0]?.trim() || null;

    const results: Array<{title: string; url: string; snippet: string}> = [];
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

    // 兼容旧的 JSON 格式
    if (!aiOverview && results.length === 0) {
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/g);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[jsonMatch.length - 1]);
          return {
            query: parsed.query || query,
            aiOverview: typeof parsed.aiOverview === 'string' && parsed.aiOverview.length > 20
              ? parsed.aiOverview : null,
            results: Array.isArray(parsed.results)
              ? parsed.results.filter((r: any) => r.title && r.url) : [],
          };
        }
      } catch (_) {}
    }

    return {
      query,
      aiOverview: aiOverview && aiOverview.length > 20 ? aiOverview : null,
      results,
    };
  }

  /**
   * 搜索并把结果存入数据库（零 token 消耗）
   */
  async searchAndStore(query: string): Promise<number> {
    let result: GoogleSearchResult;
    try {
      result = await this.search(query);
    } catch (err: any) {
      console.warn('[GoogleSearchDiscovery] 搜索失败，跳过:', err.message);
      return 0;
    }

    let addedCount = 0;

    // 存储 AI Overview
    if (result.aiOverview) {
      try {
        await db.insert(signals).values({
          source: 'competitor',
          title: `Google AI 概览: ${query}`,
          content: result.aiOverview.slice(0, 2000),
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          status: 'pending',
          sentiment: 'neutral',
        });
        addedCount++;
      } catch (err) {
        console.error('[GoogleSearchDiscovery] 存储 AI Overview 失败:', err);
      }
    }

    // 存储前 3 条搜索结果
    for (const item of result.results.slice(0, 3)) {
      try {
        await db.insert(signals).values({
          source: 'competitor',
          title: item.title,
          content: item.snippet || item.title,
          url: item.url,
          status: 'pending',
          sentiment: 'neutral',
        });
        addedCount++;
      } catch (err) {
        console.error('[GoogleSearchDiscovery] 存储搜索结果失败:', err);
      }
    }

    return addedCount;
  }
}

export const googleSearchDiscovery = new GoogleSearchDiscovery();
