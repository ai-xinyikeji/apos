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

IMPORTANT: Return ONLY a valid JSON object, without any markdown code blocks or extra formatting.
Do NOT wrap the JSON in \`\`\`json or \`\`\` markers.

Expected output format (return exactly in this format):
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
`;

    try {
      let activeClient = await getLLMClientForOptimizer();
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
          console.warn('[UIOptimizer] Primary model 404, switching to fallback...');
          const { routeModel } = await import('../llm');
          activeClient = await routeModel('default');
          const result = await generateText({ model: activeClient.model, prompt });
          text = result.text;
        } else {
          throw llmErr;
        }
      }

      // Parse JSON from text - handle multiple formats
      let jsonStr = text.trim();
      
      // Remove markdown code blocks if present (handles ```json, ```, and other variations)
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      // Remove any leading/trailing whitespace or newlines
      jsonStr = jsonStr.trim();
      
      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
        
        // Validate structure
        if (!parsed.analysis || typeof parsed.analysis !== 'string') {
          throw new Error('Missing or invalid "analysis" field in LLM response');
        }
        
        // Ensure codeSuggestions is an array
        if (!Array.isArray(parsed.codeSuggestions)) {
          console.warn('codeSuggestions is not an array, setting to empty array');
          parsed.codeSuggestions = [];
        }
        
        // Validate each code suggestion
        for (const suggestion of parsed.codeSuggestions) {
          if (!suggestion.description || !suggestion.originalCodeSnippet || !suggestion.optimizedCodeSnippet) {
            console.warn('Invalid code suggestion detected, missing required fields:', suggestion);
          }
          // Auto-fill filePath if missing
          if (!suggestion.filePath) {
            suggestion.filePath = filePath;
          }
        }
        
      } catch (parseErr: any) {
        console.error('JSON parsing failed. Raw LLM response:', text);
        throw new Error(`LLM generated invalid JSON structure: ${parseErr.message}`);
      }

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
