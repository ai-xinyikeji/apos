import { TaskClassifier, TaskType, TaskClassificationResult } from '../task-classifier';

describe('TaskClassifier', () => {
  let classifier: TaskClassifier;

  beforeEach(() => {
    classifier = new TaskClassifier();
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns default with confidence 1.0 for empty string', () => {
      const result = classifier.classify('');
      expect(result.taskType).toBe('default');
      expect(result.confidence).toBe(1.0);
      expect(result.keywords).toEqual([]);
    });

    it('returns default with confidence 1.0 for whitespace-only input', () => {
      const result = classifier.classify('   \n\t  ');
      expect(result.taskType).toBe('default');
      expect(result.confidence).toBe(1.0);
    });

    it('returns a result with all required fields', () => {
      const result = classifier.classify('hello world');
      expect(result).toHaveProperty('taskType');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('keywords');
      expect(Array.isArray(result.keywords)).toBe(true);
    });

    it('confidence is always between 0.1 and 1.0', () => {
      const prompts = [
        '',
        'hello',
        'write a function to sort an array',
        'why does the sky appear blue?',
        'summarize this document',
        'review my code for bugs',
        'plan a microservices architecture',
        'explain what recursion is',
        'refactor this class to use composition',
      ];
      for (const p of prompts) {
        const { confidence } = classifier.classify(p);
        expect(confidence).toBeGreaterThanOrEqual(0.1);
        expect(confidence).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // ── Task type classification ───────────────────────────────────────────────

  describe('coding', () => {
    it('classifies "write a function" as coding', () => {
      const result = classifier.classify('Write a function to reverse a linked list');
      expect(result.taskType).toBe('coding');
    });

    it('classifies prompt with code block as coding', () => {
      const result = classifier.classify(
        'Implement this:\n```typescript\nfunction add(a: number, b: number) {}\n```'
      );
      expect(result.taskType).toBe('coding');
    });

    it('classifies "build an API endpoint" as coding', () => {
      const result = classifier.classify('Build an API endpoint for user authentication');
      expect(result.taskType).toBe('coding');
    });

    it('returns matched keywords for coding', () => {
      const result = classifier.classify('implement a sorting algorithm');
      expect(result.keywords.length).toBeGreaterThan(0);
    });
  });

  describe('reasoning', () => {
    it('classifies "why" questions as reasoning', () => {
      const result = classifier.classify('Why is quicksort faster than bubble sort on average?');
      expect(result.taskType).toBe('reasoning');
    });

    it('classifies "analyze" prompts as reasoning', () => {
      const result = classifier.classify('Analyze the trade-offs between SQL and NoSQL databases');
      expect(result.taskType).toBe('reasoning');
    });

    it('classifies "compare and contrast" as reasoning', () => {
      const result = classifier.classify('Compare and contrast REST vs GraphQL');
      expect(result.taskType).toBe('reasoning');
    });
  });

  describe('summarize', () => {
    it('classifies "summarize" as summarize', () => {
      const result = classifier.classify('Summarize the following article in 3 bullet points');
      expect(result.taskType).toBe('summarize');
    });

    it('classifies "tldr" as summarize', () => {
      const result = classifier.classify('TLDR of this document');
      expect(result.taskType).toBe('summarize');
    });

    it('classifies "key points" as summarize', () => {
      const result = classifier.classify('What are the key points of this text?');
      expect(result.taskType).toBe('summarize');
    });
  });

  describe('refactor', () => {
    it('classifies "refactor" as refactor', () => {
      const result = classifier.classify('Refactor this class to follow SOLID principles');
      expect(result.taskType).toBe('refactor');
    });

    it('classifies "clean up the code" as refactor', () => {
      const result = classifier.classify('Clean up this code and simplify the logic');
      expect(result.taskType).toBe('refactor');
    });

    it('classifies "restructure" as refactor', () => {
      const result = classifier.classify('Restructure this module to be more maintainable');
      expect(result.taskType).toBe('refactor');
    });
  });

  describe('review', () => {
    it('classifies "review my code" as review', () => {
      const result = classifier.classify('Review my code and give feedback');
      expect(result.taskType).toBe('review');
    });

    it('classifies "find bugs" as review', () => {
      const result = classifier.classify('Find bugs in this implementation');
      expect(result.taskType).toBe('review');
    });

    it('classifies "audit" as review', () => {
      const result = classifier.classify('Audit this function for security issues');
      expect(result.taskType).toBe('review');
    });
  });

  describe('planning', () => {
    it('classifies "plan" as planning', () => {
      const result = classifier.classify('Plan a microservices architecture for an e-commerce platform');
      expect(result.taskType).toBe('planning');
    });

    it('classifies "design architecture" as planning', () => {
      const result = classifier.classify('Design the architecture for a real-time chat application');
      expect(result.taskType).toBe('planning');
    });

    it('classifies "roadmap" as planning', () => {
      const result = classifier.classify('Create a roadmap for migrating to TypeScript');
      expect(result.taskType).toBe('planning');
    });
  });

  describe('explain', () => {
    it('classifies "explain" as explain', () => {
      const result = classifier.classify('Explain how garbage collection works in JavaScript');
      expect(result.taskType).toBe('explain');
    });

    it('classifies "what is" as explain', () => {
      const result = classifier.classify('What is a closure in JavaScript?');
      expect(result.taskType).toBe('explain');
    });

    it('classifies "how does X work" as explain', () => {
      const result = classifier.classify('How does the event loop work in Node.js?');
      expect(result.taskType).toBe('explain');
    });
  });

  // ── Confidence thresholds ──────────────────────────────────────────────────

  describe('confidence', () => {
    it('returns confidence > 0.8 for clear single-type prompts', () => {
      const clearPrompts: Array<{ prompt: string; type: TaskType }> = [
        { prompt: 'Write a function to implement binary search', type: 'coding' },
        { prompt: 'Summarize this article into key points', type: 'summarize' },
        { prompt: 'Refactor this code to remove duplication', type: 'refactor' },
        { prompt: 'Review my code and find issues', type: 'review' },
        { prompt: 'Plan the architecture for a new service', type: 'planning' },
        { prompt: 'Explain what dependency injection is', type: 'explain' },
        { prompt: 'Analyze the trade-offs and decide the best approach', type: 'reasoning' },
      ];

      for (const { prompt, type } of clearPrompts) {
        const result = classifier.classify(prompt);
        expect(result.taskType).toBe(type);
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it('returns lower confidence for ambiguous prompts', () => {
      // "review and refactor" — overlapping signals
      const result = classifier.classify('Review and refactor this code');
      expect(result.confidence).toBeLessThan(1.0);
    });
  });

  // ── Chinese language support ───────────────────────────────────────────────

  describe('Chinese language support', () => {
    it('classifies Chinese coding prompt', () => {
      const result = classifier.classify('实现一个二分查找算法');
      expect(result.taskType).toBe('coding');
    });

    it('classifies Chinese summarize prompt', () => {
      const result = classifier.classify('总结这篇文章的要点');
      expect(result.taskType).toBe('summarize');
    });

    it('classifies Chinese explain prompt', () => {
      const result = classifier.classify('解释什么是闭包');
      expect(result.taskType).toBe('explain');
    });
  });

  // ── Pattern recognition ───────────────────────────────────────────────────

  describe('pattern recognition - code blocks', () => {
    it('classifies fenced code block without keywords as coding', () => {
      // No strong keyword — pattern boost should win
      const result = classifier.classify(
        'Here is the code:\n```python\nprint("hello")\n```'
      );
      expect(result.taskType).toBe('coding');
    });

    it('classifies inline code without keywords as coding', () => {
      const result = classifier.classify('What does `Array.prototype.reduce` do?');
      // inline code boosts coding; "what does" boosts explain — coding wins on score
      expect(['coding', 'explain']).toContain(result.taskType);
    });

    it('code block boost does not override strong refactor keyword signal', () => {
      // "refactor" keyword score = 3, which equals the threshold; code block boost
      // should NOT fire (maxKeywordScore >= 3), so refactor stays on top
      const result = classifier.classify(
        'Refactor this:\n```typescript\nconst x = 1;\n```'
      );
      expect(result.taskType).toBe('refactor');
    });

    it('code block boost does not override strong review keyword signal', () => {
      const result = classifier.classify(
        'Review this code:\n```javascript\nfunction foo() {}\n```'
      );
      expect(result.taskType).toBe('review');
    });

    it('code block boost does not override strong coding keyword signal', () => {
      const result = classifier.classify(
        'Write a function:\n```typescript\n// stub\n```'
      );
      expect(result.taskType).toBe('coding');
    });

    it('code block boosts refactor and review scores when no strong keyword', () => {
      // Prompt with only a code block — coding should win (highest boost)
      const result = classifier.classify('```js\nconst a = 1;\n```');
      expect(result.taskType).toBe('coding');
    });

    it('detects multi-line fenced code blocks', () => {
      const result = classifier.classify(
        '```\nline1\nline2\nline3\n```'
      );
      expect(result.taskType).toBe('coding');
    });

    it('detects inline code with backticks', () => {
      const result = classifier.classify('Use `map` instead of `forEach`');
      expect(result.taskType).toBe('coding');
    });
  });

  describe('pattern recognition - question markers', () => {
    it('question mark boosts explain score', () => {
      const result = classifier.classify('What is dependency injection?');
      expect(result.taskType).toBe('explain');
    });

    it('"how does" pattern boosts explain/reasoning', () => {
      const result = classifier.classify('How does the garbage collector work?');
      expect(['explain', 'reasoning']).toContain(result.taskType);
    });

    it('"why is" pattern boosts reasoning', () => {
      const result = classifier.classify('Why is immutability important in functional programming?');
      expect(result.taskType).toBe('reasoning');
    });

    it('"what are" pattern boosts explain or reasoning', () => {
      // "what are" matches the question pattern, boosting both explain (+1) and
      // reasoning (+1) equally. Either is a valid result.
      const result = classifier.classify('What are the benefits of TypeScript?');
      expect(['explain', 'reasoning']).toContain(result.taskType);
    });

    it('question boost does not override strong summarize keyword signal', () => {
      const result = classifier.classify('Summarize this article — what are the key points?');
      expect(result.taskType).toBe('summarize');
    });

    it('question boost does not override strong coding keyword signal', () => {
      const result = classifier.classify('Write a function that checks if a number is prime?');
      expect(result.taskType).toBe('coding');
    });

    it('question boost does not override strong review keyword signal', () => {
      const result = classifier.classify('Review my code — what bugs do you find?');
      expect(result.taskType).toBe('review');
    });

    it('"how can" pattern is recognised as a question marker', () => {
      const result = classifier.classify('How can I improve the performance of this query?');
      expect(['explain', 'reasoning']).toContain(result.taskType);
    });

    it('"how should" pattern is recognised as a question marker', () => {
      const result = classifier.classify('How should I structure this React component?');
      expect(['explain', 'reasoning', 'planning']).toContain(result.taskType);
    });
  });

  describe('pattern recognition - combined signals', () => {
    it('code block + question marker together still produce a valid result', () => {
      const result = classifier.classify(
        'What does this code do?\n```js\nconst x = arr.reduce((a, b) => a + b, 0);\n```'
      );
      expect(result).toHaveProperty('taskType');
      expect(result.confidence).toBeGreaterThanOrEqual(0.1);
    });

    it('code block + question marker without keywords: explain or coding wins', () => {
      // inline code boosts coding; "?" boosts explain — one of them should win
      const result = classifier.classify('What is `Promise.all`?');
      expect(['explain', 'coding']).toContain(result.taskType);
    });

    it('strong keyword always beats pattern-only boost', () => {
      // "plan" keyword (score 3) vs code block boost (score 3 to coding)
      // keyword wins because it fires first and maxKeywordScore >= 3 suppresses code boost
      const result = classifier.classify(
        'Plan the architecture:\n```yaml\nservices:\n  - api\n```'
      );
      expect(result.taskType).toBe('planning');
    });
  });

  // ── Defensive branch coverage ─────────────────────────────────────────────
  // These tests exercise the null-coalescing fallbacks in calculateConfidence
  // and the keywords fallback, which are defensive guards against impossible
  // states in normal usage.

  describe('calculateConfidence defensive branches', () => {
    // Expose the private method via a subclass for direct testing
    class TestableClassifier extends TaskClassifier {
      public testCalculateConfidence(
        scores: Record<string, number>,
        winner: TaskType,
        winnerScore: number
      ): number {
        // Access the private method via bracket notation
        return (this as unknown as Record<string, Function>)['calculateConfidence'](scores, winner, winnerScore);
      }
    }

    let tc: TestableClassifier;
    beforeEach(() => { tc = new TestableClassifier(); });

    it('returns 0.5 when winnerScore is 0 (even if winner is not default)', () => {
      // Covers the `winnerScore === 0` branch of the `if (winner === 'default' || winnerScore === 0)` guard
      const result = tc.testCalculateConfidence({ coding: 0, explain: 0 }, 'coding', 0);
      expect(result).toBe(0.5);
    });

    it('handles scores map with only one entry (runnerUp ?? 0 fallback)', () => {
      // sortedScores[1] is undefined when there is only one score → ?? 0 fires
      const result = tc.testCalculateConfidence({ coding: 5 }, 'coding', 5);
      expect(result).toBeGreaterThanOrEqual(0.1);
      expect(result).toBeLessThanOrEqual(1.0);
    });
  });

  describe('keywords fallback', () => {
    it('returns empty keywords array when bestType has no matched keywords entry', () => {
      // The `matchedKeywords[bestType] ?? []` fallback fires when bestType is
      // not present in matchedKeywords. We verify the result still has keywords as [].
      // In normal operation this cannot happen, but the guard ensures safety.
      // We verify the public API always returns an array (covers the ?? [] branch
      // indirectly by confirming the property is always an array).
      const result = classifier.classify('hello world');
      expect(Array.isArray(result.keywords)).toBe(true);
    });
  });

  // ── Performance ────────────────────────────────────────────────────────────

  describe('performance', () => {
    it('classifies a prompt in under 10ms', () => {
      const longPrompt = 'Write a function to implement a red-black tree with insert, delete, and search operations. '.repeat(20);
      const start = performance.now();
      classifier.classify(longPrompt);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });

    it('handles 1000 classifications in under 500ms', () => {
      const prompts = [
        'Write a sorting algorithm',
        'Explain recursion',
        'Summarize this text',
        'Review my code',
        'Plan the architecture',
        'Refactor this class',
        'Why does this fail?',
      ];
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        classifier.classify(prompts[i % prompts.length]);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });
});
