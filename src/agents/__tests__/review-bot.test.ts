import { ReviewBotAgent } from '../review-bot';
import { db } from '@/lib/db';
import { git, getRepoDetails } from '@/lib/git';
import { generateText } from '@/lib/llm';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('@/lib/git');
jest.mock('@/lib/llm');

describe('ReviewBotAgent', () => {
  let agent: ReviewBotAgent;
  const mockRunId = 'test-run-123';

  beforeEach(() => {
    agent = new ReviewBotAgent();
    jest.clearAllMocks();

    // Mock db.insert for trace
    (db.insert as jest.Mock) = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    // Mock db.select for settings
    (db.select as jest.Mock) = jest.fn().mockReturnValue({
      from: jest.fn().mockResolvedValue([]),
    });

    global.fetch = jest.fn();
  });

  describe('name', () => {
    it('should have correct agent name', () => {
      expect(agent.name).toBe('ReviewBot');
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

      // Mock git operations
      (git.branch as jest.Mock).mockResolvedValue({
        all: ['main', 'feature-branch'],
      });

      (git.diff as jest.Mock).mockResolvedValue(`
diff --git a/src/test.ts b/src/test.ts
index 1234567..abcdefg 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
+export function newFeature() {}
 export function existingFunction() {}
`);
    });

    it('should review code successfully', async () => {
      const mockReview = `
# 📌 改动概览
Added new feature function.

# 🔒 安全审计
No security issues found.

# 🎨 代码质量 & UI
Code quality is good.

# 💡 改进建议
Consider adding tests.
`;

      (generateText as jest.Mock).mockResolvedValue({
        text: mockReview,
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
        },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(result.report).toBe(mockReview);
      expect(git.branch).toHaveBeenCalled();
      expect(git.diff).toHaveBeenCalledWith(['main', 'feature-branch']);
      expect(generateText).toHaveBeenCalled();
    });

    it('should use master branch when main does not exist', async () => {
      (git.branch as jest.Mock).mockResolvedValue({
        all: ['master', 'feature-branch'],
      });

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Review report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
        },
        mockRunId
      );

      expect(git.diff).toHaveBeenCalledWith(['master', 'feature-branch']);
    });

    it('should handle no changes between branches', async () => {
      (git.diff as jest.Mock).mockResolvedValue('');

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
        },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(result.report).toBe('分支间无任何改动。');
      expect(generateText).not.toHaveBeenCalled();
    });

    it('should handle null diff', async () => {
      (git.diff as jest.Mock).mockResolvedValue(null);

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
        },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(result.report).toBe('分支间无任何改动。');
    });

    it('should post comment to GitHub PR when prNumber provided', async () => {
      const mockReview = 'Review report';

      (generateText as jest.Mock).mockResolvedValue({
        text: mockReview,
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'test_token' },
        ]),
      });

      (getRepoDetails as jest.Mock).mockResolvedValue({
        owner: 'test-owner',
        repo: 'test-repo',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
          prNumber: 42,
        },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues/42/comments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'token test_token',
          }),
        })
      );
    });

    it('should handle PR comment posting failure gracefully', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: 'Review report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'test_token' },
        ]),
      });

      (getRepoDetails as jest.Mock).mockResolvedValue({
        owner: 'test-owner',
        repo: 'test-repo',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
          prNumber: 42,
        },
        mockRunId
      );

      // Should still succeed even if PR comment fails
      expect(result.success).toBe(true);
    });

    it('should skip PR comment when no token configured', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: 'Review report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
          prNumber: 42,
        },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should skip PR comment when repo details unavailable', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: 'Review report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'test_token' },
        ]),
      });

      (getRepoDetails as jest.Mock).mockResolvedValue(null);

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
          prNumber: 42,
        },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle git errors', async () => {
      (git.branch as jest.Mock).mockRejectedValue(new Error('Git error'));

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
        },
        mockRunId
      );

      expect(result.success).toBe(false);
      expect(result.report).toBe('');
      expect(result.error).toBe('Git error');
    });

    it('should handle LLM errors', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('LLM API error'));

      const result = await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
        },
        mockRunId
      );

      expect(result.success).toBe(false);
      expect(result.report).toBe('');
      expect(result.error).toBe('LLM API error');
    });

    it('should include diff in audit prompt', async () => {
      const mockDiff = 'test diff content';
      (git.diff as jest.Mock).mockResolvedValue(mockDiff);

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Review report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
        },
        mockRunId
      );

      const generateTextCall = (generateText as jest.Mock).mock.calls[0][0];
      expect(generateTextCall.prompt).toContain(mockDiff);
      expect(generateTextCall.prompt).toContain('Security Audit');
      expect(generateTextCall.prompt).toContain('Code Quality');
    });

    it('should format PR comment with bot header', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: 'Review content',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'test_token' },
        ]),
      });

      (getRepoDetails as jest.Mock).mockResolvedValue({
        owner: 'test-owner',
        repo: 'test-repo',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
          prNumber: 42,
        },
        mockRunId
      );

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.body).toContain('🤖 AI Review Bot 评审意见');
      expect(body.body).toContain('Review content');
    });

    it('should use environment token when database token not available', async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, GITHUB_TOKEN: 'env_token' };

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Review report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      (getRepoDetails as jest.Mock).mockResolvedValue({
        owner: 'test-owner',
        repo: 'test-repo',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      await agent.run(
        {
          prototypeId: 1,
          branchName: 'feature-branch',
          prNumber: 42,
        },
        mockRunId
      );

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers.Authorization).toBe('token env_token');

      process.env = originalEnv;
    });
  });
});
