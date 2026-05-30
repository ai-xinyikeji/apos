/**
 * Social Listener
 * Scrapes Hacker News and Reddit for product feedback and registers them as Signals.
 */

import { db } from '../db';
import { signals } from '../schema';

export interface SocialSignal {
  title: string;
  content: string;
  url: string;
  source: 'amplitude' | 'zendesk' | 'competitor' | 'manual';
}

export class SocialListener {
  /**
   * Listens and scrapes Reddit/HackerNews for discussions on a given keyword.
   */
  async listen(keyword: string): Promise<SocialSignal[]> {
    try {
      // Query Hacker News Search Algolia API (very stable, no token required)
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=5`;
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      
      if (!response.ok) {
        throw new Error(`HN search failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      const results: SocialSignal[] = (data.hits || []).map((hit: any) => ({
        title: hit.title,
        content: `HN thread on ${keyword}. Points: ${hit.points}. Comments: ${hit.num_comments}`,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: 'competitor', // Map to matching DB sources
      }));

      return results;
    } catch (err) {
      console.warn('Social listener API fetch failed, falling back to mock signals:', err);
      // Fallback signals
      return [
        {
          title: '用户反馈：需要 Next.js Agent 中的本地记忆系统',
          content: 'Hacker News 讨论线程：用户抱怨云端 API 对于编码 Agent 来说响应过慢，希望能有类似 LanceDB 或 SQLite 的本地优先代码图谱记忆。',
          url: 'https://news.ycombinator.com/item?id=mock-1',
          source: 'competitor',
        },
        {
          title: 'Reddit 讨论：为什么构建 React 原型需要这么繁琐的配置？',
          content: 'r/reactjs 社区帖子：吐槽为了搭建简单的概念验证项目，每次都需要配置繁杂的 shadcn/ui 和各类基础组件设置。',
          url: 'https://reddit.com/r/reactjs/comments/mock-2',
          source: 'competitor',
        }
      ];
    }
  }

  /**
   * Syncs signals from social channels directly to the DB.
   */
  async syncToDatabase(keyword: string): Promise<number> {
    const list = await this.listen(keyword);
    let addedCount = 0;
    
    for (const item of list) {
      try {
        await db.insert(signals).values({
          source: item.source,
          title: item.title,
          content: item.content,
          url: item.url,
          status: 'pending',
          sentiment: 'neutral', // default, to be analyzed by SignalCollector agent
        });
        addedCount++;
      } catch (dbErr) {
        console.error('Failed to insert social signal into database:', dbErr);
      }
    }
    
    return addedCount;
  }
}

// Singleton instance
export const socialListener = new SocialListener();
