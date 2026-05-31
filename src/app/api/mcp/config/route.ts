import { NextRequest, NextResponse } from 'next/server';
import {
  generateMcpConfig,
  writeClaudeCodeConfig,
  cleanClaudeCodeConfig,
  getClaudeCodeConfigPaths,
} from '@/mcp/claude-config-generator';
import { writeClaudeMd, deleteClaudeMd } from '@/mcp/claude-md-generator';
import path from 'path';
import os from 'os';

// GET /api/mcp/config — 返回配置内容 + 配置路径信息
export async function GET() {
  const aposDir = process.cwd();
  const config = generateMcpConfig(aposDir);
  const configPaths = getClaudeCodeConfigPaths();

  return NextResponse.json({
    config,
    configJson: JSON.stringify(config, null, 2),
    configPaths,
    aposDir,
    serverScript: path.join(aposDir, 'src/mcp/server.ts'),
    instructions: {
      claudeCode: [
        '1. 复制下方 JSON 配置',
        `2. 写入 ~/.claude/claude_desktop_config.json（或点击"自动写入"）`,
        '3. 重启 Claude Code',
        '4. 在 Claude Code 中输入 /mcp 查看已连接的工具',
      ],
      codex: [
        '1. 复制下方 JSON 配置',
        '2. 写入 ~/.codex/config.json 的 mcpServers 字段',
        '3. 重启 Codex CLI',
      ],
    },
  });
}

// POST /api/mcp/config — 自动写入/清理配置文件 或 生成/删除 CLAUDE.md
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? 'write_claude_config';

  const fsNode = await import('fs'); // standard fs module

  if (action === 'write_claude_config') {
    const paths = getClaudeCodeConfigPaths();
    let success = true;
    let messages: string[] = [];
    
    for (const p of paths) {
      // Don't auto-create the alternate ~/.claude.json file unless it exists, to avoid pollution.
      if (p.path.endsWith('.claude.json') && !fsNode.existsSync(p.path)) {
        continue;
      }
      
      const result = writeClaudeCodeConfig(p.path, process.cwd());
      if (!result.success) {
        success = false;
        messages.push(`${p.label} 写入失败: ${result.message}`);
      } else {
        messages.push(`${p.label} 写入成功`);
      }
    }
    
    return NextResponse.json({
      success,
      message: messages.join('; '),
      configPath: paths[0].path,
    });
  }

  if (action === 'clean_claude_config') {
    const paths = getClaudeCodeConfigPaths();
    let success = true;
    let messages: string[] = [];
    
    for (const p of paths) {
      if (!fsNode.existsSync(p.path)) {
        continue;
      }
      
      const result = cleanClaudeCodeConfig(p.path);
      if (!result.success) {
        success = false;
        messages.push(`${p.label} 清理失败: ${result.message}`);
      } else {
        messages.push(`${p.label} 清理成功`);
      }
    }
    
    return NextResponse.json({
      success,
      message: messages.join('; '),
      configPath: paths[0].path,
    });
  }

  if (action === 'generate_claude_md') {
    // Generate CLAUDE.md for a target project
    const targetPath = body.targetPath ?? process.cwd();
    
    // Save target path to settings database
    try {
      const { db } = await import('@/lib/db');
      const { settings } = await import('@/lib/schema');
      await db.insert(settings).values({
        key: 'target_project_path',
        value: targetPath,
      }).onConflictDoUpdate({
        target: settings.key,
        set: { value: targetPath, updatedAt: new Date().toISOString() },
      });
    } catch (dbErr) {
      console.error('Failed to save target_project_path to database:', dbErr);
    }

    const result = await writeClaudeMd({
      projectPath: targetPath,
      aposDir: process.cwd(),
      overwrite: body.overwrite ?? false,
      customInstructions: body.customInstructions,
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      path: result.path,
    });
  }

  if (action === 'delete_claude_md') {
    // Delete CLAUDE.md for a target project
    const targetPath = body.targetPath ?? process.cwd();
    const result = deleteClaudeMd(targetPath);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      path: result.path,
    });
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 });
}
