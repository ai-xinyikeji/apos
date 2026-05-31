import { isOllamaAvailable, getOllamaModels, routeModel } from './llm';
import * as ts from 'typescript';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CompressionResult {
  compressedMessages: any[];
  compressedSystem: string;
  stats: CompressionStats;
}

export interface CompressionStats {
  originalChars: number;
  compressedChars: number;
  savedChars: number;
  reductionPercent: number;
  blocksCompressed: number;
  blocksSkipped: number;
  ollamaAvailable: boolean;
  compressionLevel?: 'light' | 'medium' | 'aggressive';
  method?: 'ast' | 'llm' | 'hybrid';
}

export interface CodeSummary {
  exports: string[];
  imports: string[];
  types: string[];
  functions: FunctionSignature[];
  classes: ClassSignature[];
  comments: string[];
  architecture: string;
  dependencies: string[];
}

export interface FunctionSignature {
  name: string;
  params: string;
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
  summary?: string;
}

export interface ClassSignature {
  name: string;
  methods: string[];
  properties: string[];
  isExported: boolean;
  extends?: string;
  implements?: string[];
}

export type CompressionLevel = 'light' | 'medium' | 'aggressive';

interface CodeBlock {
  fullMatch: string;
  language: string;
  code: string;
  startIndex: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 8000;

const COMPRESSION_SYSTEM_PROMPT = `You are a code compression assistant. Your job is to extract the essential structure from a code block while preserving all API surface information.

Rules:
1. Extract all exported functions, classes, interfaces, types, and constants with their FULL signatures (parameters + return types).
2. Keep all import statements that define dependencies.
3. Keep all TODO/FIXME/HACK comments.
4. For function bodies, replace with a one-line summary comment describing what it does.
5. Preserve the file's overall architecture and module boundaries.
6. Output ONLY the compressed code — no explanations, no markdown fences.`;

const COMPRESSION_LEVELS = {
  light: {
    threshold: 10000,
    maxTokens: 4096,
    temperature: 0.1,
    useAST: false,
  },
  medium: {
    threshold: 5000,
    maxTokens: 2048,
    temperature: 0.1,
    useAST: true,
  },
  aggressive: {
    threshold: 2000,
    maxTokens: 1024,
    temperature: 0.05,
    useAST: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AST-based Code Analysis (TypeScript/JavaScript)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract code summary using AST parsing (faster and more accurate than LLM)
 */
export function extractCodeSummaryAST(code: string, language: string): CodeSummary | null {
  try {
    if (language === 'typescript' || language === 'ts' || language === 'tsx') {
      return extractTypeScriptSummary(code);
    } else if (language === 'javascript' || language === 'js' || language === 'jsx') {
      return extractJavaScriptSummary(code);
    }
    return null;
  } catch (error) {
    console.warn('[APOS Compression] AST parsing failed:', error);
    return null;
  }
}

/**
 * Extract summary from TypeScript code using TypeScript compiler API
 */
function extractTypeScriptSummary(code: string): CodeSummary {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const summary: CodeSummary = {
    exports: [],
    imports: [],
    types: [],
    functions: [],
    classes: [],
    comments: [],
    architecture: '',
    dependencies: [],
  };

  function visit(node: ts.Node) {
    // Extract imports
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
      summary.imports.push(moduleSpecifier);
      summary.dependencies.push(moduleSpecifier);
    }

    // Extract exports - use ts.canHaveModifiers and ts.getModifiers for compatibility
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      const text = node.getText(sourceFile);
      summary.exports.push(text.split('\n')[0].substring(0, 100));
    }

    // Extract function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const funcModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = funcModifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      const isAsync = funcModifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
      
      summary.functions.push({
        name: node.name.text,
        params: node.parameters.map(p => p.getText(sourceFile)).join(', '),
        returnType: node.type?.getText(sourceFile) || 'any',
        isAsync,
        isExported,
      });
    }

    // Extract class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const classModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = classModifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      const methods: string[] = [];
      const properties: string[] = [];

      node.members.forEach(member => {
        if (ts.isMethodDeclaration(member) && member.name) {
          methods.push(member.name.getText(sourceFile));
        }
        if (ts.isPropertyDeclaration(member) && member.name) {
          properties.push(member.name.getText(sourceFile));
        }
      });

      summary.classes.push({
        name: node.name.text,
        methods,
        properties,
        isExported,
        extends: node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword)
          ?.types[0]?.getText(sourceFile),
        implements: node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ImplementsKeyword)
          ?.types.map(t => t.getText(sourceFile)),
      });
    }

    // Extract type aliases and interfaces
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      summary.types.push(node.name.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Extract comments (TODO, FIXME, HACK) once from the code
  const commentMatches = code.match(/\/\/\s*(TODO|FIXME|HACK):?.*/g);
  if (commentMatches) {
    summary.comments = Array.from(new Set(commentMatches.map(c => c.trim())));
  }

  // Generate architecture summary
  summary.architecture = generateArchitectureSummary(summary);

  return summary;
}

/**
 * Extract summary from JavaScript code using Babel parser
 */
function extractJavaScriptSummary(code: string): CodeSummary {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  const summary: CodeSummary = {
    exports: [],
    imports: [],
    types: [],
    functions: [],
    classes: [],
    comments: [],
    architecture: '',
    dependencies: [],
  };

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      summary.imports.push(source);
      summary.dependencies.push(source);
    },
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const code = path.toString().split('\n')[0].substring(0, 100);
        summary.exports.push(code);
      }
    },
    FunctionDeclaration(path) {
      const node = path.node;
      if (node.id) {
        summary.functions.push({
          name: node.id.name,
          params: node.params.map((p: any) => p.name || '...').join(', '),
          returnType: 'any',
          isAsync: node.async || false,
          isExported: path.parent.type === 'ExportNamedDeclaration',
        });
      }
    },
    ClassDeclaration(path) {
      const node = path.node;
      if (node.id) {
        const methods = node.body.body
          .filter((m: any) => m.type === 'ClassMethod')
          .map((m: any) => m.key.name);
        
        const properties = node.body.body
          .filter((m: any) => m.type === 'ClassProperty')
          .map((m: any) => m.key.name);

        summary.classes.push({
          name: node.id.name,
          methods,
          properties,
          isExported: path.parent.type === 'ExportNamedDeclaration',
        });
      }
    },
  });

  // Extract comments
  if (ast.comments) {
    const commentsList: string[] = [];
    ast.comments.forEach((comment: any) => {
      const text = comment.value;
      if (text.includes('TODO') || text.includes('FIXME') || text.includes('HACK')) {
        commentsList.push(text.trim());
      }
    });
    summary.comments = Array.from(new Set(commentsList));
  }

  summary.architecture = generateArchitectureSummary(summary);

  return summary;
}

/**
 * Generate a concise architecture summary from code summary
 */
function generateArchitectureSummary(summary: CodeSummary): string {
  const parts: string[] = [];

  if (summary.exports.length > 0) {
    parts.push(`Exports: ${summary.exports.length} items`);
  }
  if (summary.functions.length > 0) {
    parts.push(`Functions: ${summary.functions.length}`);
  }
  if (summary.classes.length > 0) {
    parts.push(`Classes: ${summary.classes.length}`);
  }
  if (summary.types.length > 0) {
    parts.push(`Types: ${summary.types.length}`);
  }
  if (summary.dependencies.length > 0) {
    parts.push(`Dependencies: ${summary.dependencies.slice(0, 5).join(', ')}${summary.dependencies.length > 5 ? '...' : ''}`);
  }

  return parts.join(' | ');
}

/**
 * Convert CodeSummary to compressed code string
 */
export function codeSummaryToString(summary: CodeSummary, language: string): string {
  const lines: string[] = [];

  lines.push(`// [APOS AST 压缩] ${summary.architecture}`);
  lines.push('');

  // Imports
  if (summary.imports.length > 0) {
    lines.push('// Dependencies:');
    summary.imports.forEach(imp => {
      lines.push(`// - ${imp}`);
    });
    lines.push('');
  }

  // Exports
  if (summary.exports.length > 0) {
    lines.push('// Exported APIs:');
    summary.exports.forEach(exp => {
      lines.push(`// ${exp}`);
    });
    lines.push('');
  }

  // Functions
  if (summary.functions.length > 0) {
    lines.push('// Functions:');
    summary.functions.forEach(fn => {
      const asyncPrefix = fn.isAsync ? 'async ' : '';
      const exportPrefix = fn.isExported ? 'export ' : '';
      lines.push(`${exportPrefix}${asyncPrefix}function ${fn.name}(${fn.params}): ${fn.returnType}`);
    });
    lines.push('');
  }

  // Classes
  if (summary.classes.length > 0) {
    lines.push('// Classes:');
    summary.classes.forEach(cls => {
      const exportPrefix = cls.isExported ? 'export ' : '';
      const extendsClause = cls.extends ? ` extends ${cls.extends}` : '';
      const implementsClause = cls.implements?.length ? ` implements ${cls.implements.join(', ')}` : '';
      lines.push(`${exportPrefix}class ${cls.name}${extendsClause}${implementsClause} {`);
      cls.methods.forEach(m => lines.push(`  ${m}()`));
      cls.properties.forEach(p => lines.push(`  ${p}`));
      lines.push('}');
    });
    lines.push('');
  }

  // Types
  if (summary.types.length > 0) {
    lines.push(`// Types: ${summary.types.join(', ')}`);
    lines.push('');
  }

  // Important comments
  if (summary.comments.length > 0) {
    lines.push('// Important Notes:');
    summary.comments.forEach(comment => {
      lines.push(`// ${comment}`);
    });
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Code block extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract markdown fenced code blocks from a text string.
 * Matches ```lang\n...\n``` patterns.
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks: CodeBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      fullMatch: match[0],
      language: match[1] || '',
      code: match[2],
      startIndex: match.index,
    });
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single code block compression via Ollama
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compress a single large code block using hybrid approach:
 * 1. Try AST-based compression first (fast, accurate)
 * 2. Fall back to LLM compression if AST fails or for non-TS/JS code
 * 3. Return original if both fail
 */
export async function compressCodeBlock(
  content: string,
  filename?: string,
  ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  level: CompressionLevel = 'medium'
): Promise<{ compressed: string; method: 'ast' | 'llm' | 'none' }> {
  const config = COMPRESSION_LEVELS[level];

  // Don't compress very short content
  if (content.length < 500) {
    return { compressed: content, method: 'none' };
  }

  // Detect language from filename or content
  const language = detectLanguage(filename, content);

  // Try AST-based compression first for TS/JS
  if (config.useAST && (language === 'typescript' || language === 'javascript' || language === 'ts' || language === 'tsx' || language === 'js' || language === 'jsx')) {
    try {
      const summary = extractCodeSummaryAST(content, language);
      if (summary) {
        const compressed = codeSummaryToString(summary, language);
        
        // Verify compression is meaningful
        if (compressed.length < content.length * 0.7) {
          console.log(`[APOS Compression] ✅ AST compressed ${filename || 'code'}: ${content.length} → ${compressed.length} chars (${Math.round((1 - compressed.length / content.length) * 100)}% reduction)`);
          return { compressed, method: 'ast' };
        }
      }
    } catch (error) {
      console.warn('[APOS Compression] AST compression failed, falling back to LLM:', error);
    }
  }

  // Fall back to LLM compression
  const available = await isOllamaAvailable();
  if (!available) {
    return { compressed: content, method: 'none' };
  }

  const models = await getOllamaModels();
  const modelId = models[0] || 'qwen/qwen3.5-9b';

  const userPrompt = filename
    ? `Compress the following code from file "${filename}":\n\n${content}`
    : `Compress the following code block:\n\n${content}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s — reasoning models need more time

  try {
    const response = await fetch(`${ollamaBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: COMPRESSION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[APOS Compression] Ollama returned ${response.status}, using original content`);
      return { compressed: content, method: 'none' };
    }

    const data = await response.json();
    const compressed = data.choices?.[0]?.message?.content?.trim();

    if (!compressed || compressed.length === 0) {
      return { compressed: content, method: 'none' };
    }

    // Sanity check: compressed should be meaningfully smaller
    if (compressed.length >= content.length * 0.9) {
      console.log('[APOS Compression] Compressed output not significantly smaller, using original');
      return { compressed: content, method: 'none' };
    }

    console.log(`[APOS Compression] ✅ LLM compressed ${filename || 'code'}: ${content.length} → ${compressed.length} chars (${Math.round((1 - compressed.length / content.length) * 100)}% reduction)`);
    return { compressed, method: 'llm' };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[APOS Compression] Failed to compress code block: ${err.message}`);
    return { compressed: content, method: 'none' };
  }
}

/**
 * Detect programming language from filename or content
 */
function detectLanguage(filename?: string, content?: string): string {
  if (filename) {
    if (filename.endsWith('.ts')) return 'typescript';
    if (filename.endsWith('.tsx')) return 'tsx';
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.jsx')) return 'jsx';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.java')) return 'java';
    if (filename.endsWith('.go')) return 'go';
    if (filename.endsWith('.rs')) return 'rust';
  }

  if (content) {
    if (content.includes('interface ') || content.includes(': string') || content.includes(': number')) {
      return 'typescript';
    }
    if (content.includes('import ') && content.includes('from ')) {
      return 'javascript';
    }
  }

  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Full message pipeline compression
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively extract all text content from an Anthropic-style message content block.
 */
function getTextFromContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block: any) => {
        if (block?.type === 'text') return block.text || '';
        if (block?.type === 'tool_result') return getTextFromContent(block.content);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Replace large code blocks in a text string with their compressed versions.
 * Only blocks exceeding the character threshold are compressed.
 */
async function compressTextContent(
  text: string,
  threshold: number,
  level: CompressionLevel = 'medium'
): Promise<{ result: string; stats: { compressed: number; skipped: number; savedChars: number; astCount: number; llmCount: number } }> {
  const blocks = extractCodeBlocks(text);
  let result = text;
  let compressed = 0;
  let skipped = 0;
  let savedChars = 0;
  let astCount = 0;
  let llmCount = 0;

  // Process blocks in reverse order so indices remain valid after replacement
  const largeBlocks = blocks
    .filter(b => b.code.length >= threshold)
    .sort((a, b) => b.startIndex - a.startIndex);

  for (const block of largeBlocks) {
    const { compressed: compressedCode, method } = await compressCodeBlock(block.code, undefined, process.env.OLLAMA_BASE_URL || 'http://localhost:11434', level);

    if (compressedCode !== block.code) {
      const methodLabel = method === 'ast' ? 'AST 结构化' : 'LLM 智能';
      const marker = `[APOS ${methodLabel}压缩，节省 ${Math.round((1 - compressedCode.length / block.code.length) * 100)}% token]\n\`\`\`${block.language}\n${compressedCode}\n\`\`\``;
      result = result.replace(block.fullMatch, marker);
      savedChars += block.fullMatch.length - marker.length;
      compressed++;
      
      if (method === 'ast') astCount++;
      if (method === 'llm') llmCount++;
    } else {
      skipped++;
    }
  }

  // Also check for very large inline text (non-code-block) that looks like full file dumps
  // This handles cases where Claude sends raw file content without markdown fences
  skipped += blocks.filter(b => b.code.length < threshold).length;

  return { result, stats: { compressed, skipped, savedChars, astCount, llmCount } };
}

/**
 * Replace content blocks within message objects, preserving their structure.
 */
function replaceContentText(content: any, oldText: string, newText: string): any {
  if (typeof content === 'string') {
    return content.replace(oldText, newText);
  }
  if (Array.isArray(content)) {
    return content.map((block: any) => {
      if (block?.type === 'text' && typeof block.text === 'string') {
        return { ...block, text: block.text.replace(oldText, newText) };
      }
      if (block?.type === 'tool_result' && block.content) {
        return { ...block, content: replaceContentText(block.content, oldText, newText) };
      }
      return block;
    });
  }
  return content;
}

/**
 * Main compression pipeline with configurable compression level.
 * Scans system prompt and all messages for large code blocks, compresses them
 * using hybrid AST + LLM approach, and returns the modified payload with statistics.
 *
 * @param messages - Anthropic-format message array
 * @param systemInstruction - System prompt string
 * @param level - Compression level: 'light' | 'medium' | 'aggressive'
 * @returns CompressionResult with compressed messages, system, and stats
 */
export async function compressMessages(
  messages: any[],
  systemInstruction: string,
  level: CompressionLevel = 'medium',
): Promise<CompressionResult> {
  const config = COMPRESSION_LEVELS[level];
  // Use getOllamaModels() directly to avoid a separate isOllamaAvailable() HTTP request
  const lmModels = await getOllamaModels();
  const lmAvailable = lmModels.length > 0;

  const originalSystemLen = systemInstruction.length;
  const originalMsgLen = messages.reduce((acc, m) => acc + getTextFromContent(m.content).length, 0);
  const originalChars = originalSystemLen + originalMsgLen;

  // If Ollama is not available and AST is not enabled, return everything unchanged
  if (!lmAvailable && !config.useAST) {
    console.log('[APOS Compression] Ollama not available and AST disabled, skipping compression');
    return {
      compressedMessages: messages,
      compressedSystem: systemInstruction,
      stats: {
        originalChars,
        compressedChars: originalChars,
        savedChars: 0,
        reductionPercent: 0,
        blocksCompressed: 0,
        blocksSkipped: 0,
        ollamaAvailable: false,
        compressionLevel: level,
        method: 'hybrid',
      },
    };
  }

  let totalCompressed = 0;
  let totalSkipped = 0;
  let totalSaved = 0;
  let totalAstCount = 0;
  let totalLlmCount = 0;

  // 1. Compress system prompt
  let compressedSystem = systemInstruction;
  if (systemInstruction.length > config.threshold) {
    const { result, stats } = await compressTextContent(systemInstruction, config.threshold, level);
    compressedSystem = result;
    totalCompressed += stats.compressed;
    totalSkipped += stats.skipped;
    totalSaved += stats.savedChars;
    totalAstCount += stats.astCount;
    totalLlmCount += stats.llmCount;
  }

  // 2. Compress message contents
  const compressedMessages = [];
  for (const msg of messages) {
    const text = getTextFromContent(msg.content);

    // Only process messages with substantial content
    if (text.length < config.threshold) {
      compressedMessages.push(msg);
      continue;
    }

    const { result, stats } = await compressTextContent(text, config.threshold, level);
    totalCompressed += stats.compressed;
    totalSkipped += stats.skipped;
    totalSaved += stats.savedChars;
    totalAstCount += stats.astCount;
    totalLlmCount += stats.llmCount;

    if (result !== text) {
      // Replace content in-place preserving message structure
      const newContent = typeof msg.content === 'string'
        ? result
        : replaceContentText(msg.content, text, result);

      compressedMessages.push({ ...msg, content: newContent });
    } else {
      compressedMessages.push(msg);
    }
  }

  const compressedChars = originalChars - totalSaved;
  const reductionPercent = originalChars > 0
    ? Math.round((totalSaved / originalChars) * 100)
    : 0;

  const stats: CompressionStats = {
    originalChars,
    compressedChars,
    savedChars: totalSaved,
    reductionPercent,
    blocksCompressed: totalCompressed,
    blocksSkipped: totalSkipped,
    ollamaAvailable: lmAvailable,
    compressionLevel: level,
    method: 'hybrid',
  };

  if (totalCompressed > 0) {
    console.log(
      `[APOS Compression] ✅ Compressed ${totalCompressed} code blocks (${totalAstCount} AST, ${totalLlmCount} LLM). ` +
      `Saved ${totalSaved} chars (${reductionPercent}% reduction). ` +
      `${totalSkipped} blocks below threshold. Level: ${level}`
    );
  }

  return { compressedMessages, compressedSystem, stats };
}


// ─────────────────────────────────────────────────────────────────────────────
// File Compression API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compress a single file's content
 * Useful for compressing files before sending to Claude
 */
export async function compressFile(
  filePath: string,
  content: string,
  level: CompressionLevel = 'medium'
): Promise<{ compressed: string; stats: { originalSize: number; compressedSize: number; reduction: number; method: string } }> {
  const { compressed, method } = await compressCodeBlock(content, filePath, process.env.OLLAMA_BASE_URL || 'http://localhost:11434', level);
  
  const originalSize = content.length;
  const compressedSize = compressed.length;
  const reduction = Math.round((1 - compressedSize / originalSize) * 100);

  return {
    compressed,
    stats: {
      originalSize,
      compressedSize,
      reduction,
      method,
    },
  };
}

/**
 * Compress multiple files at once
 */
export async function compressFiles(
  files: Array<{ path: string; content: string }>,
  level: CompressionLevel = 'medium'
): Promise<{
  files: Array<{ path: string; compressed: string; method: string }>;
  totalStats: { originalSize: number; compressedSize: number; reduction: number };
}> {
  const results = [];
  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const file of files) {
    const { compressed, stats } = await compressFile(file.path, file.content, level);
    results.push({
      path: file.path,
      compressed,
      method: stats.method,
    });
    totalOriginal += stats.originalSize;
    totalCompressed += stats.compressedSize;
  }

  return {
    files: results,
    totalStats: {
      originalSize: totalOriginal,
      compressedSize: totalCompressed,
      reduction: Math.round((1 - totalCompressed / totalOriginal) * 100),
    },
  };
}

/**
 * Smart compression: automatically choose the best compression level based on content size
 */
export async function smartCompress(
  content: string,
  filename?: string
): Promise<{ compressed: string; level: CompressionLevel; stats: any }> {
  const size = content.length;
  
  // Choose compression level based on size
  let level: CompressionLevel;
  if (size < 5000) {
    level = 'light';
  } else if (size < 15000) {
    level = 'medium';
  } else {
    level = 'aggressive';
  }

  const { compressed, method } = await compressCodeBlock(content, filename, process.env.OLLAMA_BASE_URL || 'http://localhost:11434', level);

  return {
    compressed,
    level,
    stats: {
      originalSize: size,
      compressedSize: compressed.length,
      reduction: Math.round((1 - compressed.length / size) * 100),
      method,
      level,
    },
  };
}
