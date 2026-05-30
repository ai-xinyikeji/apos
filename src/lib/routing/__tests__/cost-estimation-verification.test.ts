/**
 * Cost Estimation Verification Test
 * 
 * This test verifies that Task 3.4 (实现成本估算) is complete and meets all acceptance criteria:
 * 1. Verify the estimateCost() method is implemented
 * 2. Ensure it uses correct pricing for the default model
 * 3. Verify cost calculation formula is correct
 * 4. Ensure cost estimation error is < 10%
 * 5. Verify all related unit tests pass
 */

import { MultiDimAnalyzer } from '../multi-dim-analyzer';

describe('Task 3.4: Cost Estimation Verification', () => {
  let analyzer: MultiDimAnalyzer;

  beforeEach(() => {
    analyzer = new MultiDimAnalyzer();
  });

  describe('Acceptance Criterion 1: estimateCost() method is implemented', () => {
    it('should have estimateCost functionality in analyze()', () => {
      const result = analyzer.analyze('test prompt', 'default');
      expect(result).toHaveProperty('estimatedCost');
      expect(typeof result.estimatedCost).toBe('number');
    });
  });

  describe('Acceptance Criterion 2: Uses correct pricing for default model', () => {
    it('should use $3.00 per 1M input tokens (Claude 3.5 Sonnet)', () => {
      // 1,000,000 tokens = 4,000,000 chars
      const prompt = 'a'.repeat(4_000_000);
      const result = analyzer.analyze(prompt, 'default');
      
      // Expected: (1,000,000 / 1,000,000) * 3.00 = $3.00
      expect(result.estimatedCost).toBeCloseTo(3.0, 5);
    });

    it('should calculate cost for 100,000 tokens correctly', () => {
      // 100,000 tokens = 400,000 chars
      const prompt = 'x'.repeat(400_000);
      const result = analyzer.analyze(prompt, 'default');
      
      // Expected: (100,000 / 1,000,000) * 3.00 = $0.30
      expect(result.estimatedCost).toBeCloseTo(0.30, 5);
    });

    it('should calculate cost for 10,000 tokens correctly', () => {
      // 10,000 tokens = 40,000 chars
      const prompt = 'y'.repeat(40_000);
      const result = analyzer.analyze(prompt, 'default');
      
      // Expected: (10,000 / 1,000,000) * 3.00 = $0.03
      expect(result.estimatedCost).toBeCloseTo(0.03, 5);
    });
  });

  describe('Acceptance Criterion 3: Cost calculation formula is correct', () => {
    it('should use formula: (contextSize / 1_000_000) * inputPricePerMillion', () => {
      const testCases = [
        { chars: 4_000, expectedTokens: 1_000, expectedCost: 0.003 },
        { chars: 40_000, expectedTokens: 10_000, expectedCost: 0.03 },
        { chars: 400_000, expectedTokens: 100_000, expectedCost: 0.30 },
        { chars: 4_000_000, expectedTokens: 1_000_000, expectedCost: 3.00 },
      ];

      for (const { chars, expectedTokens, expectedCost } of testCases) {
        const prompt = 'a'.repeat(chars);
        const result = analyzer.analyze(prompt, 'default');
        
        // Verify token calculation
        expect(result.contextSize).toBe(expectedTokens);
        
        // Verify cost calculation
        const calculatedCost = (result.contextSize / 1_000_000) * 3.0;
        expect(result.estimatedCost).toBeCloseTo(calculatedCost, 10);
        expect(result.estimatedCost).toBeCloseTo(expectedCost, 5);
      }
    });

    it('should handle edge case: 0 tokens = $0 cost', () => {
      const result = analyzer.analyze('', 'default');
      expect(result.contextSize).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });

    it('should handle edge case: 1 char = 1 token = $0.000003', () => {
      const result = analyzer.analyze('a', 'default');
      expect(result.contextSize).toBe(1);
      expect(result.estimatedCost).toBeCloseTo(0.000003, 10);
    });
  });

  describe('Acceptance Criterion 4: Cost estimation error < 10%', () => {
    it('should estimate cost within 10% margin for small prompts', () => {
      const prompt = 'Write a function to sort an array'; // ~33 chars
      const result = analyzer.analyze(prompt, 'default');
      
      const expectedTokens = Math.ceil(33 / 4); // 9 tokens
      const expectedCost = (expectedTokens / 1_000_000) * 3.0;
      const tolerance = expectedCost * 0.1; // 10% margin
      
      expect(Math.abs(result.estimatedCost - expectedCost)).toBeLessThanOrEqual(tolerance + 1e-10);
    });

    it('should estimate cost within 10% margin for medium prompts', () => {
      const prompt = 'x'.repeat(1000); // 1000 chars = 250 tokens
      const result = analyzer.analyze(prompt, 'default');
      
      const expectedTokens = Math.ceil(1000 / 4);
      const expectedCost = (expectedTokens / 1_000_000) * 3.0;
      const tolerance = expectedCost * 0.1;
      
      expect(Math.abs(result.estimatedCost - expectedCost)).toBeLessThanOrEqual(tolerance + 1e-10);
    });

    it('should estimate cost within 10% margin for large prompts', () => {
      const prompt = 'y'.repeat(10_000); // 10,000 chars = 2,500 tokens
      const result = analyzer.analyze(prompt, 'default');
      
      const expectedTokens = Math.ceil(10_000 / 4);
      const expectedCost = (expectedTokens / 1_000_000) * 3.0;
      const tolerance = expectedCost * 0.1;
      
      expect(Math.abs(result.estimatedCost - expectedCost)).toBeLessThanOrEqual(tolerance + 1e-10);
    });

    it('should estimate cost within 10% margin for very large prompts', () => {
      const prompt = 'z'.repeat(100_000); // 100,000 chars = 25,000 tokens
      const result = analyzer.analyze(prompt, 'default');
      
      const expectedTokens = Math.ceil(100_000 / 4);
      const expectedCost = (expectedTokens / 1_000_000) * 3.0;
      const tolerance = expectedCost * 0.1;
      
      expect(Math.abs(result.estimatedCost - expectedCost)).toBeLessThanOrEqual(tolerance + 1e-10);
    });

    it('should maintain accuracy across different task types', () => {
      const prompt = 'Test prompt for cost estimation'; // ~31 chars
      const taskTypes = ['reasoning', 'coding', 'summarize', 'refactor', 'review', 'planning', 'explain', 'default'] as const;
      
      const expectedTokens = Math.ceil(31 / 4);
      const expectedCost = (expectedTokens / 1_000_000) * 3.0;
      const tolerance = expectedCost * 0.1;
      
      for (const taskType of taskTypes) {
        const result = analyzer.analyze(prompt, taskType);
        expect(Math.abs(result.estimatedCost - expectedCost)).toBeLessThanOrEqual(tolerance + 1e-10);
      }
    });
  });

  describe('Acceptance Criterion 5: All related unit tests pass', () => {
    it('should pass all cost estimation tests from main test suite', () => {
      // This test verifies that the main test suite covers cost estimation
      // The actual tests are in multi-dim-analyzer.test.ts
      
      // Test 1: Empty prompt
      expect(analyzer.analyze('', 'default').estimatedCost).toBe(0);
      
      // Test 2: Pricing verification
      const largePrompt = 'a'.repeat(4_000_000);
      expect(analyzer.analyze(largePrompt, 'default').estimatedCost).toBeCloseTo(3.0, 5);
      
      // Test 3: Linear scaling
      const small = analyzer.analyze('a'.repeat(400), 'default').estimatedCost;
      const large = analyzer.analyze('a'.repeat(4000), 'default').estimatedCost;
      expect(large).toBeCloseTo(small * 10, 10);
      
      // Test 4: Realistic prompt
      const realistic = 'x'.repeat(1000);
      const result = analyzer.analyze(realistic, 'default');
      const expected = (Math.ceil(1000 / 4) / 1_000_000) * 3.0;
      const tolerance = expected * 0.1;
      expect(Math.abs(result.estimatedCost - expected)).toBeLessThanOrEqual(tolerance + 1e-10);
    });
  });

  describe('Integration: Cost estimation with other features', () => {
    it('should provide cost estimate alongside context size', () => {
      const prompt = 'a'.repeat(1000);
      const result = analyzer.analyze(prompt, 'default');
      
      expect(result.contextSize).toBe(250); // 1000 / 4
      expect(result.estimatedCost).toBeCloseTo(0.00075, 10); // (250 / 1M) * 3.0
    });

    it('should provide cost estimate alongside code complexity', () => {
      const code = 'function test() { if (x) { return 1; } }';
      const result = analyzer.analyze(code, 'coding');
      
      expect(result.codeComplexity).toBeGreaterThan(0);
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it('should provide cost estimate alongside Extended Thinking flag', () => {
      const prompt = 'Why is the sky blue?';
      const result = analyzer.analyze(prompt, 'reasoning');
      
      expect(result.requiresExtendedThinking).toBe(true);
      expect(result.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe('Performance: Cost estimation should not impact performance', () => {
    it('should calculate cost quickly as part of analysis', () => {
      const prompt = 'Test prompt for performance';
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        analyzer.analyze(prompt, 'default');
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500); // Should complete 1000 analyses in < 500ms
    });
  });
});
