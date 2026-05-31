import { getEmbedding, chunkFile, indexRepository, searchRepository } from '../rag';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

jest.mock('@lancedb/lancedb', () => ({
  connect: jest.fn(),
}));

jest.mock('fs');
jest.mock('path');

describe('RAG Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEmbedding', () => {
    it('should generate embedding vector for text', async () => {
      const mockPipeline = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      });

      const { pipeline } = await import('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue(mockPipeline);

      const result = await getEmbedding('test text');

      expect(result).toHaveLength(4);
      expect(result[0]).toBeCloseTo(0.1);
      expect(result[1]).toBeCloseTo(0.2);
      expect(mockPipeline).toHaveBeenCalledWith('test text', {
        pooling: 'mean',
        normalize: true,
      });
    });

    it('should reuse pipeline instance on subsequent calls', async () => {
      const mockPipeline = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2]),
      });

      // Clear any previous pipeline instance
      jest.resetModules();
      
      const { pipeline } = await import('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue(mockPipeline);

      // Import getEmbedding after mocking
      const { getEmbedding: freshGetEmbedding } = await import('../rag');

      await freshGetEmbedding('first call');
      await freshGetEmbedding('second call');

      // Pipeline should be called twice (once for each embedding)
      expect(mockPipeline).toHaveBeenCalledTimes(2);
    });
  });

  describe('chunkFile', () => {
    it('should return single chunk for small files', () => {
      const content = 'line1\nline2\nline3';
      const filePath = 'test.ts';

      const chunks = chunkFile(content, filePath);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        text: `File: ${filePath}\n\nCode:\n${content}`,
        filePath,
        startLine: 1,
      });
    });

    it('should split large files into overlapping chunks', () => {
      // Create content with 100 lines
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const content = lines.join('\n');
      const filePath = 'large.ts';

      const chunks = chunkFile(content, filePath);

      // Should create multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // First chunk should start at line 1
      expect(chunks[0].startLine).toBe(1);
      expect(chunks[0].filePath).toBe(filePath);

      // Chunks should overlap (chunkSize=60, overlap=15, so step=45)
      expect(chunks[1].startLine).toBe(46); // 1 + 45
    });

    it('should include file path and line numbers in chunk text', () => {
      const lines = Array.from({ length: 70 }, (_, i) => `line ${i + 1}`);
      const content = lines.join('\n');
      const filePath = 'test.ts';

      const chunks = chunkFile(content, filePath);

      expect(chunks[0].text).toContain(`File: ${filePath} (Lines 1 - 60)`);
      expect(chunks[0].text).toContain('Code:');
    });

    it('should skip trailing tiny chunks', () => {
      // Create content that would result in a tiny last chunk
      const lines = Array.from({ length: 65 }, (_, i) => `line ${i + 1}`);
      const content = lines.join('\n');

      const chunks = chunkFile(content, 'test.ts');

      // Should not include the tiny trailing chunk (< 10 lines)
      const lastChunk = chunks[chunks.length - 1];
      const lastChunkLines = lastChunk.text.split('\n').length;
      expect(lastChunkLines).toBeGreaterThanOrEqual(10);
    });
  });

  describe('indexRepository', () => {
    beforeEach(() => {
      // Mock process.cwd
      jest.spyOn(process, 'cwd').mockReturnValue('/mock/project');

      // Mock path.join
      (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
      (path.relative as jest.Mock).mockImplementation((from, to) => to.replace(from + '/', ''));
      (path.extname as jest.Mock).mockImplementation((file) => {
        const parts = file.split('.');
        return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
      });
    });

    it('should return 0 when no files found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const count = await indexRepository();

      expect(count).toBe(0);
    });

    it('should index files and return chunk count', async () => {
      // Mock file system
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.ts']);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      (fs.readFileSync as jest.Mock).mockReturnValue('const x = 1;\nconst y = 2;');

      // Mock embedding generation
      const mockPipeline = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3]),
      });
      const { pipeline } = await import('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue(mockPipeline);

      // Mock LanceDB
      const mockTable = { createTable: jest.fn() };
      const mockDb = {
        createTable: jest.fn().mockResolvedValue(mockTable),
      };
      const { connect } = await import('@lancedb/lancedb');
      (connect as jest.Mock).mockResolvedValue(mockDb);

      const count = await indexRepository();

      expect(count).toBeGreaterThan(0);
      expect(mockDb.createTable).toHaveBeenCalledWith(
        'code_chunks',
        expect.any(Array),
        { mode: 'overwrite' }
      );
    });

    it('should call trace callback with progress messages', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const traceCallback = jest.fn().mockResolvedValue(undefined);
      await indexRepository(traceCallback);

      expect(traceCallback).toHaveBeenCalledWith(expect.stringContaining('开始检索'));
      expect(traceCallback).toHaveBeenCalledWith(expect.stringContaining('未找到'));
    });

    it('should handle file read errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.ts', 'error.ts']);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce('const x = 1;')
        .mockImplementationOnce(() => {
          throw new Error('Read error');
        });

      // Mock embedding
      const mockPipeline = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2]),
      });
      const { pipeline } = await import('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue(mockPipeline);

      // Mock LanceDB
      const mockDb = { createTable: jest.fn() };
      const { connect } = await import('@lancedb/lancedb');
      (connect as jest.Mock).mockResolvedValue(mockDb);

      const count = await indexRepository();

      // Should still index the successful file
      expect(count).toBeGreaterThan(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to index file'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('searchRepository', () => {
    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue('/mock/project');
      (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    });

    it('should return empty array when database does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const results = await searchRepository('test query');

      expect(results).toEqual([]);
    });

    it('should return empty array when table does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockDb = {
        tableNames: jest.fn().mockResolvedValue(['other_table']),
      };
      const { connect } = await import('@lancedb/lancedb');
      (connect as jest.Mock).mockResolvedValue(mockDb);

      const results = await searchRepository('test query');

      expect(results).toEqual([]);
    });

    it('should search and return matching chunks', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Mock embedding
      const mockPipeline = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3]),
      });
      const { pipeline } = await import('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue(mockPipeline);

      // Mock LanceDB search results
      const mockSearchResults = [
        {
          text: 'File: test.ts\n\nCode:\nconst x = 1;',
          filePath: 'src/test.ts',
          startLine: 1,
          _distance: 0.15,
        },
        {
          text: 'File: utils.ts\n\nCode:\nexport function util() {}',
          filePath: 'src/utils.ts',
          startLine: 10,
          _distance: 0.25,
        },
      ];

      const mockSearch = {
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockSearchResults),
      };

      const mockTable = {
        search: jest.fn().mockReturnValue(mockSearch),
      };

      const mockDb = {
        tableNames: jest.fn().mockResolvedValue(['code_chunks']),
        openTable: jest.fn().mockResolvedValue(mockTable),
      };

      const { connect } = await import('@lancedb/lancedb');
      (connect as jest.Mock).mockResolvedValue(mockDb);

      const results = await searchRepository('test query', 2);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        text: 'File: test.ts\n\nCode:\nconst x = 1;',
        filePath: 'src/test.ts',
        startLine: 1,
        score: 0.15,
      });
      expect(mockSearch.limit).toHaveBeenCalledWith(2);
    });

    it('should use default limit of 3', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockPipeline = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2]),
      });
      const { pipeline } = await import('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue(mockPipeline);

      const mockSearch = {
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      };

      const mockTable = { search: jest.fn().mockReturnValue(mockSearch) };
      const mockDb = {
        tableNames: jest.fn().mockResolvedValue(['code_chunks']),
        openTable: jest.fn().mockResolvedValue(mockTable),
      };

      const { connect } = await import('@lancedb/lancedb');
      (connect as jest.Mock).mockResolvedValue(mockDb);

      await searchRepository('test query');

      expect(mockSearch.limit).toHaveBeenCalledWith(3);
    });

    it('should handle search errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const { connect } = await import('@lancedb/lancedb');
      (connect as jest.Mock).mockRejectedValue(new Error('Database error'));

      const results = await searchRepository('test query');

      expect(results).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to search lancedb vector index:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
