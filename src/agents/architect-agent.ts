import { BaseAgent } from './base';

export interface ArchitectInput {
  requirements: string;
  context?: string;
  constraints?: string[];
}

export interface ArchitectOutput {
  success: boolean;
  thinking?: string;
  architecture: string;
  confidence: number;
  alternatives?: string[];
  risks?: string[];
  error?: string;
}

/**
 * Architect Agent - 使用 Claude Extended Thinking 进行深度架构设计
 * 
 * 功能:
 * - 深度思考模式（Extended Thinking）
 * - 架构设计和技术选型
 * - 风险评估
 * - 替代方案分析
 * 
 * 使用场景:
 * - 复杂系统架构设计
 * - 技术方案评估
 * - 重构方案设计
 */
export class ArchitectAgent extends BaseAgent<ArchitectInput, ArchitectOutput> {
  public readonly name = 'ArchitectAgent';

  async run(input: ArchitectInput, runId: string): Promise<ArchitectOutput> {
    await this.trace(runId, 'init', 'info', '启动架构设计 Agent...');

    try {
      const llm = await this.getLLM();

      // 只有 Claude 支持 Extended Thinking
      if (llm.provider !== 'anthropic') {
        await this.trace(runId, 'provider_check', 'warning', 
          `当前 Provider (${llm.provider}) 不支持 Extended Thinking，使用标准模式`
        );
      }

      await this.trace(runId, 'deep_thinking', 'info', '启动深度思考模式，分析架构需求...');

      const systemPrompt = `你是一位资深的系统架构师和技术专家。

请深度分析以下系统需求，设计一个完整的技术架构方案。

分析维度:
1. **系统架构**: 整体架构设计（前端、后端、数据库、缓存等）
2. **技术选型**: 推荐的技术栈和框架
3. **数据流设计**: 数据如何在系统中流转
4. **可扩展性**: 如何支持未来的扩展
5. **性能优化**: 潜在的性能瓶颈和优化方案
6. **安全性**: 安全风险和防护措施
7. **部署方案**: 推荐的部署架构
8. **替代方案**: 其他可行的技术方案
9. **风险评估**: 潜在的技术风险和应对策略

请给出详细的思考过程和最终的架构设计方案。`;

      const contextStr = input.context ? `\n\n**项目上下文**:\n${input.context}` : '';
      const constraintsStr = input.constraints && input.constraints.length > 0
        ? `\n\n**约束条件**:\n${input.constraints.map(c => `- ${c}`).join('\n')}`
        : '';

      const userMessage = `**需求描述**:\n${input.requirements}${contextStr}${constraintsStr}`;

      let thinking = '';
      let architecture = '';

      // 尝试使用 Extended Thinking
      if (llm.provider === 'anthropic') {
        try {
          const result = await this.callLLM(runId, llm, {
            maxTokens: 16000,
            temperature: 1.0,
            experimental_thinkingBudget: 10000,
            messages: [
              {
                role: 'user',
                content: `${systemPrompt}\n\n${userMessage}`,
              },
            ],
          });

          thinking = (result as any).experimental_thinking || '';
          architecture = result.text;

          if (thinking) {
            await this.trace(runId, 'thinking_complete', 'success', 
              `深度思考完成，思考过程: ${thinking.length} 字符`,
              { thinkingLength: thinking.length }
            );
          }

          if (result.usage) {
            await this.trace(runId, 'token_usage', 'info', 
              `Token 消耗: Prompt=${result.usage.promptTokens || result.usage.inputTokens}, Completion=${result.usage.completionTokens || result.usage.outputTokens}`,
              result.usage
            );
          }
        } catch (error: any) {
          await this.trace(runId, 'extended_thinking_failed', 'warning', 
            `Extended Thinking 失败，回退到标准模式: ${error.message}`
          );

          // 回退到标准模式
          const result = await this.callLLM(runId, llm, {
            maxTokens: 8192,
            temperature: 0.7,
            messages: [
              {
                role: 'user',
                content: `${systemPrompt}\n\n${userMessage}`,
              },
            ],
          });

          architecture = result.text;
        }
      } else {
        // 非 Claude Provider 使用标准模式
        const result = await this.callLLM(runId, llm, {
          maxTokens: 8192,
          temperature: 0.7,
          messages: [
            {
              role: 'user',
              content: `${systemPrompt}\n\n${userMessage}`,
            },
          ],
        });

        architecture = result.text;
      }

      // 提取替代方案和风险
      const alternatives = this.extractAlternatives(architecture);
      const risks = this.extractRisks(architecture);
      const confidence = this.calculateConfidence(architecture, thinking);

      await this.trace(runId, 'analysis_complete', 'success', 
        `架构设计完成，置信度: ${confidence}%`,
        { alternatives: alternatives.length, risks: risks.length }
      );

      return {
        success: true,
        thinking,
        architecture,
        confidence,
        alternatives,
        risks,
      };
    } catch (error: any) {
      console.error('ArchitectAgent failed:', error);
      await this.trace(runId, 'error', 'error', `架构设计失败: ${error.message}`);

      return {
        success: false,
        architecture: '',
        confidence: 0,
        error: error.message,
      };
    }
  }

  /**
   * 提取替代方案
   */
  private extractAlternatives(text: string): string[] {
    const alternatives: string[] = [];
    
    // 查找替代方案相关的段落
    const altRegex = /(?:替代方案|备选方案|其他方案|Alternative)[：:]\s*\n([\s\S]*?)(?=\n\n|$)/gi;
    let match;
    
    while ((match = altRegex.exec(text)) !== null) {
      const content = match[1].trim();
      if (content) {
        alternatives.push(content);
      }
    }

    return alternatives;
  }

  /**
   * 提取风险
   */
  private extractRisks(text: string): string[] {
    const risks: string[] = [];
    
    // 查找风险相关的段落
    const riskRegex = /(?:风险|挑战|问题|Risk)[：:]\s*\n([\s\S]*?)(?=\n\n|$)/gi;
    let match;
    
    while ((match = riskRegex.exec(text)) !== null) {
      const content = match[1].trim();
      if (content) {
        risks.push(content);
      }
    }

    return risks;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(architecture: string, thinking: string): number {
    let confidence = 50; // 基础分

    // 如果有思考过程，增加置信度
    if (thinking && thinking.length > 500) {
      confidence += 20;
    }

    // 如果架构设计详细，增加置信度
    if (architecture.length > 2000) {
      confidence += 15;
    }

    // 如果包含关键词，增加置信度
    const keywords = [
      '架构', '设计', '技术栈', '数据流', '扩展性',
      '性能', '安全', '部署', '风险', '替代方案'
    ];
    
    const keywordCount = keywords.filter(kw => architecture.includes(kw)).length;
    confidence += Math.min(keywordCount * 2, 15);

    return Math.min(confidence, 100);
  }
}
