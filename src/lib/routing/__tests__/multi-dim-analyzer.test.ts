import { MultiDimAnalyzer, AnalysisResult } from '../multi-dim-analyzer';
import { TaskType } from '../task-classifier';

describe('MultiDimAnalyzer', () => {
  let analyzer: MultiDimAnalyzer;

  beforeEach(() => {
    analyzer = new MultiDimAnalyzer();
  });

  // ── analyze() – shape of result ───────────────────────────────────────────

  describe('analyze() result shape', () => {
    it('returns all required fields', () => {
      const result = analyzer.analyze('hello world', 'default');
      expect(result).toHaveProperty('contextSize');
      expect(result).toHaveProperty('codeComplexity');
      expect(result).toHaveProperty('estimatedCost');
      expect(result).toHaveProperty('requiresExtendedThinking');
    });

    it('contextSize is a non-negative integer', () => {
      const result = analyzer.analyze('some prompt', 'coding');
      expect(result.contextSize).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.contextSize)).toBe(true);
    });

    it('codeComplexity is between 0 and 100', () => {
      const result = analyzer.analyze('some prompt', 'coding');
      expect(result.codeComplexity).toBeGreaterThanOrEqual(0);
      expect(result.codeComplexity).toBeLessThanOrEqual(100);
    });

    it('estimatedCost is non-negative', () => {
      const result = analyzer.analyze('some prompt', 'coding');
      expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
    });

    it('requiresExtendedThinking is a boolean', () => {
      const result = analyzer.analyze('some prompt', 'coding');
      expect(typeof result.requiresExtendedThinking).toBe('boolean');
    });
  });

  // ── Context size calculation ───────────────────────────────────────────────

  describe('context size (token approximation)', () => {
    it('returns 0 for empty string', () => {
      const result = analyzer.analyze('', 'default');
      expect(result.contextSize).toBe(0);
    });

    it('approximates tokens as ceil(chars / 4)', () => {
      // 4 chars → 1 token
      expect(analyzer.analyze('abcd', 'default').contextSize).toBe(1);
      // 5 chars → 2 tokens (ceil)
      expect(analyzer.analyze('abcde', 'default').contextSize).toBe(2);
      // 8 chars → 2 tokens
      expect(analyzer.analyze('abcdefgh', 'default').contextSize).toBe(2);
      // 9 chars → 3 tokens
      expect(analyzer.analyze('abcdefghi', 'default').contextSize).toBe(3);
    });

    it('scales linearly with prompt length', () => {
      const short = analyzer.analyze('a'.repeat(100), 'default').contextSize;
      const long = analyzer.analyze('a'.repeat(400), 'default').contextSize;
      expect(long).toBe(short * 4);
    });

    it('handles a realistic prompt correctly', () => {
      const prompt = 'Write a function to sort an array'; // 33 chars
      const result = analyzer.analyze(prompt, 'coding');
      expect(result.contextSize).toBe(Math.ceil(33 / 4)); // 9
    });
  });

  // ── Code complexity scoring ────────────────────────────────────────────────

  describe('code complexity scoring', () => {
    it('returns 0 for empty string', () => {
      const result = analyzer.analyze('', 'coding');
      expect(result.codeComplexity).toBe(0);
    });

    it('returns a low score for a simple one-liner', () => {
      const result = analyzer.analyze('const x = 1;', 'coding');
      expect(result.codeComplexity).toBeLessThan(20);
    });

    it('increases score with more lines of code', () => {
      const shortCode = Array(10).fill('const x = 1;').join('\n');
      const longCode = Array(200).fill('const x = 1;').join('\n');
      const shortScore = analyzer.analyze(shortCode, 'coding').codeComplexity;
      const longScore = analyzer.analyze(longCode, 'coding').codeComplexity;
      expect(longScore).toBeGreaterThan(shortScore);
    });

    it('increases score with deeper nesting', () => {
      const shallow = 'function f() { if (x) { return 1; } }';
      const deep = 'function f() { if (x) { for (let i=0;i<n;i++) { while(true) { try { if(y){} } catch(e){} } } } }';
      const shallowScore = analyzer.analyze(shallow, 'coding').codeComplexity;
      const deepScore = analyzer.analyze(deep, 'coding').codeComplexity;
      expect(deepScore).toBeGreaterThan(shallowScore);
    });

    it('increases score with more functions', () => {
      const few = 'function a() {} function b() {}';
      const many = Array(15).fill('const fn = () => {};').join('\n');
      const fewScore = analyzer.analyze(few, 'coding').codeComplexity;
      const manyScore = analyzer.analyze(many, 'coding').codeComplexity;
      expect(manyScore).toBeGreaterThan(fewScore);
    });

    it('increases score with more complex control flow', () => {
      const simple = 'const x = 1;';
      const complex = 'if(a){} for(;;){} while(b){} switch(c){} try{}catch(e){}';
      const simpleScore = analyzer.analyze(simple, 'coding').codeComplexity;
      const complexScore = analyzer.analyze(complex, 'coding').codeComplexity;
      expect(complexScore).toBeGreaterThan(simpleScore);
    });

    it('caps score at 100 for extremely complex code', () => {
      // 3000 lines → min(3000/100, 30) = 30 pts
      // Properly nested depth 6 → min(6*5, 30) = 30 pts
      // 10 functions → min(10*2, 20) = 20 pts
      // 20 control flows → min(20, 20) = 20 pts  → total = 100
      const lines = Array(3000).fill('const x = 1;').join('\n');
      // Properly nested braces to depth 6
      const nesting = '{ { { { { { } } } } } }';
      const fns = Array(10).fill('function f(){}').join('\n');
      const flows = Array(20).fill('if(x){}').join('\n');
      const code = lines + '\n' + nesting + '\n' + fns + '\n' + flows;
      const result = analyzer.analyze(code, 'coding');
      expect(result.codeComplexity).toBe(100);
    });

    it('score is always an integer', () => {
      const result = analyzer.analyze('function foo() { if (x) { return 1; } }', 'coding');
      expect(Number.isInteger(result.codeComplexity)).toBe(true);
    });
  });

  // ── Cost estimation ────────────────────────────────────────────────────────

  describe('cost estimation', () => {
    it('returns 0 cost for empty prompt', () => {
      const result = analyzer.analyze('', 'default');
      expect(result.estimatedCost).toBe(0);
    });

    it('uses $3.00 per 1M input tokens pricing', () => {
      // 1,000,000 tokens = 4,000,000 chars → cost = $3.00
      const prompt = 'a'.repeat(4_000_000);
      const result = analyzer.analyze(prompt, 'default');
      // contextSize = ceil(4_000_000 / 4) = 1_000_000
      // cost = (1_000_000 / 1_000_000) * 3.00 = 3.00
      expect(result.estimatedCost).toBeCloseTo(3.0, 5);
    });

    it('cost scales linearly with context size', () => {
      const small = analyzer.analyze('a'.repeat(400), 'default').estimatedCost;
      const large = analyzer.analyze('a'.repeat(4000), 'default').estimatedCost;
      expect(large).toBeCloseTo(small * 10, 10);
    });

    it('cost is within 10% of expected for a realistic prompt', () => {
      // 1000-char prompt → ~250 tokens → $0.00075
      const prompt = 'x'.repeat(1000);
      const result = analyzer.analyze(prompt, 'default');
      const expected = (Math.ceil(1000 / 4) / 1_000_000) * 3.0;
      const tolerance = expected * 0.1;
      expect(Math.abs(result.estimatedCost - expected)).toBeLessThanOrEqual(tolerance + 1e-10);
    });
  });

  // ── Extended Thinking triggers ─────────────────────────────────────────────

  describe('Extended Thinking triggers', () => {
    it('triggers for taskType "reasoning"', () => {
      const result = analyzer.analyze('Why is the sky blue?', 'reasoning');
      expect(result.requiresExtendedThinking).toBe(true);
    });

    it('triggers for taskType "planning"', () => {
      const result = analyzer.analyze('Plan a microservices architecture', 'planning');
      expect(result.requiresExtendedThinking).toBe(true);
    });

    it('does NOT trigger for taskType "coding" with small context and low complexity', () => {
      const result = analyzer.analyze('Write a hello world function', 'coding');
      expect(result.requiresExtendedThinking).toBe(false);
    });

    it('does NOT trigger for taskType "summarize"', () => {
      const result = analyzer.analyze('Summarize this text', 'summarize');
      expect(result.requiresExtendedThinking).toBe(false);
    });

    it('does NOT trigger for taskType "explain"', () => {
      const result = analyzer.analyze('Explain closures', 'explain');
      expect(result.requiresExtendedThinking).toBe(false);
    });

    it('triggers when contextSize > 50,000 tokens (any task type)', () => {
      // 50,001 tokens = 200,004 chars minimum
      const largePrompt = 'a'.repeat(200_008); // ceil(200008/4) = 50002 tokens
      const result = analyzer.analyze(largePrompt, 'coding');
      expect(result.contextSize).toBeGreaterThan(50_000);
      expect(result.requiresExtendedThinking).toBe(true);
    });

    it('does NOT trigger when contextSize is exactly 50,000 tokens', () => {
      // exactly 50,000 tokens = 200,000 chars
      const prompt = 'a'.repeat(200_000);
      const result = analyzer.analyze(prompt, 'coding');
      expect(result.contextSize).toBe(50_000);
      expect(result.requiresExtendedThinking).toBe(false);
    });

    it('triggers when codeComplexity > 80 (any task type)', () => {
      // Build a prompt that scores > 80:
      // 2500 lines → min(2500/100, 30) = 25 pts
      // Properly nested depth 6 → min(6*5, 30) = 30 pts
      // 10 functions → min(10*2, 20) = 20 pts
      // 10 control flows → min(10, 20) = 10 pts  → total = 85
      const lines = Array(2500).fill('const x = 1;').join('\n');
      // Properly nested braces to depth 6
      const nesting = '{ { { { { { } } } } } }';
      const fns = Array(10).fill('function f(){}').join('\n');
      const flows = Array(10).fill('if(x){}').join('\n');
      const code = lines + '\n' + nesting + '\n' + fns + '\n' + flows;
      const result = analyzer.analyze(code, 'review');
      expect(result.codeComplexity).toBeGreaterThan(80);
      expect(result.requiresExtendedThinking).toBe(true);
    });

    it('does NOT trigger for "default" task type with small context and low complexity', () => {
      const result = analyzer.analyze('hello', 'default');
      expect(result.requiresExtendedThinking).toBe(false);
    });
  });

  // ── Max nesting depth ──────────────────────────────────────────────────────

  describe('nesting depth calculation (via complexity)', () => {
    it('flat code has nesting depth 0 → 0 nesting pts', () => {
      // No brackets at all
      const result = analyzer.analyze('const x = 1', 'coding');
      // Only line score: 1 line → min(1/100, 30) = 0.01 → rounds to 0
      expect(result.codeComplexity).toBeLessThan(5);
    });

    it('single level of braces contributes 5 pts to nesting', () => {
      // depth 1 → 1*5 = 5 pts nesting
      // 1 line → ~0 pts length
      // 0 functions, 0 control flow
      const result = analyzer.analyze('{ }', 'coding');
      // nesting = 5, length ≈ 0, functions = 0, flow = 0 → score ≈ 5
      expect(result.codeComplexity).toBeGreaterThanOrEqual(5);
    });

    it('nesting score is capped at 30 (depth >= 6)', () => {
      // depth 6 → 6*5 = 30 pts (cap)
      const code = '{{{{{{}}}}}}';
      const result = analyzer.analyze(code, 'coding');
      // nesting contribution = 30 (capped), length ≈ 0, no functions/flow
      expect(result.codeComplexity).toBeGreaterThanOrEqual(30);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles very long prompts without throwing', () => {
      const huge = 'x'.repeat(1_000_000);
      expect(() => analyzer.analyze(huge, 'coding')).not.toThrow();
    });

    it('handles prompts with only whitespace', () => {
      const result = analyzer.analyze('   \n\t  ', 'default');
      expect(result.contextSize).toBeGreaterThan(0);
      expect(result.codeComplexity).toBeGreaterThanOrEqual(0);
    });

    it('handles unicode characters', () => {
      const result = analyzer.analyze('你好世界 🌍', 'default');
      expect(result.contextSize).toBeGreaterThan(0);
    });

    it('all task types produce valid results', () => {
      const taskTypes: TaskType[] = [
        'reasoning', 'coding', 'summarize', 'refactor',
        'review', 'planning', 'explain', 'default',
      ];
      for (const taskType of taskTypes) {
        const result = analyzer.analyze('test prompt', taskType);
        expect(result.contextSize).toBeGreaterThanOrEqual(0);
        expect(result.codeComplexity).toBeGreaterThanOrEqual(0);
        expect(result.codeComplexity).toBeLessThanOrEqual(100);
        expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
        expect(typeof result.requiresExtendedThinking).toBe('boolean');
      }
    });
  });

  // ── Performance ────────────────────────────────────────────────────────────

  describe('performance', () => {
    it('analyzes a typical prompt in under 10ms', () => {
      const prompt = 'Write a function to implement a binary search tree with insert, delete, and search. '.repeat(10);
      const start = performance.now();
      analyzer.analyze(prompt, 'coding');
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });

    it('handles 1000 analyses in under 500ms', () => {
      const prompts: Array<[string, TaskType]> = [
        ['Write a sorting algorithm', 'coding'],
        ['Explain recursion', 'explain'],
        ['Summarize this text', 'summarize'],
        ['Review my code', 'review'],
        ['Plan the architecture', 'planning'],
        ['Refactor this class', 'refactor'],
        ['Why does this fail?', 'reasoning'],
      ];
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const [p, t] = prompts[i % prompts.length];
        analyzer.analyze(p, t);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });
});
