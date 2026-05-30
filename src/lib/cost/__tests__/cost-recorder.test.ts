/**
 * Tests for CostRecorder
 */

import { CostRecorder, MODEL_PRICING } from '../cost-recorder';
import { db } from '../../db';

jest.mock('../../db', () => ({
  db: {
    insert: jest.fn(),
  },
}));

describe('CostRecorder', () => {
  let recorder: CostRecorder;
  let mockInsertValues: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    recorder = new CostRecorder();
    mockInsertValues = jest.fn().mockResolvedValue(undefined);
    (db.insert as jest.Mock).mockReturnValue({ values: mockInsertValues });
  });

  afterEach(async () => {
    // Flush any pending records
    await recorder.flush();
  });

  // ── calculateCost ──────────────────────────────────────────────────────────

  describe('calculateCost()', () => {
    it('calculates input + output cost for anthropic sonnet', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        taskType: 'coding',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      // input: 300 cents + output: 1500 cents = 1800 cents
      expect(totalCost).toBe(1800);
    });

    it('calculates cost for haiku (cheaper model)', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'anthropic',
        modelName: 'claude-3-5-haiku-20241022',
        taskType: 'summarize',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      // input: 80 + output: 400 = 480 cents
      expect(totalCost).toBe(480);
    });

    it('returns 0 cost for lmstudio', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'lmstudio',
        modelName: 'local-model',
        taskType: 'coding',
        inputTokens: 10_000,
        outputTokens: 5_000,
      });
      expect(totalCost).toBe(0);
    });

    it('includes cache creation cost', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        taskType: 'coding',
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 1_000_000,
      });
      // cacheWrite: 375 cents per 1M
      expect(totalCost).toBe(375);
    });

    it('includes cache read cost (cheaper than input)', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        taskType: 'coding',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      });
      // cacheRead: 30 cents per 1M
      expect(totalCost).toBe(30);
    });

    it('calculates cache savings correctly', () => {
      const { cacheSavings } = recorder.calculateCost({
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        taskType: 'coding',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      });
      // Full price: 300 cents, cache price: 30 cents → savings: 270 cents
      expect(cacheSavings).toBe(270);
    });

    it('returns 0 cache savings when no cache reads', () => {
      const { cacheSavings } = recorder.calculateCost({
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        taskType: 'coding',
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(cacheSavings).toBe(0);
    });

    it('returns 0 for unknown provider', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'unknown-provider',
        modelName: 'some-model',
        taskType: 'coding',
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(totalCost).toBe(0);
    });

    it('calculates openai gpt-4o cost', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'openai',
        modelName: 'gpt-4o',
        taskType: 'coding',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      // input: 250 + output: 1000 = 1250 cents
      expect(totalCost).toBe(1250);
    });

    it('calculates google gemini-flash cost', () => {
      const { totalCost } = recorder.calculateCost({
        provider: 'google',
        modelName: 'gemini-1.5-flash',
        taskType: 'summarize',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      // input: 7 + output: 30 = 37 cents
      expect(totalCost).toBe(37);
    });
  });

  // ── getPricing ─────────────────────────────────────────────────────────────

  describe('getPricing()', () => {
    it('returns pricing for known anthropic model', () => {
      const pricing = recorder.getPricing('anthropic', 'claude-3-5-sonnet-20241022');
      expect(pricing).not.toBeNull();
      expect(pricing?.input).toBe(300);
    });

    it('returns wildcard pricing for lmstudio', () => {
      const pricing = recorder.getPricing('lmstudio', 'any-model');
      expect(pricing).not.toBeNull();
      expect(pricing?.input).toBe(0);
    });

    it('returns null for unknown provider', () => {
      const pricing = recorder.getPricing('unknown', 'model');
      expect(pricing).toBeNull();
    });
  });

  // ── record() and flush() ───────────────────────────────────────────────────

  describe('record() and flush()', () => {
    it('flushes records to database', async () => {
      recorder.record({
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        taskType: 'coding',
        inputTokens: 1000,
        outputTokens: 500,
      });

      await recorder.flush();

      expect(db.insert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'anthropic',
            modelName: 'claude-3-5-sonnet-20241022',
            taskType: 'coding',
          }),
        ])
      );
    });

    it('does nothing when queue is empty', async () => {
      await recorder.flush();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('batches multiple records in one insert', async () => {
      recorder.record({ provider: 'anthropic', modelName: 'claude-3-5-haiku-20241022', taskType: 'summarize', inputTokens: 100, outputTokens: 50 });
      recorder.record({ provider: 'openai', modelName: 'gpt-4o-mini', taskType: 'coding', inputTokens: 200, outputTokens: 100 });
      recorder.record({ provider: 'google', modelName: 'gemini-1.5-flash', taskType: 'review', inputTokens: 300, outputTokens: 150 });

      await recorder.flush();

      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ provider: 'anthropic' }),
          expect.objectContaining({ provider: 'openai' }),
          expect.objectContaining({ provider: 'google' }),
        ])
      );
    });

    it('assigns unique IDs to each record', async () => {
      recorder.record({ provider: 'anthropic', modelName: 'claude-3-5-haiku-20241022', taskType: 'coding', inputTokens: 100, outputTokens: 50 });
      recorder.record({ provider: 'anthropic', modelName: 'claude-3-5-haiku-20241022', taskType: 'coding', inputTokens: 100, outputTokens: 50 });

      await recorder.flush();

      const insertedRows = mockInsertValues.mock.calls[0][0];
      expect(insertedRows[0].id).not.toBe(insertedRows[1].id);
    });
  });

  // ── batchRecord() ──────────────────────────────────────────────────────────

  describe('batchRecord()', () => {
    it('queues all records for batch insert', async () => {
      recorder.batchRecord([
        { provider: 'anthropic', modelName: 'claude-3-5-haiku-20241022', taskType: 'coding', inputTokens: 100, outputTokens: 50 },
        { provider: 'openai', modelName: 'gpt-4o-mini', taskType: 'review', inputTokens: 200, outputTokens: 100 },
      ]);

      await recorder.flush();

      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ provider: 'anthropic' }),
          expect.objectContaining({ provider: 'openai' }),
        ])
      );
    });
  });

  // ── MODEL_PRICING ──────────────────────────────────────────────────────────

  describe('MODEL_PRICING', () => {
    it('has pricing for all major anthropic models', () => {
      expect(MODEL_PRICING.anthropic['claude-3-5-sonnet-20241022']).toBeDefined();
      expect(MODEL_PRICING.anthropic['claude-3-5-haiku-20241022']).toBeDefined();
      expect(MODEL_PRICING.anthropic['claude-3-opus-20240229']).toBeDefined();
      expect(MODEL_PRICING.anthropic['claude-3-7-sonnet-20250219']).toBeDefined();
    });

    it('has pricing for openai models', () => {
      expect(MODEL_PRICING.openai['gpt-4o']).toBeDefined();
      expect(MODEL_PRICING.openai['gpt-4o-mini']).toBeDefined();
    });

    it('has pricing for google models', () => {
      expect(MODEL_PRICING.google['gemini-1.5-pro-latest']).toBeDefined();
      expect(MODEL_PRICING.google['gemini-1.5-flash']).toBeDefined();
    });

    it('has zero-cost pricing for lmstudio', () => {
      expect(MODEL_PRICING.lmstudio['*'].input).toBe(0);
      expect(MODEL_PRICING.lmstudio['*'].output).toBe(0);
    });
  });
});
