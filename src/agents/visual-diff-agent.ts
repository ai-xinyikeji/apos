/**
 * 视觉对比 Agent
 * 对比设计稿和实际实现的差异
 */

import { BaseAgent } from './base';
import { anthropic } from '@ai-sdk/anthropic';

export interface VisualDiffInput {
  designImage: string; // Base64 编码的设计稿
  implementationImage: string; // Base64 编码的实现截图
  imageMimeType?: string;
  checkAspects?: ('layout' | 'colors' | 'typography' | 'spacing' | 'components')[];
}

export interface VisualDiffOutput {
  overallScore: number; // 0-100，相似度评分
  differences: Difference[];
  recommendations: string[];
  report: string;
}

export interface Difference {
  category: 'layout' | 'colors' | 'typography' | 'spacing' | 'components' | 'other';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  location?: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
}

/**
 * 视觉对比 Agent
 */
export class VisualDiffAgent extends BaseAgent<VisualDiffInput, VisualDiffOutput> {
  name = 'VisualDiffAgent';

  async run(input: VisualDiffInput, runId: string): Promise<VisualDiffOutput> {
    this.registerProgressSteps(runId, [
      { name: 'init', weight: 5, status: 'pending' },
      { name: 'analyze_design', weight: 20, status: 'pending' },
      { name: 'analyze_implementation', weight: 20, status: 'pending' },
      { name: 'compare', weight: 40, status: 'pending' },
      { name: 'generate_report', weight: 10, status: 'pending' },
      { name: 'complete', weight: 5, status: 'pending' },
    ]);

    await this.trace(runId, 'init', 'info', '初始化视觉对比 Agent');
    this.updateProgressStep(runId, 'init', 'completed', '初始化完成');

    try {
      this.updateProgressStep(runId, 'analyze_design', 'running', '分析设计稿...');
      await this.trace(runId, 'analyze_design', 'info', '正在分析设计稿');
      this.updateProgressStep(runId, 'analyze_design', 'completed', '设计稿分析完成');

      this.updateProgressStep(runId, 'analyze_implementation', 'running', '分析实现截图...');
      await this.trace(runId, 'analyze_implementation', 'info', '正在分析实现截图');
      this.updateProgressStep(runId, 'analyze_implementation', 'completed', '实现分析完成');

      this.updateProgressStep(runId, 'compare', 'running', '对比差异...');
      const comparison = await this.compareImages(input, runId);
      this.updateProgressStep(runId, 'compare', 'completed', `发现 ${comparison.differences.length} 处差异`);

      this.updateProgressStep(runId, 'generate_report', 'running', '生成对比报告...');
      const report = await this.generateReport(comparison, runId);
      this.updateProgressStep(runId, 'generate_report', 'completed', '报告生成完成');

      await this.trace(runId, 'complete', 'success', '✅ 视觉对比完成', {
        score: comparison.overallScore,
        differencesCount: comparison.differences.length,
      });
      this.updateProgressStep(runId, 'complete', 'completed', '对比完成');

      return { ...comparison, report };
    } catch (error) {
      await this.trace(runId, 'error', 'error', '❌ 视觉对比失败', error);
      throw error;
    }
  }

  /**
   * 使用 Claude 对比两张图片
   */
  private async compareImages(
    input: VisualDiffInput,
    runId: string
  ): Promise<Omit<VisualDiffOutput, 'report'>> {
    // Single getLLM() call — reuse for both model check and callLLM
    const llm = await this.getLLM();

    // 确保使用支持多模态的模型
    const multimodalModel = llm.model.modelId?.includes('claude')
      ? anthropic('claude-3-5-sonnet-20241022')
      : llm.model;

    const checkAspects = input.checkAspects || [
      'layout',
      'colors',
      'typography',
      'spacing',
      'components',
    ];

    const result = await this.callLLM(runId, { ...llm, model: multimodalModel }, {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '**设计稿（期望）:**',
            },
            {
              type: 'image',
              image: input.designImage,
              mimeType: input.imageMimeType || 'image/png',
            },
            {
              type: 'text',
              text: '**实际实现:**',
            },
            {
              type: 'image',
              image: input.implementationImage,
              mimeType: input.imageMimeType || 'image/png',
            },
            {
              type: 'text',
              text: `请详细对比这两张图片，找出所有差异。

重点检查以下方面:
${checkAspects.map(aspect => `- ${aspect}`).join('\n')}

对于每个差异，请提供:
1. **类别**: ${checkAspects.join(', ')}
2. **严重程度**: critical（严重）, major（主要）, minor（次要）
3. **描述**: 详细说明差异
4. **位置**: 差异所在位置
5. **期望值**: 设计稿中的样式
6. **实际值**: 实现中的样式
7. **建议**: 如何修复

最后给出:
- **相似度评分** (0-100)
- **改进建议**

请以 JSON 格式返回结果:
\`\`\`json
{
  "overallScore": 85,
  "differences": [
    {
      "category": "colors",
      "severity": "major",
      "description": "主按钮颜色不匹配",
      "location": "页面顶部的主按钮",
      "expected": "#3b82f6",
      "actual": "#60a5fa",
      "suggestion": "将按钮颜色改为 #3b82f6"
    }
  ],
  "recommendations": [
    "调整主按钮颜色以匹配设计稿",
    "增加标题字体粗细"
  ]
}
\`\`\``,
            },
          ],
        },
      ],
    });

    // 解析结果
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          overallScore: parsed.overallScore || 0,
          differences: parsed.differences || [],
          recommendations: parsed.recommendations || [],
        };
      }
    } catch (error) {
      await this.trace(runId, 'parse_error', 'warning', '无法解析 JSON，使用文本分析');
    }

    return this.parseTextComparison(result.text);
  }

  /**
   * 从文本中解析对比结果
   */
  private parseTextComparison(text: string): Omit<VisualDiffOutput, 'report'> {
    const differences: Difference[] = [];
    const recommendations: string[] = [];

    const lines = text.split('\n');
    let currentDiff: Partial<Difference> | null = null;

    for (const line of lines) {
      const lower = line.toLowerCase();

      if (lower.includes('差异') || lower.includes('difference')) {
        if (currentDiff) {
          differences.push(currentDiff as Difference);
        }
        currentDiff = {
          category: 'other',
          severity: 'minor',
          description: line.trim(),
        };
      }

      if (lower.includes('建议') || lower.includes('recommendation')) {
        recommendations.push(line.trim());
      }
    }

    if (currentDiff) {
      differences.push(currentDiff as Difference);
    }

    const criticalCount = differences.filter(d => d.severity === 'critical').length;
    const majorCount = differences.filter(d => d.severity === 'major').length;
    const minorCount = differences.filter(d => d.severity === 'minor').length;

    const overallScore = Math.max(
      0,
      100 - criticalCount * 20 - majorCount * 10 - minorCount * 5
    );

    return { overallScore, differences, recommendations };
  }

  /**
   * 生成详细报告
   */
  private async generateReport(
    comparison: Omit<VisualDiffOutput, 'report'>,
    runId: string
  ): Promise<string> {
    const llm = await this.getLLM();

    const result = await this.callLLM(runId, llm, {
      messages: [
        {
          role: 'user',
          content: `请根据以下视觉对比结果生成详细的报告:

**相似度评分**: ${comparison.overallScore}/100

**差异列表**:
${JSON.stringify(comparison.differences, null, 2)}

**改进建议**:
${comparison.recommendations.join('\n')}

报告应包括:
1. 执行摘要
2. 相似度评分解读
3. 差异详细分析（按严重程度分组）
4. 优先修复建议
5. 质量评估

使用 Markdown 格式，专业且易读。`,
        },
      ],
    });

    return result.text;
  }
}
