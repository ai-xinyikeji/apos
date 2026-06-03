/**
 * Feature Ranking System
 * Ranks features based on usage, sentiment, and business value
 */

import { metricsCollector } from './metrics';
import { db } from '../db';
import { signals } from '../schema';
import { eq, and, gte } from 'drizzle-orm';

export interface FeatureScore {
  feature: string;
  score: number;
  usage: number;
  sentiment: number;
  recency: number;
  recommendation: 'expand' | 'maintain' | 'improve' | 'deprecate';
  reasoning: string;
}

export class FeatureRanker {
  /**
   * Calculate feature scores
   */
  async rankFeatures(days: number = 30): Promise<FeatureScore[]> {
    // Get usage data
    const usageData = await metricsCollector.getFeatureUsage(days);
    
    // Get sentiment data from signals
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const sentimentData = await db
      .select()
      .from(signals)
      .where(
        and(
          gte(signals.createdAt, cutoffDate.toISOString()),
          eq(signals.status, 'analyzed')
        )
      );
    
    // Calculate scores for each feature
    const scores: FeatureScore[] = [];
    
    for (const usage of usageData) {
      // Usage score (0-100)
      const maxUsage = Math.max(...usageData.map(u => u.count));
      const usageScore = (usage.count / maxUsage) * 100;
      
      // Recency score (0-100)
      const daysSinceLastUse = Math.floor(
        (Date.now() - usage.lastUsed.getTime()) / (1000 * 60 * 60 * 24)
      );
      const recencyScore = Math.max(0, 100 - (daysSinceLastUse * 10));
      
      // Sentiment score (0-100)
      const relatedSignals = sentimentData.filter(s => 
        s.title.toLowerCase().includes(usage.feature.toLowerCase()) ||
        s.content.toLowerCase().includes(usage.feature.toLowerCase())
      );
      
      let sentimentScore = 50; // neutral default
      if (relatedSignals.length > 0) {
        const positiveCount = relatedSignals.filter(s => s.sentiment === 'positive').length;
        const negativeCount = relatedSignals.filter(s => s.sentiment === 'negative').length;
        const totalCount = relatedSignals.length;
        
        sentimentScore = ((positiveCount - negativeCount) / totalCount) * 50 + 50;
      }
      
      // Overall score (weighted average)
      const overallScore = 
        usageScore * 0.4 +      // 40% weight on usage
        sentimentScore * 0.3 +  // 30% weight on sentiment
        recencyScore * 0.3;     // 30% weight on recency
      
      // Recommendation
      let recommendation: 'expand' | 'maintain' | 'improve' | 'deprecate';
      let reasoning: string;
      
      if (overallScore >= 75) {
        recommendation = 'expand';
        reasoning = '高使用率和正面反馈，建议扩展功能';
      } else if (overallScore >= 50) {
        recommendation = 'maintain';
        reasoning = '稳定使用，保持现状';
      } else if (overallScore >= 25) {
        recommendation = 'improve';
        reasoning = '使用率或满意度较低，需要改进';
      } else {
        recommendation = 'deprecate';
        reasoning = '低使用率和负面反馈，考虑废弃';
      }
      
      scores.push({
        feature: usage.feature,
        score: Math.round(overallScore),
        usage: Math.round(usageScore),
        sentiment: Math.round(sentimentScore),
        recency: Math.round(recencyScore),
        recommendation,
        reasoning,
      });
    }
    
    // Sort by score descending
    return scores.sort((a, b) => b.score - a.score);
  }
  
  /**
   * Get top features
   */
  async getTopFeatures(limit: number = 10, days: number = 30): Promise<FeatureScore[]> {
    const allScores = await this.rankFeatures(days);
    return allScores.slice(0, limit);
  }
  
  /**
   * Get features to improve
   */
  async getFeaturesToImprove(days: number = 30): Promise<FeatureScore[]> {
    const allScores = await this.rankFeatures(days);
    return allScores.filter(s => s.recommendation === 'improve');
  }
  
  /**
   * Get features to deprecate
   */
  async getFeaturesToDeprecate(days: number = 30): Promise<FeatureScore[]> {
    const allScores = await this.rankFeatures(days);
    return allScores.filter(s => s.recommendation === 'deprecate');
  }
  
  /**
   * Generate feature report using AI for deep analytical product growth recommendations
   */
  async generateReport(days: number = 30): Promise<string> {
    const scores = await this.rankFeatures(days);
    const pageViews = await metricsCollector.getPageViews(days);
    const agentStats = await metricsCollector.getAgentStats(days);
    const dailyActive = await metricsCollector.getDailyActiveUsage(days);

    // Get signals in the period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let recentSignals: any[] = [];
    try {
      recentSignals = await db
        .select()
        .from(signals)
        .where(gte(signals.createdAt, cutoffDate.toISOString()));
    } catch (e) {
      console.error('Failed to fetch signals for report:', e);
    }

    // Format metrics into structured text
    const scoresText = scores.map(s => 
      `- **${s.feature}**: Overall Score = ${s.score}/100 (Usage = ${s.usage}, Sentiment = ${s.sentiment}, Recency = ${s.recency}). Recommendation = ${s.recommendation}. Reason: ${s.reasoning}`
    ).join('\n');

    const pageViewsText = pageViews.map(p => `- ${p.page}: ${p.views} views`).join('\n');
    const agentStatsText = agentStats.map(a => `- ${a.agentName}: Executions = ${a.totalExecutions}, Success Rate = ${a.successRate.toFixed(1)}%, Avg Duration = ${a.avgDuration.toFixed(0)}ms`).join('\n');
    
    const signalsText = recentSignals.map((s, i) => 
      `Signal #${i+1}: [${s.source}] ${s.title} (${s.sentiment || 'neutral'}) - ${s.content.slice(0, 150)}`
    ).join('\n');

    const prompt = `
You are a Principal Product Growth Manager. Analyze the following application metrics and user feedback signals for the last ${days} days.
Provide a highly professional, data-driven Product Growth and Iteration Report.

Write the report in Chinese and format it in clean Markdown. It should contain:
1. **📌 核心增长概览 (Growth Overview)**: An executive summary of the product's growth health, including user activity trends (we have ${dailyActive.length} active usage records) and overall conversion/interaction rates.
2. **🔍 页面访问与体验瓶颈 (Friction Points)**: Analyze the page view data. Highlight pages with potential drop-offs.
3. **💡 核心功能深度评估 (Feature Deep Dive)**: Detail the top performing features, which ones to prioritize, which ones need optimization (the "improve" recommendations), and what to do with deprecated features.
4. **📊 用户反馈与情绪透视 (Sentiment Insights)**: Summarize feedback signals, what features users praise, and where they encounter pain points.
5. **🛠️ 具体的版本迭代与行动指南 (Roadmap & Action Items)**: Give 3-4 concrete, prioritized steps for the next iteration (e.g. modify specific UI behaviors, add onboarding tips, or expand specific agent capabilities).

---
METRICS DATA:

[Feature Scores & Recommendations]
${scoresText || 'No feature ranking data.'}

[Page Views]
${pageViewsText || 'No page view data.'}

[Agent Execution Stats]
${agentStatsText || 'No agent execution data.'}

[Recent User Feedback & Market Signals]
${signalsText || 'No recent user signals.'}
`;

    try {
      const { getLLMClient, generateText, routeModel } = await import('../llm');
      let activeClient = await getLLMClient('ReportGenerator');
      
      let text: string;
      try {
        const result = await generateText({
          model: activeClient.model,
          prompt,
        });
        text = result.text;
      } catch (llmErr: any) {
        const msg: string = llmErr?.message || '';
        const is404 = msg === 'Not Found' || msg === '404' || msg.startsWith('404 ') || llmErr?.status === 404 || llmErr?.statusCode === 404;
        if (is404) {
          console.warn('[FeatureRanker] Primary model 404, switching to fallback...');
          activeClient = await routeModel('default');
          const result = await generateText({ model: activeClient.model, prompt });
          text = result.text;
        } else {
          throw llmErr;
        }
      }

      return text;
    } catch (err: any) {
      console.error('AI Report Generation failed, falling back to rule-based report:', err);
      // Fallback to basic report
      let report = `# Feature Ranking Report (Rule-based Fallback)\n\n`;
      report += `**Period**: Last ${days} days\n`;
      report += `**Generated**: ${new Date().toISOString()}\n\n`;
      report += `AI generation failed: ${err.message}\n\n`;
      report += `## Top Features\n\n`;
      for (const feature of scores.slice(0, 10)) {
        report += `- **${feature.feature}**: Score ${feature.score}/100, Rec: ${feature.recommendation} (${feature.reasoning})\n`;
      }
      return report;
    }
  }
}

// Singleton instance
export const featureRanker = new FeatureRanker();
