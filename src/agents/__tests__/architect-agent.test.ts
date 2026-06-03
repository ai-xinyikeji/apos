import { ArchitectAgent } from '../architect-agent';
import { db } from '@/lib/db';
import { generateText } from '@/lib/llm';

jest.mock('@/lib/db');
jest.mock('@/lib/llm');
jest.mock('@/lib/growth/metrics', () => ({
  metricsCollector: {
    trackAgentExecution: jest.fn().mockResolvedValue(undefined),
    trackFeature: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ArchitectAgent', () => {
  let agent: ArchitectAgent;
  const mockRunId = 'test-arch-run-123';

  beforeEach(() => {
    agent = new ArchitectAgent();
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
      expect(agent.name).toBe('ArchitectAgent');
    });
  });

  describe('run', () => {
    const baseInput = {
      requirements: '设计一个用户认证系统，支持邮箱登录和第三方登录',
      context: '使用 Next.js + PostgreSQL',
      constraints: ['支持 OAuth', '支持 2FA'],
    };

    describe('with non-anthropic provider (standard mode)', () => {
      beforeEach(() => {
        jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
          model: { modelId: 'gpt-4o', provider: 'openai' },
          provider: 'openai',
        });
      });

      it('should return architecture design successfully', async () => {
        const mockArchitecture = `
# 系统架构设计

## 技术选型
- Next.js 15 App Router
- PostgreSQL + Drizzle ORM
- NextAuth.js

## 安全性
- JWT Token
- bcrypt 密码哈希
`;
        (generateText as jest.Mock).mockResolvedValue({
          text: mockArchitecture,
          usage: { promptTokens: 200, completionTokens: 400 },
        });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(true);
        expect(result.architecture).toBe(mockArchitecture);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
        expect(generateText).toHaveBeenCalledTimes(1);
      });

      it('should include requirements in prompt', async () => {
        (generateText as jest.Mock).mockResolvedValue({
          text: '架构设计方案',
          usage: {},
        });

        await agent.run(baseInput, mockRunId);

        const call = (generateText as jest.Mock).mock.calls[0][0];
        const content = call.messages[0].content;
        expect(content).toContain(baseInput.requirements);
        expect(content).toContain(baseInput.context);
        expect(content).toContain('OAuth');
        expect(content).toContain('2FA');
      });

      it('should work without optional context and constraints', async () => {
        (generateText as jest.Mock).mockResolvedValue({
          text: '基础架构方案',
          usage: {},
        });

        const result = await agent.run(
          { requirements: '简单的 CRUD 应用' },
          mockRunId
        );

        expect(result.success).toBe(true);
        expect(result.architecture).toBe('基础架构方案');
      });

      it('should extract alternatives from architecture text', async () => {
        (generateText as jest.Mock).mockResolvedValue({
          text: `
# 架构设计

替代方案：
可以使用 Supabase 替代自建 PostgreSQL

## 风险：
数据库迁移风险较高
`,
          usage: {},
        });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(true);
        expect(result.alternatives).toBeDefined();
        expect(result.risks).toBeDefined();
      });

      it('should handle LLM errors gracefully', async () => {
        (generateText as jest.Mock).mockRejectedValue(new Error('LLM timeout'));

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(false);
        expect(result.architecture).toBe('');
        expect(result.confidence).toBe(0);
        expect(result.error).toContain('LLM timeout');
      });

      it('should handle 404 Not Found error gracefully', async () => {
        // routeModel fallback also needs to be mocked to avoid undefined model
        const { routeModel } = require('@/lib/llm');
        (routeModel as jest.Mock).mockRejectedValue(new Error('No fallback available'));
        (generateText as jest.Mock).mockRejectedValue(new Error('Not Found'));

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('with anthropic provider (extended thinking mode)', () => {
      beforeEach(() => {
        jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
          model: { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
          provider: 'anthropic',
        });
      });

      it('should use extended thinking when available', async () => {
        const mockThinking = '深度思考过程：分析系统需求...';
        const mockArchitecture = '# 架构设计\n\n详细方案...';

        (generateText as jest.Mock).mockResolvedValue({
          text: mockArchitecture,
          experimental_thinking: mockThinking,
          usage: { promptTokens: 500, completionTokens: 1000 },
        });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(true);
        expect(result.architecture).toBe(mockArchitecture);
        expect(result.thinking).toBe(mockThinking);
        // Extended thinking should boost confidence
        expect(result.confidence).toBeGreaterThan(50);
      });

      it('should fall back to standard mode when extended thinking fails', async () => {
        const mockArchitecture = '标准模式架构方案';

        // First call (extended thinking) fails, second call (standard) succeeds
        (generateText as jest.Mock)
          .mockRejectedValueOnce(new Error('Extended thinking not supported'))
          .mockResolvedValueOnce({ text: mockArchitecture, usage: {} });

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(true);
        expect(result.architecture).toBe(mockArchitecture);
        expect(generateText).toHaveBeenCalledTimes(2);
      });

      it('should handle complete LLM failure in anthropic mode', async () => {
        (generateText as jest.Mock).mockRejectedValue(new Error('API quota exceeded'));

        const result = await agent.run(baseInput, mockRunId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('API quota exceeded');
      });
    });

    describe('confidence calculation', () => {
      beforeEach(() => {
        jest.spyOn(agent as any, 'getLLM').mockResolvedValue({
          model: { modelId: 'gpt-4o', provider: 'openai' },
          provider: 'openai',
        });
      });

      it('should give higher confidence for detailed architecture', async () => {
        const detailedArch = `
# 架构设计
## 技术选型
## 数据流设计
## 可扩展性
## 性能优化
## 安全性
## 部署方案
## 替代方案
## 风险评估
${'详细内容 '.repeat(200)}
`;
        (generateText as jest.Mock).mockResolvedValue({
          text: detailedArch,
          usage: {},
        });

        const result = await agent.run(baseInput, mockRunId);
        // Detailed arch with many keywords should score higher than brief one
        expect(result.confidence).toBeGreaterThan(55);
      });

      it('should give lower confidence for brief architecture', async () => {
        (generateText as jest.Mock).mockResolvedValue({
          text: '简单方案',
          usage: {},
        });

        const result = await agent.run(baseInput, mockRunId);
        expect(result.confidence).toBeLessThan(80);
      });
    });
  });
});
