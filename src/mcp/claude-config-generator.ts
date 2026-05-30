/**
 * Claude Code & Codex MCP 配置生成器
 * 
 * 为 Claude Code / Codex / Cursor 生成标准 MCP 配置文件，
 * 让这些工具能自动连接到 APOS MCP Server。
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

export interface McpConfig {
  mcpServers: {
    apos: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
}

/**
 * 获取 APOS MCP Server 的配置对象
 */
export function generateMcpConfig(aposDir?: string): McpConfig {
  const dir = aposDir ?? process.cwd();
  const serverScript = path.join(dir, 'src/mcp/server.ts');
  
  return {
    mcpServers: {
      apos: {
        command: 'npx',
        args: ['tsx', serverScript],
        env: {
          APOS_DIR: dir,
          NODE_PATH: path.join(dir, 'node_modules'),
        },
      },
    },
  };
}

/**
 * 生成 Claude Code 与 Claude Desktop 用的 MCP 配置文件路径列表
 */
export function getClaudeCodeConfigPaths(): Array<{ label: string; path: string }> {
  const home = os.homedir();
  const paths: Array<{ label: string; path: string }> = [
    {
      label: 'Claude Code (CLI) 全局配置 (~/.claude/claude_desktop_config.json)',
      path: path.join(home, '.claude', 'claude_desktop_config.json'),
    },
    {
      label: 'Claude Code (CLI) 备用配置 (~/.claude.json)',
      path: path.join(home, '.claude.json'),
    },
  ];

  // Add Claude Desktop app config path based on OS platform
  if (process.platform === 'darwin') {
    paths.push({
      label: 'Claude Desktop (Mac App) 全局配置',
      path: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    });
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    paths.push({
      label: 'Claude Desktop (Windows App) 全局配置',
      path: path.join(appData, 'Claude', 'claude_desktop_config.json'),
    });
  } else {
    paths.push({
      label: 'Claude Desktop (Linux App) 全局配置',
      path: path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    });
  }

  return paths;
}

/**
 * 将 APOS MCP 配置写入 Claude Code 的配置文件
 * 如果配置文件已存在，合并 apos 配置（不覆盖其他 MCP server）
 */
export function writeClaudeCodeConfig(configPath: string, aposDir?: string): {
  success: boolean;
  message: string;
  configPath: string;
} {
  const config = generateMcpConfig(aposDir);
  
  try {
    // 确保目录存在
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let existingConfig: any = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        // Ignore parse errors, overwrite with fresh config
      }
    }

    // Merge: add/update apos key, keep other MCP servers
    const merged = {
      ...existingConfig,
      mcpServers: {
        ...(existingConfig.mcpServers ?? {}),
        apos: config.mcpServers.apos,
      },
    };

    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    
    return {
      success: true,
      message: `已成功写入配置到 ${configPath}`,
      configPath,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `写入失败: ${err.message}`,
      configPath,
    };
  }
}

/**
 * 从 Claude Code 的配置文件中清除 APOS MCP 配置
 */
export function cleanClaudeCodeConfig(configPath: string): {
  success: boolean;
  message: string;
  configPath: string;
} {
  try {
    if (!fs.existsSync(configPath)) {
      return {
        success: true,
        message: `配置文件不存在，无需清理`,
        configPath,
      };
    }

    let config: any = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      return {
        success: false,
        message: `配置文件损坏或格式错误，请手动清理: ${configPath}`,
        configPath,
      };
    }

    if (config.mcpServers && config.mcpServers.apos) {
      delete config.mcpServers.apos;
      
      // If mcpServers is empty, delete it as well
      if (Object.keys(config.mcpServers).length === 0) {
        delete config.mcpServers;
      }
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      
      return {
        success: true,
        message: `已成功从 ${configPath} 中清除 APOS 配置`,
        configPath,
      };
    }

    return {
      success: true,
      message: `未在配置文件中发现 APOS 配置，无需清理`,
      configPath,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `清理失败: ${err.message}`,
      configPath,
    };
  }
}

/**
 * 生成用于项目级 CLAUDE.md 的 MCP 使用说明
 */
export function generateMcpUsageInstructions(): string {
  return `## APOS MCP 工具使用指南

APOS MCP Server 已连接。可用工具：

### 1. \`rag_search\` — 语义搜索代码库
\`\`\`
用途：找到与功能相关的现有代码
示例：rag_search("用户认证和 JWT token 处理")
\`\`\`

### 2. \`get_code_graph\` — 代码关系图谱
\`\`\`
用途：查看函数/组件的调用者和依赖关系
示例：get_code_graph("getUserById", "callers")
\`\`\`

### 3. \`get_signals\` — 用户需求信号
\`\`\`
用途：了解当前最迫切的用户反馈和功能需求
示例：get_signals(status="pending")
\`\`\`

### 4. \`get_project_context\` — 项目全貌
\`\`\`
用途：开始新功能前了解架构、技术栈、竞品
示例：get_project_context(type="all")
\`\`\`

### 5. \`route_model\` — 最优模型路由
\`\`\`
用途：获取当前任务的最优模型配置（优先本地 Ollama）
示例：route_model(task_type="coding")
\`\`\`

### 6. \`index_workspace\` — 索引代码库
\`\`\`
用途：首次使用或代码大量变更后重建索引
示例：index_workspace(path="/your/project")
\`\`\`

### 7. \`get_active_prototype\` — 活跃开发任务
\`\`\`
用途：在开发前获取当前处于活跃/挂起状态的原型开发任务列表，获取任务 ID、设计需求和关联分支。
示例：get_active_prototype()
\`\`\`

### 8. \`sync_prototype_progress\` — 同步本地开发进度
\`\`\`
用途：在本地开发、测试或推送 PR 时，同步状态到 APOS 数据库。支持的状态有 generating（开发中）、generated（测试通过）、failed（开发失败）、pr_created（PR已创建）等。
示例：sync_prototype_progress(prototype_id=1, status="generating", branch_name="feature-oauth")
\`\`\`

### 9. \`report_cli_signal\` — 上报终端异常与缺陷信号
\`\`\`
用途：当在终端编译报错或单元测试（如 Jest）运行失败时，自动将错误日志、堆栈和负向极性上报至 APOS 信号中心。
示例：report_cli_signal(title="编译失败: TS2307", content="无法解析模块 '@/components/ui/button'", sentiment="negative")
\`\`\`

### 10. \`delegate_to_architect\` — 架构师 Agent (Extended Thinking)
\`\`\`
用途：输入复杂系统设计需求，启动具有 Extended Thinking 深度思考的大模型进行架构设计、技术选型及风险评估。
示例：delegate_to_architect(requirements="设计一个基于 Redis 的高并发秒杀系统限流器", constraints=["必须支持水平扩展"])
\`\`\`

### 11. \`delegate_to_review_bot\` — 自动化代码评审 (ReviewBot)
\`\`\`
用途：评审分支代码变更。可对密钥泄露、安全漏洞、UI 设计与代码质量进行分析，结合 CodeGraph 执行跨文件变更影响评估，并自动提报 GitHub 评审意见。
示例：delegate_to_review_bot(prototypeId=1, branchName="feature/auth", prNumber=15)
\`\`\`

### 12. \`delegate_to_openhands\` — OpenHands 沙箱/Shell 自动化代理
\`\`\`
用途：将指令重度、执行步骤多的开发或重构任务分发给 OpenHands 背景运行时自动处理，支持在 Docker 沙箱中进行代码生成与编译。
示例：delegate_to_openhands(task="重构 lib/utils.ts 并把所有的 CommonJS 导入改为 ES Modules，并且运行 npm test 确保通过")
\`\`\`

### 13. \`delegate_to_design_parser\` — 多模态设计稿解析
\`\`\`
用途：将 UI 设计稿的 Base64 传入，让多模态大模型智能分析，提取布局结构、配色体系、字体字号并识别相关组件及交互，建议生成 UI 结构代码。
示例：delegate_to_design_parser(imageBase64="iVBORw0KGgoAAAANSUhEUgAA...")
\`\`\`

### 14. \`delegate_to_ui_test\` — 自动化浏览器 UI 测试 (Computer Use)
\`\`\`
用途：指定测试网页 URL 以及一系列交互与断言，让 Agent 通过浏览器（支持 Computer Use 模拟或 Headless）运行 UI 测试并返回包含截图的报告。
示例：delegate_to_ui_test(url="http://localhost:3000/costs", testCases=["检查成本分析卡片的灰度背景色是否符合 slate-800/40"])
\`\`\`

### 15. \`delegate_to_visual_diff\` — 视觉设计还原度比对 (Visual Diff)
\`\`\`
用途：传入 UI 设计稿与实际实现截图的 Base64 图片，对比识别布局、间距、字体及颜色的还原度差异并打出百分比评分，生成建议修复报告。
示例：delegate_to_visual_diff(designImage="...", implementationImage="...")
\`\`\`

### 16. \`heal_compilation_errors\` — 编译与类型自愈修复
\`\`\`
用途：当在终端编译报错或 TypeScript 类型检查不通过时，自动调用此工具。大模型将结合报错信息以及目标文件内容，智能生成修复方案并自动写入，实现代码自愈。
示例：heal_compilation_errors(files=["src/app/page.tsx"])
\`\`\`
`;
}

