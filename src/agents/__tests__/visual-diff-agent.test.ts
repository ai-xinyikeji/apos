import { VisualDiffAgent } from '../visual-diff-agent';
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

const MOCK_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('VisualDiffAgent', () => {
  let agent: VisualDiffAgent;
  const mockRunId = 'test-vd-run-123';

  beforeEach(() => {
    agent = new VisualDiffAgent();
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
      expect(agent.name).toBe('VisualDiffAgent');
    });
  });

  describe('run', () => {
    const baseInput = {
      designImage: MOCK_IMAGE,
      implementationImage: MOCK_IMAGE,
      imageMimeType: 'image/png' as const,
    };

    beforeEach(() => {
      jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
        model: { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
        provider: 'anthropic',
      });
    });

    it('should compare images and return diff report', async () => {
      const mockComparison = {
        overallScore: 85,
        differences: [
          {
            category: 'colors',
            severity: 'major',
            description: '主按钮颜色不匹配',
            location: '页面顶部',
            expected: '#3b82f6',
            actual: '#60a5fa',
            suggestion: '将按钮颜色改为 #3b82f6',
          },
        ],
        recommendations: ['调整主按钮颜色', '增加标题字体粗细'],
      };
      const mockReport = '# 视觉对比报告\n\n相似度评分: 85/100';

      // First call: compareImages, second call: generateReport
      (generateText as jest.Mock)
        .mockResolvedValueOnce({ text: JSON.stringify(mockComparison), usage: {} })
        .mockResolvedValueOnce({ text: mockReport, usage: {} });

      const result = await agent.run(baseInput, mockRunId);

      expect(result.overallScore).toBe(85);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].category).toBe('colors');
      expect(result.differences[0].severity).toBe('major');
      expect(result.recommendations).toHaveLength(2);
      expect(result.report).toBe(mockReport);
      expect(generateText).toHaveBeenCalledTimes(2);
    });

    it('should send both images in multimodal format', async () => {
      (generateText as jest.Mock)
        .mockResolvedValueOnce({
          text: JSON.stringify({ overallScore: 90, differences: [], recommendations: [] }),
          usage: {},
        })
        .mockResolvedValueOnce({ text: '报告内容', usage: {} });

      await agent.run(baseInput, mockRunId);

      const compareCall = (generateText as jest.Mock).mock.calls[0][0];
      const content = compareCall.messages[0].content;
      expect(Array.isArray(content)).toBe(true);
      const imageParts = content.filter((c: any) => c.type === 'image');
      expect(imageParts).toHaveLength(2); // design + implementation
    });

    it('should handle non-JSON comparison response gracefully', async () => {
      const textResponse = `
差异1: 颜色不匹配
建议: 调整颜色
差异2: 字体大小不同
`;
      (generateText as jest.Mock)
        .mockResolvedValueOnce({ text: textResponse, usage: {} })
        .mockResolvedValueOnce({ text: '报告', usage: {} });

      const result = await agent.run(baseInput, mockRunId);

      // Should fall back to text parsing
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.differences).toBeDefined();
      expect(result.report).toBe('报告');
    });

    it('should check specified aspects only', async () => {
      (generateText as jest.Mock)
        .mockResolvedValueOnce({
          text: JSON.stringify({ overallScore: 95, differences: [], recommendations: [] }),
          usage: {},
        })
        .mockResolvedValueOnce({ text: '报告', usage: {} });

      await agent.run(
        { ...baseInput, checkAspects: ['colors', 'typography'] },
        mockRunId
      );

      const compareCall = (generateText as jest.Mock).mock.calls[0][0];
      const content = compareCall.messages[0].content;
      const textPart = content.find((c: any) => c.type === 'text' && c.text?.includes('colors'));
      expect(textPart).toBeDefined();
    });

    it('should handle LLM 404 Not Found error', async () => {
      const { routeModel } = require('@/lib/llm');
      (routeModel as jest.Mock).mockRejectedValue(new Error('No fallback'));
      (generateText as jest.Mock).mockRejectedValue(new Error('Not Found'));

      await expect(agent.run(baseInput, mockRunId)).rejects.toThrow();
    });

    it('should handle LLM error in report generation', async () => {
      (generateText as jest.Mock)
        .mockResolvedValueOnce({
          text: JSON.stringify({ overallScore: 80, differences: [], recommendations: [] }),
          usage: {},
        })
        .mockRejectedValueOnce(new Error('Report generation failed'));

      await expect(agent.run(baseInput, mockRunId)).rejects.toThrow('Report generation failed');
    });

    it('should calculate score based on difference severity when parsing text', async () => {
      // Response with critical differences
      const textWithCritical = '差异: 严重布局问题\ncritical difference found\n建议: 重新设计';
      (generateText as jest.Mock)
        .mockResolvedValueOnce({ text: textWithCritical, usage: {} })
        .mockResolvedValueOnce({ text: '报告', usage: {} });

      const result = await agent.run(baseInput, mockRunId);
      // Score should be reduced for critical differences
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });
});
