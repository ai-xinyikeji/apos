#!/usr/bin/env node
/**
 * APOS MCP Server
 * 
 * 将 APOS 的核心能力（RAG搜索、代码图谱、信号获取、项目上下文、模型路由）
 * 通过 Model Context Protocol 暴露给 Claude Code / Codex / Cursor 等 CLI 工具。
 * 
 * 默认端口: 3100（独立于 Next.js Web UI）
 * 
 * 使用方式:
 *   npx tsx src/mcp/server.ts        # 开发模式
 *   node dist/mcp/server.js          # 生产模式
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import fs from 'fs';

const APOS_DIR = process.env.APOS_DIR || process.cwd();

// ─── Tool Handlers (lazy-loaded to avoid heavy deps at startup) ───────────────

async function handleRagSearch(args: { query: string; limit?: number; workspacePath?: string }) {
  const { searchRepository } = await import('../lib/rag.js');
  const results = await searchRepository(args.query, args.limit ?? 5);
  
  if (results.length === 0) {
    return {
      content: [{
        type: 'text',
        text: '⚠️ 未找到相关代码。请先运行 index_workspace 工具索引代码库。',
      }],
    };
  }

  const formatted = results.map((r, i) => 
    `### 结果 ${i + 1} — ${r.filePath}${r.startLine ? `:${r.startLine}` : ''}\n\`\`\`\n${r.text.slice(0, 800)}\n\`\`\``
  ).join('\n\n');

  return {
    content: [{
      type: 'text',
      text: `## RAG 代码搜索结果 (query: "${args.query}")\n\n${formatted}`,
    }],
  };
}

async function handleGetCodeGraph(args: { symbol: string; type?: 'callers' | 'dependencies' | 'symbols' | 'all' }) {
  const { graphQueryManager } = await import('../lib/codegraph/graph.js');
  const type = args.type ?? 'all';
  let output = `## 代码图谱查询: \`${args.symbol}\`\n\n`;

  if (type === 'callers' || type === 'all') {
    const callers = await graphQueryManager.getCallers(args.symbol);
    if (callers.length > 0) {
      output += `### 调用者 (Callers)\n`;
      output += callers.map(c => `- \`${c.name}\` — ${c.file_path}:${c.start_line}`).join('\n');
      output += '\n\n';
    }
  }

  if (type === 'dependencies' || type === 'all') {
    const deps = await graphQueryManager.getDependencies(args.symbol);
    if (deps.length > 0) {
      output += `### 依赖 (Dependencies / Imports)\n`;
      output += deps.map((d: any) => `- \`${d.target}\``).join('\n');
      output += '\n\n';
    }
  }

  if (type === 'symbols' || type === 'all') {
    const symbols = await graphQueryManager.searchSymbols(args.symbol);
    if (symbols.length > 0) {
      output += `### 符号定义 (Symbol Definitions)\n`;
      output += symbols.map((s: any) => 
        `- **${s.kind}** \`${s.qualified_name}\` — ${s.file_path}:${s.start_line}-${s.end_line}`
      ).join('\n');
    }
  }

  if (output.trim() === `## 代码图谱查询: \`${args.symbol}\``) {
    output += '⚠️ 未找到相关符号。请先运行 index_workspace 索引代码库，或检查符号名称是否正确。';
  }

  return {
    content: [{ type: 'text', text: output }],
  };
}

async function handleGetSignals(args: { limit?: number; status?: string }) {
  // Use better-sqlite3 directly to avoid Next.js module resolution issues
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(APOS_DIR, 'data/apos.db');
  
  if (!fs.existsSync(dbPath)) {
    return {
      content: [{ type: 'text', text: '⚠️ 数据库未找到。请先启动 APOS Web UI 初始化数据库。' }],
    };
  }

  const sqliteDb = new Database(dbPath, { readonly: true });
  
  try {
    let query = 'SELECT * FROM signals ORDER BY created_at DESC LIMIT ?';
    const params: any[] = [args.limit ?? 10];
    
    if (args.status) {
      query = 'SELECT * FROM signals WHERE status = ? ORDER BY created_at DESC LIMIT ?';
      params.unshift(args.status);
    }
    
    const rows = sqliteDb.prepare(query).all(...params) as any[];
    
    if (rows.length === 0) {
      return {
        content: [{ type: 'text', text: '📭 暂无用户信号。请在 APOS Web UI 的洞察页面采集信号。' }],
      };
    }

    const statusMap: Record<string, string> = { pending: '待分析', analyzed: '已分析' };
    const sentimentMap: Record<string, string> = { positive: '正向 ✅', negative: '负向 ❌', neutral: '中性 ➖' };
    const sourceMap: Record<string, string> = { amplitude: 'Amplitude', zendesk: 'Zendesk', competitor: '竞品监测', github: 'GitHub', social: '社交媒体' };

    const formatted = rows.map((r, i) => [
      `### ${i + 1}. ${r.title}`,
      `**来源**: ${sourceMap[r.source] ?? r.source} | **状态**: ${statusMap[r.status] ?? r.status} | **情感**: ${sentimentMap[r.sentiment] ?? (r.sentiment ?? '未分析')}`,
      `**时间**: ${new Date(r.created_at).toLocaleString('zh-CN')}`,
      `> ${r.content}`,
    ].join('\n')).join('\n\n');

    return {
      content: [{ type: 'text', text: `## 用户需求信号 (${rows.length} 条)\n\n${formatted}` }],
    };
  } finally {
    sqliteDb.close();
  }
}

async function handleGetProjectContext(args: { type?: string }) {
  const contextType = args.type ?? 'all';
  let output = '## APOS 项目上下文\n\n';
  const targetPath = await getTargetPath();

  // Architecture: read key files
  if (contextType === 'architecture' || contextType === 'all') {
    const archFile = path.join(targetPath, 'ARCHITECTURE.md');
    if (fs.existsSync(archFile)) {
      const content = fs.readFileSync(archFile, 'utf8').slice(0, 2000);
      output += `### 系统架构\n${content}\n\n`;
    }
  }

  // Tech stack: read package.json
  if (contextType === 'stack' || contextType === 'all') {
    const pkgFile = path.join(targetPath, 'package.json');
    if (fs.existsSync(pkgFile)) {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      const deps = Object.keys(pkg.dependencies ?? {}).slice(0, 20).join(', ');
      output += `### 技术栈\n**框架**: Next.js ${pkg.dependencies?.next ?? 'unknown'}\n**核心依赖**: ${deps}\n\n`;
    }
  }

  // Recent signals summary
  if (contextType === 'signals' || contextType === 'all') {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = path.join(APOS_DIR, 'data/apos.db');
    if (fs.existsSync(dbPath)) {
      const sqliteDb = new Database(dbPath, { readonly: true });
      try {
        const rows = sqliteDb.prepare('SELECT title, source, sentiment FROM signals ORDER BY created_at DESC LIMIT 5').all() as any[];
        if (rows.length > 0) {
          output += `### 最近用户信号摘要\n`;
          output += rows.map(r => `- [${r.source}] ${r.title} (${r.sentiment ?? '未分析'})`).join('\n');
          output += '\n\n';
        }
      } finally {
        sqliteDb.close();
      }
    }
  }

  // Competitor context
  if (contextType === 'competitors' || contextType === 'all') {
    output += `### 主要竞品参考\n`;
    output += `- **Cursor**: AI 代码编辑器，强项是 Codebase 理解和 multi-file edits\n`;
    output += `- **v0 (Vercel)**: UI 组件生成，强项是 shadcn/Tailwind 快速原型\n`;
    output += `- **Bolt.new**: 全栈快速原型，强项是从 prompt 直接生成可运行项目\n`;
    output += `- **GitHub Copilot**: 行内补全，强项是编辑器集成深度\n\n`;
  }

  // CLAUDE.md content if exists
  const claudeMd = path.join(targetPath, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, 'utf8');
    if (content.length > 20) {
      output += `### CLAUDE.md 项目指南\n${content.slice(0, 1000)}\n\n`;
    }
  }

  return {
    content: [{ type: 'text', text: output }],
  };
}

async function handleRouteModel(args: { task_type: string }) {
  try {
    const { routeModel, getOllamaModels } = await import('../lib/llm.js');
    const { provider, model } = await routeModel(args.task_type as any);
    
    // If it's a web model
    if (model && typeof model === 'object' && model.isWebModel) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            recommended: 'web',
            provider: 'web',
            type: model.type,
            reason: `根据用户配置的路由规则，任务类型 "${args.task_type}" 使用 Web 网页端免 API 驱动 (${model.type})`,
          }, null, 2),
        }],
      };
    }

    // Standard client or Ollama client
    let modelName = 'default';
    let baseURL = undefined;
    let apiKey = undefined;

    // Check if provider is ollama
    if (provider === 'ollama') {
      baseURL = `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/v1`;
      apiKey = 'ollama';
      try {
        const models = await getOllamaModels();
        modelName = models[0] || 'qwen2.5-coder';
      } catch {}
    } else {
      // Find model name if possible
      modelName = typeof model === 'function' ? model.modelId ?? 'default' : (model?.modelId || 'default');
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          recommended: provider,
          model: modelName,
          baseURL,
          apiKey: apiKey ? '***' : undefined,
          reason: `根据您的配置中心路由设置，开发任务 "${args.task_type}" 路由推荐使用: ${provider} (${modelName})`,
        }, null, 2),
      }],
    };
  } catch (err: any) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          recommended: 'default',
          error: err.message,
          note: '大模型路由服务请求异常，已使用默认模型。',
        }, null, 2),
      }],
    };
  }
}

// ─── Task 18: Enhanced routing with cost recording ────────────────────────────

async function handleEnhancedRouteModel(args: { prompt: string; task_type?: string }) {
  try {
    const { EnhancedRoutingSystem } = await import('../lib/routing/enhanced-routing-system.js');
    const { CostRecorder } = await import('../lib/cost/cost-recorder.js');

    const routingSystem = new EnhancedRoutingSystem();
    const costRecorder  = new CostRecorder();

    const result = await routingSystem.route({
      prompt: args.prompt,
      taskType: args.task_type as any,
    });

    // Record estimated cost asynchronously
    costRecorder.record({
      provider: result.selection.provider,
      modelName: result.selection.modelName,
      taskType: result.taskType,
      inputTokens: result.analysis.contextSize,
      outputTokens: 0,
      routingDecisionId: result.decisionId,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          decisionId: result.decisionId,
          taskType: result.taskType,
          provider: result.selection.provider,
          model: result.selection.modelName,
          reason: result.selection.reason,
          estimatedCostCents: result.selection.estimatedCost,
          usesExtendedThinking: result.selection.usesExtendedThinking,
          usesPromptCaching: result.selection.usesPromptCaching,
          explanation: result.explanation.summary,
          budgetStatus: {
            withinBudget: result.budgetStatus.withinBudget,
            percentageUsed: Math.round(result.budgetStatus.percentageUsed),
          },
          routingTimeMs: result.routingTimeMs,
        }, null, 2),
      }],
    };
  } catch (err: any) {
    process.stderr.write(`[APOS MCP] enhanced_route_model error: ${err.message}\n`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: err.message,
          note: '增强路由失败，请使用 route_model 工具作为备选。',
        }, null, 2),
      }],
      isError: true,
    };
  }
}

async function getTargetPath(argsPath?: string): Promise<string> {
  if (argsPath) return path.resolve(argsPath);
  
  // Try to load target_project_path from settings
  try {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = path.join(APOS_DIR, 'data/apos.db');
    if (fs.existsSync(dbPath)) {
      const sqliteDb = new Database(dbPath, { readonly: true });
      const row = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'target_project_path'").get() as any;
      sqliteDb.close();
      if (row?.value && fs.existsSync(row.value)) {
        return row.value;
      }
    }
  } catch {}
  
  return process.cwd();
}

async function handleIndexWorkspace(args: { path?: string }) {
  const targetPath = await getTargetPath(args.path);
  const { indexRepository } = await import('../lib/rag.js');
  
  const messages: string[] = [];
  const count = await indexRepository(targetPath, async (msg) => {
    messages.push(msg);
    process.stderr.write(`[APOS Index] ${msg}\n`);
  });

  return {
    content: [{
      type: 'text',
      text: `## 工作区索引完成\n\n**路径**: ${targetPath}\n**已索引**: ${count} 个代码片段\n\n**日志**:\n${messages.map(m => `- ${m}`).join('\n')}`,
    }],
  };
}

async function handleGetActivePrototype(args: { limit?: number }) {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(APOS_DIR, 'data/apos.db');
  
  if (!fs.existsSync(dbPath)) {
    return {
      content: [{ type: 'text', text: '⚠️ 数据库未找到。请先启动 APOS Web UI 初始化数据库。' }],
    };
  }

  const sqliteDb = new Database(dbPath, { readonly: true });
  try {
    const limit = args.limit ?? 5;
    const rows = sqliteDb.prepare(
      "SELECT * FROM prototypes WHERE status IN ('draft', 'assessing', 'generating', 'generated') ORDER BY updated_at DESC LIMIT ?"
    ).all(limit) as any[];

    if (rows.length === 0) {
      return {
        content: [{ type: 'text', text: '📭 当前没有活跃的原型任务。' }],
      };
    }

    const formatted = rows.map((r, i) => [
      `### ${i + 1}. [ID: ${r.id}] ${r.name}`,
      `**状态**: ${r.status} | **开发分支**: \`${r.branch_name ?? '未创建'}\``,
      `**时间**: ${new Date(r.created_at).toLocaleString('zh-CN')}`,
      `> **设计需求**: ${r.description}`,
      r.feasibility_report ? `> **可行性评估报告**: ${r.feasibility_report.slice(0, 300)}...` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    return {
      content: [{ type: 'text', text: `## 活跃原型任务列表\n\n${formatted}` }],
    };
  } finally {
    sqliteDb.close();
  }
}

async function handleSyncPrototypeProgress(args: { 
  prototype_id: number; 
  status: string; 
  branch_name?: string; 
  commit_hash?: string; 
  pr_url?: string; 
  pr_number?: number 
}) {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(APOS_DIR, 'data/apos.db');
  
  if (!fs.existsSync(dbPath)) {
    return {
      content: [{ type: 'text', text: '⚠️ 数据库未找到。' }],
      isError: true,
    };
  }

  const sqliteDb = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    
    // Check if prototype exists
    const row = sqliteDb.prepare('SELECT id FROM prototypes WHERE id = ?').get(args.prototype_id);
    if (!row) {
      return {
        content: [{ type: 'text', text: `❌ 未找到 ID 为 ${args.prototype_id} 的原型任务。` }],
        isError: true,
      };
    }

    // Build update dynamic query
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [args.status, now];

    if (args.branch_name !== undefined) {
      updates.push('branch_name = ?');
      params.push(args.branch_name);
    }
    if (args.commit_hash !== undefined) {
      updates.push('commit_hash = ?');
      params.push(args.commit_hash);
    }
    if (args.pr_url !== undefined) {
      updates.push('pr_url = ?');
      params.push(args.pr_url);
    }
    if (args.pr_number !== undefined) {
      updates.push('pr_number = ?');
      params.push(args.pr_number);
    }

    params.push(args.prototype_id);
    
    const query = `UPDATE prototypes SET ${updates.join(', ')} WHERE id = ?`;
    sqliteDb.prepare(query).run(...params);

    // If status is 'pr_created' or 'merged', we also log a trace
    sqliteDb.prepare(
      'INSERT INTO agent_traces (agent_name, run_id, step, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      'ReviewBot',
      `cli_${Date.now()}`,
      'cli_sync',
      'success',
      `终端开发进度同步: 原型 ID ${args.prototype_id} 状态更新为 ${args.status}`,
      now
    );

    // Trigger CLAUDE.md hot-reload in background
    try {
      const { updateClaudeMdIfConfigured } = await import('./claude-md-generator.js');
      updateClaudeMdIfConfigured().catch(err => {
        process.stderr.write(`[APOS MCP] Failed to update CLAUDE.md on sync: ${err.message}\n`);
      });
    } catch (_) {}

    return {
      content: [{ type: 'text', text: `✅ 原型 ID ${args.prototype_id} 进度同步成功，状态已更新为: ${args.status}` }],
    };
  } finally {
    sqliteDb.close();
  }
}

async function handleReportCliSignal(args: { title: string; content: string; sentiment?: string }) {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(APOS_DIR, 'data/apos.db');
  
  if (!fs.existsSync(dbPath)) {
    return {
      content: [{ type: 'text', text: '⚠️ 数据库未找到。' }],
      isError: true,
    };
  }

  const sqliteDb = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    sqliteDb.prepare(
      'INSERT INTO signals (source, title, content, status, sentiment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'cli',
      args.title,
      args.content,
      'pending',
      args.sentiment ?? 'negative',
      now,
      now
    );

    // Trigger CLAUDE.md hot-reload in background
    try {
      const { updateClaudeMdIfConfigured } = await import('./claude-md-generator.js');
      updateClaudeMdIfConfigured().catch(err => {
        process.stderr.write(`[APOS MCP] Failed to update CLAUDE.md on signal: ${err.message}\n`);
      });
    } catch (_) {}

    return {
      content: [{ type: 'text', text: `✅ 终端异常/质量信号已成功收集至 APOS 数据库，标题: "${args.title}"` }],
    };
  } finally {
    sqliteDb.close();
  }
}

async function handleCompressContext(args: { 
  files?: Array<{ path: string; content: string }>; 
  content?: string;
  level?: 'light' | 'medium' | 'aggressive';
}) {
  try {
    const { compressFiles, compressFile, smartCompress } = await import('../lib/compression.js');
    
    const level = args.level || 'medium';

    // Compress multiple files
    if (args.files && args.files.length > 0) {
      const result = await compressFiles(args.files, level);
      
      const output = [
        `## 上下文压缩完成 (${level} 级别)`,
        '',
        `**总体统计**:`,
        `- 原始大小: ${result.totalStats.originalSize.toLocaleString()} 字符`,
        `- 压缩后: ${result.totalStats.compressedSize.toLocaleString()} 字符`,
        `- 节省: ${result.totalStats.reduction}% (${(result.totalStats.originalSize - result.totalStats.compressedSize).toLocaleString()} 字符)`,
        '',
        `**文件列表**:`,
        ...result.files.map(f => `- \`${f.path}\` (方法: ${f.method})`),
        '',
        '**压缩后的内容**:',
        '',
        ...result.files.map(f => `### ${f.path}\n\`\`\`\n${f.compressed}\n\`\`\`\n`),
      ].join('\n');

      return {
        content: [{ type: 'text', text: output }],
      };
    }

    // Compress single content
    if (args.content) {
      const result = await smartCompress(args.content);
      
      const output = [
        `## 智能上下文压缩完成`,
        '',
        `**统计**:`,
        `- 原始大小: ${result.stats.originalSize.toLocaleString()} 字符`,
        `- 压缩后: ${result.stats.compressedSize.toLocaleString()} 字符`,
        `- 节省: ${result.stats.reduction}%`,
        `- 压缩级别: ${result.level}`,
        `- 压缩方法: ${result.stats.method}`,
        '',
        '**压缩后的内容**:',
        '',
        '```',
        result.compressed,
        '```',
      ].join('\n');

      return {
        content: [{ type: 'text', text: output }],
      };
    }

    return {
      content: [{ type: 'text', text: '❌ 请提供 files 或 content 参数' }],
      isError: true,
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `❌ 压缩失败: ${err.message}` }],
      isError: true,
    };
  }
}

async function handleAnalyzeTokenUsage(args: { days?: number }) {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(APOS_DIR, 'data/apos.db');
  
  if (!fs.existsSync(dbPath)) {
    return {
      content: [{ type: 'text', text: '⚠️ 数据库未找到。' }],
    };
  }

  const sqliteDb = new Database(dbPath, { readonly: true });
  try {
    const days = args.days || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get agent traces with token usage
    const traces = sqliteDb.prepare(
      `SELECT agent_name, details, created_at 
       FROM agent_traces 
       WHERE created_at >= ? AND details IS NOT NULL
       ORDER BY created_at DESC`
    ).all(since) as any[];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const byAgent: Record<string, { prompt: number; completion: number; runs: number }> = {};

    traces.forEach(trace => {
      try {
        const details = JSON.parse(trace.details);
        if (details.usage) {
          const prompt = details.usage.promptTokens || 0;
          const completion = details.usage.completionTokens || 0;
          
          totalPromptTokens += prompt;
          totalCompletionTokens += completion;

          if (!byAgent[trace.agent_name]) {
            byAgent[trace.agent_name] = { prompt: 0, completion: 0, runs: 0 };
          }
          byAgent[trace.agent_name].prompt += prompt;
          byAgent[trace.agent_name].completion += completion;
          byAgent[trace.agent_name].runs += 1;
        }
      } catch {}
    });

    const totalTokens = totalPromptTokens + totalCompletionTokens;

    // Estimate cost (Claude 3.5 Sonnet pricing)
    const estimatedCost = (totalPromptTokens / 1000000 * 3) + (totalCompletionTokens / 1000000 * 15);

    const output = [
      `## Token 使用分析 (最近 ${days} 天)`,
      '',
      `**总体统计**:`,
      `- Prompt Tokens: ${totalPromptTokens.toLocaleString()}`,
      `- Completion Tokens: ${totalCompletionTokens.toLocaleString()}`,
      `- 总计: ${totalTokens.toLocaleString()}`,
      `- 预估成本 (Claude 3.5 Sonnet): $${estimatedCost.toFixed(2)}`,
      '',
      `**按 Agent 分类**:`,
      ...Object.entries(byAgent).map(([name, stats]) => 
        `- **${name}**: ${(stats.prompt + stats.completion).toLocaleString()} tokens (${stats.runs} 次运行)`
      ),
      '',
      `💡 **优化建议**: 使用 compress_context 工具可节省约 70% 的 token 消耗`,
    ].join('\n');

    return {
      content: [{ type: 'text', text: output }],
    };
  } finally {
    sqliteDb.close();
  }
}

async function handleCreatePrototype(args: { 
  name: string; 
  description: string; 
  assessOnly?: boolean;
  autoGenerate?: boolean;
}) {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(APOS_DIR, 'data/apos.db');
  
  if (!fs.existsSync(dbPath)) {
    return {
      content: [{ type: 'text', text: '⚠️ 数据库未找到。请先启动 APOS Web UI 初始化数据库。' }],
      isError: true,
    };
  }

  const sqliteDb = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    const branchName = `feature/${args.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    // Insert prototype
    const result = sqliteDb.prepare(
      `INSERT INTO prototypes (name, description, branch_name, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      args.name,
      args.description,
      branchName,
      'draft',
      now,
      now
    );

    const prototypeId = result.lastInsertRowid as number;

    // If autoGenerate is true, trigger ProtoBuilder Agent
    if (args.autoGenerate) {
      try {
        const { ProtoBuilderAgent } = await import('../agents/proto-builder.js');
        const agent = new ProtoBuilderAgent();
        const runId = `mcp_${Date.now()}`;
        
        // Run agent in background (don't await)
        agent.execute({
          prototypeId,
          name: args.name,
          description: args.description,
          branchName,
          assessOnly: args.assessOnly || false,
        }, runId).catch(err => {
          process.stderr.write(`[APOS MCP] ProtoBuilder failed: ${err.message}\n`);
        });

        return {
          content: [{
            type: 'text',
            text: `✅ 原型项目已创建！\n\n**ID**: ${prototypeId}\n**名称**: ${args.name}\n**分支**: ${branchName}\n**状态**: 正在生成代码...\n\n可以通过 get_active_prototype 查看进度。`,
          }],
        };
      } catch (err: any) {
        return {
          content: [{
            type: 'text',
            text: `✅ 原型项目已创建（ID: ${prototypeId}），但自动生成失败: ${err.message}\n\n请在 APOS Web UI 中手动触发生成。`,
          }],
        };
      }
    }

    return {
      content: [{
        type: 'text',
        text: `✅ 原型项目已创建！\n\n**ID**: ${prototypeId}\n**名称**: ${args.name}\n**分支**: ${branchName}\n**状态**: draft\n\n可以在 APOS Web UI 中查看和生成代码，或使用 sync_prototype_progress 更新状态。`,
      }],
    };
  } finally {
    sqliteDb.close();
  }
}

async function handleDelegateToArchitect(args: { requirements: string; context?: string; constraints?: string[] }) {
  const { ArchitectAgent } = await import('../agents/architect-agent.js');
  const agent = new ArchitectAgent();
  const runId = `mcp_arch_${Date.now()}`;
  const result = await agent.execute({
    requirements: args.requirements,
    context: args.context,
    constraints: args.constraints,
  }, runId);

  return {
    content: [{
      type: 'text',
      text: result.success 
        ? `## 架构设计评估完成\n\n**置信度**: ${result.confidence}%\n\n### 架构设计方案:\n${result.architecture}\n\n${result.risks && result.risks.length > 0 ? `### 潜在风险:\n${result.risks.join('\n')}\n\n` : ''}${result.alternatives && result.alternatives.length > 0 ? `### 替代方案:\n${result.alternatives.join('\n')}\n` : ''}`
        : `❌ 架构设计失败: ${result.error}`,
    }],
    isError: !result.success,
  };
}

async function handleDelegateToReviewBot(args: { prototypeId: number; branchName: string; prNumber?: number }) {
  const { ReviewBotAgent } = await import('../agents/review-bot.js');
  const agent = new ReviewBotAgent();
  const runId = `mcp_rev_${Date.now()}`;
  const result = await agent.execute({
    prototypeId: args.prototypeId,
    branchName: args.branchName,
    prNumber: args.prNumber,
  }, runId);

  return {
    content: [{
      type: 'text',
      text: result.success 
        ? `## 代码评审报告\n\n${result.report}`
        : `❌ 代码评审失败: ${result.error}`,
    }],
    isError: !result.success,
  };
}

async function handleDelegateToOpenHands(args: { task: string; workspacePath?: string }) {
  const { OpenHandsAgent } = await import('../agents/openhands-agent.js');
  const agent = new OpenHandsAgent();
  const runId = `mcp_oh_${Date.now()}`;
  const targetPath = args.workspacePath || await getTargetPath();
  const result = await agent.execute({
    task: args.task,
    workspacePath: targetPath,
  }, runId);

  return {
    content: [{
      type: 'text',
      text: result.success
        ? `## OpenHands 任务执行结果\n\n${result.logs}\n\n**修改的文件**: ${result.filesModified.length > 0 ? result.filesModified.join(', ') : '无'}`
        : `❌ OpenHands 任务执行失败: ${result.error}\n\n**执行日志**:\n${result.logs}`,
    }],
    isError: !result.success,
  };
}

async function handleDelegateToDesignParser(args: { imageBase64: string; imageMimeType?: string; extractionMode?: 'full' | 'layout' | 'colors' | 'typography' }) {
  const { DesignParserAgent } = await import('../agents/design-parser-agent.js');
  const agent = new DesignParserAgent();
  const runId = `mcp_dp_${Date.now()}`;
  const result = await agent.execute({
    imageBase64: args.imageBase64,
    imageMimeType: args.imageMimeType,
    extractionMode: args.extractionMode,
  }, runId);

  return {
    content: [{
      type: 'text',
      text: `## 设计稿解析结果 (置信度: ${result.confidence}%)\n\n` +
            `### 🎨 颜色方案 (Colors)\n` +
            `- **主色**: \`${result.colors.primary}\`\n` +
            `- **辅色**: \`${result.colors.secondary}\`\n` +
            `- **背景**: \`${result.colors.background}\`\n` +
            `- **文字**: \`${result.colors.text}\`\n` +
            `- **调色板**: ${result.colors.palette.map(c => `\`${c}\``).join(', ')}\n\n` +
            `### 📐 布局结构 (Layout)\n` +
            `- **类型**: \`${result.layout.type}\`\n` +
            `- **方向**: \`${result.layout.direction || 'N/A'}\`\n` +
            `- **间距**: \`${result.layout.gap || 'N/A'}\`\n` +
            `- **内边距**: \`${result.layout.padding || 'N/A'}\`\n\n` +
            `### 🔠 字体规范 (Typography)\n` +
            `- **字体家族**: \`${result.typography.fontFamily}\`\n` +
            `- **H1**: size=\`${result.typography.headings.h1.size}\` weight=\`${result.typography.headings.h1.weight}\`\n` +
            `- **H2**: size=\`${result.typography.headings.h2.size}\` weight=\`${result.typography.headings.h2.weight}\`\n` +
            `- **H3**: size=\`${result.typography.headings.h3.size}\` weight=\`${result.typography.headings.h3.weight}\`\n` +
            `- **正文**: size=\`${result.typography.body.size}\` weight=\`${result.typography.body.weight}\`\n\n` +
            `### 🧩 识别组件 (${result.components.length} 个)\n` +
            (result.components.length > 0 ? result.components.map(c => `- **${c.type}** (\`${c.name}\`): props=${JSON.stringify(c.props)}`).join('\n') : '无') + '\n\n' +
            `### 🖱️ 交互规范 (${result.interactions.length} 个)\n` +
            (result.interactions.length > 0 ? result.interactions.map(i => `- **${i.element}** on \`${i.trigger}\`: ${i.action} (${i.description})`).join('\n') : '无') +
            (result.code ? `\n\n### 💻 建议生成代码:\n\`\`\`tsx\n${result.code}\n\`\`\`` : ''),
    }],
  };
}

async function handleDelegateToUITest(args: { url: string; testCases: string[]; viewport?: { width: number; height: number }; screenshots?: boolean }) {
  const { UITestAgent } = await import('../agents/ui-test-agent.js');
  const agent = new UITestAgent();
  const runId = `mcp_uit_${Date.now()}`;
  const result = await agent.execute({
    url: args.url,
    testCases: args.testCases,
    viewport: args.viewport,
    screenshots: args.screenshots,
  }, runId);

  const formattedResults = result.testResults.map((r, idx) => 
    `- **用例 ${idx + 1}**: ${r.testCase} -> **${r.status.toUpperCase()}**\n  * 消息: ${r.message}${r.error ? `\n  * 错误: ${r.error}` : ''}`
  ).join('\n');

  return {
    content: [{
      type: 'text',
      text: `## UI 自动化测试完成\n\n` +
            `**测试 URL**: ${args.url}\n` +
            `**测试时长**: ${result.duration}ms\n` +
            `**最终结果**: ${result.success ? '✅ 全部通过' : '❌ 存在失败用例'}\n\n` +
            `### 📊 详细测试结果:\n${formattedResults}\n\n` +
            `### 📝 报告:\n${result.report}`,
    }],
    isError: !result.success,
  };
}

async function handleDelegateToVisualDiff(args: { designImage: string; implementationImage: string; imageMimeType?: string; checkAspects?: ('layout' | 'colors' | 'typography' | 'spacing' | 'components')[] }) {
  const { VisualDiffAgent } = await import('../agents/visual-diff-agent.js');
  const agent = new VisualDiffAgent();
  const runId = `mcp_vd_${Date.now()}`;
  const result = await agent.execute({
    designImage: args.designImage,
    implementationImage: args.implementationImage,
    imageMimeType: args.imageMimeType,
    checkAspects: args.checkAspects,
  }, runId);

  const formattedDiffs = result.differences.map((d, idx) => 
    `#### ${idx + 1}. [${d.category.toUpperCase()}] [严重度: ${d.severity}]\n` +
    `- **描述**: ${d.description}\n` +
    (d.location ? `- **位置**: ${d.location}\n` : '') +
    (d.expected ? `- **期望（设计稿）**: \`${d.expected}\`\n` : '') +
    (d.actual ? `- **实际（实现）**: \`${d.actual}\`\n` : '') +
    (d.suggestion ? `- **修复建议**: ${d.suggestion}\n` : '')
  ).join('\n');

  return {
    content: [{
      type: 'text',
      text: `## 视觉设计还原度比对\n\n` +
            `**相似度评分**: **${result.overallScore} / 100**\n\n` +
            `### 🔍 差异分析 (${result.differences.length} 处):\n${formattedDiffs}\n\n` +
            `### 💡 核心修复建议:\n${result.recommendations.map(r => `- ${r}`).join('\n')}\n\n` +
            `### 📝 比对详细报告:\n${result.report}`,
    }],
  };
}

async function handleHealCompilationErrors(args: { buildOutput?: string; files?: string[] }) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);

  // 1. If buildOutput is not provided, run npm run build to collect errors
  let errors = args.buildOutput || '';
  const targetPath = await getTargetPath();
  if (!errors) {
    try {
      await execPromise('npm run build', { cwd: targetPath });
      return {
        content: [{ type: 'text', text: '✅ 项目编译检查通过，未检测到任何编译或类型错误，无需修复。' }]
      };
    } catch (err: any) {
      errors = (err.stdout || '') + '\n' + (err.stderr || '');
    }
  }

  // 2. Identify files to fix
  let targetFiles: string[] = args.files || [];
  if (targetFiles.length === 0) {
    // Fallback: get modified files from git status
    try {
      const { stdout } = await execPromise('git status --porcelain', { cwd: targetPath });
      targetFiles = stdout
        .split('\n')
        .map(line => line.slice(3).trim())
        .filter(p => p && (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js') || p.endsWith('.jsx')));
    } catch {}
  }

  if (targetFiles.length === 0) {
    return {
      content: [{ type: 'text', text: '⚠️ 检测到编译错误，但无法确定需要修复的文件。请显式提供 files 参数。\n\n错误日志：\n' + errors }]
    };
  }

  // 3. Call LLM to repair
  const { routeModel, generateText } = await import('../lib/llm.js');
  const llm = await routeModel('coding');
  
  // Read current file contents
  const fileContents = targetFiles.map(file => {
    const fullPath = path.join(targetPath, file);
    if (fs.existsSync(fullPath)) {
      return {
        path: file,
        content: fs.readFileSync(fullPath, 'utf8')
      };
    }
    return null;
  }).filter(Boolean) as Array<{ path: string; content: string }>;

  if (fileContents.length === 0) {
    return {
      content: [{ type: 'text', text: '❌ 未能读取到任何需要修复的目标文件。' }]
    };
  }

  const prompt = `
You are a senior full-stack React and TypeScript expert.
The local project build failed with compilation or TypeScript errors.
Here is the compiler output from "npm run build":
\`\`\`
${errors}
\`\`\`

Here are the contents of the files causing the errors:
${fileContents.map(f => `\n--- File: ${f.path} ---\n${f.content}`).join('\n')}

Please correct the code in these files to fix the errors (such as missing imports, incorrect types, incorrect props, or syntax errors). Keep everything else intact and do not use placeholders.

Return your fixed code for these files as a JSON array of objects structured exactly like:
\`\`\`json
[
  {
    "path": "src/app/my-feature/page.tsx",
    "content": "... corrected complete React component code ..."
  }
]
\`\`\`
`;

  try {
    const result = await generateText({
      model: llm.model,
      prompt,
    });

    const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/) || [null, result.text];
    const jsonStr = jsonMatch[1]?.trim() || result.text.trim();
    
    const healedFiles: Array<{ path: string; content: string }> = JSON.parse(jsonStr);
    const fixedPaths: string[] = [];

    for (const file of healedFiles) {
      const fullPath = path.join(targetPath, file.path);
      
      // Safety check
      if (!fullPath.startsWith(targetPath)) continue;

      fs.writeFileSync(fullPath, file.content, 'utf8');
      fixedPaths.push(file.path);
    }

    return {
      content: [{
        type: 'text',
        text: `✅ 编译自愈修复完成！\n\n**已修复写入的文件**: ${fixedPaths.join(', ')}\n\n请重新运行构建或测试以确认所有错误都已清除。`
      }]
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `❌ 自动修复失败: ${err.message}` }],
      isError: true
    };
  }
}

async function logMcpToolCall(toolName: string, success: boolean, error?: string) {
  try {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = path.join(APOS_DIR, 'data/apos.db');
    if (fs.existsSync(dbPath)) {
      const sqliteDb = new Database(dbPath);
      sqliteDb.prepare(
        'INSERT INTO metrics (event, properties, timestamp) VALUES (?, ?, ?)'
      ).run(
        'mcp_tool_call',
        JSON.stringify({ tool: toolName, success, error: error || null }),
        new Date().toISOString()
      );
      sqliteDb.close();
    }
  } catch (_) {
    // Silently ignore logging issues
  }
}

// ─── MCP Server Definition ────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'rag_search',
    description: '语义搜索本地代码库，找到与查询最相关的代码片段。支持自然语言查询，如"用户认证逻辑"、"数据库连接配置"等。结果包含 RAG 向量搜索 + CodeGraph 关系上下文。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询（支持自然语言）' },
        limit: { type: 'number', description: '返回结果数量（默认5）', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_code_graph',
    description: '查询代码符号的关系图谱：谁调用了它（Callers）、它依赖什么（Dependencies）、符号在哪定义（Symbols）。用于理解代码影响范围和依赖链。',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '要查询的符号名称或文件路径' },
        type: {
          type: 'string',
          enum: ['callers', 'dependencies', 'symbols', 'all'],
          description: '查询类型（默认 all）',
          default: 'all',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_signals',
    description: '获取 APOS 收集的用户需求信号，包括用户反馈、功能请求、BUG报告等。可用于了解当前最迫切的用户需求，辅助决定下一步开发方向。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量（默认10）', default: 10 },
        status: {
          type: 'string',
          enum: ['pending', 'analyzed'],
          description: '筛选状态（不填则返回所有）',
        },
      },
    },
  },
  {
    name: 'get_project_context',
    description: '获取项目的综合上下文信息，包括系统架构、技术栈、近期用户信号摘要、竞品分析。在开始新功能开发前调用，获取项目全貌。',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['architecture', 'stack', 'signals', 'competitors', 'all'],
          description: '上下文类型（默认 all）',
          default: 'all',
        },
      },
    },
  },
  {
    name: 'route_model',
    description: '根据任务类型推荐最优的 LLM 模型配置。优先推荐本地 Ollama（零成本），其次推荐云端模型。返回完整的模型配置参数。',
    inputSchema: {
      type: 'object',
      properties: {
        task_type: {
          type: 'string',
          enum: ['coding', 'review', 'summarize', 'reasoning', 'refactor', 'explain', 'planning'],
          description: '任务类型',
        },
      },
      required: ['task_type'],
    },
  },
  {
    name: 'index_workspace',
    description: '索引指定目录的代码到向量数据库（LanceDB）和代码图谱（SQLite）。首次使用前或代码有大量变更后运行。通常需要1-3分钟。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要索引的目录路径（默认当前工作目录）' },
      },
    },
  },
  {
    name: 'get_active_prototype',
    description: '获取当前活跃的原型开发任务列表，包含任务ID、原型名称、需求设计描述和当前开发分支名称。在终端开发开始前调用，了解需要实现的功能。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量限制，默认 5' }
      }
    }
  },
  {
    name: 'sync_prototype_progress',
    description: '将本地终端中的开发进度同步回 APOS 数据库，更新原型任务状态。例如开发开始时设为 generating，测试成功后设为 generated，推送到 PR 时设为 pr_created。',
    inputSchema: {
      type: 'object',
      properties: {
        prototype_id: { type: 'number', description: '原型任务的 ID' },
        status: { 
          type: 'string', 
          enum: ['assessing', 'generating', 'generated', 'failed', 'pr_created', 'merged'],
          description: '要更新的新状态'
        },
        branch_name: { type: 'string', description: '（可选）当前的 Git 开发分支名' },
        commit_hash: { type: 'string', description: '（可选）最新的 Git 提交哈希值' },
        pr_url: { type: 'string', description: '（可选）创建的 GitHub PR URL' },
        pr_number: { type: 'number', description: '（可选）PR 号' }
      },
      required: ['prototype_id', 'status']
    }
  },
  {
    name: 'report_cli_signal',
    description: '将本地终端在开发、测试或编译过程中遇到的异常、失败或质量问题作为信号上报给 APOS 数据库，辅助产品缺陷监控。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '信号简短标题，描述报错类型，例如 "编译错误: TypeScript 类型不兼容"' },
        content: { type: 'string', description: '信号详细描述，例如具体的错误日志堆栈' },
        sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'], description: '情感极性，默认 negative' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'compress_context',
    description: '智能压缩代码上下文，节省 70% token 消耗。支持 AST 结构化压缩（TypeScript/JavaScript）和 LLM 智能压缩。可压缩单个内容或多个文件。',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件路径' },
              content: { type: 'string', description: '文件内容' }
            },
            required: ['path', 'content']
          },
          description: '要压缩的文件列表（多文件模式）'
        },
        content: { type: 'string', description: '要压缩的单个内容（单内容模式）' },
        level: {
          type: 'string',
          enum: ['light', 'medium', 'aggressive'],
          description: '压缩级别：light (轻度), medium (中度, 默认), aggressive (激进)'
        }
      }
    }
  },
  {
    name: 'analyze_token_usage',
    description: '分析最近的 token 使用情况，提供成本估算和优化建议。帮助了解哪些 Agent 消耗最多 token，以及如何通过压缩节省成本。',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '分析最近多少天的数据，默认 7 天' }
      }
    }
  },
  {
    name: 'create_prototype',
    description: '创建新的原型项目。在 APOS 数据库中创建原型记录，并可选择立即触发 ProtoBuilder Agent 生成代码。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '原型名称' },
        description: { type: 'string', description: '功能描述' },
        assessOnly: { type: 'boolean', description: '是否仅进行可行性评估（默认 false）', default: false },
        autoGenerate: { type: 'boolean', description: '是否立即生成代码（默认 false）', default: false }
      },
      required: ['name', 'description']
    }
  },
  {
    name: 'delegate_to_architect',
    description: '使用 APOS 系统架构师 Agent (包含 Extended Thinking 深度思考模式) 进行复杂模块设计与技术方案评估。',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: { type: 'string', description: '系统需求或功能描述' },
        context: { type: 'string', description: '项目特定上下文、技术栈或相关 file 路径' },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: '架构约束条件，如: ["使用 Next.js App Router", "保证每秒请求数限制"]'
        }
      },
      required: ['requirements']
    }
  },
  {
    name: 'delegate_to_review_bot',
    description: '调用 APOS ReviewBot 进行自动化代码评审。分析安全风险（如密钥泄漏、前端直写 DB）、代码质量及 CodeGraph 依赖变更影响。',
    inputSchema: {
      type: 'object',
      properties: {
        prototypeId: { type: 'number', description: '任务或原型 ID' },
        branchName: { type: 'string', description: '当前要进行代码评审的 Git 分支名称' },
        prNumber: { type: 'number', description: '关联的 GitHub PR 号，传入后将自动发布评审评论' }
      },
      required: ['prototypeId', 'branchName']
    }
  },
  {
    name: 'delegate_to_openhands',
    description: '调用 APOS OpenHands Agent 在隔离的 Docker 沙箱（在线）或本地 Shell（兜底）中自动执行重构、安装等开发流程。',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '具体要执行的开发/重构/编译指令或目标任务描述' },
        workspacePath: { type: 'string', description: '项目工作区绝对路径（默认当前工作区）' }
      },
      required: ['task']
    }
  },
  {
    name: 'delegate_to_design_parser',
    description: '调用 APOS 设计稿解析 Agent 通过多模态识别 UI 设计稿图片，提取布局结构、颜色规范、字体、交互组件与生成原型代码。',
    inputSchema: {
      type: 'object',
      properties: {
        imageBase64: { type: 'string', description: 'Base64 编码的 UI 设计稿图片内容（不含 MIME 前缀，例如 data:image/png;base64,）' },
        imageMimeType: { type: 'string', description: '图片 MIME 类型，默认 image/png' },
        extractionMode: {
          type: 'string',
          enum: ['full', 'layout', 'colors', 'typography'],
          description: '分析提取模式（默认 full）'
        }
      },
      required: ['imageBase64']
    }
  },
  {
    name: 'delegate_to_ui_test',
    description: '调用 APOS 自动化测试 Agent 使用 Claude Computer Use 或 Headless 浏览器模拟执行 UI 点击/输入测试场景并生成测试报告。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要测试的目标网页 URL (如 http://localhost:3000/costs)' },
        testCases: {
          type: 'array',
          items: { type: 'string' },
          description: '要执行的模拟交互和断言测试用例描述列表'
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', description: '浏览器视口宽度，默认 1920' },
            height: { type: 'number', description: '浏览器视口高度，默认 1080' }
          }
        },
        screenshots: { type: 'boolean', description: '是否生成过程截图（默认 false）' }
      },
      required: ['url', 'testCases']
    }
  },
  {
    name: 'delegate_to_visual_diff',
    description: '调用 APOS 视觉对比 Agent，通过多模态差异比对，计算设计稿与实现截图的还原度相似评分，并列出布局、间距、颜色等像素级差异修复建议。',
    inputSchema: {
      type: 'object',
      properties: {
        designImage: { type: 'string', description: 'Base64 编码的期望设计稿图片内容' },
        implementationImage: { type: 'string', description: 'Base64 编码的实际实现截图内容' },
        imageMimeType: { type: 'string', description: '图片 MIME 类型，默认 image/png' },
        checkAspects: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['layout', 'colors', 'typography', 'spacing', 'components']
          },
          description: '指定比对审查的特征方向列表'
        }
      },
      required: ['designImage', 'implementationImage']
    }
  },
  {
    name: 'heal_compilation_errors',
    description: '自动对项目中的编译或 TypeScript 类型报错进行智能修复。如果不传入 buildOutput 与 files，会自动在当前工作区运行构建命令获取报错并识别修改过的文件。',
    inputSchema: {
      type: 'object',
      properties: {
        buildOutput: { type: 'string', description: '（可选）终端的编译报错或类型报错日志' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: '（可选）需要进行类型修复的文件路径列表。若不提供，将通过 git status 自动检测变动文件'
        }
      }
    }
  },
  // Task 18: Enhanced routing tool
  {
    name: 'enhanced_route_model',
    description: '使用增强路由系统为给定提示选择最优模型。支持多维度分析（任务类型、上下文大小、代码复杂度）、预算检查、Extended Thinking 和 Prompt Caching 判断，并记录成本。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '要路由的提示内容' },
        task_type: {
          type: 'string',
          enum: ['reasoning', 'coding', 'summarize', 'refactor', 'review', 'planning', 'explain', 'default'],
          description: '（可选）手动指定任务类型，不填则自动分类',
        },
      },
      required: ['prompt'],
    },
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const server = new Server(
    {
      name: 'apos',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, any>;

    process.stderr.write(`[APOS MCP] Tool called: ${name}\n`);

    try {
      let result: any;
      switch (name) {
        case 'rag_search':
          result = await handleRagSearch(toolArgs as any);
          break;
        case 'get_code_graph':
          result = await handleGetCodeGraph(toolArgs as any);
          break;
        case 'get_signals':
          result = await handleGetSignals(toolArgs as any);
          break;
        case 'get_project_context':
          result = await handleGetProjectContext(toolArgs as any);
          break;
        case 'route_model':
          result = await handleRouteModel(toolArgs as any);
          break;
        case 'index_workspace':
          result = await handleIndexWorkspace(toolArgs as any);
          break;
        case 'get_active_prototype':
          result = await handleGetActivePrototype(toolArgs as any);
          break;
        case 'sync_prototype_progress':
          result = await handleSyncPrototypeProgress(toolArgs as any);
          break;
        case 'report_cli_signal':
          result = await handleReportCliSignal(toolArgs as any);
          break;
        case 'compress_context':
          result = await handleCompressContext(toolArgs as any);
          break;
        case 'analyze_token_usage':
          result = await handleAnalyzeTokenUsage(toolArgs as any);
          break;
        case 'create_prototype':
          result = await handleCreatePrototype(toolArgs as any);
          break;
        case 'delegate_to_architect':
          result = await handleDelegateToArchitect(toolArgs as any);
          break;
        case 'delegate_to_review_bot':
          result = await handleDelegateToReviewBot(toolArgs as any);
          break;
        case 'delegate_to_openhands':
          result = await handleDelegateToOpenHands(toolArgs as any);
          break;
        case 'delegate_to_design_parser':
          result = await handleDelegateToDesignParser(toolArgs as any);
          break;
        case 'delegate_to_ui_test':
          result = await handleDelegateToUITest(toolArgs as any);
          break;
        case 'delegate_to_visual_diff':
          result = await handleDelegateToVisualDiff(toolArgs as any);
          break;
        case 'heal_compilation_errors':
          result = await handleHealCompilationErrors(toolArgs as any);
          break;
        case 'enhanced_route_model':
          result = await handleEnhancedRouteModel(toolArgs as any);
          break;
        default:
          result = {
            content: [{ type: 'text', text: `❌ 未知工具: ${name}` }],
            isError: true,
          };
      }

      logMcpToolCall(name, !result.isError).catch(() => {});
      return result;
    } catch (err: any) {
      process.stderr.write(`[APOS MCP] Error in ${name}: ${err.message}\n`);
      logMcpToolCall(name, false, err.message).catch(() => {});
      return {
        content: [{ type: 'text', text: `❌ 工具执行失败: ${err.message}` }],
        isError: true,
      };
    }
  });

  // Start with stdio transport (standard MCP transport for Claude Code / Codex)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  process.stderr.write('[APOS MCP Server] 已启动，等待 Claude Code / Codex 连接...\n');
  process.stderr.write('[APOS MCP Server] 传输协议: stdio\n');
  process.stderr.write(`[APOS MCP Server] 工具数量: ${TOOLS.length}\n`);
}

main().catch((err) => {
  process.stderr.write(`[APOS MCP Server] 启动失败: ${err.message}\n`);
  process.exit(1);
});
