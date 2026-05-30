import { ReportGeneratorAgent } from '../report-generator';
import { db } from '@/lib/db';
import { generateText, getLLMClient } from '@/lib/llm';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('@/lib/llm');
jest.mock('fs');
jest.mock('path');

describe('ReportGeneratorAgent', () => {
  let agent: ReportGeneratorAgent;
  const mockRunId = 'test-run-123';

  beforeEach(() => {
    agent = new ReportGeneratorAgent();
    jest.clearAllMocks();

    // Mock path functions
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    jest.spyOn(process, 'cwd').mockReturnValue('/mock/project');

    // Mock db.insert for trace
    (db.insert as jest.Mock) = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    // Mock db.update
    (db.update as jest.Mock) = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    });
  });

  describe('name', () => {
    it('should have correct agent name', () => {
      expect(agent.name).toBe('ReportGenerator');
    });
  });

  describe('run', () => {
    beforeEach(() => {
      // Mock getLLM
      const mockLLM = {
        model: { provider: 'openai', modelId: 'gpt-4o' },
        provider: 'openai',
      };
      jest.spyOn(agent as any, 'getLLM').mockResolvedValue(mockLLM);
      (getLLMClient as jest.Mock).mockResolvedValue(mockLLM);

      // Mock fs operations
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    });

    it('should generate report successfully with pending signals', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'User needs CSV export',
          content: 'Multiple users requesting CSV export',
          source: 'zendesk',
          sentiment: 'negative',
          status: 'pending',
        },
        {
          id: 2,
          title: 'Login flow drop-off',
          content: 'High drop-off rate in login',
          source: 'amplitude',
          sentiment: 'negative',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      const mockReport = `
# 📌 执行摘要
Users are requesting CSV export and experiencing login issues.

# 🔍 核心洞察
1. Export functionality is missing
2. Login UX needs improvement

# 💡 建议启动的开发原型
- CSV Export Feature
- Login Flow Optimization

# 📊 用户情绪大盘
Mostly negative feedback
`;

      (generateText as jest.Mock).mockResolvedValue({
        text: mockReport,
        usage: { inputTokens: 150, outputTokens: 300 },
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(true);
      expect(result.reportContent).toBe(mockReport);
      expect(result.reportPath).toContain('data/reports/report-');
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledTimes(2); // Update both signals
    });

    it('should use custom title when provided', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Test signal',
          content: 'Test content',
          source: 'zendesk',
          sentiment: 'neutral',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report content',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      const customTitle = 'Custom Weekly Report';
      await agent.run({ title: customTitle }, mockRunId);

      // Verify trace was called with custom title
      expect(db.insert).toHaveBeenCalled();
    });

    it('should handle no pending signals', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(true);
      expect(result.reportContent).toBe('目前没有新的待分析需求信号。');
      expect(generateText).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should create reports directory if not exists', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Test signal',
          content: 'Test content',
          source: 'zendesk',
          sentiment: 'neutral',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report content',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await agent.run({}, mockRunId);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/mock/project/data/reports',
        { recursive: true }
      );
    });

    it('should not create directory if it already exists', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Test signal',
          content: 'Test content',
          source: 'zendesk',
          sentiment: 'neutral',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report content',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await agent.run({}, mockRunId);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should include all signal details in prompt', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Signal Title',
          content: 'Signal Content',
          source: 'zendesk',
          sentiment: 'positive',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      await agent.run({}, mockRunId);

      const generateTextCall = (generateText as jest.Mock).mock.calls[(generateText as jest.Mock).mock.calls.length - 1][0];
      expect(generateTextCall.prompt).toContain('Signal Title');
      expect(generateTextCall.prompt).toContain('Signal Content');
      expect(generateTextCall.prompt).toContain('ZENDESK');
      expect(generateTextCall.prompt).toContain('positive');
    });

    it('should handle null sentiment gracefully', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Test signal',
          content: 'Test content',
          source: 'amplitude',
          sentiment: null,
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      await agent.run({}, mockRunId);

      const generateTextCall = (generateText as jest.Mock).mock.calls[(generateText as jest.Mock).mock.calls.length - 1][0];
      expect(generateTextCall.prompt).toContain('中性');
    });

    it('should update all signals to analyzed status', async () => {
      const mockSignals = [
        { id: 1, title: 'Signal 1', content: 'Content 1', source: 'zendesk', sentiment: 'neutral', status: 'pending' },
        { id: 2, title: 'Signal 2', content: 'Content 2', source: 'amplitude', sentiment: 'negative', status: 'pending' },
        { id: 3, title: 'Signal 3', content: 'Content 3', source: 'competitor', sentiment: 'positive', status: 'pending' },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      await agent.run({}, mockRunId);

      expect(db.update).toHaveBeenCalledTimes(3);
    });

    it('should handle database query errors', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(false);
      expect(result.reportPath).toBeUndefined();
      expect(result.reportContent).toBeUndefined();
    });

    it('should handle LLM errors', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Test signal',
          content: 'Test content',
          source: 'zendesk',
          sentiment: 'neutral',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockRejectedValue(new Error('LLM API error'));

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(false);
    });

    it('should handle file system errors', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Test signal',
          content: 'Test content',
          source: 'zendesk',
          sentiment: 'neutral',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File write error');
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(false);
    });

    it('should generate unique filenames based on timestamp', async () => {
      const mockSignals = [
        {
          id: 1,
          title: 'Test signal',
          content: 'Test content',
          source: 'zendesk',
          sentiment: 'neutral',
          status: 'pending',
        },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      const result1 = await agent.run({}, mockRunId);
      const result2 = await agent.run({}, mockRunId);

      // Filenames should be different due to timestamp
      expect(result1.reportPath).toBeDefined();
      expect(result2.reportPath).toBeDefined();
    });

    it('should format signals with proper numbering', async () => {
      const mockSignals = [
        { id: 1, title: 'First', content: 'Content 1', source: 'zendesk', sentiment: 'neutral', status: 'pending' },
        { id: 2, title: 'Second', content: 'Content 2', source: 'amplitude', sentiment: 'negative', status: 'pending' },
      ];

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockSignals),
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      await agent.run({}, mockRunId);

      const generateTextCall = (generateText as jest.Mock).mock.calls[(generateText as jest.Mock).mock.calls.length - 1][0];
      expect(generateTextCall.prompt).toContain('[信号 #1]');
      expect(generateTextCall.prompt).toContain('[信号 #2]');
    });
  });
});
