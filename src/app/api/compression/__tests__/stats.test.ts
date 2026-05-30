import { GET } from '../stats/route';
import { db } from '@/lib/db';

// Mock the database
jest.mock('@/lib/db');

const mockDb = db as jest.Mocked<typeof db>;

// Helper to create mock request
function createRequest(params?: Record<string, string>): any {
  const url = new URL('http://localhost:3000/api/compression/stats');
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return {
    url: url.toString(),
    method: 'GET',
    headers: new Headers(),
  };
}

describe('GET /api/compression/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return compression statistics for default 30 days', async () => {
    const mockRuns = [
      {
        id: 1,
        agentName: 'proto_builder',
        runId: 'run-1',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 10000,
            compressedChars: 3000,
            savedChars: 7000,
            reductionPercent: 70,
            blocksCompressed: 5,
            blocksSkipped: 2,
            method: 'hybrid',
          },
        }),
      },
      {
        id: 2,
        agentName: 'proto_builder',
        runId: 'run-2',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 8000,
            compressedChars: 2400,
            savedChars: 5600,
            reductionPercent: 70,
            blocksCompressed: 3,
            blocksSkipped: 1,
            method: 'ast',
          },
        }),
      },
    ];

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRuns),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.stats).toBeDefined();
    
    // Check total stats (10000 + 8000) / 4 = 4500 tokens original
    expect(data.stats.totalOriginalTokens).toBe(4500);
    // (3000 + 2400) / 4 = 1350 tokens compressed
    expect(data.stats.totalCompressedTokens).toBe(1350);
    // 4500 - 1350 = 3150 tokens saved
    expect(data.stats.totalSavedTokens).toBe(3150);
    expect(data.stats.compressionCount).toBe(2);
    
    // Average compression rate: (3150 / 4500) * 100 = 70%
    expect(data.stats.avgCompressionRate).toBe(70);
    
    // Average saved per run: 3150 / 2 = 1575
    expect(data.stats.avgSavedPerRun).toBe(1575);
    
    // Method breakdown
    expect(data.stats.methodBreakdown.ast).toBe(1);
    expect(data.stats.methodBreakdown.hybrid).toBe(1);
    expect(data.stats.methodBreakdown.llm).toBe(0);
  });

  it('should respect custom days parameter', async () => {
    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = createRequest({ days: '7' });
    await GET(req);

    // Verify the where clause was called (checking date filtering)
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should handle runs without compression stats', async () => {
    const mockRuns = [
      {
        id: 1,
        agentName: 'proto_builder',
        runId: 'run-1',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          promptTokens: 100,
          completionTokens: 50,
        }),
      },
    ];

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRuns),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.compressionCount).toBe(0);
    expect(data.stats.totalSavedTokens).toBe(0);
  });

  it('should calculate cost savings correctly', async () => {
    const mockRuns = [
      {
        id: 1,
        agentName: 'proto_builder',
        runId: 'run-1',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 4000000, // 1M tokens
            compressedChars: 0,
            savedChars: 4000000,
            reductionPercent: 100,
            blocksCompressed: 1,
            blocksSkipped: 0,
            method: 'ast',
          },
        }),
      },
    ];

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRuns),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    // 1M tokens saved * $3/1M = $3.00
    expect(data.stats.estimatedCostSavings).toBe('3.00');
  });

  it('should aggregate daily statistics', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const mockRuns = [
      {
        id: 1,
        agentName: 'proto_builder',
        runId: 'run-1',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 4000,
            compressedChars: 1200,
            savedChars: 2800,
            reductionPercent: 70,
            blocksCompressed: 2,
            blocksSkipped: 0,
            method: 'ast',
          },
        }),
      },
      {
        id: 2,
        agentName: 'proto_builder',
        runId: 'run-2',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: yesterday,
        details: JSON.stringify({
          compressionStats: {
            originalChars: 8000,
            compressedChars: 2400,
            savedChars: 5600,
            reductionPercent: 70,
            blocksCompressed: 3,
            blocksSkipped: 1,
            method: 'hybrid',
          },
        }),
      },
    ];

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRuns),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.dailyStats).toBeDefined();
    expect(Array.isArray(data.stats.dailyStats)).toBe(true);
    expect(data.stats.dailyStats.length).toBeGreaterThan(0);
    
    // Check that daily stats are sorted by date
    const dates = data.stats.dailyStats.map((s: any) => s.date);
    const sortedDates = [...dates].sort();
    expect(dates).toEqual(sortedDates);
  });

  it('should handle empty results', async () => {
    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.stats.compressionCount).toBe(0);
    expect(data.stats.totalSavedTokens).toBe(0);
    expect(data.stats.avgCompressionRate).toBe(0);
    expect(data.stats.avgSavedPerRun).toBe(0);
    expect(data.stats.estimatedCostSavings).toBe('0.00');
  });

  it('should handle runs with null metadata', async () => {
    const mockRuns = [
      {
        id: 1,
        agentName: 'proto_builder',
        runId: 'run-1',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: null,
      },
    ];

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRuns),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.compressionCount).toBe(0);
  });

  it('should count compression methods correctly', async () => {
    const mockRuns = [
      {
        id: 1,
        agentName: 'proto_builder',
        runId: 'run-1',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 4000,
            compressedChars: 1200,
            method: 'ast',
          },
        }),
      },
      {
        id: 2,
        agentName: 'proto_builder',
        runId: 'run-2',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 4000,
            compressedChars: 1200,
            method: 'llm',
          },
        }),
      },
      {
        id: 3,
        agentName: 'proto_builder',
        runId: 'run-3',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 4000,
            compressedChars: 1200,
            method: 'hybrid',
          },
        }),
      },
    ];

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRuns),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.methodBreakdown.ast).toBe(1);
    expect(data.stats.methodBreakdown.llm).toBe(1);
    expect(data.stats.methodBreakdown.hybrid).toBe(1);
  });

  it('should return 500 on database error', async () => {
    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockRejectedValue(new Error('Database connection failed')),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Database connection failed');
  });

  it('should handle invalid days parameter gracefully', async () => {
    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = createRequest({ days: 'invalid' });
    const response = await GET(req);
    const data = await response.json();

    // Should default to 30 days and still work
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should handle very large numbers correctly', async () => {
    const mockRuns = [
      {
        id: 1,
        agentName: 'proto_builder',
        runId: 'run-1',
        step: 'init',
        message: 'completed',
        status: 'completed',
        createdAt: new Date().toISOString(),
        details: JSON.stringify({
          compressionStats: {
            originalChars: 10000000, // 2.5M tokens
            compressedChars: 3000000, // 750K tokens
            savedChars: 7000000, // 1.75M tokens
            reductionPercent: 70,
            blocksCompressed: 100,
            blocksSkipped: 20,
            method: 'hybrid',
          },
        }),
      },
    ];

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRuns),
        }),
      }),
    });

    const req = createRequest();
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.totalOriginalTokens).toBe(2500000);
    expect(data.stats.totalCompressedTokens).toBe(750000);
    expect(data.stats.totalSavedTokens).toBe(1750000);
    // 1.75M tokens * $3/1M = $5.25
    expect(parseFloat(data.stats.estimatedCostSavings)).toBeCloseTo(5.25, 2);
  });
});
