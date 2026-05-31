/**
 * CLAUDE.md 自动生成器
 * 
 * 为目标项目自动生成 CLAUDE.md，注入：
 * - 项目技术栈和架构摘要
 * - APOS MCP 工具使用说明
 * - 近期用户信号摘要
 * - 竞品分析摘要
 * - 开发规范和常用命令
 */

import path from 'path';
import fs from 'fs';
import { generateMcpUsageInstructions } from './claude-config-generator';

interface ProjectInfo {
  name: string;
  description?: string;
  tech: string[];
  scripts: Record<string, string>;
  srcDirs: string[];
}

function detectProjectInfo(projectPath: string): ProjectInfo {
  const pkgPath = path.join(projectPath, 'package.json');
  let info: ProjectInfo = {
    name: path.basename(projectPath),
    tech: [],
    scripts: {},
    srcDirs: [],
  };

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      info.name = pkg.name ?? info.name;
      info.description = pkg.description;
      info.scripts = pkg.scripts ?? {};
      
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Detect tech stack
      if (deps.next) info.tech.push(`Next.js ${deps.next.replace(/[\^~]/, '')}`);
      if (deps.react) info.tech.push(`React ${deps.react.replace(/[\^~]/, '')}`);
      if (deps.vue) info.tech.push('Vue');
      if (deps.express) info.tech.push('Express');
      if (deps['@prisma/client']) info.tech.push('Prisma ORM');
      if (deps['drizzle-orm']) info.tech.push('Drizzle ORM');
      if (deps.tailwindcss) info.tech.push('Tailwind CSS');
      if (deps.typescript) info.tech.push('TypeScript');
      if (deps.jest || deps.vitest) info.tech.push('Unit Tests');
    } catch {}
  }

  // Detect source directories
  const commonSrcDirs = ['src', 'app', 'pages', 'components', 'lib', 'utils', 'api'];
  for (const dir of commonSrcDirs) {
    if (fs.existsSync(path.join(projectPath, dir))) {
      info.srcDirs.push(dir);
    }
  }

  return info;
}

function buildKeyFileList(projectPath: string): string[] {
  const important: string[] = [];
  const checks = [
    'src/app/layout.tsx', 'src/app/page.tsx',
    'src/lib/db.ts', 'src/lib/schema.ts', 'src/lib/utils.ts',
    'src/components/ui', 'src/agents',
    'drizzle.config.ts', 'next.config.ts', 'next.config.js',
    'tailwind.config.ts', 'tailwind.config.js',
    'prisma/schema.prisma',
    '.env.example', '.env.local',
  ];
  
  for (const check of checks) {
    if (fs.existsSync(path.join(projectPath, check))) {
      important.push(check);
    }
  }
  
  return important;
}

/**
 * 为指定项目生成 CLAUDE.md 内容
 */
export function generateClaudeMd(options: {
  projectPath: string;
  aposDir: string;
  recentSignals?: Array<{ title: string; source: string; sentiment: string | null }>;
  customInstructions?: string;
}): string {
  const { projectPath, recentSignals, customInstructions } = options;
  const project = detectProjectInfo(projectPath);
  const keyFiles = buildKeyFileList(projectPath);

  const sections: string[] = [];

  // Header
  sections.push(`# ${project.name} — Claude Code 配置`);
  if (project.description) {
    sections.push(`\n> ${project.description}`);
  }

  // Tech Stack
  if (project.tech.length > 0) {
    sections.push(`\n## 技术栈\n${project.tech.map(t => `- ${t}`).join('\n')}`);
  }

  // Key Commands
  const importantScripts = ['dev', 'build', 'test', 'lint', 'db:push', 'db:migrate'];
  const filteredScripts = importantScripts
    .filter(s => project.scripts[s])
    .map(s => `- \`npm run ${s}\` — ${project.scripts[s]}`);
  
  if (filteredScripts.length > 0) {
    sections.push(`\n## 常用命令\n${filteredScripts.join('\n')}`);
  }

  // Key Files
  if (keyFiles.length > 0) {
    sections.push(`\n## 关键文件\n${keyFiles.map(f => `- \`${f}\``).join('\n')}`);
  }

  // Source Dirs
  if (project.srcDirs.length > 0) {
    sections.push(`\n## 目录结构\n\`\`\`\n${project.srcDirs.map(d => `${d}/`).join('\n')}\n\`\`\``);
  }

  // Recent User Signals
  if (recentSignals && recentSignals.length > 0) {
    const sentimentEmoji: Record<string, string> = { positive: '✅', negative: '❌', neutral: '➖' };
    sections.push(
      `\n## 最近用户需求信号（来自 APOS）\n` +
      recentSignals.map(s => 
        `- [${s.source}] ${s.title} ${sentimentEmoji[s.sentiment ?? ''] ?? ''}`
      ).join('\n')
    );
  }

  // APOS MCP Tools
  sections.push(`\n## APOS MCP 工具\n\nAPOS MCP Server 已配置，在 Claude Code 中可直接调用以下工具增强上下文：\n`);
  sections.push(generateMcpUsageInstructions());

  // Custom Instructions
  if (customInstructions) {
    sections.push(`\n## 项目特定规范\n${customInstructions}`);
  }

  // APOS Workflow Guidelines
  sections.push(`\n## APOS 自动化集成流程规范
作为与 APOS 深度联动的 AI 助手，在本地终端开发时，请严格遵守以下集成 SOP 流程：
1. **任务认领**：开始任何开发工作前，必须先调用 \`get_active_prototype\` 获取当前活跃的原型开发任务，确认你的任务 ID。
2. **状态同步（开发中）**：认领任务后，立即调用 \`sync_prototype_progress\` 将该原型任务状态更新为 \`generating\`，并传入你的当前 Git 开发分支名（例如 \`branch_name="feature-oauth"\`）。
3. **架构与规划委派**：如果遇到特别复杂的跨模块大改动或未知技术选型，可调用 \`delegate_to_architect\` 启用 APOS 架构师大模型的 Extended Thinking 深度思考能力获取架构图谱，避免直接消耗你本地的 CLI Token。
4. **长耗时及繁琐修改委派**：如果需要对很多文件进行格式化、转换（如 CommonJS 转 ESM）或长耗时的编译重构，可调用 \`delegate_to_openhands\` 将任务分发给后台 Docker 沙箱异步运行，释放命令行。
5. **UI 设计解析与多模态比对**：
   - 看到设计图时，调用 \`delegate_to_design_parser\` 自动解析出 Flex/Grid 布局、色调及字体，并要求其生成原型骨架。
   - 完成开发后，对页面进行截图并与原设计稿进行 \`delegate_to_visual_diff\` 比对，确认没有视觉还原度偏差（相似度评分需大于 90）。
6. **自动化 UI 浏览器测试**：开发完前端界面后，务必调用 \`delegate_to_ui_test\` 在后台运行无头浏览器测试，验证页面按钮点击、状态流转和弹框样式，检查是否存在隐藏 Bug。
7. **模型路由决策**：在需要重构、总结或编码时，可调用 \`route_model\` 工具以参考是否可以路由到低成本的本地/免 Key 模型，帮助团队节省 Token 消耗。
8. **代码提质与安全评审**：在推送代码前，调用 \`delegate_to_review_bot\` 对当前分支与 master/main 分支的代码差异进行自动化质量安全评审，防止前端组件中直接写入 API 密钥或暴露明文 SQL 操作。
9. **编译报错自动修复（自愈）**：如果在编译（如 \`npm run build\`）或类型检查时遇到了 TypeScript/编译报错，除了自我修改外，可调用 \`heal_compilation_errors\` 工具并传入报错日志与受影响文件路径，由 APOS 大模型自愈引擎全自动分析并写入修复，省去逐个文件手动对齐类型和导出的时间。
10. **编译与异常反馈**：如果编译或运行测试时遭遇无法自动修复的失败，请调用 \`report_cli_signal\` 工具上报失败日志和错误堆栈（使用 \`sentiment="negative"\`），以便 APOS 收集质量监控缺陷。
11. **状态同步（完成与提报）**：
    - 本地编译通过且测试全部通过后，调用 \`sync_prototype_progress\` 将状态更新为 \`generated\`。
    - 创建 GitHub PR 并成功推送后，调用 \`sync_prototype_progress\` 将状态更新为 \`pr_created\`，并传入对应的 \`pr_url\` 和最新的 \`commit_hash\`，以便 Web 端实时渲染 PR 状态和研发进度看板。`);

  // Development Guidelines
  sections.push(`\n## 开发规范
- 新组件放在 \`src/components/\`，公共 UI 放在 \`src/components/ui/\`
- API 路由放在 \`src/app/api/\`，遵循 Next.js App Router 规范
- 修改数据库 Schema 后运行 \`npm run db:push\`
- 提交前运行 \`npm run build\` 确认编译通过
- 使用 TypeScript 严格模式，避免 \`any\` 类型`);


  return sections.join('\n');
}

/**
 * 将 CLAUDE.md 写入目标项目
 */
export async function writeClaudeMd(options: {
  projectPath: string;
  aposDir: string;
  overwrite?: boolean;
  customInstructions?: string;
}): Promise<{ success: boolean; message: string; path: string }> {
  const claudeMdPath = path.join(options.projectPath, 'CLAUDE.md');
  
  if (fs.existsSync(claudeMdPath) && !options.overwrite) {
    return {
      success: false,
      message: 'CLAUDE.md 已存在，使用 overwrite=true 强制覆盖',
      path: claudeMdPath,
    };
  }

  // Try to load recent signals from APOS DB
  let recentSignals: Array<{ title: string; source: string; sentiment: string | null }> = [];
  try {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = path.join(options.aposDir, 'data/apos.db');
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true });
      recentSignals = db.prepare(
        'SELECT title, source, sentiment FROM signals ORDER BY created_at DESC LIMIT 5'
      ).all() as any[];
      db.close();
    }
  } catch {}

  const content = generateClaudeMd({
    projectPath: options.projectPath,
    aposDir: options.aposDir,
    recentSignals,
    customInstructions: options.customInstructions,
  });

  try {
    fs.writeFileSync(claudeMdPath, content, 'utf8');
    return {
      success: true,
      message: `CLAUDE.md 已生成 (${content.length} 字符)`,
      path: claudeMdPath,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `写入失败: ${err.message}`,
      path: claudeMdPath,
    };
  }
}

/**
 * 从指定的目标项目中删除 CLAUDE.md 文件
 */
export function deleteClaudeMd(projectPath: string): { success: boolean; message: string; path: string } {
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  try {
    if (fs.existsSync(claudeMdPath)) {
      fs.unlinkSync(claudeMdPath);
      return {
        success: true,
        message: 'CLAUDE.md 已成功删除。',
        path: claudeMdPath,
      };
    }
    return {
      success: true,
      message: 'CLAUDE.md 不存在，无需删除。',
      path: claudeMdPath,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `删除 CLAUDE.md 失败: ${err.message}`,
      path: claudeMdPath,
    };
  }
}

/**
 * 根据数据库中持久化的目标项目路径，自动重新生成并热更新 CLAUDE.md
 */
export async function updateClaudeMdIfConfigured(aposDir: string = process.cwd()) {
  try {
    const { db } = await import('@/lib/db');
    const { settings } = await import('@/lib/schema');
    const { eq } = await import('drizzle-orm');

    if (!settings) {
      console.log('[CLAUDE.md Auto-Update] settings schema 未定义（可能处于测试 Mock 环境中），跳过更新。');
      return;
    }

    const list = await db.select().from(settings).where(eq(settings.key, 'target_project_path'));
    const targetPath = list[0]?.value;
    
    if (targetPath && fs.existsSync(targetPath)) {
      console.log(`[CLAUDE.md Auto-Update] 检测到配置的路径: \${targetPath}，正在热更新 CLAUDE.md...`);
      const result = await writeClaudeMd({
        projectPath: targetPath,
        aposDir,
        overwrite: true,
      });
      console.log(`[CLAUDE.md Auto-Update] \${result.message}`);
    } else {
      console.log('[CLAUDE.md Auto-Update] 未配置目标项目路径或路径不存在，跳过热更新。');
    }
  } catch (error) {
    console.error('[CLAUDE.md Auto-Update] 自动更新失败:', error);
  }
}
