/**
 * Graph Query Manager
 * Indexes codebase files into SQLite using the Parser, and handles relational graph queries.
 */

import { db } from '../db';
import { codeNodes, codeEdges } from '../schema';
import { parseCodeFile } from './parser';
import { eq, and, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export class GraphQueryManager {
  /**
   * Cleans old nodes and edges of a file.
   */
  async cleanFile(filePath: string): Promise<void> {
    try {
      // 1. Delete all edges starting from this file or symbols inside this file
      const symbols = await db
        .select({ name: codeNodes.name })
        .from(codeNodes)
        .where(eq(codeNodes.filePath, filePath));

      const symbolNames = symbols.map(s => s.name);
      
      // Delete edges where source is the file or any of its symbols
      if (symbolNames.length > 0) {
        await db.run(sql`
          DELETE FROM code_edges 
          WHERE source = ${filePath} 
             OR source IN (${sql.join(symbolNames.map(name => sql`${name}`), sql`, `)})
             OR target IN (${sql.join(symbolNames.map(name => sql`${name}`), sql`, `)})
        `);
      } else {
        await db.run(sql`
          DELETE FROM code_edges 
          WHERE source = ${filePath}
        `);
      }

      // 2. Delete all nodes defined in this file
      await db.run(sql`
        DELETE FROM code_nodes 
        WHERE file_path = ${filePath}
      `);
    } catch (err) {
      console.error(`Failed to clean file ${filePath} in CodeGraph:`, err);
    }
  }

  /**
   * Indexes a single file in the database.
   */
  async indexFile(filePath: string, workspacePath: string = process.cwd()): Promise<void> {
    const relativePath = path.relative(workspacePath, filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { nodes, edges } = parseCodeFile(content, relativePath);

      // Clean old records
      await this.cleanFile(relativePath);

      // Insert new nodes
      const seenNodeIds = new Set<string>();
      for (const node of nodes) {
        if (seenNodeIds.has(node.id)) continue;
        seenNodeIds.add(node.id);

        await db.insert(codeNodes).values({
          id: node.id,
          kind: node.kind,
          name: node.name,
          qualifiedName: node.qualifiedName,
          filePath: node.filePath,
          startLine: node.startLine,
          endLine: node.endLine,
          docstring: node.docstring || null,
          signature: node.signature || null,
          isExported: node.isExported ? 1 : 0,
        });
      }

      // Insert new edges
      for (const edge of edges) {
        await db.insert(codeEdges).values({
          source: edge.sourceName,
          target: edge.targetName,
          kind: edge.kind,
          line: edge.line || null,
        });
      }
    } catch (err) {
      console.warn(`Failed to index file ${relativePath}:`, err);
    }
  }

  /**
   * Recursively scans directories to index files.
   */
  private scanDir(dir: string, extensions: string[], fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        if (file === 'node_modules' || file === '.next' || file === '.git') continue;
        this.scanDir(filePath, extensions, fileList);
      } else {
        if (extensions.includes(path.extname(file))) {
          fileList.push(filePath);
        }
      }
    }
    return fileList;
  }

  /**
   * Indexes the entire workspace repo.
   */
  async indexWorkspace(
    workspacePathOrTraceCallback?: string | ((msg: string) => Promise<void>),
    traceCallback?: (msg: string) => Promise<void>
  ): Promise<number> {
    let workspacePath = process.cwd();
    let actualTraceCallback = traceCallback;
    
    if (typeof workspacePathOrTraceCallback === 'string') {
      workspacePath = workspacePathOrTraceCallback;
    } else if (typeof workspacePathOrTraceCallback === 'function') {
      actualTraceCallback = workspacePathOrTraceCallback;
    }

    if (actualTraceCallback) {
      await actualTraceCallback(`开始构建 AST 代码关系图谱并写入数据库，目标工作区: ${workspacePath}...`);
    }
    
    const targetDirs = ['src/app', 'src/components', 'src/lib', 'src/agents'];
    let allFiles: string[] = [];
    
    for (const dir of targetDirs) {
      const fullDir = path.join(workspacePath, dir);
      if (fs.existsSync(fullDir)) {
        allFiles = allFiles.concat(this.scanDir(fullDir, ['.ts', '.tsx', '.js', '.jsx']));
      }
    }

    if (allFiles.length === 0) {
      if (traceCallback) await traceCallback('未找到任何代码文件进行 CodeGraph 索引。');
      return 0;
    }

    let indexedCount = 0;
    for (const filePath of allFiles) {
      await this.indexFile(filePath, workspacePath);
      indexedCount++;
    }

    if (actualTraceCallback) {
      await actualTraceCallback(`CodeGraph 构建完成！成功解析并存储了 ${indexedCount} 个文件的代码符号和依赖边。`);
    }

    return indexedCount;
  }

  /**
   * Gets all callers of a symbol.
   */
  async getCallers(symbolName: string): Promise<any[]> {
    const results = await db.all(sql`
      SELECT n.name, n.file_path, n.start_line, e.kind
      FROM code_edges e
      JOIN code_nodes n ON e.source = n.qualified_name OR e.source = n.name
      WHERE e.target = ${symbolName} AND e.kind = 'calls'
    `);
    return results;
  }

  /**
   * Gets dependencies (imports) of a file.
   */
  async getDependencies(filePath: string): Promise<any[]> {
    const results = await db.all(sql`
      SELECT target FROM code_edges
      WHERE source = ${filePath} AND kind = 'imports'
    `);
    return results;
  }

  /**
   * Gets symbols defined inside a file.
   */
  async getFileSymbols(filePath: string): Promise<any[]> {
    return await db
      .select()
      .from(codeNodes)
      .where(eq(codeNodes.filePath, filePath));
  }

  /**
   * Searches symbols by name or qualifiedName.
   */
  async searchSymbols(query: string): Promise<any[]> {
    return await db.all(sql`
      SELECT * FROM code_nodes
      WHERE name LIKE ${'%' + query + '%'} OR qualified_name LIKE ${'%' + query + '%'}
      LIMIT 10
    `);
  }
}

// Singleton instance
export const graphQueryManager = new GraphQueryManager();
