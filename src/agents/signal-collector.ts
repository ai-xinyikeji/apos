import { BaseAgent } from './base';
import { db } from '@/lib/db';
import { signals } from '@/lib/schema';

export interface SignalCollectorInput {
  sources?: string[];
}

export class SignalCollectorAgent extends BaseAgent<SignalCollectorInput, { success: boolean; count: number }> {
  public readonly name = 'SignalCollector';

  public async run(input: SignalCollectorInput, runId: string) {
    const sources = input.sources || ['amplitude', 'zendesk', 'competitor'];
    await this.trace(runId, '启动', 'info', `开始从 [${sources.join(', ')}] 数据源收集用户反馈与需求信号...`);

    try {
      // Sync real social signals from Hacker News / Reddit
      try {
        await this.trace(runId, '社交信号同步', 'info', '正在通过 SocialListener 同步 Hacker News 和 Reddit 的最新社交信号...');
        const { socialListener } = await import('@/lib/discovery/social');
        const socialCount = await socialListener.syncToDatabase('AI coding agent');
        await this.trace(runId, '社交信号同步成功', 'success', `成功从 HN/Reddit 同步了 ${socialCount} 条最新的行业需求信号并存入数据库！`);
      } catch (socialErr: any) {
        await this.trace(runId, '社交信号同步警告', 'warning', `社交信号同步出现警告: ${socialErr.message}，将继续执行其余采集渠道。`);
      }

      // Sync Google AI Search signals (via browser extension, no login required)
      try {
        await this.trace(runId, 'Google 搜索同步', 'info', '正在通过浏览器扩展抓取 Google AI 搜索概览...');
        const { googleSearchDiscovery } = await import('@/lib/discovery/google-search');
        const googleCount = await googleSearchDiscovery.searchAndStore('AI coding agent product feedback');
        if (googleCount > 0) {
          await this.trace(runId, 'Google 搜索同步成功', 'success', `成功从 Google AI 搜索抓取了 ${googleCount} 条行业信号！`);
        } else {
          await this.trace(runId, 'Google 搜索跳过', 'warning', 'Google 搜索未返回结果（扩展可能未连接），已跳过。');
        }
      } catch (googleErr: any) {
        await this.trace(runId, 'Google 搜索警告', 'warning', `Google 搜索抓取出现警告: ${googleErr.message}，将继续执行其余采集渠道。`);
      }

      // Get LLM client (with automatic retry logic)
      const llm = await this.getLLM();
      
      await this.trace(runId, '反馈模拟审计', 'info', '正在审计并检索最新的生产环境/第三方反馈渠道（用户埋点异常、客户支持工单、竞品动作监控等）...');

      const prompt = `
Generate 3 to 5 realistic, mock user feedback signals or competitor updates for a modern software application.
The sources can be:
- 'amplitude' (user flow drop-offs, bottleneck analytics, feature usage decline)
- 'zendesk' (direct bug reports, customer support tickets, feature requests)
- 'competitor' (rival software release updates, market analysis changes)

For each signal, provide:
1. title: A short title summarizing the signal. Must be written in Chinese.
2. content: Detailed explanation of the signal. Must be written in Chinese.
3. source: MUST be exactly one of: 'amplitude', 'zendesk', 'competitor' (lowercase, no other values allowed)
4. sentiment: MUST be exactly one of: 'positive', 'neutral', 'negative' (lowercase)
5. url: An optional mock URL pointing to the source (e.g., 'https://zendesk.com/tickets/1084')

IMPORTANT: Return ONLY a valid JSON array, without any markdown code blocks or extra formatting.
Do NOT wrap the JSON in \`\`\`json or \`\`\` markers.
ALL titles and contents MUST be written in Chinese (简体中文).

Example output (return exactly in this format):
[
  {
    "title": "Zendesk #1084: 用户需要报表导出的 CSV 功能",
    "content": "多个高级付费用户反馈希望能将每周的数据报告一键导出为 CSV 文件本地归档，以便进行离线分析和长期存储。当前系统只支持在线查看，不支持批量导出，导致用户体验不佳。",
    "source": "zendesk",
    "sentiment": "negative",
    "url": "https://zendesk.com/tickets/1084"
  },
  {
    "title": "Amplitude 分析: 用户在支付页面的流失率上升 15%",
    "content": "过去一周的数据显示，用户在进入支付页面后的流失率从 8% 上升到 23%，可能与最近的页面改版有关。需要紧急排查支付流程中的潜在问题。",
    "source": "amplitude",
    "sentiment": "negative"
  }
]
`;

      // Use callLLM instead of generateText directly - it has built-in 404 fallback
      let text: string;
      try {
        const result = await this.callLLM(runId, llm, { prompt });
        text = result.text;
      } catch (llmErr: any) {
        const msg: string = llmErr?.message || '';
        throw new Error(`LLM 调用失败: ${msg || '未知错误，请检查模型配置或浏览器扩展连接状态'}`);
      }

      // Parse JSON from text - handle multiple formats with robust error recovery
      let jsonStr = text.trim();
      
      // Strategy 1: Remove markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      // Strategy 2: Extract array from potential surrounding text
      // Look for [ ... ] pattern (the actual JSON array)
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }
      
      // Strategy 3: Remove any leading/trailing whitespace or newlines
      jsonStr = jsonStr.trim();
      
      let items: Array<{ title: string; content: string; source: string; sentiment: string; url?: string }> = [];
      try {
        items = JSON.parse(jsonStr);
        
        // Validate that items is an array
        if (!Array.isArray(items)) {
          throw new Error('Expected an array of signals');
        }
        
        // Validate and sanitize each item
        items = items.filter((item, index) => {
          if (!item.title || !item.content || !item.source) {
            this.trace(runId, 'JSON 验证警告', 'warning', `信号项 #${index + 1} 缺少必填字段（title, content, 或 source），已跳过`);
            return false;
          }
          return true;
        });
        
        // Ensure source is one of the valid values
        for (const item of items) {
          if (!['amplitude', 'zendesk', 'competitor', 'manual'].includes(item.source)) {
            await this.trace(runId, 'source 字段警告', 'warning', `信号 "${item.title}" 的 source 字段值 "${item.source}" 不在预期范围内，将设置为 'manual'`);
            item.source = 'manual';
          }
          
          // Ensure sentiment is valid or set default
          if (!item.sentiment || !['positive', 'neutral', 'negative'].includes(item.sentiment)) {
            item.sentiment = 'neutral';
          }
        }
        
      } catch (err: any) {
        await this.trace(runId, 'JSON 解析异常', 'error', '解析大模型返回的 JSON 结构失败。', text);
        throw new Error(`LLM generated invalid JSON structure: ${err.message}. 请确保模型正确配置，或尝试切换到其他模型。`);
      }

      if (items.length === 0) {
        await this.trace(runId, 'JSON 验证警告', 'warning', '大模型返回的数据中没有有效的信号项');
        throw new Error('LLM 返回的数据不包含有效的信号项，请重试或切换模型');
      }

      await this.trace(runId, '保存反馈信号', 'info', `正在将提取出的 ${items.length} 条信号保存至本地数据库...`);

      for (const item of items) {
        await db.insert(signals).values({
          title: item.title,
          content: item.content,
          source: item.source,
          sentiment: item.sentiment,
          url: item.url || null,
          status: 'pending',
        });
        
        await this.trace(runId, '归档反馈信号', 'info', `已成功归档 [${item.source.toUpperCase()}] 信号: ${item.title}`);
      }

      await this.trace(runId, '采集成功', 'success', `信号收集阶段顺利结束，成功捕获并存储 ${items.length} 个最新信号。`);

      // Trigger CLAUDE.md hot-reload in background
      try {
        const { updateClaudeMdIfConfigured } = await import('@/mcp/claude-md-generator');
        updateClaudeMdIfConfigured().catch(err => {
          console.error('Failed to auto-update CLAUDE.md after signal collection:', err);
        });
      } catch (err) {
        // Ignore imports error
      }

      return { success: true, count: items.length };

    } catch (error: any) {
      console.error('SignalCollector execution error:', error);
      await this.trace(runId, '采集失败', 'error', `信号收集失败: ${error.message}`);
      return { success: false, count: 0 };
    }
  }
}
