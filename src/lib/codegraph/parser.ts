/**
 * CodeGraph Parser
 * Fast, lightweight regex-based AST parser for TypeScript/JavaScript/TSX/JSX files.
 * Extracts symbols (nodes) and dependency relationships (edges) without native compilation issues.
 */

export interface ParsedNode {
  id: string; // filePath + '#' + name
  kind: 'class' | 'method' | 'function' | 'variable' | 'interface' | 'type' | 'route';
  name: string;
  qualifiedName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  docstring?: string;
  signature?: string;
  isExported: boolean;
}

export interface ParsedEdge {
  sourceName: string; // Name of the source symbol
  targetName: string; // Name of the target symbol or import path
  kind: 'calls' | 'imports' | 'extends' | 'implements' | 'contains';
  line?: number;
  col?: number;
}

export interface ParseResult {
  nodes: ParsedNode[];
  edges: ParsedEdge[];
}

/**
 * Parses a TS/JS file content to extract code nodes and edges.
 */
export function parseCodeFile(content: string, filePath: string): ParseResult {
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];
  const lines = content.split('\n');

  // Helper to extract docstrings before a given line
  const extractDocstring = (startLineIdx: number): string | undefined => {
    let i = startLineIdx - 1;
    while (i >= 0 && lines[i].trim() === '') {
      i--;
    }
    if (i < 0) return undefined;

    if (lines[i].trim().endsWith('*/')) {
      const docLines: string[] = [];
      docLines.unshift(lines[i].trim());
      i--;
      while (i >= 0) {
        const line = lines[i].trim();
        docLines.unshift(line);
        if (line.startsWith('/**')) {
          break;
        }
        i--;
      }
      return docLines.join('\n');
    }
    return undefined;
  };

  // 1. Process Imports to create "imports" edges
  // Matches: import { A, B } from './C' or import D from 'E' or import * as F from 'G'
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"](.*?)['"]/g;
  let importMatch;
  while ((importMatch = importRegex.exec(content)) !== null) {
    const importItems = importMatch[1].replace(/[\{\}]/g, '').split(',').map(s => s.trim());
    const importPath = importMatch[2];
    
    for (const item of importItems) {
      if (!item) continue;
      // Handle alias: "A as B"
      const parts = item.split(/\s+as\s+/);
      const importedName = parts[parts.length - 1].trim();
      
      edges.push({
        sourceName: filePath,
        targetName: importPath,
        kind: 'imports',
      });
    }
  }

  // 2. Identify Nodes (Classes, Functions, Routes)
  // Check if file is Next.js API route
  const isApiRoute = filePath.includes('src/app/api/') || filePath.includes('pages/api/');

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();

    // Check Class declaration
    // Matches: export class MyClass or class MyClass extends Base
    const classMatch = trimmed.match(/^(export\s+)?(default\s+)?class\s+([a-zA-Z0-9_$]+)(\s+extends\s+([a-zA-Z0-9_$]+))?/);
    if (classMatch) {
      const name = classMatch[3];
      const isExported = !!classMatch[1];
      const extendsClass = classMatch[5];
      const startLine = idx + 1;
      
      // Basic endLine search (look for closing brace matching class brace)
      const endLine = findMatchingBraceEnd(lines, idx);
      const docstring = extractDocstring(idx);

      const classNode: ParsedNode = {
        id: `${filePath}#${name}`,
        kind: 'class',
        name,
        qualifiedName: name,
        filePath,
        startLine,
        endLine,
        docstring,
        signature: classMatch[0],
        isExported,
      };
      nodes.push(classNode);

      if (extendsClass) {
        edges.push({
          sourceName: name,
          targetName: extendsClass,
          kind: 'extends',
          line: startLine,
        });
      }

      // Parse methods inside this class
      parseClassMethods(lines, idx, endLine, name, filePath, nodes, edges);
      continue;
    }

    // Check Function declaration
    // Matches: export function myFunction or function myFunction
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+([a-zA-Z0-9_$]+)/);
    if (funcMatch) {
      const name = funcMatch[3];
      const isExported = !!funcMatch[1];
      const startLine = idx + 1;
      const endLine = findMatchingBraceEnd(lines, idx);
      const docstring = extractDocstring(idx);

      // In Next.js API, HTTP method functions are API routes
      const kind = (isApiRoute && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(name)) ? 'route' : 'function';

      nodes.push({
        id: `${filePath}#${name}`,
        kind,
        name,
        qualifiedName: name,
        filePath,
        startLine,
        endLine,
        docstring,
        signature: funcMatch[0],
        isExported,
      });

      // Simple calls scanning inside function
      scanCallsInBlock(lines, idx, endLine, name, edges);
      continue;
    }

    // Check Arrow Function constant declaration
    // Matches: export const myFunc = async (...) =>
    const arrowFuncMatch = trimmed.match(/^(export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s*)?\(.*?\)\s*=>/);
    if (arrowFuncMatch) {
      const name = arrowFuncMatch[2];
      const isExported = !!arrowFuncMatch[1];
      const startLine = idx + 1;
      const endLine = findMatchingBraceEnd(lines, idx);
      const docstring = extractDocstring(idx);

      const kind = (isApiRoute && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(name)) ? 'route' : 'function';

      nodes.push({
        id: `${filePath}#${name}`,
        kind,
        name,
        qualifiedName: name,
        filePath,
        startLine,
        endLine,
        docstring,
        signature: arrowFuncMatch[0],
        isExported,
      });

      scanCallsInBlock(lines, idx, endLine, name, edges);
      continue;
    }
  }

  return { nodes, edges };
}

/**
 * Finds the end line index where a brace block closes.
 */
function findMatchingBraceEnd(lines: string[], startIdx: number): number {
  let openBraces = 0;
  let foundBrace = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
      if (char === '{') {
        openBraces++;
        foundBrace = true;
      } else if (char === '}') {
        openBraces--;
      }
    }
    if (foundBrace && openBraces <= 0) {
      return i + 1;
    }
  }
  return lines.length;
}

/**
 * Parses methods inside a class block.
 */
function parseClassMethods(
  lines: string[],
  startIdx: number,
  endIdx: number,
  className: string,
  filePath: string,
  nodes: ParsedNode[],
  edges: ParsedEdge[]
) {
  for (let i = startIdx + 1; i < endIdx - 1; i++) {
    const line = lines[i].trim();
    // Match method signatures: constructor(...) or public myMethod(...) or async myMethod(...)
    const methodMatch = line.match(/^(public\s+|private\s+|protected\s+|async\s+|static\s+)*([a-zA-Z0-9_$]+)\s*\(.*?\)\s*\{/);
    
    if (methodMatch) {
      const methodName = methodMatch[2];
      if (['if', 'for', 'while', 'switch', 'catch'].includes(methodName)) continue;
      
      const methodStart = i + 1;
      const methodEnd = findMatchingBraceEnd(lines, i);
      const qualifiedName = `${className}.${methodName}`;
      
      nodes.push({
        id: `${filePath}#${qualifiedName}`,
        kind: 'method',
        name: methodName,
        qualifiedName,
        filePath,
        startLine: methodStart,
        endLine: methodEnd,
        isExported: false,
      });

      // Method is contained inside class
      edges.push({
        sourceName: className,
        targetName: qualifiedName,
        kind: 'contains',
      });

      scanCallsInBlock(lines, i, methodEnd, qualifiedName, edges);
    }
  }
}

/**
 * Simple scanning for function calls inside a block.
 */
function scanCallsInBlock(lines: string[], startIdx: number, endIdx: number, callerName: string, edges: ParsedEdge[]) {
  const blockContent = lines.slice(startIdx, endIdx).join('\n');
  // Match method or function calls like: myFunction(...) or object.method(...)
  const callRegex = /\b([a-zA-Z0-9_$]+)\(/g;
  let callMatch;
  const seenCalls = new Set<string>();

  while ((callMatch = callRegex.exec(blockContent)) !== null) {
    const callee = callMatch[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'require', 'import', 'Promise', 'Map', 'Set', 'console'].includes(callee)) {
      continue;
    }
    
    if (!seenCalls.has(callee)) {
      seenCalls.add(callee);
      edges.push({
        sourceName: callerName,
        targetName: callee,
        kind: 'calls',
      });
    }
  }
}
