import { POST, GET } from '../compress/route';
import * as compression from '@/lib/compression';

// Mock the compression module
jest.mock('@/lib/compression');
jest.mock('@/lib/llm');

const mockCompressMessages = compression.compressMessages as jest.MockedFunction<typeof compression.compressMessages>;
const mockCompressFile = compression.compressFile as jest.MockedFunction<typeof compression.compressFile>;
const mockCompressFiles = compression.compressFiles as jest.MockedFunction<typeof compression.compressFiles>;
const mockSmartCompress = compression.smartCompress as jest.MockedFunction<typeof compression.smartCompress>;

// Helper to create mock request
function createRequest(body: any, url = 'http://localhost:3000/api/compression/compress'): any {
  return {
    json: async () => body,
    url,
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
  };
}

describe('POST /api/compression/compress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mode: messages', () => {
    it('should compress messages successfully', async () => {
      const mockResult = {
        compressedMessages: [{ role: 'user', content: 'compressed' }],
        compressedSystem: 'compressed system',
        stats: {
          originalChars: 1000,
          compressedChars: 300,
          savedChars: 700,
          reductionPercent: 70,
          blocksCompressed: 2,
          blocksSkipped: 1,
          lmStudioAvailable: true,
          compressionLevel: 'medium' as const,
          method: 'hybrid' as const,
        },
      };

      mockCompressMessages.mockResolvedValue(mockResult);

      const req = createRequest({
        mode: 'messages',
        messages: [{ role: 'user', content: 'test' }],
        system: 'system prompt',
        level: 'medium',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('messages');
      expect(data.compressedMessages).toEqual(mockResult.compressedMessages);
      expect(data.compressedSystem).toEqual(mockResult.compressedSystem);
      expect(data.stats).toEqual(mockResult.stats);
      expect(mockCompressMessages).toHaveBeenCalledWith(
        [{ role: 'user', content: 'test' }],
        'system prompt',
        'medium'
      );
    });

    it('should use default compression level when not specified', async () => {
      const mockResult = {
        compressedMessages: [],
        compressedSystem: '',
        stats: {
          originalChars: 0,
          compressedChars: 0,
          savedChars: 0,
          reductionPercent: 0,
          blocksCompressed: 0,
          blocksSkipped: 0,
          lmStudioAvailable: false,
          compressionLevel: 'medium' as const,
          method: 'hybrid' as const,
        },
      };

      mockCompressMessages.mockResolvedValue(mockResult);

      const req = createRequest({
        mode: 'messages',
        messages: [{ role: 'user', content: 'test' }],
      });

      await POST(req);

      expect(mockCompressMessages).toHaveBeenCalledWith(
        [{ role: 'user', content: 'test' }],
        '',
        'medium'
      );
    });

    it('should return 400 when messages array is missing', async () => {
      const req = createRequest({
        mode: 'messages',
        system: 'system prompt',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('messages array is required');
    });

    it('should return 400 when messages is not an array', async () => {
      const req = createRequest({
        mode: 'messages',
        messages: 'not an array',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('messages array is required');
    });

    it('should handle all compression levels', async () => {
      const levels: Array<'light' | 'medium' | 'aggressive'> = ['light', 'medium', 'aggressive'];

      for (const level of levels) {
        const mockResult = {
          compressedMessages: [],
          compressedSystem: '',
          stats: {
            originalChars: 0,
            compressedChars: 0,
            savedChars: 0,
            reductionPercent: 0,
            blocksCompressed: 0,
            blocksSkipped: 0,
            lmStudioAvailable: false,
            compressionLevel: level,
            method: 'hybrid' as const,
          },
        };

        mockCompressMessages.mockResolvedValue(mockResult);

        const req = createRequest({
          mode: 'messages',
          messages: [{ role: 'user', content: 'test' }],
          level,
        });

        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.stats.compressionLevel).toBe(level);
      }
    });

    it('should default to medium for invalid compression level', async () => {
      const mockResult = {
        compressedMessages: [],
        compressedSystem: '',
        stats: {
          originalChars: 0,
          compressedChars: 0,
          savedChars: 0,
          reductionPercent: 0,
          blocksCompressed: 0,
          blocksSkipped: 0,
          lmStudioAvailable: false,
          compressionLevel: 'medium' as const,
          method: 'hybrid' as const,
        },
      };

      mockCompressMessages.mockResolvedValue(mockResult);

      const req = createRequest({
        mode: 'messages',
        messages: [{ role: 'user', content: 'test' }],
        level: 'invalid',
      });

      await POST(req);

      expect(mockCompressMessages).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        'medium'
      );
    });
  });

  describe('mode: file', () => {
    it('should compress a single file successfully', async () => {
      const mockResult = {
        compressed: 'compressed content',
        stats: {
          originalSize: 1000,
          compressedSize: 300,
          reduction: 70,
          method: 'ast',
        },
      };

      mockCompressFile.mockResolvedValue(mockResult);

      const req = createRequest({
        mode: 'file',
        content: 'file content',
        filename: 'test.ts',
        level: 'medium',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('file');
      expect(data.compressed).toBe('compressed content');
      expect(data.stats).toEqual(mockResult.stats);
      expect(mockCompressFile).toHaveBeenCalledWith('test.ts', 'file content', 'medium');
    });

    it('should use default filename when not provided', async () => {
      const mockResult = {
        compressed: 'compressed',
        stats: {
          originalSize: 100,
          compressedSize: 50,
          reduction: 50,
          method: 'none',
        },
      };

      mockCompressFile.mockResolvedValue(mockResult);

      const req = createRequest({
        mode: 'file',
        content: 'content',
      });

      await POST(req);

      expect(mockCompressFile).toHaveBeenCalledWith('unknown.txt', 'content', 'medium');
    });

    it('should return 400 when content is missing', async () => {
      const req = createRequest({
        mode: 'file',
        filename: 'test.ts',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('content string is required');
    });

    it('should return 400 when content is not a string', async () => {
      const req = createRequest({
        mode: 'file',
        content: { not: 'a string' },
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('content string is required');
    });
  });

  describe('mode: files', () => {
    it('should compress multiple files successfully', async () => {
      const mockResult = {
        files: [
          { path: 'test1.ts', compressed: 'compressed1', method: 'ast' },
          { path: 'test2.js', compressed: 'compressed2', method: 'ast' },
        ],
        totalStats: {
          originalSize: 2000,
          compressedSize: 600,
          reduction: 70,
        },
      };

      mockCompressFiles.mockResolvedValue(mockResult);

      const req = createRequest({
        mode: 'files',
        files: [
          { path: 'test1.ts', content: 'content1' },
          { path: 'test2.js', content: 'content2' },
        ],
        level: 'aggressive',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('files');
      expect(data.files).toEqual(mockResult.files);
      expect(data.totalStats).toEqual(mockResult.totalStats);
      expect(mockCompressFiles).toHaveBeenCalledWith(
        [
          { path: 'test1.ts', content: 'content1' },
          { path: 'test2.js', content: 'content2' },
        ],
        'aggressive'
      );
    });

    it('should return 400 when files array is missing', async () => {
      const req = createRequest({
        mode: 'files',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('files array is required');
    });

    it('should return 400 when files is not an array', async () => {
      const req = createRequest({
        mode: 'files',
        files: 'not an array',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('files array is required');
    });
  });

  describe('mode: smart', () => {
    it('should use smart compression successfully', async () => {
      const mockResult = {
        compressed: 'smart compressed',
        level: 'medium' as const,
        stats: {
          originalSize: 8000,
          compressedSize: 2400,
          reduction: 70,
          method: 'ast',
          level: 'medium' as const,
        },
      };

      mockSmartCompress.mockResolvedValue(mockResult);

      const req = createRequest({
        mode: 'smart',
        content: 'content to compress',
        filename: 'test.ts',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('smart');
      expect(data.compressed).toBe('smart compressed');
      expect(data.level).toBe('medium');
      expect(data.stats).toEqual(mockResult.stats);
      expect(mockSmartCompress).toHaveBeenCalledWith('content to compress', 'test.ts');
    });

    it('should return 400 when content is missing', async () => {
      const req = createRequest({
        mode: 'smart',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('content string is required');
    });
  });

  describe('error handling', () => {
    it('should return 400 for invalid mode', async () => {
      const req = createRequest({
        mode: 'invalid',
        content: 'test',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid mode');
    });

    it('should return 500 when compression throws an error', async () => {
      mockCompressFile.mockRejectedValue(new Error('Compression failed'));

      const req = createRequest({
        mode: 'file',
        content: 'test content',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Compression failed');
    });

    it('should handle errors without message', async () => {
      mockCompressFile.mockRejectedValue(new Error());

      const req = createRequest({
        mode: 'file',
        content: 'test content',
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Compression failed');
    });
  });
});

describe('GET /api/compression/compress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return compression system status', async () => {
    const { isOllamaAvailable } = await import('@/lib/llm');
    const mockIsAvailable = isOllamaAvailable as jest.MockedFunction<typeof isOllamaAvailable>;
    mockIsAvailable.mockResolvedValue(true);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toEqual({
      ollamaAvailable: true,
      supportedModes: ['messages', 'file', 'files', 'smart'],
      supportedLevels: ['light', 'medium', 'aggressive'],
      compressionMethods: ['ast', 'llm', 'hybrid'],
    });
  });

  it('should handle Ollama unavailable', async () => {
    const { isOllamaAvailable } = await import('@/lib/llm');
    const mockIsAvailable = isOllamaAvailable as jest.MockedFunction<typeof isOllamaAvailable>;
    mockIsAvailable.mockResolvedValue(false);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status.ollamaAvailable).toBe(false);
  });

  it('should return 500 when status check fails', async () => {
    const { isLMStudioAvailable } = await import('@/lib/llm');
    const mockIsAvailable = isLMStudioAvailable as jest.MockedFunction<typeof isLMStudioAvailable>;
    mockIsAvailable.mockRejectedValue(new Error('Connection failed'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Connection failed');
  });
});
