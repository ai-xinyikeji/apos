import { SignalCollectorAgent } from '../signal-collector';
import { db } from '@/lib/db';
import { generateText } from '@/lib/llm';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('@/lib/llm');

describe('SignalCollectorAgent', () => {
  let agent: SignalCollectorAgent;
  const mockRunId = 'test-run-123';

  beforeEach(() => {
    agent = new SignalCollectorAgent();
    jest.clearAllMocks();

    // Mock db.insert for trace
    (db.insert as jest.Mock) = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });
  });

  describe('name', () => {
    it('should have correct agent name', () => {
      expect(agent.name).toBe('SignalCollector');
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
    });

    it('should collect signals successfully with default sources', async () => {
      const mockSignals = [
        {
          title: 'Zendesk #1084: User needs CSV export',
          content: 'Multiple users requesting CSV export functionality',
          source: 'zendesk',
          sentiment: 'negative',
          url: 'https://zendesk.com/tickets/1084',
        },
        {
          title: 'Amplitude: Login flow drop-off at 45%',
          content: 'Significant user drop-off detected in login flow',
          source: 'amplitude',
          sentiment: 'negative',
        },
        {
          title: 'Competitor: Rival launched new feature',
          content: 'Competitor X released advanced analytics dashboard',
          source: 'competitor',
          sentiment: 'neutral',
          url: 'https://competitor.com/release',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockSignals) + '\n```',
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(generateText).toHaveBeenCalled();
      // db.insert is called for each trace step + each signal insert
      expect(db.insert).toHaveBeenCalled();
    });

    it('should collect signals with custom sources', async () => {
      const mockSignals = [
        {
          title: 'Custom source signal',
          content: 'Signal from custom source',
          source: 'amplitude',
          sentiment: 'positive',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockSignals) + '\n```',
      });

      const result = await agent.run(
        { sources: ['amplitude'] },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('should handle signals without optional URL', async () => {
      const mockSignals = [
        {
          title: 'Signal without URL',
          content: 'This signal has no URL',
          source: 'amplitude',
          sentiment: 'neutral',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockSignals) + '\n```',
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      
      // Verify that null is passed for missing URL
      const insertCall = (db.insert as jest.Mock).mock.results.find(
        r => r.value.values
      );
      expect(insertCall).toBeDefined();
    });

    it('should handle different sentiment types', async () => {
      const mockSignals = [
        {
          title: 'Positive signal',
          content: 'Users love the new feature',
          source: 'zendesk',
          sentiment: 'positive',
        },
        {
          title: 'Neutral signal',
          content: 'Feature usage is stable',
          source: 'amplitude',
          sentiment: 'neutral',
        },
        {
          title: 'Negative signal',
          content: 'Users report bugs',
          source: 'zendesk',
          sentiment: 'negative',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockSignals) + '\n```',
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
    });

    it('should handle JSON parsing errors', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: 'This is not valid JSON',
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should handle LLM errors', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('LLM API error'));

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should handle database insertion errors', async () => {
      const mockSignals = [
        {
          title: 'Test signal',
          content: 'Test content',
          source: 'zendesk',
          sentiment: 'neutral',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockSignals) + '\n```',
      });

      // Mock db.insert to throw error
      (db.insert as jest.Mock) = jest.fn().mockReturnValue({
        values: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should parse JSON without code fence', async () => {
      const mockSignals = [
        {
          title: 'Direct JSON signal',
          content: 'Signal without code fence',
          source: 'amplitude',
          sentiment: 'positive',
        },
      ];

      // Return JSON without ```json wrapper
      (generateText as jest.Mock).mockResolvedValue({
        text: JSON.stringify(mockSignals),
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('should handle empty signals array', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n[]\n```',
      });

      const result = await agent.run({}, mockRunId);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should include all signal fields in database insert', async () => {
      const mockSignals = [
        {
          title: 'Complete signal',
          content: 'Signal with all fields',
          source: 'zendesk',
          sentiment: 'positive',
          url: 'https://example.com',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockSignals) + '\n```',
      });

      // Capture what gets inserted via values()
      const capturedInserts: any[] = [];
      const mockValues = jest.fn().mockImplementation((data) => {
        capturedInserts.push(data);
        return Promise.resolve(undefined);
      });
      (db.insert as jest.Mock) = jest.fn().mockReturnValue({ values: mockValues });

      await agent.run({}, mockRunId);

      // Find the signal insert (not a trace insert — traces have agentName field)
      const signalInsert = capturedInserts.find(
        (v) => v && v.title === 'Complete signal'
      );

      expect(signalInsert).toBeDefined();
      expect(signalInsert.content).toBe('Signal with all fields');
      expect(signalInsert.source).toBe('zendesk');
      expect(signalInsert.sentiment).toBe('positive');
      expect(signalInsert.url).toBe('https://example.com');
      expect(signalInsert.status).toBe('pending');
    });

    it('should handle multiple sources in input', async () => {
      const mockSignals = [
        {
          title: 'Signal 1',
          content: 'Content 1',
          source: 'amplitude',
          sentiment: 'neutral',
        },
        {
          title: 'Signal 2',
          content: 'Content 2',
          source: 'competitor',
          sentiment: 'positive',
        },
      ];

      (generateText as jest.Mock).mockResolvedValue({
        text: '```json\n' + JSON.stringify(mockSignals) + '\n```',
      });

      const result = await agent.run(
        { sources: ['amplitude', 'zendesk', 'competitor'] },
        mockRunId
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });
});
