import { UITestAgent } from '../ui-test-agent';
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

describe('UITestAgent', () => {
  let agent: UITestAgent;
  const mockRunId = 'test-ui-run-123';

  beforeEach(() => {
    agent = new UITestAgent();
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
      expect(agent.name).toBe('UITestAgent');
    });
  });

  describe('run', () => {
    const baseInput = {
      url: 'http://localhost:3000',
      testCases: ['验证登录按钮可点击', '验证表单提交成功'],
    };

    describe('with Claude model (Computer Use path)', () => {
      beforeEach(() => {
        jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
          model: { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
          provider: 'anthropic',
        });
      });

      it('should run all test cases and generate report', async () => {
        const mockTestResult = JSON.stringify({ passed: true, message: '测试通过' });
        const mockReport = '# UI 测试报告\n\n所有测试通过';

        // Each test case calls generateText once, then report generation calls once more
        (generateText as jest.Mock)
          .mockResolvedValueOnce({ text: mockTestResult, usage: {} }) // test case 1
          .mockResolvedValueOnce({ text: mockTestResult, usage: {} }) // test case 2
          .mockResolvedValueOnce({ text: mockReport, usage: {} });    // report

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(true);
        expect(result.testResults).toHaveLength(2);
        expect(result.testResults[0].status).toBe('passed');
        expect(result.testResults[1].status).toBe('passed');
        expect(result.report).toBe(mockReport);
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });

      it('should handle failed test case', async () => {
        const mockFailResult = JSON.stringify({ passed: false, message: '按钮未找到' });
        const mockReport = '# 测试报告\n\n1个测试失败';

        (generateText as jest.Mock)
          .mockResolvedValueOnce({ text: mockFailResult, usage: {} })
          .mockResolvedValueOnce({ text: mockFailResult, usage: {} })
          .mockResolvedValueOnce({ text: mockReport, usage: {} });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(false);
        expect(result.testResults.some(r => r.status === 'failed')).toBe(true);
      });

      it('should include URL and test case in prompt', async () => {
        (generateText as jest.Mock)
          .mockResolvedValue({ text: JSON.stringify({ passed: true, message: 'ok' }), usage: {} });

        await agent.run({ url: 'http://localhost:3000/login', testCases: ['验证登录'] }, mockRunId);

        const firstCall = (generateText as jest.Mock).mock.calls[0][0];
        const content = firstCall.messages[0].content;
        expect(content).toContain('http://localhost:3000/login');
        expect(content).toContain('验证登录');
      });

      it('should handle non-JSON LLM response for test result', async () => {
        (generateText as jest.Mock)
          .mockResolvedValueOnce({ text: 'Test passed successfully', usage: {} })
          .mockResolvedValueOnce({ text: 'Test passed successfully', usage: {} })
          .mockResolvedValueOnce({ text: '报告', usage: {} });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.testResults[0].status).toBe('passed');
        expect(result.testResults[0].message).toBe('Test passed successfully');
      });

      it('should mark test as failed when LLM response contains failed keyword', async () => {
        (generateText as jest.Mock)
          .mockResolvedValueOnce({ text: 'Test failed: element not found', usage: {} })
          .mockResolvedValueOnce({ text: 'Test failed: timeout', usage: {} })
          .mockResolvedValueOnce({ text: '报告', usage: {} });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.testResults[0].status).toBe('failed');
      });

      it('should handle LLM error per test case gracefully', async () => {
        (generateText as jest.Mock)
          .mockRejectedValueOnce(new Error('LLM timeout'))
          .mockResolvedValueOnce({ text: JSON.stringify({ passed: true, message: 'ok' }), usage: {} })
          .mockResolvedValueOnce({ text: '报告', usage: {} });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.testResults[0].status).toBe('failed');
        expect(result.testResults[0].error).toContain('LLM timeout');
        expect(result.testResults[1].status).toBe('passed');
      });

      it('should handle 404 Not Found error per test case', async () => {
        const { routeModel } = require('@/lib/llm');
        (routeModel as jest.Mock).mockRejectedValue(new Error('No fallback'));
        // Test case execution fails with 404, but report generation succeeds
        (generateText as jest.Mock)
          .mockRejectedValueOnce(new Error('Not Found'))  // test case 1 fails
          .mockResolvedValueOnce({ text: '测试报告', usage: {} }); // report succeeds

        const result = await agent.run(
          { url: 'http://localhost:3000', testCases: ['单个测试'] },
          mockRunId
        );

        expect(result.testResults[0].status).toBe('failed');
        expect(result.testResults[0].error).toBeDefined();
      });
    });

    describe('with non-Claude model (simulation fallback)', () => {
      beforeEach(() => {
        jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
          model: { modelId: 'gpt-4o', provider: 'openai' },
          provider: 'openai',
        });
      });

      it('should use simulation when model is not Claude', async () => {
        // Only report generation calls generateText (simulation doesn't call LLM)
        (generateText as jest.Mock).mockResolvedValue({ text: '测试报告', usage: {} });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.testResults).toHaveLength(2);
        // Simulated results have a message indicating simulation
        result.testResults.forEach(r => {
          expect(r.message).toContain('模拟');
        });
      });
    });

    describe('report generation', () => {
      beforeEach(() => {
        jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
          model: { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
          provider: 'anthropic',
        });
      });

      it('should include test results in report prompt', async () => {
        (generateText as jest.Mock)
          .mockResolvedValueOnce({ text: JSON.stringify({ passed: true, message: 'ok' }), usage: {} })
          .mockResolvedValueOnce({ text: JSON.stringify({ passed: false, message: 'fail' }), usage: {} })
          .mockResolvedValueOnce({ text: '报告内容', usage: {} });

        await agent.run(baseInput, mockRunId);

        const reportCall = (generateText as jest.Mock).mock.calls[2][0];
        const content = reportCall.messages[0].content;
        expect(content).toContain('passed');
        expect(content).toContain('failed');
      });

      it('should handle report generation LLM error', async () => {
        (generateText as jest.Mock)
          .mockResolvedValueOnce({ text: JSON.stringify({ passed: true, message: 'ok' }), usage: {} })
          .mockResolvedValueOnce({ text: JSON.stringify({ passed: true, message: 'ok' }), usage: {} })
          .mockRejectedValueOnce(new Error('Report LLM failed'));

        await expect(agent.run(baseInput, mockRunId)).rejects.toThrow('Report LLM failed');
      });
    });

    describe('viewport configuration', () => {
      beforeEach(() => {
        jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
          model: { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
          provider: 'anthropic',
        });
      });

      it('should accept custom viewport', async () => {
        (generateText as jest.Mock).mockResolvedValue({ text: JSON.stringify({ passed: true, message: 'ok' }), usage: {} });

        const result = await agent.run(
          {
            url: 'http://localhost:3000',
            testCases: ['测试移动端'],
            viewport: { width: 375, height: 812 },
          },
          mockRunId
        );

        expect(result).toBeDefined();
        expect(generateText).toHaveBeenCalled();
      });
    });
  });
});
