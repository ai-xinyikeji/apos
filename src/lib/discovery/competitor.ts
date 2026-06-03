/**
 * Competitor Analyzer
 * Runs GAP analysis between APOS features and industry competitors like Cursor, Bolt.new, and V0.
 */

import { generateText } from '../llm';

export interface CompetitorProfile {
  name: string;
  strengths: string[];
  features: string[];
}

export class CompetitorAnalyzer {
  private getCompetitors(): CompetitorProfile[] {
    return [
      {
        name: 'Cursor',
        strengths: ['Tab auto-complete', 'Chat context index', 'Composer multi-file edits'],
        features: ['Composer', 'Terminal integration', 'MCP support', 'Codebase index (SQLite)'],
      },
      {
        name: 'v0.dev',
        strengths: ['Stunning UI design generation', 'shadcn/ui compatibility', 'Vercel deployment'],
        features: ['Multimodal UI generation', 'Chat-to-UI UI editor', 'Code download'],
      },
      {
        name: 'Bolt.new',
        strengths: ['WebContainers in-browser execution', 'Instant full-stack previews', 'Auto-dependency installs'],
        features: ['In-browser editor', 'Preview panel', 'Terminal', 'Deploy to Netlify/Vercel'],
      }
    ];
  }

  /**
   * Run GAP Analysis against APOS's current capabilities.
   */
  async runGapAnalysis(): Promise<{
    gaps: string[];
    report: string;
  }> {
    const competitors = this.getCompetitors();
    
    // Formulate a prompt with competitor profiles
    const competitorsSummary = competitors
      .map(c => `Competitor: ${c.name}\n- Strengths: ${c.strengths.join(', ')}\n- Features: ${c.features.join(', ')}`)
      .join('\n\n');

    const prompt = `
You are a senior product manager. Analyze the following competitor profiles in the AI Web Development / Coding Agents space:

${competitorsSummary}

Our platform, APOS (AI Product OS), has the following features:
- Multi-agent system (ProtoBuilder, SignalCollector, ReviewBot, ReportGenerator)
- Parallel Task DAG executor with dependency management
- Hybrid Vector & Code Graph Memory System (LanceDB + SQLite)
- Auto A/B Testing & UI/UX Optimizers

Perform a GAP Analysis between APOS and these competitors. Identify:
1. Key features we are missing (Gaps).
2. Recommendations on what features we should prioritize next to win (e.g. WebContainer support, preview servers, live editing).
3. Draft a PM report detailing the findings.

Return the result as a JSON block with:
\`\`\`json
{
  "gaps": [
    "Gap 1 description",
    "Gap 2 description"
  ],
  "report": "... detailed PM markdown report ..."
}
\`\`\`
`;

    try {
      const { getLLMClient, generateText, routeModel } = await import('../llm');
      let activeClient = await getLLMClient('ReportGenerator');
      
      let text: string;
      try {
        const result = await generateText({ model: activeClient.model, prompt });
        text = result.text;
      } catch (llmErr: any) {
        const msg: string = llmErr?.message || '';
        const is404 = msg === 'Not Found' || msg === '404' || msg.startsWith('404 ') || llmErr?.status === 404 || llmErr?.statusCode === 404;
        if (is404) {
          console.warn('[CompetitorAnalyzer] Primary model 404, switching to fallback...');
          activeClient = await routeModel('default');
          const result = await generateText({ model: activeClient.model, prompt });
          text = result.text;
        } else {
          throw llmErr;
        }
      }

      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
      const jsonStr = jsonMatch[1]?.trim() || text.trim();
      const parsed = JSON.parse(jsonStr);

      return {
        gaps: parsed.gaps || [],
        report: parsed.report || 'Unable to generate analysis report.',
      };
    } catch (err: any) {
      console.error('Competitor gap analysis failed:', err);
      return {
        gaps: ['WebContainer preview support', 'Multi-file side-by-side Diff editor'],
        report: `Error executing competitor gap analysis: ${err.message}`,
      };
    }
  }
}

// Singleton instance
export const competitorAnalyzer = new CompetitorAnalyzer();
