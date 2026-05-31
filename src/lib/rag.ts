import path from 'path';
import fs from 'fs';

let extractor: any = null;

/**
 * Returns the local HuggingFace/Xenova feature-extraction pipeline instance.
 * Lazily loaded to avoid overhead when RAG is not invoked.
 */
async function getExtractor() {
  if (!extractor) {
    const { pipeline } = await import('@xenova/transformers');
    // Loads all-MiniLM-L6-v2 model (384 dimensions)
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

/**
 * Generates a 384-dimensional vector embedding for the given text.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const pipelineInstance = await getExtractor();
  const output = await pipelineInstance(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

interface CodeChunk {
  [key: string]: any;
  vector: number[];
  text: string;
  filePath: string;
  startLine: number;
}

/**
 * Splits a file content into smaller overlapping chunks for granular semantic indexing.
 */
export function chunkFile(content: string, filePath: string): Array<{ text: string; filePath: string; startLine: number }> {
  const lines = content.split('\n');
  const chunkSize = 60;
  const overlap = 15;
  const chunks: Array<{ text: string; filePath: string; startLine: number }> = [];

  if (lines.length <= chunkSize) {
    chunks.push({
      text: `File: ${filePath}\n\nCode:\n${content}`,
      filePath,
      startLine: 1,
    });
    return chunks;
  }

  for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
    const chunkLines = lines.slice(i, i + chunkSize);
    if (chunkLines.length < 10 && chunks.length > 0) break; // skip trailing tiny chunks
    
    chunks.push({
      text: `File: ${filePath} (Lines ${i + 1} - ${i + chunkLines.length})\n\nCode:\n${chunkLines.join('\n')}`,
      filePath,
      startLine: i + 1,
    });
  }
  return chunks;
}

/**
 * Recursively scans a directory for files to index.
 */
function globFiles(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(globFiles(filePath, extensions));
    } else {
      const ext = path.extname(file);
      if (extensions.includes(ext)) {
        results.push(filePath);
      }
    }
  }
  return results;
}

/**
 * Scans the codebase workspace and indexes files into LanceDB and CodeGraph.
 * Parameterized to support a target workspace directory. Supports both (traceCallback) and (workspacePath, traceCallback).
 */
export async function indexRepository(
  workspacePathOrTraceCallback?: string | ((message: string) => Promise<void>),
  traceCallback?: (message: string) => Promise<void>
): Promise<number> {
  let workspacePath = process.cwd();
  let actualTraceCallback = traceCallback;

  if (typeof workspacePathOrTraceCallback === 'string') {
    workspacePath = workspacePathOrTraceCallback;
  } else if (typeof workspacePathOrTraceCallback === 'function') {
    actualTraceCallback = workspacePathOrTraceCallback;
  }

  const APOS_DIR = process.env.APOS_DIR || process.cwd();
  const DB_DIR = path.join(APOS_DIR, 'data/vectordb');
  const lancedb = await import('@lancedb/lancedb');
  
  if (actualTraceCallback) {
    await actualTraceCallback(`开始检索工作区文件并生成向量特征，目标工作区: ${workspacePath}...`);
  }
  
  // Find all ts, tsx, js, jsx files in source directories of the workspace
  const targetDirs = ['src/app', 'src/components', 'src/lib', 'src/agents'];
  let allFiles: string[] = [];
  for (const dir of targetDirs) {
    const fullDir = path.join(workspacePath, dir);
    if (fs.existsSync(fullDir)) {
      allFiles = allFiles.concat(globFiles(fullDir, ['.ts', '.tsx', '.js', '.jsx']));
    }
  }
  
  if (allFiles.length === 0) {
    if (actualTraceCallback) await actualTraceCallback('未找到任何匹配的代码文件进行索引。');
    return 0;
  }
  
  const chunksToInsert: CodeChunk[] = [];
  
  for (const filePath of allFiles) {
    const relativePath = path.relative(workspacePath, filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileChunks = chunkFile(content, relativePath);
      
      for (const chunk of fileChunks) {
        // Generate embedding for chunk
        const vector = await getEmbedding(chunk.text);
        chunksToInsert.push({
          vector,
          text: chunk.text,
          filePath: chunk.filePath,
          startLine: chunk.startLine,
        });
      }
    } catch (err: any) {
      console.warn(`Failed to index file ${relativePath}:`, err);
    }
  }
  
  if (chunksToInsert.length === 0) {
    if (actualTraceCallback) await actualTraceCallback('未能成功向量化任何代码片段。');
    return 0;
  }

  // Index vectors in LanceDB
  const db = await lancedb.connect(DB_DIR);
  await db.createTable('code_chunks', chunksToInsert, { mode: 'overwrite' });
  
  if (actualTraceCallback) {
    await actualTraceCallback(`成功向量化并索引了 ${chunksToInsert.length} 个代码片段（覆盖 ${allFiles.length} 个文件）。`);
  }
  
  // Index relational CodeGraph
  try {
    const { graphQueryManager } = await import('./codegraph/graph');
    await graphQueryManager.indexWorkspace(workspacePath, actualTraceCallback);
  } catch (err: any) {
    if (actualTraceCallback) await actualTraceCallback(`构建 CodeGraph 关系图谱失败: ${err.message}`);
  }

  return chunksToInsert.length;
}

/**
 * Searches the LanceDB database for matching code chunks using semantic vector search and enriches with CodeGraph relational context.
 */
export async function searchRepository(query: string, limit: number = 3): Promise<Array<{ text: string; filePath: string; startLine: number; score?: number }>> {
  const APOS_DIR = process.env.APOS_DIR || process.cwd();
  const DB_DIR = path.join(APOS_DIR, 'data/vectordb');
  
  if (!fs.existsSync(DB_DIR)) {
    return [];
  }
  
  try {
    const lancedb = await import('@lancedb/lancedb');
    const queryVector = await getEmbedding(query);
    const db = await lancedb.connect(DB_DIR);
    
    // Check if table exists
    const tableNames = await db.tableNames();
    if (!tableNames.includes('code_chunks')) {
      return [];
    }
    
    const table = await db.openTable('code_chunks');
    const results = await table.search(queryVector).limit(limit).toArray();
    
    const mappedResults = results.map((r: any) => ({
      text: r.text,
      filePath: r.filePath,
      startLine: r.startLine,
      score: r._distance,
    }));

    // Enrich with CodeGraph relationships (GraphRAG)
    try {
      const { graphQueryManager } = await import('./codegraph/graph');
      const uniqueFiles = Array.from(new Set(mappedResults.map(r => r.filePath)));
      
      let graphContext = 'CodeGraph Relation & Symbol Map:\n';
      let hasGraphContext = false;
      
      for (const file of uniqueFiles) {
        const symbols = await graphQueryManager.getFileSymbols(file);
        if (symbols && symbols.length > 0) {
          hasGraphContext = true;
          graphContext += `\n* Symbols defined in [${file}]:\n`;
          for (const sym of symbols) {
            graphContext += `  - ${sym.kind} ${sym.qualifiedName} (Lines ${sym.startLine}-${sym.endLine})\n`;
          }
        }
        
        const deps = await graphQueryManager.getDependencies(file);
        if (deps && deps.length > 0) {
          hasGraphContext = true;
          graphContext += `  - Imports/Dependencies: ${deps.map((d: any) => d.target).join(', ')}\n`;
        }
      }
      
      if (hasGraphContext) {
        mappedResults.push({
          text: graphContext,
          filePath: 'CodeGraph relation metadata',
          startLine: 1,
          score: 0,
        });
      }
    } catch (gErr) {
      console.warn('Failed to retrieve CodeGraph contextual enrichment:', gErr);
    }

    return mappedResults;
  } catch (err) {
    console.error('Failed to search lancedb vector index:', err);
    return [];
  }
}
