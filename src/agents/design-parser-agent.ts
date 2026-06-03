/**
 * 设计稿解析 Agent
 * 使用 Claude 的多模态能力智能解析设计稿
 */

import { BaseAgent } from './base';
import { anthropic } from '@ai-sdk/anthropic';

export interface DesignParserInput {
  imageBase64: string; // Base64 编码的设计稿图片
  imageMimeType?: string; // 图片 MIME 类型，默认 image/png
  extractionMode?: 'full' | 'layout' | 'colors' | 'typography';
}

export interface DesignParserOutput {
  layout: LayoutSpec;
  colors: ColorSpec;
  typography: TypographySpec;
  components: ComponentSpec[];
  interactions: InteractionSpec[];
  code?: string; // 可选的代码生成
  confidence: number; // 0-100
}

export interface LayoutSpec {
  type: 'flexbox' | 'grid' | 'absolute';
  direction?: 'row' | 'column';
  gap?: string;
  padding?: string;
  alignment?: string;
  structure: LayoutNode[];
}

export interface LayoutNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  children?: LayoutNode[];
}

export interface ColorSpec {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  palette: string[];
}

export interface TypographySpec {
  fontFamily: string;
  headings: {
    h1: { size: string; weight: string; lineHeight: string };
    h2: { size: string; weight: string; lineHeight: string };
    h3: { size: string; weight: string; lineHeight: string };
  };
  body: { size: string; weight: string; lineHeight: string };
  small: { size: string; weight: string; lineHeight: string };
}

export interface ComponentSpec {
  id: string;
  type: string;
  name: string;
  props: Record<string, any>;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface InteractionSpec {
  element: string;
  trigger: string;
  action: string;
  description: string;
}

/**
 * 设计稿解析 Agent
 */
export class DesignParserAgent extends BaseAgent<DesignParserInput, DesignParserOutput> {
  name = 'DesignParserAgent';

  async run(input: DesignParserInput, runId: string): Promise<DesignParserOutput> {
    // 注册进度步骤
    this.registerProgressSteps(runId, [
      { name: 'init', weight: 5, status: 'pending' },
      { name: 'analyze_image', weight: 30, status: 'pending' },
      { name: 'extract_layout', weight: 20, status: 'pending' },
      { name: 'extract_colors', weight: 15, status: 'pending' },
      { name: 'extract_typography', weight: 15, status: 'pending' },
      { name: 'identify_components', weight: 10, status: 'pending' },
      { name: 'complete', weight: 5, status: 'pending' },
    ]);

    await this.trace(runId, 'init', 'info', '初始化设计稿解析 Agent');
    this.updateProgressStep(runId, 'init', 'completed', '初始化完成');

    try {
      // 1. 分析图片
      this.updateProgressStep(runId, 'analyze_image', 'running', '分析设计稿...');
      const analysis = await this.analyzeDesign(input, runId);
      this.updateProgressStep(runId, 'analyze_image', 'completed', '设计稿分析完成');

      // 2. 提取布局
      this.updateProgressStep(runId, 'extract_layout', 'running', '提取布局结构...');
      const layout = this.extractLayout(analysis);
      this.updateProgressStep(runId, 'extract_layout', 'completed', '布局提取完成');

      // 3. 提取颜色
      this.updateProgressStep(runId, 'extract_colors', 'running', '提取颜色方案...');
      const colors = this.extractColors(analysis);
      this.updateProgressStep(runId, 'extract_colors', 'completed', '颜色提取完成');

      // 4. 提取字体
      this.updateProgressStep(runId, 'extract_typography', 'running', '提取字体规范...');
      const typography = this.extractTypography(analysis);
      this.updateProgressStep(runId, 'extract_typography', 'completed', '字体提取完成');

      // 5. 识别组件
      this.updateProgressStep(runId, 'identify_components', 'running', '识别 UI 组件...');
      const components = this.identifyComponents(analysis);
      const interactions = this.identifyInteractions(analysis);
      this.updateProgressStep(runId, 'identify_components', 'completed', `识别到 ${components.length} 个组件`);

      await this.trace(runId, 'complete', 'success', '✅ 设计稿解析完成', {
        componentsCount: components.length,
        colorsCount: colors.palette.length,
      });

      this.updateProgressStep(runId, 'complete', 'completed', '解析完成');

      return {
        layout,
        colors,
        typography,
        components,
        interactions,
        confidence: analysis.confidence || 85,
      };
    } catch (error) {
      await this.trace(runId, 'error', 'error', '❌ 设计稿解析失败', error);
      throw error;
    }
  }

  /**
   * 使用 Claude 的多模态能力分析设计稿
   */
  private async analyzeDesign(
    input: DesignParserInput,
    runId: string
  ): Promise<any> {
    // Single getLLM() call — reuse for both model check and callLLM
    const llm = await this.getLLM();

    // 确保使用支持多模态的模型
    const multimodalModel = llm.model.modelId?.includes('claude')
      ? anthropic('claude-3-5-sonnet-20241022')
      : llm.model;

    const result = await this.callLLM(runId, { ...llm, model: multimodalModel }, {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: input.imageBase64,
              mimeType: input.imageMimeType || 'image/png',
            },
            {
              type: 'text',
              text: `请详细分析这个设计稿，提取以下信息:

1. **布局结构**
   - 布局类型 (Flexbox/Grid/Absolute)
   - 主要区域划分
   - 元素层次结构
   - 间距和对齐方式

2. **颜色方案**
   - 主色调
   - 辅助色
   - 强调色
   - 背景色
   - 文字颜色
   - 完整调色板

3. **字体规范**
   - 字体家族
   - 标题字号和粗细 (H1, H2, H3)
   - 正文字号和粗细
   - 行高

4. **UI 组件**
   - 识别所有 UI 组件 (按钮、输入框、卡片等)
   - 组件位置和尺寸
   - 组件属性

5. **交互元素**
   - 可点击元素
   - 表单元素
   - 导航元素

请以 JSON 格式返回结果，包含以上所有信息。`,
            },
          ],
        },
      ],
    });

    // 解析 JSON 结果
    try {
      // 尝试从文本中提取 JSON
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // 如果没有找到 JSON，返回原始文本
      return { rawAnalysis: result.text, confidence: 70 };
    } catch (error) {
      await this.trace(runId, 'parse_error', 'warning', '无法解析 JSON，使用原始文本');
      return { rawAnalysis: result.text, confidence: 60 };
    }
  }

  /**
   * 提取布局结构
   */
  private extractLayout(analysis: any): LayoutSpec {
    if (analysis.layout) {
      return analysis.layout;
    }

    // 默认布局
    return {
      type: 'flexbox',
      direction: 'column',
      gap: '1rem',
      padding: '1rem',
      alignment: 'start',
      structure: [],
    };
  }

  /**
   * 提取颜色方案
   */
  private extractColors(analysis: any): ColorSpec {
    if (analysis.colors) {
      return analysis.colors;
    }

    // 默认颜色
    return {
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      accent: '#f59e0b',
      background: '#ffffff',
      text: '#1f2937',
      palette: ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'],
    };
  }

  /**
   * 提取字体规范
   */
  private extractTypography(analysis: any): TypographySpec {
    if (analysis.typography) {
      return analysis.typography;
    }

    // 默认字体
    return {
      fontFamily: 'Inter, system-ui, sans-serif',
      headings: {
        h1: { size: '2.5rem', weight: '700', lineHeight: '1.2' },
        h2: { size: '2rem', weight: '600', lineHeight: '1.3' },
        h3: { size: '1.5rem', weight: '600', lineHeight: '1.4' },
      },
      body: { size: '1rem', weight: '400', lineHeight: '1.5' },
      small: { size: '0.875rem', weight: '400', lineHeight: '1.5' },
    };
  }

  /**
   * 识别 UI 组件
   */
  private identifyComponents(analysis: any): ComponentSpec[] {
    if (analysis.components && Array.isArray(analysis.components)) {
      return analysis.components;
    }

    return [];
  }

  /**
   * 识别交互元素
   */
  private identifyInteractions(analysis: any): InteractionSpec[] {
    if (analysis.interactions && Array.isArray(analysis.interactions)) {
      return analysis.interactions;
    }

    return [];
  }
}
