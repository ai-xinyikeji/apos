import { BaseAgent } from './base';
import { db } from '@/lib/db';
import { signals } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { generateText } from '@/lib/llm';
import fs from 'fs';
import path from 'path';

export interface ReportGeneratorInput {
  title?: string;
}

export class ReportGeneratorAgent extends BaseAgent<ReportGeneratorInput, { success: boolean; reportPath?: string; reportContent?: string }> {
  public readonly name = 'ReportGenerator';

  public async run(input: ReportGeneratorInput, runId: string) {
    const title = input.title || `需求洞察周报 - ${new Date().toLocaleDateString()}`;
    await this.trace(runId, '启动', 'info', '开始聚合未处理的用户反馈与竞品信号，生成产品周度分析报告...');

    try {
      const llm = await this.getLLM();
      
      // 1. Fetch pending signals
      await this.trace(runId, '查询待处理信号', 'info', '正在从 SQLite 检索所有状态为 [pending] 的待处理信号...');
      const pendingSignals = await db.select().from(signals).where(eq(signals.status, 'pending'));

      if (pendingSignals.length === 0) {
        await this.trace(runId, '无待处理信号', 'warning', '数据库中未发现任何待处理的需求信号。已中止报告生成。');
        return { success: true, reportContent: '目前没有新的待分析需求信号。' };
      }

      // 2. Fetch GitHub Trending & Competitor Gap Analysis
      let marketContext = '';
      try {
        await this.trace(runId, '开源市场趋势分析', 'info', '正在抓取 GitHub 热门项目并提取开源市场趋势...');
        const { githubTrendAnalyzer } = await import('@/lib/discovery/github');
        const trendsData = await githubTrendAnalyzer.extractInsights('typescript');
        
        await this.trace(runId, '对标竞品差距分析', 'info', '正在执行竞品差距分析 (Cursor, v0.dev, Bolt.new)...');
        const { competitorAnalyzer } = await import('@/lib/discovery/competitor');
        const gapData = await competitorAnalyzer.runGapAnalysis();
        
        marketContext = `
\n### 市场与竞品洞察 (Market & Competitor Insights):\n
1. 开源社区技术趋势:
${trendsData.trends.map((t: string) => `- ${t}`).join('\n')}
2. 对标竞品 GAP 分析差距点:
${gapData.gaps.map((g: string) => `- ${g}`).join('\n')}
`;
      } catch (marketErr: any) {
        console.warn('Failed to compile market insights for report:', marketErr);
      }

      await this.trace(runId, '信号综合分析', 'info', `聚合了 ${pendingSignals.length} 条待分析信号与市场洞察，正在调起 AI 提取业务趋势与设计灵感...`);

      // Format signals list for LLM context
      const signalsListText = pendingSignals.map((sig, i) => `
[信号 #${i + 1}]
- 标题: ${sig.title}
- 来源: ${sig.source.toUpperCase()}
- 用户情绪: ${sig.sentiment || '中性'}
- 详细内容: ${sig.content}
`).join('\n');

      const prompt = `
You are a Lead Product Manager. Analyze the following user feedback signals, market tech trends, and competitor gap analyses.
Generate a comprehensive, professional Product Insight Report in Markdown.

Write the report in Chinese, following this structure:
1. **📌 执行摘要 (Executive Summary)**: Overview of recent user feedback trends, market trends, and competitor actions.
2. **🔍 核心洞察 (Core Insights)**: Extract 2-3 major themes or friction points from user signals and market trends.
3. **💡 建议启动的开发原型 (Proposed Prototypes)**: Suggest specific features or prototypes we should build to resolve these issues or close competitor gaps. For each recommendation, provide:
   - **原型名称**: A short, clear name
   - **实现方案**: Technical scope or component recommendations
4. **📊 市场与竞品分析 (Market & Competitor Analysis)**: Summary of gaps compared to Cursor/v0/Bolt.new and opportunities.
5. **📊 用户情绪大盘 (Sentiment Analysis)**: Summary of user feelings (positive/negative ratio) if signals are present.

Signals List:
${signalsListText || '（目前数据库无新增用户反馈信号）'}

${marketContext}
`;

      const { text, usage } = await generateText({
        model: llm.model,
        prompt,
      });

      if (usage) {
        await this.trace(runId, 'Token 使用统计', 'info', `周报生成 Token 消耗: Prompt=${usage.inputTokens}, Completion=${usage.outputTokens}`, {
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens
        });
      }

      // 2. Ensure data/reports directory exists
      const reportsDir = path.join(process.cwd(), 'data', 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      // Save to local file
      const filename = `report-${Date.now()}.md`;
      const reportPath = path.join(reportsDir, filename);
      fs.writeFileSync(reportPath, text, 'utf8');
      
      await this.trace(runId, '报告存盘', 'success', `报告已成功存盘为本地 Markdown: data/reports/${filename}`);

      // 3. Mark processed signals as analyzed
      await this.trace(runId, '更新信号状态', 'info', '正在批量更新处理过的信号状态为已分析 [analyzed]...');
      for (const sig of pendingSignals) {
        await db.update(signals)
          .set({ status: 'analyzed', updatedAt: new Date().toISOString() })
          .where(eq(signals.id, sig.id));
      }

      // 4. Save report content in trace step details for UI fetch
      await this.trace(runId, '生成报告', 'success', `成功生成报告: ${title}`, text);

      return { success: true, reportPath, reportContent: text };

    } catch (error: any) {
      console.error('ReportGenerator Agent error:', error);
      await this.trace(runId, '生成失败', 'error', `生成洞察报告遭遇致命错误: ${error.message}`);
      return { success: false };
    }
  }
}
