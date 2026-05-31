import {
  extractCodeBlocks,
  compressCodeBlock,
  compressMessages,
  extractCodeSummaryAST,
  codeSummaryToString,
  compressFile,
  compressFiles,
  smartCompress,
  type CompressionLevel,
} from '../compression';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Ollama availability + model list
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../llm', () => ({
  isOllamaAvailable: jest.fn(),
  getOllamaModels: jest.fn(),
  routeModel: jest.fn(),
  // Backward compatibility aliases
  isLMStudioAvailable: jest.fn(),
  getLMStudioModels: jest.fn(),
}));

import { isOllamaAvailable, getOllamaModels } from '../llm';

const mockIsAvailable = isOllamaAvailable as jest.MockedFunction<typeof isOllamaAvailable>;
const mockGetModels = getOllamaModels as jest.MockedFunction<typeof getOllamaModels>;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a large code block string
// ─────────────────────────────────────────────────────────────────────────────

function makeLargeCodeBlock(lines: number = 300, lang: string = 'typescript'): string {
  const code = Array.from({ length: lines }, (_, i) =>
    `export function handler_${i}(req: Request): Response { return new Response('ok ${i}'); }`
  ).join('\n');
  return '```' + lang + '\n' + code + '\n```';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample code for testing
// ─────────────────────────────────────────────────────────────────────────────

const sampleTypeScriptCode = `
import { Request, Response } from 'express';
import { UserService } from './services/user';
import { ValidationService } from './services/validation';
import { LoggerService } from './services/logger';

// TODO: Add rate limiting
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  role: 'admin' | 'user' | 'guest';
}

export interface UserCreateInput {
  name: string;
  email: string;
  password: string;
}

export class UserController {
  private userService: UserService;
  private validationService: ValidationService;
  private logger: LoggerService;

  constructor(userService: UserService, validationService: ValidationService, logger: LoggerService) {
    this.userService = userService;
    this.validationService = validationService;
    this.logger = logger;
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.id;
      this.logger.info(\`Fetching user \${userId}\`);
      const user = await this.userService.findById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (error) {
      this.logger.error('Error fetching user', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const userData: UserCreateInput = req.body;
      const validationResult = await this.validationService.validateUserInput(userData);
      if (!validationResult.valid) {
        res.status(400).json({ errors: validationResult.errors });
        return;
      }
      const user = await this.userService.create(userData);
      this.logger.info(\`Created user \${user.id}\`);
      res.status(201).json(user);
    } catch (error) {
      this.logger.error('Error creating user', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.id;
      const userData = req.body;
      const user = await this.userService.update(userId, userData);
      res.json(user);
    } catch (error) {
      this.logger.error('Error updating user', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.id;
      await this.userService.delete(userId);
      res.status(204).send();
    } catch (error) {
      this.logger.error('Error deleting user', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export async function validateUser(user: User): Promise<boolean> {
  if (!user.email || !user.email.includes('@')) {
    return false;
  }
  if (!user.name || user.name.length < 2) {
    return false;
  }
  return true;
}

export function formatUserName(user: User): string {
  return \`\${user.name} (\${user.email})\`;
}
`;

const sampleJavaScriptCode = `
const express = require('express');
const router = express.Router();
const { validateInput } = require('./validators');
const { logger } = require('./logger');

// FIXME: Add error handling
function calculateTotal(items) {
  if (!items || !Array.isArray(items)) {
    throw new Error('Items must be an array');
  }
  return items.reduce((sum, item) => {
    if (typeof item.price !== 'number') {
      throw new Error('Item price must be a number');
    }
    return sum + item.price;
  }, 0);
}

function calculateDiscount(total, discountPercent) {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error('Invalid discount percentage');
  }
  return total * (discountPercent / 100);
}

class ShoppingCart {
  constructor(userId) {
    this.userId = userId;
    this.items = [];
    this.createdAt = new Date();
  }

  addItem(item) {
    if (!item || !item.id || !item.price) {
      throw new Error('Invalid item');
    }
    this.items.push(item);
    logger.info(\`Added item \${item.id} to cart for user \${this.userId}\`);
  }

  removeItem(itemId) {
    const index = this.items.findIndex(item => item.id === itemId);
    if (index === -1) {
      throw new Error('Item not found in cart');
    }
    this.items.splice(index, 1);
    logger.info(\`Removed item \${itemId} from cart for user \${this.userId}\`);
  }

  getTotal() {
    return calculateTotal(this.items);
  }

  getTotalWithDiscount(discountPercent) {
    const total = this.getTotal();
    const discount = calculateDiscount(total, discountPercent);
    return total - discount;
  }

  clear() {
    this.items = [];
    logger.info(\`Cleared cart for user \${this.userId}\`);
  }

  getItemCount() {
    return this.items.length;
  }
}

module.exports = { ShoppingCart, calculateTotal, calculateDiscount };
`;

const samplePythonCode = `
from typing import List, Optional, Dict, Any
import asyncio
import logging

logger = logging.getLogger(__name__)

class DataProcessor:
    """Process data asynchronously with validation and error handling"""
    
    def __init__(self, config: dict):
        self.config = config
        self.results = []
        self.errors = []
        self.processed_count = 0
        
    async def process(self, data: List[str]) -> List[str]:
        """Process data asynchronously"""
        if not data:
            logger.warning("Empty data list provided")
            return []
            
        logger.info(f"Processing {len(data)} items")
        tasks = [self._process_item(item) for item in data]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error processing item {i}: {result}")
                self.errors.append(str(result))
            else:
                valid_results.append(result)
                self.processed_count += 1
                
        return valid_results
    
    async def _process_item(self, item: str) -> str:
        # TODO: Add validation
        if not item or not isinstance(item, str):
            raise ValueError("Item must be a non-empty string")
        
        # Simulate async processing
        await asyncio.sleep(0.01)
        return item.upper()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        return {
            'processed': self.processed_count,
            'errors': len(self.errors),
            'success_rate': self.processed_count / (self.processed_count + len(self.errors)) if self.processed_count + len(self.errors) > 0 else 0
        }
    
    def reset(self) -> None:
        """Reset processor state"""
        self.results = []
        self.errors = []
        self.processed_count = 0
`;

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('extractCodeBlocks', () => {
  it('should extract zero blocks from plain text', () => {
    const blocks = extractCodeBlocks('Hello world, no code here.');
    expect(blocks).toHaveLength(0);
  });

  it('should extract a single fenced code block', () => {
    const text = 'Some text\n```typescript\nconst x = 1;\n```\nMore text';
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('typescript');
    expect(blocks[0].code).toBe('const x = 1;\n');
  });

  it('should extract multiple code blocks with different languages', () => {
    const text = '```js\nconst a = 1;\n```\nMiddle\n```python\nx = 2\n```';
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].language).toBe('js');
    expect(blocks[1].language).toBe('python');
  });

  it('should handle blocks with no language specifier', () => {
    const text = '```\nplain content\n```';
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AST-based Compression Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('extractCodeSummaryAST', () => {
  it('should extract TypeScript function signatures', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    
    expect(summary).not.toBeNull();
    expect(summary!.functions).toHaveLength(2);
    expect(summary!.functions[0].name).toBe('validateUser');
    expect(summary!.functions[0].isAsync).toBe(true);
    expect(summary!.functions[0].isExported).toBe(true);
  });

  it('should extract TypeScript class definitions', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    
    expect(summary).not.toBeNull();
    expect(summary!.classes).toHaveLength(1);
    expect(summary!.classes[0].name).toBe('UserController');
    expect(summary!.classes[0].methods).toContain('getUser');
    expect(summary!.classes[0].methods).toContain('createUser');
    expect(summary!.classes[0].isExported).toBe(true);
  });

  it('should extract TypeScript imports and dependencies', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    
    expect(summary).not.toBeNull();
    expect(summary!.imports).toContain('express');
    expect(summary!.imports).toContain('./services/user');
    expect(summary!.dependencies).toEqual(summary!.imports);
  });

  it('should extract TypeScript types and interfaces', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    
    expect(summary).not.toBeNull();
    expect(summary!.types).toContain('User');
  });

  it('should extract TODO/FIXME comments', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    
    expect(summary).not.toBeNull();
    expect(summary!.comments.length).toBeGreaterThan(0);
    expect(summary!.comments.some(c => c.includes('TODO'))).toBe(true);
  });

  it('should extract JavaScript function signatures', () => {
    const summary = extractCodeSummaryAST(sampleJavaScriptCode, 'javascript');
    
    expect(summary).not.toBeNull();
    expect(summary!.functions).toHaveLength(2);
    expect(summary!.functions[0].name).toBe('calculateTotal');
  });

  it('should extract JavaScript class definitions', () => {
    const summary = extractCodeSummaryAST(sampleJavaScriptCode, 'javascript');
    
    expect(summary).not.toBeNull();
    expect(summary!.classes).toHaveLength(1);
    expect(summary!.classes[0].name).toBe('ShoppingCart');
    expect(summary!.classes[0].methods).toContain('addItem');
    expect(summary!.classes[0].methods).toContain('getTotal');
  });

  it('should return null for unsupported languages', () => {
    const summary = extractCodeSummaryAST(samplePythonCode, 'python');
    expect(summary).toBeNull();
  });

  it('should handle malformed code gracefully', () => {
    const malformedCode = 'function broken( { return';
    const summary = extractCodeSummaryAST(malformedCode, 'typescript');
    // Should not throw, may return null or partial summary
    expect(summary).toBeDefined();
  });
});

describe('codeSummaryToString', () => {
  it('should convert TypeScript summary to compressed string', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    const compressed = codeSummaryToString(summary!, 'typescript');
    
    expect(compressed).toContain('APOS AST 压缩');
    expect(compressed).toContain('Dependencies:');
    expect(compressed).toContain('express');
    expect(compressed).toContain('UserController');
    expect(compressed).toContain('validateUser');
    expect(compressed).toContain('TODO');
  });

  it('should include architecture summary', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    const compressed = codeSummaryToString(summary!, 'typescript');
    
    expect(compressed).toContain('Functions:');
    expect(compressed).toContain('Classes:');
    expect(compressed).toContain('Types:');
  });

  it('should preserve function signatures with parameters and return types', () => {
    const summary = extractCodeSummaryAST(sampleTypeScriptCode, 'typescript');
    const compressed = codeSummaryToString(summary!, 'typescript');
    
    expect(compressed).toContain('async function validateUser');
    expect(compressed).toContain('Promise<boolean>');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Compression Level Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('Compression Levels', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockIsAvailable.mockReset();
    mockGetModels.mockReset();
  });

  it('should use AST compression for medium level TypeScript', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleTypeScriptCode,
      'test.ts',
      'http://localhost:1234',
      'medium'
    );
    
    expect(method).toBe('ast');
    expect(compressed.length).toBeLessThan(sampleTypeScriptCode.length);
    expect(compressed).toContain('APOS AST 压缩');
  });

  it('should use AST compression for aggressive level TypeScript', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleTypeScriptCode,
      'test.ts',
      'http://localhost:1234',
      'aggressive'
    );
    
    expect(method).toBe('ast');
    expect(compressed.length).toBeLessThan(sampleTypeScriptCode.length);
  });

  it('should skip AST for light level', async () => {
    mockIsAvailable.mockResolvedValue(false);
    
    const { compressed, method } = await compressCodeBlock(
      sampleTypeScriptCode,
      'test.ts',
      'http://localhost:1234',
      'light'
    );
    
    // Light level doesn't use AST, and LM Studio is unavailable
    expect(method).toBe('none');
    expect(compressed).toBe(sampleTypeScriptCode);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Code Block Compression Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('compressCodeBlock', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockIsAvailable.mockReset();
    mockGetModels.mockReset();
  });

  it('should return original content for short text (< 500 chars)', async () => {
    const shortCode = 'const x = 1;';
    const { compressed, method } = await compressCodeBlock(shortCode);
    expect(compressed).toBe(shortCode);
    expect(method).toBe('none');
  });

  it('should use AST compression for TypeScript files', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleTypeScriptCode,
      'test.ts'
    );
    
    expect(method).toBe('ast');
    expect(compressed.length).toBeLessThan(sampleTypeScriptCode.length);
    expect(compressed).toContain('UserController');
  });

  it('should use AST compression for JavaScript files', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleJavaScriptCode,
      'test.js'
    );
    
    expect(method).toBe('ast');
    expect(compressed.length).toBeLessThan(sampleJavaScriptCode.length);
    expect(compressed).toContain('ShoppingCart');
  });

  it('should fallback to LLM for non-TS/JS files', async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockGetModels.mockResolvedValue(['qwen/qwen3.5-9b']);

    const compressedPython = '# Compressed Python code';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: compressedPython } }],
      }),
    } as any);

    const { compressed, method } = await compressCodeBlock(
      samplePythonCode,
      'test.py'
    );
    
    expect(method).toBe('llm');
    expect(compressed).toBe(compressedPython);

    fetchSpy.mockRestore();
  });

  it('should return original when LLM unavailable for non-TS/JS', async () => {
    mockIsAvailable.mockResolvedValue(false);

    const { compressed, method } = await compressCodeBlock(
      samplePythonCode,
      'test.py'
    );
    
    expect(method).toBe('none');
    expect(compressed).toBe(samplePythonCode);
  });

  it('should handle compression errors gracefully', async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockGetModels.mockResolvedValue(['qwen/qwen3.5-9b']);

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Network error')
    );

    const { compressed, method } = await compressCodeBlock(
      samplePythonCode,
      'test.py'
    );
    
    expect(method).toBe('none');
    expect(compressed).toBe(samplePythonCode);

    fetchSpy.mockRestore();
  });
});

describe('compressMessages', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockIsAvailable.mockReset();
    mockGetModels.mockReset();
    // Set default mock return values
    mockIsAvailable.mockResolvedValue(false);
    mockGetModels.mockResolvedValue([]);
  });

  it('should return original messages when LM Studio unavailable and AST disabled', async () => {
    mockIsAvailable.mockResolvedValue(false);
    mockGetModels.mockResolvedValue([]);

    const messages = [{ role: 'user', content: 'Hello world' }];
    const result = await compressMessages(messages, 'You are helpful.', 'light');

    expect(result.compressedMessages).toEqual(messages);
    expect(result.compressedSystem).toBe('You are helpful.');
    expect(result.stats.ollamaAvailable).toBe(false);
    expect(result.stats.reductionPercent).toBe(0);
    expect(result.stats.compressionLevel).toBe('light');
  });

  it('should compress messages with medium level', async () => {
    mockIsAvailable.mockResolvedValue(false); // AST only
    mockGetModels.mockResolvedValue([]);

    const largeBlock = '```typescript\n' + sampleTypeScriptCode.repeat(2) + '\n```';
    const messages = [
      { role: 'user', content: `Please review:\n${largeBlock}` },
    ];

    const result = await compressMessages(messages, 'You are a reviewer.', 'medium');

    expect(result.stats.compressionLevel).toBe('medium');
    expect(result.stats.method).toBe('hybrid');
    expect(result.stats.blocksCompressed).toBeGreaterThan(0);
  });

  it('should compress messages with aggressive level', async () => {
    mockIsAvailable.mockResolvedValue(false);
    mockGetModels.mockResolvedValue([]);

    const largeBlock = '```typescript\n' + sampleTypeScriptCode + '\n```';
    const messages = [
      { role: 'user', content: `Review:\n${largeBlock}` },
    ];

    const result = await compressMessages(messages, 'System', 'aggressive');

    expect(result.stats.compressionLevel).toBe('aggressive');
    expect(result.stats.blocksCompressed).toBeGreaterThan(0);
  });

  it('should skip messages below the threshold', async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockGetModels.mockResolvedValue(['qwen/qwen3.5-9b']);

    const shortMessages = [
      { role: 'user', content: 'Short prompt' },
      { role: 'assistant', content: 'Short reply' },
    ];

    const result = await compressMessages(shortMessages, 'System', 'medium');

    expect(result.compressedMessages).toEqual(shortMessages);
    expect(result.stats.blocksCompressed).toBe(0);
  });

  it('should handle Anthropic content block arrays', async () => {
    mockIsAvailable.mockResolvedValue(false);
    mockGetModels.mockResolvedValue([]);

    const largeBlock = '```typescript\n' + sampleTypeScriptCode + '\n```';
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Review:\n${largeBlock}` },
        ],
      },
    ];

    const result = await compressMessages(messages, '', 'medium');
    expect(result.compressedMessages).toBeDefined();
    expect(result.stats).toBeDefined();
  });

  it('should correctly calculate reduction statistics', async () => {
    mockIsAvailable.mockResolvedValue(false);
    mockGetModels.mockResolvedValue([]);

    const messages = [{ role: 'user', content: 'x'.repeat(100) }];
    const result = await compressMessages(messages, 'sys', 'medium');

    expect(result.stats.originalChars).toBe(103);
    expect(result.stats.compressedChars).toBe(103);
    expect(result.stats.savedChars).toBe(0);
    expect(result.stats.reductionPercent).toBe(0);
  });

  it('should compress system prompt if large enough', async () => {
    mockIsAvailable.mockResolvedValue(false);
    mockGetModels.mockResolvedValue([]);

    const largeSystem = '```typescript\n' + sampleTypeScriptCode.repeat(10) + '\n```';
    const messages = [{ role: 'user', content: 'Hello' }];

    const result = await compressMessages(messages, largeSystem, 'medium');

    expect(result.compressedSystem.length).toBeLessThan(largeSystem.length);
    expect(result.stats.blocksCompressed).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// File Compression API Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('compressFile', () => {
  it('should compress a single TypeScript file', async () => {
    const result = await compressFile('test.ts', sampleTypeScriptCode, 'medium');

    expect(result.compressed.length).toBeLessThan(sampleTypeScriptCode.length);
    expect(result.stats.originalSize).toBe(sampleTypeScriptCode.length);
    expect(result.stats.compressedSize).toBe(result.compressed.length);
    expect(result.stats.reduction).toBeGreaterThan(0);
    expect(result.stats.method).toBe('ast');
  });

  it('should compress a single JavaScript file', async () => {
    const result = await compressFile('test.js', sampleJavaScriptCode, 'medium');

    expect(result.compressed.length).toBeLessThan(sampleJavaScriptCode.length);
    expect(result.stats.method).toBe('ast');
  });

  it('should handle different compression levels', async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockGetModels.mockResolvedValue(['qwen/qwen3.5-9b']);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '// Light compressed code\n' + ' '.repeat(100) } }],
      }),
    } as any);

    const resultLight = await compressFile('test.ts', sampleTypeScriptCode, 'light');
    const resultMedium = await compressFile('test.ts', sampleTypeScriptCode, 'medium');
    const resultAggressive = await compressFile('test.ts', sampleTypeScriptCode, 'aggressive');

    // All should compress
    expect(resultLight.stats.reduction).toBeGreaterThan(0);
    expect(resultMedium.stats.reduction).toBeGreaterThan(0);
    expect(resultAggressive.stats.reduction).toBeGreaterThan(0);

    fetchSpy.mockRestore();
  });
});

describe('compressFiles', () => {
  it('should compress multiple files at once', async () => {
    const files = [
      { path: 'test1.ts', content: sampleTypeScriptCode },
      { path: 'test2.js', content: sampleJavaScriptCode },
    ];

    const result = await compressFiles(files, 'medium');

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe('test1.ts');
    expect(result.files[1].path).toBe('test2.js');
    expect(result.totalStats.originalSize).toBeGreaterThan(0);
    expect(result.totalStats.compressedSize).toBeLessThan(result.totalStats.originalSize);
    expect(result.totalStats.reduction).toBeGreaterThan(0);
  });

  it('should track compression method for each file', async () => {
    const files = [
      { path: 'test.ts', content: sampleTypeScriptCode },
    ];

    const result = await compressFiles(files, 'medium');

    expect(result.files[0].method).toBe('ast');
  });
});

describe('smartCompress', () => {
  it('should choose light level for small files', async () => {
    const smallCode = 'const x = 1;\n'.repeat(100); // ~1500 chars

    const result = await smartCompress(smallCode, 'test.ts');

    expect(result.level).toBe('light');
  });

  it('should choose medium level for medium files', async () => {
    const mediumCode = sampleTypeScriptCode.repeat(3); // ~5000-10000 chars

    const result = await smartCompress(mediumCode, 'test.ts');

    expect(result.level).toBe('medium');
  });

  it('should choose aggressive level for large files', async () => {
    const largeCode = sampleTypeScriptCode.repeat(10); // >15000 chars

    const result = await smartCompress(largeCode, 'test.ts');

    expect(result.level).toBe('aggressive');
  });

  it('should return compression stats', async () => {
    const inputCode = sampleTypeScriptCode.repeat(3);
    const result = await smartCompress(inputCode, 'test.ts');

    expect(result.stats.originalSize).toBe(inputCode.length);
    expect(result.stats.compressedSize).toBeLessThan(result.stats.originalSize);
    expect(result.stats.reduction).toBeGreaterThan(0);
    expect(result.stats.method).toBe('ast');
    expect(result.stats.level).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Performance Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

describe('Performance Benchmarks', () => {
  it('should compress TypeScript with AST in < 100ms', async () => {
    const start = Date.now();
    await compressCodeBlock(sampleTypeScriptCode, 'test.ts', 'http://localhost:1234', 'medium');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('should compress JavaScript with AST in < 100ms', async () => {
    const start = Date.now();
    await compressCodeBlock(sampleJavaScriptCode, 'test.js', 'http://localhost:1234', 'medium');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('should handle large TypeScript files efficiently', async () => {
    const largeCode = sampleTypeScriptCode.repeat(10);
    
    const start = Date.now();
    const { compressed, method } = await compressCodeBlock(largeCode, 'large.ts', 'http://localhost:1234', 'aggressive');
    const duration = Date.now() - start;

    expect(method).toBe('ast');
    expect(duration).toBeLessThan(200); // Allow more time for large files
    expect(compressed.length).toBeLessThan(largeCode.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Information Preservation Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('Information Preservation', () => {
  it('should preserve all exported function signatures', async () => {
    const { compressed } = await compressCodeBlock(sampleTypeScriptCode, 'test.ts');

    expect(compressed).toContain('validateUser');
    expect(compressed).toContain('Promise<boolean>');
  });

  it('should preserve all class names and methods', async () => {
    const { compressed } = await compressCodeBlock(sampleTypeScriptCode, 'test.ts');

    expect(compressed).toContain('UserController');
    expect(compressed).toContain('getUser');
    expect(compressed).toContain('createUser');
  });

  it('should preserve all imports and dependencies', async () => {
    const { compressed } = await compressCodeBlock(sampleTypeScriptCode, 'test.ts');

    expect(compressed).toContain('express');
    expect(compressed).toContain('./services/user');
  });

  it('should preserve all type definitions', async () => {
    const { compressed } = await compressCodeBlock(sampleTypeScriptCode, 'test.ts');

    expect(compressed).toContain('User');
  });

  it('should preserve TODO/FIXME/HACK comments', async () => {
    const { compressed } = await compressCodeBlock(sampleTypeScriptCode, 'test.ts');

    expect(compressed).toContain('TODO');
  });

  it('should preserve FIXME comments in JavaScript', async () => {
    const { compressed } = await compressCodeBlock(sampleJavaScriptCode, 'test.js');

    expect(compressed).toContain('FIXME');
  });

  it('should not lose critical API surface information', async () => {
    const { compressed } = await compressCodeBlock(sampleTypeScriptCode, 'test.ts');

    // Verify all public APIs are present
    expect(compressed).toContain('User');
    expect(compressed).toContain('UserController');
    expect(compressed).toContain('validateUser');
    
    // Verify parameter information is preserved
    expect(compressed).toContain('user: User');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Different File Types Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('Different File Types', () => {
  const sampleTSXCode = `
import React from 'react';
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};
`;

  const sampleJSXCode = `
import React from 'react';
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing
// padding comment to exceed 500 characters limit for compression testing

export function Card({ title, children }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
`;

  const sampleGoCode = `
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
`;

  const sampleRustCode = `
fn main() {
    println!("Hello, world!");
}

pub struct User {
    name: String,
    age: u32,
}
`;

  it('should compress TypeScript (.ts) files', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleTypeScriptCode,
      'test.ts',
      'http://localhost:1234',
      'medium'
    );

    expect(method).toBe('ast');
    expect(compressed.length).toBeLessThan(sampleTypeScriptCode.length);
  });

  it('should compress TSX (.tsx) files', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleTSXCode,
      'Button.tsx',
      'http://localhost:1234',
      'medium'
    );

    expect(method).toBe('ast');
    expect(compressed).toContain('Button');
    expect(compressed).toContain('ButtonProps');
  });

  it('should compress JavaScript (.js) files', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleJavaScriptCode,
      'test.js',
      'http://localhost:1234',
      'medium'
    );

    expect(method).toBe('ast');
    expect(compressed.length).toBeLessThan(sampleJavaScriptCode.length);
  });

  it('should compress JSX (.jsx) files', async () => {
    const { compressed, method } = await compressCodeBlock(
      sampleJSXCode,
      'Card.jsx',
      'http://localhost:1234',
      'medium'
    );

    expect(method).toBe('ast');
    expect(compressed).toContain('Card');
  });

  it('should handle Python files (no AST, fallback to LLM or none)', async () => {
    mockIsAvailable.mockResolvedValue(false);

    const { compressed, method } = await compressCodeBlock(
      samplePythonCode,
      'test.py',
      'http://localhost:1234',
      'medium'
    );

    // Without LLM available, should return original
    expect(method).toBe('none');
    expect(compressed).toBe(samplePythonCode);
  });

  it('should handle Go files (no AST support)', async () => {
    mockIsAvailable.mockResolvedValue(false);

    const { compressed, method } = await compressCodeBlock(
      sampleGoCode,
      'main.go',
      'http://localhost:1234',
      'medium'
    );

    expect(method).toBe('none');
    expect(compressed).toBe(sampleGoCode);
  });

  it('should handle Rust files (no AST support)', async () => {
    mockIsAvailable.mockResolvedValue(false);

    const { compressed, method } = await compressCodeBlock(
      sampleRustCode,
      'main.rs',
      'http://localhost:1234',
      'medium'
    );

    expect(method).toBe('none');
    expect(compressed).toBe(sampleRustCode);
  });

  it('should detect language from filename extension', async () => {
    const files = [
      { name: 'test.ts', expected: 'typescript' },
      { name: 'test.tsx', expected: 'tsx' },
      { name: 'test.js', expected: 'javascript' },
      { name: 'test.jsx', expected: 'jsx' },
    ];

    for (const file of files) {
      const { method } = await compressCodeBlock(
        'export function test() { console.log("hello"); }\n' + '// padding\n'.repeat(100),
        file.name,
        'http://localhost:1234',
        'medium'
      );
      
      // All these should use AST
      expect(method).toBe('ast');
    }
  });

  it('should handle files without extension', async () => {
    mockIsAvailable.mockResolvedValue(false);

    const { compressed, method } = await compressCodeBlock(
      'const x = 1;'.repeat(100),
      'Makefile',
      'http://localhost:1234',
      'medium'
    );

    // Should try to detect from content or return none
    expect(['ast', 'none']).toContain(method);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Edge Cases and Error Handling
// ═════════════════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  it('should handle empty code', async () => {
    const { compressed, method } = await compressCodeBlock('', 'test.ts');
    
    expect(method).toBe('none');
    expect(compressed).toBe('');
  });

  it('should handle very short code (< 500 chars)', async () => {
    const shortCode = 'const x = 1;';
    const { compressed, method } = await compressCodeBlock(shortCode, 'test.ts');
    
    expect(method).toBe('none');
    expect(compressed).toBe(shortCode);
  });

  it('should handle code with only whitespace', async () => {
    const whitespaceCode = '   \n\n\t\t   \n';
    const { compressed, method } = await compressCodeBlock(whitespaceCode, 'test.ts');
    
    expect(method).toBe('none');
    expect(compressed).toBe(whitespaceCode);
  });

  it('should handle code with special characters', async () => {
    const specialCode = `
const emoji = '🚀 💻 🎉';
const unicode = 'Hello 世界';
const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
`.repeat(50);

    const { compressed, method } = await compressCodeBlock(specialCode, 'test.ts');
    
    expect(method).toBe('ast');
    expect(compressed).toBeDefined();
  });

  it('should handle deeply nested code structures', async () => {
    const nestedCode = `
export class Outer {
  class Inner {
    class DeepInner {
      method() {
        return function() {
          return () => {
            return { nested: { deeply: { value: 1 } } };
          };
        };
      }
    }
  }
}
`.repeat(10);

    const { compressed, method } = await compressCodeBlock(nestedCode, 'test.ts');
    
    expect(method).toBe('ast');
    expect(compressed).toContain('Outer');
  });

  it('should handle code with syntax errors gracefully', async () => {
    const brokenCode = `
function broken( {
  return
}
const x = ;
`.repeat(50);

    const { compressed, method } = await compressCodeBlock(brokenCode, 'test.ts');
    
    // Should not throw, may return original or partial compression
    expect(compressed).toBeDefined();
  });

  it('should handle extremely large files', async () => {
    const largeCode = sampleTypeScriptCode.repeat(100); // Very large file
    
    const start = Date.now();
    const { compressed, method } = await compressCodeBlock(
      largeCode,
      'large.ts',
      'http://localhost:1234',
      'aggressive'
    );
    const duration = Date.now() - start;

    expect(method).toBe('ast');
    expect(compressed.length).toBeLessThan(largeCode.length);
    expect(duration).toBeLessThan(500); // Should still be reasonably fast
  });

  it('should handle code with no exports', async () => {
    const noExportsCode = `
function privateFunction() {
  return 'private';
}

const privateVar = 42;
`.repeat(20);

    const { compressed, method } = await compressCodeBlock(noExportsCode, 'test.ts');
    
    expect(method).toBe('ast');
    expect(compressed).toContain('privateFunction');
  });

  it('should handle code with only comments', async () => {
    const commentsOnlyCode = `
// TODO: Implement this
// FIXME: Bug here
// HACK: Temporary solution
/* Multi-line comment
   with multiple lines
*/
`.repeat(50);

    const { compressed, method } = await compressCodeBlock(commentsOnlyCode, 'test.ts');
    
    expect(method).toBe('ast');
    expect(compressed).toContain('TODO');
  });

  it('should handle mixed content (code + markdown)', async () => {
    const mixedContent = `
# Documentation

\`\`\`typescript
export function example() {
  return 'test';
}
\`\`\`

More text here.
`;

    const blocks = extractCodeBlocks(mixedContent);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('typescript');
  });

  it('should handle concurrent compression requests', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => 
      compressCodeBlock(
        sampleTypeScriptCode,
        `test${i}.ts`,
        'http://localhost:1234',
        'medium'
      )
    );

    const results = await Promise.all(promises);

    results.forEach(result => {
      expect(result.method).toBe('ast');
      expect(result.compressed.length).toBeLessThan(sampleTypeScriptCode.length);
    });
  });
});
