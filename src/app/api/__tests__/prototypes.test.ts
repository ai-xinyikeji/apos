/**
 * API Route Tests for /api/prototypes
 */


// Mock the database
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  },
}));

jest.mock('@/lib/schema', () => ({
  prototypes: {
    id: 'id',
    name: 'name',
    description: 'description',
    branchName: 'branchName',
    status: 'status',
    createdAt: 'createdAt',
  },
}));

jest.mock('drizzle-orm', () => ({
  desc: jest.fn((col) => ({ col, direction: 'desc' })),
  eq: jest.fn((col, val) => ({ col, val })),
}));

describe('/api/prototypes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return list of prototypes', async () => {
      const mockPrototypes = [
        {
          id: 1,
          name: 'Test Prototype',
          description: 'Test description',
          branchName: 'proto/test-123',
          status: 'draft',
          createdAt: new Date().toISOString(),
        },
      ];

      const { db } = require('@/lib/db');
      db.orderBy.mockResolvedValue(mockPrototypes);

      const { GET } = require('../prototypes/route');
      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Test Prototype');
    });

    it('should handle database errors', async () => {
      const { db } = require('@/lib/db');
      db.orderBy.mockRejectedValue(new Error('Database error'));

      const { GET } = require('../prototypes/route');
      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('POST', () => {
    const makeRequest = (body: object) => ({
      json: async () => body,
    });

    it('should create a new prototype', async () => {
      const mockPrototype = {
        id: 1,
        name: 'New Prototype',
        description: 'New description',
        branchName: 'proto/new-prototype-123456',
        status: 'draft',
        createdAt: new Date().toISOString(),
      };

      const { db } = require('@/lib/db');
      db.returning.mockResolvedValue([mockPrototype]);

      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({
        name: 'New Prototype',
        description: 'New description',
      }));

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data.name).toBe('New Prototype');
    });

    it('should validate required name field', async () => {
      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({ description: 'Some description' }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should validate required description field', async () => {
      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({ name: 'Some name' }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should validate name length', async () => {
      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({
        name: 'a'.repeat(101),
        description: 'Test',
      }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('100');
    });

    it('should validate description length', async () => {
      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({
        name: 'Test',
        description: 'a'.repeat(5001),
      }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('5000');
    });

    it('should sanitize branch name from special characters', async () => {
      const mockPrototype = {
        id: 1,
        name: 'Test Name!@#',
        description: 'Test',
        branchName: 'proto/test-name-123456',
        status: 'draft',
        createdAt: new Date().toISOString(),
      };

      const { db } = require('@/lib/db');
      db.returning.mockResolvedValue([mockPrototype]);

      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({
        name: 'Test Name!@#',
        description: 'Test description',
      }));

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.branchName).toMatch(/^proto\/[a-z0-9\-]+-\d+$/);
    });

    it('should reject empty name string', async () => {
      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({
        name: '   ',
        description: 'Test description',
      }));

      expect(response.status).toBe(400);
    });

    it('should reject empty description string', async () => {
      const { POST } = require('../prototypes/route');
      const response = await POST(makeRequest({
        name: 'Test',
        description: '   ',
      }));

      expect(response.status).toBe(400);
    });
  });
});
