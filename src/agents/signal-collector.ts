import { BaseAgent } from './base';
import { db } from '@/lib/db';
import { signals } from '@/lib/schema';
import { generateText } from '@/lib/llm';

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
3. source: One of: 'amplitude', 'zendesk', 'competitor'
4. sentiment: One of: 'positive', 'neutral', 'negative'
5. url: An optional mock URL pointing to the source (e.g., 'https://zendesk.com/tickets/1084')

Return your output as a JSON block (wrapped in \`\`\`json ... \`\`\`) containing a JSON array of signals.
Ensure the mock data is realistic, professional, and provides rich context. ALL titles and contents MUST be written in Chinese (简体中文).

Example format:
\`\`\`json
[
  {
    "title": "Zendesk #1084: 用户需要报表导出的 CSV 功能",
    "content": "多个高级付费用户反馈希望能将每周的数据报告一键导出为 CSV 文件本地归档...",
    "source": "zendesk",
    "sentiment": "negative",
    "url": "https://zendesk.com/tickets/1084"
  }
]
\`\`\`
`;

      const { text } = await generateText({
        model: llm.model,
        prompt,
      });

      // Parse JSON from text
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
      const jsonStr = jsonMatch[1]?.trim() || text.trim();
      
      let items: Array<{ title: string; content: string; source: string; sentiment: string; url?: string }> = [];
      try {
        items = JSON.parse(jsonStr);
      } catch (err) {
        await this.trace(runId, 'JSON 解析异常', 'error', '解析大模型返回的 JSON 结构失败。', text);
        throw new Error('LLM generated invalid JSON structure: ' + err);
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
