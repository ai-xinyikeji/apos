/**
 * Auto UI Optimizer
 * Analyzes component usage metrics and user sentiment, query LLMs for recommendations, and proposes code modifications.
 */

import { metricsCollector } from './metrics';
import { db } from '../db';
import { signals } from '../schema';
import { generateText } from '../llm';
import { eq, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export interface OptimizationResult {
  componentName: string;
  metricSummary: {
    uses: number;
    avgDuration?: number;
    sentimentScore: number;
  };
  analysis: string;
  codeSuggestions: Array<{
    filePath: string;
    description: string;
    originalCodeSnippet: string;
    optimizedCodeSnippet: string;
  }>;
}

export class UIOptimizer {
  /**
   * Run optimization suggestions for a specific component.
   */
  async optimizeComponent(componentName: string, filePath: string): Promise<OptimizationResult | null> {
    if (!fs.existsSync(filePath)) {
      console.warn(`File ${filePath} not found for optimization`);
      return null;
    }

    // 1. Gather metrics
    const usage = await metricsCollector.getFeatureUsage(30);
    const componentUsage = usage.find(u => u.feature.toLowerCase().includes(componentName.toLowerCase()));
    const usesCount = componentUsage ? componentUsage.count : 0;
    const avgDuration = componentUsage ? componentUsage.avgDuration : 0;

    // Gather sentiment signals from database
    let sentimentScore = 50; // default neutral
    try {
      const relatedSignals = await db
        .select()
        .from(signals)
        .where(eq(signals.status, 'analyzed'));
      
      const filtered = relatedSignals.filter(s =>
        s.title.toLowerCase().includes(componentName.toLowerCase()) ||
        s.content.toLowerCase().includes(componentName.toLowerCase())
      );

      if (filtered.length > 0) {
        const positives = filtered.filter(s => s.sentiment === 'positive').length;
        const negatives = filtered.filter(s => s.sentiment === 'negative').length;
        sentimentScore = ((positives - negatives) / filtered.length) * 50 + 50;
      }
    } catch (e) {
      console.error('Failed to query signals for sentiment scoring:', e);
    }

    // 2. Read component code
    const originalCode = fs.readFileSync(filePath, 'utf8');

    // 3. Ask LLM for UI/UX optimization suggestions
    const prompt = `
You are a senior UI/UX engineer and React expert.
We want to optimize the frontend component "${componentName}" located at:
File: ${filePath}

Performance Metrics (last 30 days):
- Usage Count: ${usesCount}
- Average Interaction Time: ${avgDuration ? avgDuration.toFixed(1) + 'ms' : 'N/A'}
- Sentiment Score: ${sentimentScore}/100 (higher means better sentiment feedback)

Original Component Code:
\`\`\`tsx
${originalCode}
\`\`\`

Analyze the code and metric parameters. Generate an optimization report with design recommendations (such as enhancing Tailwind styles, improving micro-animations, simplifying UI hierarchy, or fixing contrast/spacing).
Provide your suggestions as a JSON block with:
1. An overall analysis text.
2. A list of code replacements containing originalCodeSnippet and optimizedCodeSnippet.

Output format:
\`\`\`json
{
  "analysis": "... detailed analysis ...",
  "codeSuggestions": [
    {
      "filePath": "${filePath}",
      "description": "... description of tweak ...",
      "originalCodeSnippet": "exact code from original tsx",
      "optimizedCodeSnippet": "optimized replacement code"
    }
  ]
}
\`\`\`
`;

    try {
      const activeClient = await getLLMClientForOptimizer();
      const { text } = await generateText({
        model: activeClient.model,
        prompt,
      });

      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
      const jsonStr = jsonMatch[1]?.trim() || text.trim();
      const parsed = JSON.parse(jsonStr);

      return {
        componentName,
        metricSummary: {
          uses: usesCount,
          avgDuration,
          sentimentScore,
        },
        analysis: parsed.analysis,
        codeSuggestions: parsed.codeSuggestions || [],
      };
    } catch (err: any) {
      console.error('LLM UI Optimization failed:', err);
      return {
        componentName,
        metricSummary: { uses: usesCount, sentimentScore },
        analysis: `Failed to execute LLM Optimization: ${err.message}`,
        codeSuggestions: [],
      };
    }
  }
}

/**
 * Get LLM client for Optimizer
 */
async function getLLMClientForOptimizer() {
  const { getLLMClient } = await import('../llm');
  return await getLLMClient('UIOptimizer');
}

// Singleton instance
export const uiOptimizer = new UIOptimizer();
