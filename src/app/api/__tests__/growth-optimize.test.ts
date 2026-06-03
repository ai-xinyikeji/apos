/**
 * Security and functionality tests for /api/growth/optimize and /api/growth/optimize/apply
 * Focuses on path traversal protection and input validation.
 */

import path from 'path';

// Mock dependencies
jest.mock('@/lib/growth/optimizer', () => ({
  uiOptimizer: {
    optimizeComponent: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    ...actual,
    isAbsolute: actual.isAbsolute.bind(actual),
    join: actual.join.bind(actual),
    relative: actual.relative.bind(actual),
    sep: actual.sep,
  };
});

const PROJECT_ROOT = process.cwd();

// Helper to make a mock NextRequest
function makeRequest(body: object) {
  return {
    json: async () => body,
  } as any;
}

// ─── /api/growth/optimize ────────────────────────────────────────────────────

describe('POST /api/growth/optimize', () => {
  let POST: any;
  let uiOptimizer: any;
  let fs: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    uiOptimizer = require('@/lib/growth/optimizer').uiOptimizer;
    fs = require('fs');
    ({ POST } = require('../growth/optimize/route'));
  });

  describe('input validation', () => {
    it('should return 400 when componentName is missing', async () => {
      const response = await POST(makeRequest({ filePath: 'src/components/button.tsx' }));
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 400 when filePath is missing', async () => {
      const response = await POST(makeRequest({ componentName: 'Button' }));
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('path traversal protection', () => {
    it('should reject path traversal with ../  sequences', async () => {
      const response = await POST(makeRequest({
        componentName: 'Button',
        filePath: '../../../etc/passwd',
      }));
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('outside the project directory');
    });

    it('should reject absolute path outside project root', async () => {
      const response = await POST(makeRequest({
        componentName: 'Button',
        filePath: '/etc/passwd',
      }));
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject encoded traversal attempts', async () => {
      const response = await POST(makeRequest({
        componentName: 'Button',
        filePath: '..%2F..%2Fetc%2Fpasswd',
      }));
      // Either blocked by path traversal check or 404 (file not found)
      expect([403, 404, 500]).toContain(response.status);
    });

    it('should allow valid relative path within project', async () => {
      uiOptimizer.optimizeComponent.mockResolvedValue({
        componentName: 'Button',
        metricSummary: { uses: 10, sentimentScore: 70 },
        analysis: '良好的组件结构',
        codeSuggestions: [],
      });

      const response = await POST(makeRequest({
        componentName: 'Button',
        filePath: 'src/components/ui/button.tsx',
      }));

      // Should not be blocked (even if file doesn't exist, it's within project root)
      expect(response.status).not.toBe(403);
    });
  });

  describe('optimizer results', () => {
    it('should return 404 when optimizer returns null (file not found)', async () => {
      uiOptimizer.optimizeComponent.mockResolvedValue(null);

      const response = await POST(makeRequest({
        componentName: 'Button',
        filePath: 'src/components/ui/nonexistent.tsx',
      }));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return optimization result on success', async () => {
      const mockResult = {
        componentName: 'Button',
        metricSummary: { uses: 50, avgDuration: 120, sentimentScore: 80 },
        analysis: 'Component has good structure but could use better animations',
        codeSuggestions: [
          {
            filePath: 'src/components/ui/button.tsx',
            description: 'Add hover animation',
            originalCodeSnippet: 'className="btn"',
            optimizedCodeSnippet: 'className="btn hover:scale-105 transition-transform"',
          },
        ],
      };
      uiOptimizer.optimizeComponent.mockResolvedValue(mockResult);

      const response = await POST(makeRequest({
        componentName: 'Button',
        filePath: 'src/components/ui/button.tsx',
      }));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.result.componentName).toBe('Button');
    });
  });
});

// ─── /api/growth/optimize/apply ─────────────────────────────────────────────

describe('POST /api/growth/optimize/apply', () => {
  let POST: any;
  let fs: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    fs = require('fs');
    ({ POST } = require('../growth/optimize/apply/route'));
  });

  describe('input validation', () => {
    it('should return 400 when filePath is missing', async () => {
      const response = await POST(makeRequest({
        originalCodeSnippet: 'old code',
        optimizedCodeSnippet: 'new code',
      }));
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 400 when originalCodeSnippet is missing', async () => {
      const response = await POST(makeRequest({
        filePath: 'src/components/button.tsx',
        optimizedCodeSnippet: 'new code',
      }));
      expect(response.status).toBe(400);
    });

    it('should return 400 when optimizedCodeSnippet is missing', async () => {
      const response = await POST(makeRequest({
        filePath: 'src/components/button.tsx',
        originalCodeSnippet: 'old code',
      }));
      expect(response.status).toBe(400);
    });
  });

  describe('path traversal protection', () => {
    it('should reject path traversal with ../ sequences', async () => {
      const response = await POST(makeRequest({
        filePath: '../../../etc/passwd',
        originalCodeSnippet: 'root:x:0:0',
        optimizedCodeSnippet: 'hacked',
      }));
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('outside the project directory');
    });

    it('should reject absolute path outside project root', async () => {
      const response = await POST(makeRequest({
        filePath: '/etc/hosts',
        originalCodeSnippet: 'localhost',
        optimizedCodeSnippet: 'evil',
      }));
      expect(response.status).toBe(403);
    });

    it('should reject Windows-style traversal', async () => {
      const response = await POST(makeRequest({
        filePath: '..\\..\\Windows\\System32\\config\\SAM',
        originalCodeSnippet: 'data',
        optimizedCodeSnippet: 'evil',
      }));
      // Either blocked by path check or 404
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('file operations', () => {
    it('should return 404 when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const response = await POST(makeRequest({
        filePath: 'src/components/nonexistent.tsx',
        originalCodeSnippet: 'old code',
        optimizedCodeSnippet: 'new code',
      }));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 400 when original snippet not found in file', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('completely different content');

      const response = await POST(makeRequest({
        filePath: 'src/components/button.tsx',
        originalCodeSnippet: 'code that does not exist in file',
        optimizedCodeSnippet: 'new code',
      }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found in target file');
    });

    it('should apply optimization and create backup on success', async () => {
      const originalContent = 'export function Button() { return <button className="btn">Click</button>; }';
      const originalSnippet = 'className="btn"';
      const optimizedSnippet = 'className="btn hover:scale-105"';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(originalContent);
      fs.writeFileSync.mockReturnValue(undefined);

      const response = await POST(makeRequest({
        filePath: 'src/components/ui/button.tsx',
        originalCodeSnippet: originalSnippet,
        optimizedCodeSnippet: optimizedSnippet,
      }));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.backupFile).toContain('.bak');

      // Verify backup was created
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      const backupCall = fs.writeFileSync.mock.calls[0];
      expect(backupCall[0]).toContain('.bak');
      expect(backupCall[1]).toBe(originalContent);

      // Verify optimized content was written
      const applyCall = fs.writeFileSync.mock.calls[1];
      expect(applyCall[1]).toContain(optimizedSnippet);
      expect(applyCall[1]).not.toContain(originalSnippet);
    });
  });
});
