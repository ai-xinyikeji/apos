import { DesignParserAgent } from '../design-parser-agent';
import { db } from '@/lib/db';
import { generateText } from '@/lib/llm';

jest.mock('@/lib/db');
jest.mock('@/lib/llm');
jest.mock('@ai-sdk/anthropic', () => ({
  anthropic: jest.fn(() => ({ modelId: 'claude-3-5-sonnet-20241022' })),
}));
jest.mock('@/lib/growth/metrics', () => ({
  metricsCollector: {
    trackAgentExecution: jest.fn().mockResolvedValue(undefined),
    trackFeature: jest.fn().mockResolvedValue(undefined),
  },
}));

// Minimal 1x1 PNG base64
const MOCK_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('DesignParserAgent', () => {
  let agent: DesignParserAgent;
  const mockRunId = 'test-design-run-123';

  beforeEach(() => {
    agent = new DesignParserAgent();
    jest.clearAllMocks();

    (db.insert as jest.Mock) = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });
    (db.select as jest.Mock) = jest.fn().mockReturnValue({
      from: jest.fn().mockResolvedValue([]),
    });
  });

  describe('name', () => {
    it('should have correct agent name', () => {
      expect(agent.name).toBe('DesignParserAgent');
    });
  });

  describe('run', () => {
    const baseInput = {
      imageBase64: MOCK_IMAGE_BASE64,
      imageMimeType: 'image/png' as const,
    };

    beforeEach(() => {
      jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
        model: { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
        provider: 'anthropic',
      });
    });

    it('should parse design and return structured output', async () => {
      const mockAnalysis = {
        layout: {
          type: 'flexbox',
          direction: 'column',
          gap: '1rem',
          padding: '1.5rem',
          alignment: 'start',
          structure: [],
        },
        colors: {
          primary: '#3b82f6',
          secondary: '#8b5cf6',
          accent: '#f59e0b',
          background: '#0f172a',
          text: '#f8fafc',
          palette: ['#3b82f6', '#8b5cf6', '#f59e0b'],
        },
        typography: {
          fontFamily: 'Inter, sans-serif',
          headings: {
            h1: { size: '2.5rem', weight: '700', lineHeight: '1.2' },
            h2: { size: '2rem', weight: '600', lineHeight: '1.3' },
            h3: { size: '1.5rem', weight: '600', lineHeight: '1.4' },
          },
          body: { size: '1rem', weight: '400', lineHeight: '1.5' },
          small: { size: '0.875rem', weight: '400', lineHeight: '1.5' },
        },
        components: [
          {
            id: 'btn-1',
            type: 'Button',
            name: '主按钮',
            props: { variant: 'primary' },
            position: { x: 100, y: 200 },
            size: { width: 120, height: 40 },
          },
        ],
        interactions: [
          {
            element: '主按钮',
            trigger: 'click',
            action: 'navigate',
            description: '点击跳转到下一页',
          },
        ],
        confidence: 90,
      };

      (generateText as jest.Mock).mockResolvedValue({
        text: JSON.stringify(mockAnalysis),
        usage: { promptTokens: 300, completionTokens: 500 },
      });

      const result = await agent.run(baseInput, mockRunId);

      expect(result.layout.type).toBe('flexbox');
      expect(result.colors.primary).toBe('#3b82f6');
      expect(result.typography.fontFamily).toBe('Inter, sans-serif');
      expect(result.components).toHaveLength(1);
      expect(result.components[0].type).toBe('Button');
      expect(result.interactions).toHaveLength(1);
      expect(result.confidence).toBe(90);
    });

    it('should use multimodal message format with image', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: JSON.stringify({ confidence: 75 }),
        usage: {},
      });

      await agent.run(baseInput, mockRunId);

      const call = (generateText as jest.Mock).mock.calls[0][0];
      expect(call.messages).toBeDefined();
      expect(call.messages[0].role).toBe('user');
      const content = call.messages[0].content;
      expect(Array.isArray(content)).toBe(true);
      // Should contain image part
      const imagePart = content.find((c: any) => c.type === 'image');
      expect(imagePart).toBeDefined();
      expect(imagePart.image).toBe(MOCK_IMAGE_BASE64);
      expect(imagePart.mimeType).toBe('image/png');
    });

    it('should return defaults when LLM returns non-JSON text', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: '这是一个设计稿，包含蓝色按钮和白色背景',
        usage: {},
      });

      const result = await agent.run(baseInput, mockRunId);

      // Should fall back to defaults
      expect(result.layout).toBeDefined();
      expect(result.colors).toBeDefined();
      expect(result.typography).toBeDefined();
      expect(result.components).toBeDefined();
      expect(result.interactions).toBeDefined();
    });

    it('should return defaults when LLM returns partial JSON', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: JSON.stringify({ confidence: 60 }), // missing layout/colors/etc
        usage: {},
      });

      const result = await agent.run(baseInput, mockRunId);

      // Should use defaults for missing fields
      expect(result.layout.type).toBe('flexbox');
      expect(result.colors.primary).toBe('#3b82f6');
      expect(result.confidence).toBe(60);
    });

    it('should handle LLM 404 Not Found error', async () => {
      const { routeModel } = require('@/lib/llm');
      (routeModel as jest.Mock).mockRejectedValue(new Error('No fallback'));
      (generateText as jest.Mock).mockRejectedValue(new Error('Not Found'));

      await expect(agent.run(baseInput, mockRunId)).rejects.toThrow();
    });

    it('should handle generic LLM errors', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(agent.run(baseInput, mockRunId)).rejects.toThrow('Rate limit exceeded');
    });

    it('should accept different extraction modes', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: JSON.stringify({
          colors: {
            primary: '#ff0000',
            secondary: '#00ff00',
            accent: '#0000ff',
            background: '#ffffff',
            text: '#000000',
            palette: ['#ff0000', '#00ff00', '#0000ff'],
          },
          confidence: 80,
        }),
        usage: {},
      });

      const result = await agent.run(
        { ...baseInput, extractionMode: 'colors' },
        mockRunId
      );

      expect(result).toBeDefined();
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('should use default mime type when not specified', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: JSON.stringify({ confidence: 70 }),
        usage: {},
      });

      await agent.run({ imageBase64: MOCK_IMAGE_BASE64 }, mockRunId);

      const call = (generateText as jest.Mock).mock.calls[0][0];
      const imagePart = call.messages[0].content.find((c: any) => c.type === 'image');
      expect(imagePart.mimeType).toBe('image/png');
    });
  });
});
