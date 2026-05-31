import { ProtoBuilderAgent } from '../proto-builder';
import { db } from '@/lib/db';
import { generateText } from '@/lib/llm';
import { createBranch, commitAndPush, createPullRequest } from '@/lib/git';
import fs from 'fs';
import path from 'path';

// Mock ALL dependencies before any imports resolve
jest.mock('@/lib/db');
jest.mock('@/lib/llm');
jest.mock('@/lib/git');
jest.mock('@/lib/rag', () => ({
  indexRepository: jest.fn().mockResolvedValue(5),
  searchRepository: jest.fn().mockResolvedValue([]),
}));
jest.mock('fs');
jest.mock('path');
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));
jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn(() => jest.fn().mockResolvedValue({ stdout: 'Build successful', stderr: '' })),
}));
describe('ProtoBuilderAgent', () => {
  let agent: ProtoBuilderAgent;
  const mockRunId = 'test-run-123';

  beforeEach(() => {
    agent = new ProtoBuilderAgent();
    jest.clearAllMocks();

    // Mock path functions
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.dirname as jest.Mock).mockImplementation((p) => p.split('/').slice(0, -1).join('/'));
    
    // Mock process.cwd
    jest.spyOn(process, 'cwd').mockReturnValue('/mock/project');

    // Mock db.insert for trace
    (db.insert as jest.Mock) = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });
  });

  describe('name', () => {
    it('should have correct agent name', () => {
      expect(agent.name).toBe('ProtoBuilder');
    });
  });

  describe('run - assessOnly mode', () => {
    it('should perform feasibility assessment only', async () => {
      const input = {
        prototypeId: 1,
        name: 'Test Feature',
        description: 'A test feature description',
        branchName: 'feature/test',
        assessOnly: true,
      };

      // Mock getLLM
      const mockLLM = {
        model: { provider: 'openai', modelId: 'gpt-4o' },
        provider: 'openai',
      };
      jest.spyOn(agent as any, 'getLLM').mockResolvedValue(mockLLM);

      // Mock generateText for assessment
      (generateText as jest.Mock).mockResolvedValue({
        text: 'Feasibility assessment report',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      // Mock fs.existsSync and fs.readdirSync for component discovery
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['button.tsx', 'card.tsx']);

      // Mock db.update
      (db.update as jest.Mock) = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      });

      const result = await agent.run(input, mockRunId);

      expect(result).toEqual({ success: true });
      expect(generateText).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(createBranch).not.toHaveBeenCalled();
    });
  });

  describe('run - full generation mode', () => {
    beforeEach(() => {
      // Mock getLLM
      const mockLLM = {
        model: { provider: 'openai', modelId: 'gpt-4o' },
        provider: 'openai',
      };
      jest.spyOn(agent as any, 'getLLM').mockResolvedValue(mockLLM);

      // Mock db.select for feasibility report
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          {
            id: 1,
            feasibilityReport: 'Previous assessment report',
          },
        ]),
      });

      // Mock db.update
      (db.update as jest.Mock) = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      });

      // Mock fs operations
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    });

    it('should generate code and create PR successfully', async () => {
      const input = {
        prototypeId: 1,
        name: 'Test Feature',
        description: 'A test feature description',
        branchName: 'feature/test',
      };

      // Mock generateText for code generation
      const mockGeneratedCode = [
        {
          path: 'src/app/test-feature/page.tsx',
          content: 'export default function TestPage() { return <div>Test</div>; }',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockGeneratedCode) + '\n```',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      // Mock RAG
      jest.doMock('@/lib/rag', () => ({
        indexRepository: jest.fn().mockResolvedValue(10),
        searchRepository: jest.fn().mockResolvedValue([
          {
            text: 'Sample code',
            filePath: 'src/components/sample.tsx',
            startLine: 1,
          },
        ]),
      }));

      // Mock Git operations
      (createBranch as jest.Mock).mockResolvedValue(undefined);
      (commitAndPush as jest.Mock).mockResolvedValue('abc123');
      (createPullRequest as jest.Mock).mockResolvedValue({
        url: 'https://github.com/owner/repo/pull/1',
        number: 1,
      });

      // Mock self-heal loop (successful build)
      jest.spyOn(agent as any, 'selfHealLoop').mockResolvedValue(true);

      const result = await agent.run(input, mockRunId);

      expect(result.success).toBe(true);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/1');
      expect(createBranch).toHaveBeenCalledWith('feature/test');
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(commitAndPush).toHaveBeenCalled();
      expect(createPullRequest).toHaveBeenCalled();
    });

    it('should handle multimodal input with image', async () => {
      const input = {
        prototypeId: 1,
        name: 'Test Feature',
        description: 'A test feature description',
        branchName: 'feature/test',
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };

      const mockGeneratedCode = [
        {
          path: 'src/app/test-feature/page.tsx',
          content: 'export default function TestPage() { return <div>Test</div>; }',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockGeneratedCode) + '\n```',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (createBranch as jest.Mock).mockResolvedValue(undefined);
      (commitAndPush as jest.Mock).mockResolvedValue('abc123');
      (createPullRequest as jest.Mock).mockResolvedValue(null);

      jest.spyOn(agent as any, 'selfHealLoop').mockResolvedValue(true);

      const result = await agent.run(input, mockRunId);

      expect(result.success).toBe(true);
      
      // Verify multimodal message structure
      const generateTextCall = (generateText as jest.Mock).mock.calls[0][0];
      expect(generateTextCall.messages[0].content).toBeInstanceOf(Array);
      expect(generateTextCall.messages[0].content[0].type).toBe('text');
      expect(generateTextCall.messages[0].content[1].type).toBe('image');
    });

    it('should handle JSON parsing errors', async () => {
      const input = {
        prototypeId: 1,
        name: 'Test Feature',
        description: 'A test feature description',
        branchName: 'feature/test',
      };

      // Mock generateText returning invalid JSON
      (generateText as jest.Mock).mockResolvedValue({
        text: 'This is not valid JSON',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (createBranch as jest.Mock).mockResolvedValue(undefined);

      const result = await agent.run(input, mockRunId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM generated invalid JSON structure');
    });

    it('should prevent writing files outside project root', async () => {
      const input = {
        prototypeId: 1,
        name: 'Test Feature',
        description: 'A test feature description',
        branchName: 'feature/test',
      };

      // Mock generateText with malicious path
      const mockGeneratedCode = [
        {
          path: '../../../etc/passwd',
          content: 'malicious content',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockGeneratedCode) + '\n```',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (createBranch as jest.Mock).mockResolvedValue(undefined);

      // Mock path.join to simulate path traversal
      (path.join as jest.Mock).mockReturnValue('/etc/passwd');

      const result = await agent.run(input, mockRunId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security Exception');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should update status to failed on error', async () => {
      const input = {
        prototypeId: 1,
        name: 'Test Feature',
        description: 'A test feature description',
        branchName: 'feature/test',
      };

      // Mock createBranch to throw error
      (createBranch as jest.Mock).mockRejectedValue(new Error('Git error'));

      const result = await agent.run(input, mockRunId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Git error');
      
      // Verify status update
      expect(db.update).toHaveBeenCalled();
      const updateCall = (db.update as jest.Mock).mock.results[0].value;
      expect(updateCall.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
    });

    it('should handle PR creation failure gracefully', async () => {
      const input = {
        prototypeId: 1,
        name: 'Test Feature',
        description: 'A test feature description',
        branchName: 'feature/test',
      };

      const mockGeneratedCode = [
        {
          path: 'src/app/test-feature/page.tsx',
          content: 'export default function TestPage() { return <div>Test</div>; }',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockGeneratedCode) + '\n```',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      (createBranch as jest.Mock).mockResolvedValue(undefined);
      (commitAndPush as jest.Mock).mockResolvedValue('abc123');
      (createPullRequest as jest.Mock).mockResolvedValue(null); // No PR created

      jest.spyOn(agent as any, 'selfHealLoop').mockResolvedValue(true);

      const result = await agent.run(input, mockRunId);

      expect(result.success).toBe(true);
      expect(result.prUrl).toBe(''); // Empty string when no PR created
      
      // Verify status is 'generated' instead of 'pr_created'
      const updateCall = (db.update as jest.Mock).mock.results[0].value;
      expect(updateCall.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'generated' })
      );
    });
  });

  describe('selfHealLoop', () => {
    it('should pass on successful build', async () => {
      const mockFiles = [
        { path: 'src/test.tsx', content: 'test content' },
      ];
      const mockLLM = { model: { provider: 'openai' } };

      // Mock child_process exec to succeed
      const { exec } = require('child_process');
      const mockExec = jest.fn((cmd, opts, callback) => {
        callback(null, { stdout: 'Build successful', stderr: '' });
      });
      jest.spyOn(require('util'), 'promisify').mockReturnValue(
        jest.fn().mockResolvedValue({ stdout: 'Build successful', stderr: '' })
      );

      const result = await (agent as any).selfHealLoop(mockRunId, mockFiles, mockLLM);

      expect(result).toBe(true);
    });

    it('should attempt self-healing on build failure', async () => {
      const mockFiles = [
        { path: 'src/test.tsx', content: 'test content' },
      ];
      const mockLLM = { model: { provider: 'openai' } };

      // Mock build to fail first, then succeed
      let buildAttempt = 0;
      jest.spyOn(require('util'), 'promisify').mockReturnValue(
        jest.fn().mockImplementation(() => {
          buildAttempt++;
          if (buildAttempt === 1) {
            const error: any = new Error('Build failed');
            error.stdout = 'Type error in test.tsx';
            error.stderr = 'Error: Cannot find module';
            return Promise.reject(error);
          }
          return Promise.resolve({ stdout: 'Build successful', stderr: '' });
        })
      );

      // Mock generateText for healing
      const healedCode = [
        { path: 'src/test.tsx', content: 'fixed content' },
      ];
      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(healedCode) + '\n```',
      });

      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const result = await (agent as any).selfHealLoop(mockRunId, mockFiles, mockLLM);

      expect(result).toBe(true);
      expect(generateText).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('src/test.tsx'),
        'fixed content',
        'utf8'
      );
    });

    it('should give up after max retries', async () => {
      const mockFiles = [
        { path: 'src/test.tsx', content: 'test content' },
      ];
      const mockLLM = { model: { provider: 'openai' } };

      // Mock build to always fail
      jest.spyOn(require('util'), 'promisify').mockReturnValue(
        jest.fn().mockRejectedValue({
          stdout: 'Type error',
          stderr: 'Build failed',
        })
      );

      // Mock generateText for healing attempts
      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n[]\n```',
      });

      const result = await (agent as any).selfHealLoop(mockRunId, mockFiles, mockLLM);

      expect(result).toBe(false);
      expect(generateText).toHaveBeenCalledTimes(2); // maxRetries - 1
    });
  });

  describe('assessFeasibility', () => {
    it('should generate feasibility assessment', async () => {
      const mockLLM = { model: { provider: 'openai' } };
      const description = 'Build a user dashboard';

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['button.tsx', 'card.tsx', 'input.tsx']);

      (generateText as jest.Mock).mockResolvedValue({
        text: '# Feasibility Assessment\n\nThis is feasible.',
        usage: { inputTokens: 50, outputTokens: 100 },
      });

      const result = await (agent as any).assessFeasibility(description, mockLLM, mockRunId);

      expect(result).toContain('Feasibility Assessment');
      expect(generateText).toHaveBeenCalled();
      
      // Verify prompt includes available components
      const generateTextCall = (generateText as jest.Mock).mock.calls[0][0];
      expect(generateTextCall.prompt).toContain('button');
      expect(generateTextCall.prompt).toContain('card');
    });

    it('should handle missing UI components directory', async () => {
      const mockLLM = { model: { provider: 'openai' } };
      const description = 'Build a feature';

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      (generateText as jest.Mock).mockResolvedValue({
        text: 'Assessment result',
        usage: { inputTokens: 50, outputTokens: 100 },
      });

      const result = await (agent as any).assessFeasibility(description, mockLLM, mockRunId);

      expect(result).toBe('Assessment result');
      
      // Verify prompt indicates no components available
      const generateTextCall = (generateText as jest.Mock).mock.calls[0][0];
      expect(generateTextCall.prompt).toContain('None');
    });
  });
});
