/**
 * GitHub Trend Analyzer
 * Fetches trending projects and analyzes market insights using LLM.
 */

import { generateText } from '../llm';

export interface GitHubRepo {
  name: string;
  owner: string;
  description: string;
  stars: number;
  language: string;
  url: string;
}

export class GitHubTrendAnalyzer {
  /**
   * Fetches trending repositories from GitHub.
   */
  async fetchTrending(language: string = 'typescript'): Promise<GitHubRepo[]> {
    try {
      // Fetch using GitHub Search API (trending-like query sorted by stars created recently)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const dateStr = oneWeekAgo.toISOString().split('T')[0];
      
      const query = `language:${language} created:>${dateStr}`;
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'APOS-Discovery-Agent',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.items || []).map((item: any) => ({
        name: item.name,
        owner: item.owner.login,
        description: item.description || '',
        stars: item.stargazers_count,
        language: item.language,
        url: item.html_url,
      }));
    } catch (error) {
      console.warn('GitHub API trending fetch failed, using fallback mock data:', error);
      // Fallback trending data
      return [
        {
          name: 'nextjs-saas-template',
          owner: 'vercel',
          description: 'A complete SaaS template ready to deploy on Vercel with Stripe, Tailwind, and Supabase.',
          stars: 1200,
          language: 'TypeScript',
          url: 'https://github.com/vercel/nextjs-saas-template',
        },
        {
          name: 'shadcn-ui-blocks',
          owner: 'shadcn',
          description: 'A collection of copy-paste blocks built with Tailwind CSS and Radix UI.',
          stars: 940,
          language: 'TypeScript',
          url: 'https://github.com/shadcn/ui',
        },
        {
          name: 'lancedb-js',
          owner: 'lancedb',
          description: 'Serverless vector database for Javascript and Node.js.',
          stars: 450,
          language: 'TypeScript',
          url: 'https://github.com/lancedb/lancedb',
        }
      ];
    }
  }

  /**
   * Generates insight reports using LLM from trending repos.
   */
  async extractInsights(language: string = 'typescript'): Promise<{
    trends: string[];
    report: string;
  }> {
    const repos = await this.fetchTrending(language);
    const reposSummary = repos
      .map(r => `- **${r.owner}/${r.name}** (${r.stars} stars): ${r.description} (URL: ${r.url})`)
      .join('\n');

    const prompt = `
You are a product management assistant. Below is the list of top trending repositories in the past week:
${reposSummary}

Please analyze these repositories and write a Market Trends Insight Report.
Identify:
1. The dominant themes or products being built (e.g. AI tools, templates, databases).
2. Emerging technology stacks or conventions.
3. Opportunities for our platform to build new templates or prototypes.

Provide the response as a JSON block structured like:
\`\`\`json
{
  "trends": [
    "Trend 1 description",
    "Trend 2 description"
  ],
  "report": "... detailed markdown report ..."
}
\`\`\`
`;

    try {
      const { getLLMClient } = await import('../llm');
      const activeClient = await getLLMClient('ReportGenerator');
      
      const { text } = await generateText({
        model: activeClient.model,
        prompt,
      });

      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
      const jsonStr = jsonMatch[1]?.trim() || text.trim();
      const parsed = JSON.parse(jsonStr);

      return {
        trends: parsed.trends || [],
        report: parsed.report || 'Unable to generate analysis report content.',
      };
    } catch (err: any) {
      console.error('Failed to extract trends insights:', err);
      return {
        trends: ['AI Saas templates', 'Local vector memory databases'],
        report: `Error generating report: ${err.message}`,
      };
    }
  }
}

// Singleton instance
export const githubTrendAnalyzer = new GitHubTrendAnalyzer();
