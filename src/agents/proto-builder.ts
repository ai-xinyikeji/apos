import { BaseAgent } from './base';
import { db } from '@/lib/db';
import { prototypes } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { generateText } from '@/lib/llm';
import fs from 'fs';
import path from 'path';
import { createBranch, commitAndPush, createPullRequest } from '@/lib/git';

export interface ProtoBuilderInput {
  prototypeId: number;
  name: string;
  description: string;
  branchName: string;
  image?: string; // Base64 data url
  assessOnly?: boolean;
}

export class ProtoBuilderAgent extends BaseAgent<ProtoBuilderInput, { success: boolean; error?: string; prUrl?: string }> {
  public readonly name = 'ProtoBuilder';

  public async run(input: ProtoBuilderInput, runId: string) {
    const { prototypeId, name, description, branchName, image, assessOnly } = input;
    
    await this.trace(runId, '启动', 'info', `开始为原型项目 [${name}] 生成代码，目标分支为 [${branchName}]。`);

    try {
      const llm = await this.getLLM();
      
      // Step 1: Feasibility Assessment (if requested or as part of the pipeline)
      if (assessOnly) {
        await this.trace(runId, '可行性评估', 'info', '正在进行需求可行性评估与技术方案选型...');
        const assessment = await this.assessFeasibility(description, llm, runId);
        
        await db.update(prototypes)
          .set({ 
            feasibilityReport: assessment,
            status: 'draft',
            updatedAt: new Date().toISOString()
          })
          .where(eq(prototypes.id, prototypeId));
          
        await this.trace(runId, '可行性评估完成', 'success', '可行性评估报告已生成并写入数据库。');
        return { success: true };
      }

      // Step 2: Create local Git branch
      await this.trace(runId, 'Git 创建与切换分支', 'info', `正在创建并切换到本地分支 [${branchName}]...`);
      await createBranch(branchName);
      await this.trace(runId, 'Git 分支切换成功', 'success', `成功切换至分支 [${branchName}]。`);

      // Fetch feasibility report if it exists to provide context memory
      let feasibilityContext = '';
      try {
        const [proto] = await db.select().from(prototypes).where(eq(prototypes.id, prototypeId));
        if (proto && proto.feasibilityReport) {
          feasibilityContext = `\n\nFeasibility Assessment & Technical Spec:\n${proto.feasibilityReport}\n\nPlease implement the prototype according to the assessment and specs above.`;
        }
      } catch (err) {
        console.warn('Failed to load feasibility report context memory', err);
      }

      // Local RAG Memory: index repository and retrieve relevant code chunks
      let ragContext = '';
      try {
        await this.trace(runId, '向量语义索引更新', 'info', '正在更新本地代码库的向量语义索引 (LanceDB)...');
        const { indexRepository, searchRepository } = await import('@/lib/rag');
        await indexRepository(async (msg) => {
          await this.trace(runId, '向量索引构建进度', 'info', msg);
        });

        await this.trace(runId, '向量检索匹配', 'info', `正在检索与需求 [${description.slice(0, 50)}...] 最相关的代码片段与本地组件...`);
        const searchResults = await searchRepository(description, 3);
        
        if (searchResults && searchResults.length > 0) {
          ragContext = `\n\nReference Local Code Context (RAG Memory):\nUse these existing local files and component imports as reference or reuse them if applicable:\n`;
          for (const res of searchResults) {
            ragContext += `\n--- File: ${res.filePath} (Lines ${res.startLine}+) ---\n${res.text}\n`;
          }
          await this.trace(runId, '向量检索命中', 'success', `已检索到 ${searchResults.length} 个相关代码片段，并注入记忆上下文。`);
          
          // Apply context compression if enabled
          try {
            const { settings } = await import('@/lib/schema');
            const settingsList = await db.select().from(settings);
            const settingsMap = new Map(settingsList.map(s => [s.key, s.value]));
            const compressionEnabled = settingsMap.get('enable_context_compression') === 'true';
            
            if (compressionEnabled && ragContext.length > 5000) {
              await this.trace(runId, '上下文压缩', 'info', `RAG 上下文过大 (${ragContext.length} 字符)，正在进行智能压缩...`);
              
              const { compressFile } = await import('@/lib/compression');
              const { compressed, stats } = await compressFile(
                'rag-context.txt',
                ragContext,
                'medium'
              );
              
              if (stats.reduction > 20) {
                ragContext = compressed;
                await this.trace(runId, '上下文压缩完成', 'success', 
                  `RAG 上下文已压缩: ${stats.originalSize} → ${stats.compressedSize} 字符 (节省 ${stats.reduction}%)`
                );
              }
            }
          } catch (compressionErr: any) {
            await this.trace(runId, '上下文压缩失败', 'warning', `压缩失败，使用原始上下文: ${compressionErr.message}`);
          }
        } else {
          await this.trace(runId, '向量检索未命中', 'info', '未找到足够相关的本地代码组件参考。');
        }
      } catch (err: any) {
        await this.trace(runId, '向量检索异常', 'warning', `本地向量检索出错: ${err.message}`);
      }

      await this.trace(runId, '代码生成', 'info', '正在生成代码...');

      const systemPrompt = `You are a senior full-stack React developer. You need to implement a prototype feature based on the user's description.
The project is a Next.js 15 App Router application with Tailwind CSS and shadcn/ui.

Generate the code files required for this prototype. Please follow these rules:
1. Ensure all code is complete and has no placeholders.
2. Return your output as a JSON block (wrapped in \`\`\`json ... \`\`\`) containing a list of files to write.
3. Every file must include complete code.
4. If you need new icons, import from 'lucide-react'.
5. If creating a new page, place it in a subdirectory under \`src/app/\` (e.g. \`src/app/my-feature/page.tsx\`) so that it can be navigated to.
6. Make sure to style it beautifully with slate-950 backdrop, dark modes, neon accent gradients, and animations.

Return a JSON array of objects structured like:
\`\`\`json
[
  {
    "path": "src/app/my-feature/page.tsx",
    "content": "... complete React component code ..."
  }
]
\`\`\``;

      const context = `${feasibilityContext}${ragContext}`;
      const userMessage = `Prototype Name: ${name}\nPrototype Description: ${description}${image ? '\n\n[Design image provided - please implement according to the visual design]' : ''}`;

      let text: string;
      let usage: any;

      const generationPrompt = `${systemPrompt}\n\n${context}\n\n${userMessage}`;
      let messages: any[] = [{ role: 'user', content: generationPrompt }];

      if (image) {
        await this.trace(runId, '多模态图像输入', 'info', '检测到手绘草图/设计图，使用多模态模式进行代码生成...');
        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(cleanBase64, 'base64');
        messages = [{
          role: 'user',
          content: [
            { type: 'text', text: generationPrompt },
            { type: 'image', image: imageBuffer }
          ]
        }];
      }

      const result = await generateText({
        model: llm.model,
        messages,
      });

      text = result.text;
      usage = result.usage;

      if (usage) {
        await this.trace(runId, 'Token 使用统计', 'info', 
          `代码生成 Token 消耗: Input=${usage.inputTokens}, Output=${usage.outputTokens}`,
          { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, provider: llm.provider }
        );
      }

      // Parse JSON from text
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
      const jsonStr = jsonMatch[1]?.trim() || text.trim();
      
      let files: Array<{ path: string; content: string }> = [];
      try {
        files = JSON.parse(jsonStr);
      } catch (err) {
        await this.trace(runId, 'JSON 解析异常', 'error', '无法解析生成的 JSON 代码包结构。大模型返回如下内容：\n' + text);
        throw new Error('LLM generated invalid JSON structure: ' + err);
      }

      // Step 4: Write files to workspace
      await this.trace(runId, '写入文件', 'info', `正在向本地工作空间写入 ${files.length} 个文件...`);
      for (const file of files) {
        const fullPath = path.join(process.cwd(), file.path);
        const dir = path.dirname(fullPath);
        
        // Safety check to prevent writing outside project root
        if (!fullPath.startsWith(process.cwd())) {
          throw new Error(`Security Exception: Cannot write to path outside project workspace: ${file.path}`);
        }

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(fullPath, file.content, 'utf8');
        await this.trace(runId, '文件已写入', 'info', `文件已写入: ${file.path}`);
      }

      // Self-Healing Loop: compile check and auto repair
      await this.selfHealLoop(runId, files, llm);

      // Step 5: Git commit and push
      await this.trace(runId, 'Git 提交与推送', 'info', '正在进行本地 Git 提交并推送至 GitHub...');
      const commitHash = await commitAndPush(branchName, `feat(${branchName}): generate prototype code for ${name}`);
      await this.trace(runId, 'Git 推送成功', 'success', `代码已推送，提交哈希为 [${commitHash}]。`);

      // Step 6: Create GitHub Pull Request
      await this.trace(runId, '创建 PR 请求', 'info', '正在 GitHub 创建 Pull Request...');
      const pr = await createPullRequest(
        `feat: Prototype - ${name}`,
        `This PR contains the generated prototype code for **${name}**.\n\n### Description\n${description}`,
        branchName
      );

      let prUrl = '';
      let prNumber: number | null = null;
      if (pr) {
        prUrl = pr.url;
        prNumber = pr.number;
        await this.trace(runId, 'PR 创建成功', 'success', `成功创建 Pull Request: ${prUrl}`);
      } else {
        await this.trace(runId, '跳过 PR 创建', 'warning', '未配置 GitHub Token，已跳过 PR 创建。可在本地合并分支。');
      }

      // Find previewUrl from files
      let previewUrl: string | null = null;
      const pageFile = files.find(f => f.path.startsWith('src/app/') && (f.path.endsWith('/page.tsx') || f.path.endsWith('/page.js') || f.path.endsWith('/page.ts')));
      if (pageFile) {
        const routeMatch = pageFile.path.match(/^src\/app\/(.*)\/page\.(tsx|js|ts)$/);
        if (routeMatch) {
          let route = routeMatch[1];
          // Remove route groups like (marketing) or [id]
          route = route.split('/').filter(p => !(p.startsWith('(') && p.endsWith(')'))).join('/');
          previewUrl = route ? `/${route}` : '/';
        } else if (pageFile.path === 'src/app/page.tsx' || pageFile.path === 'src/app/page.js' || pageFile.path === 'src/app/page.ts') {
          previewUrl = '/';
        }
      }

      // Convert generated files list to JSON array of paths
      const filePathsJson = JSON.stringify(files.map(f => f.path));

      // Update prototype status in db
      await db.update(prototypes)
        .set({
          status: pr ? 'pr_created' : 'generated',
          commitHash,
          prNumber,
          prUrl: prUrl || null,
          codePath: filePathsJson,
          previewUrl,
          updatedAt: new Date().toISOString()
        })
        .where(eq(prototypes.id, prototypeId));

      await this.trace(runId, '生成成功', 'success', `原型 [${name}] 生成完毕！`);
      return { success: true, prUrl };
      
    } catch (error: any) {
      console.error('ProtoBuilder execution error:', error);
      await this.trace(runId, '生成失败', 'error', `原型生成失败: ${error.message}`);
      
      await db.update(prototypes)
        .set({
          status: 'failed',
          updatedAt: new Date().toISOString()
        })
        .where(eq(prototypes.id, prototypeId));

      return { success: false, error: error.message };
    }
  }

  /**
   * Runs the local compiler check and performs self-healing if build fails.
   */
  private async selfHealLoop(runId: string, files: Array<{ path: string; content: string }>, llm: any): Promise<boolean> {
    const maxRetries = 3;
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await this.trace(runId, `自动修复编译检查 (第 ${attempt}/${maxRetries} 次)`, 'info', `正在进行本地编译与类型检查 (npm run build)...`);

      try {
        // Run compilation check (npm run build)
        await execPromise('npm run build', { cwd: process.cwd() });
        await this.trace(runId, '自动修复成功', 'success', `本地编译类型检查成功通过！代码无任何语法或类型错误。`);
        return true;
      } catch (err: any) {
        const buildOutput = (err.stdout || '') + '\n' + (err.stderr || '');
        await this.trace(runId, '编译失败', 'warning', `本地编译失败。检测到编译或类型错误。准备开始自动修复...`, buildOutput);

        if (attempt === maxRetries) {
          await this.trace(runId, '达到自动修复次数上限', 'warning', `已达到自愈重试次数上限 (${maxRetries})。放弃自动修复。`);
          return false;
        }

        // Use LLM to heal files that are causing compilation errors
        await this.trace(runId, '自动修复诊断', 'info', `大模型正在诊断编译报错并尝试自我修复代码...`);

        const healPrompt = `
You are a senior full-stack React and TypeScript expert.
The local project build failed. Below is the error output from "npm run build":

\`\`\`
${buildOutput}
\`\`\`

Here are the files we recently generated and wrote to the workspace:
${files.map(f => `- ${f.path}`).join('\n')}

For each generated file that has compilation or TypeScript errors, please correct the code to fix the errors (such as missing imports, incorrect types, incorrect props, or syntax errors). Keep everything else intact.

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

        const { text } = await generateText({
          model: llm.model,
          prompt: healPrompt,
        });

        // Parse JSON from text
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
        const jsonStr = jsonMatch[1]?.trim() || text.trim();
        
        let healedFiles: Array<{ path: string; content: string }> = [];
        try {
          healedFiles = JSON.parse(jsonStr);
        } catch (parseErr) {
          await this.trace(runId, '自动修复解析数据异常', 'error', '无法解析自愈返回的 JSON 数据结构。将跳过此次修复尝试。', text);
          continue;
        }

        // Rewrite healed files to workspace
        for (const file of healedFiles) {
          const fullPath = path.join(process.cwd(), file.path);
          
          if (!fullPath.startsWith(process.cwd())) {
            continue;
          }

          fs.writeFileSync(fullPath, file.content, 'utf8');
          await this.trace(runId, '自动修复写入文件', 'info', `自愈修复已写入文件: ${file.path}`);
          
          // Update our files tracking array
          const idx = files.findIndex(f => f.path === file.path);
          if (idx !== -1) {
            files[idx].content = file.content;
          } else {
            files.push(file);
          }
        }
      }
    }

    return false;
  }

  private async assessFeasibility(description: string, llm: any, runId: string): Promise<string> {
    let availableComponents: string[] = [];
    try {
      const uiPath = path.join(process.cwd(), 'src/components/ui');
      if (fs.existsSync(uiPath)) {
        availableComponents = fs.readdirSync(uiPath)
          .filter(file => file.endsWith('.tsx'))
          .map(file => file.replace('.tsx', ''));
      }
    } catch (err) {
      console.warn('Failed to read available ui components:', err);
    }

    const prompt = `
You are a senior frontend architect. Assess the feasibility of implementing the following requirement in our Next.js + Tailwind codebase.

Available UI components in our project (you can use/recommend these directly):
${availableComponents.length > 0 ? availableComponents.map(c => `- ${c}`).join('\n') : '- None'}

Provide a clean Markdown report summarizing:
1. Technical feasibility (Simple, Moderate, Complex)
2. Suggested UI/UX flow and structure
3. Recommended Tailwind CSS components and styling details (suggest which of the available UI components should be used or if any new ones should be installed)
4. Potential edge cases or challenges

Requirement:
${description}
`;

    const { text, usage } = await generateText({
      model: llm.model,
      prompt,
    });
    
    if (usage) {
      await this.trace(runId, 'Token 使用统计', 'info', `可行性评估 Token 消耗: Prompt=${usage.inputTokens}, Completion=${usage.outputTokens}`, {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens
      });
    }
    
    return text;
  }
}
