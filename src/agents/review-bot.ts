import { BaseAgent } from './base';
import { db } from '@/lib/db';
import { git, getRepoDetails } from '@/lib/git';
import { settings } from '@/lib/schema';



export interface ReviewBotInput {
  prototypeId: number;
  branchName: string;
  prNumber?: number | null;
}

export class ReviewBotAgent extends BaseAgent<ReviewBotInput, { success: boolean; report: string; error?: string }> {
  public readonly name = 'ReviewBot';

  public async run(input: ReviewBotInput, runId: string) {
    const { prototypeId, branchName, prNumber } = input;
    
    await this.trace(runId, '启动', 'info', `开始对分支 [${branchName}] 的代码进行自动化安全和质量评审...`);

    try {
      const llm = await this.getLLM();
      
      // Determine the main base branch
      const branches = await git.branch();
      const baseBranch = branches.all.includes('main') ? 'main' : 'master';
      
      // Fetch diff content
      await this.trace(runId, '获取代码差异', 'info', `正在获取 [${baseBranch}] 与 [${branchName}] 分支的代码差异 (Diff)...`);
      const diff = await git.diff([baseBranch, branchName]);
      
      if (!diff) {
        await this.trace(runId, '无代码更改', 'warning', '分支之间未检测到任何代码更改。已终止审查。');
        return { success: true, report: '分支间无任何改动。' };
      }

      // Change Impact Analysis (GraphRAG)
      let impactContext = '';
      try {
        const { graphQueryManager } = await import('@/lib/codegraph/graph');
        const changedSymbols = extractChangedSymbols(diff);
        
        if (changedSymbols.length > 0) {
          impactContext = `\n### CodeGraph Change Impact Info:\nWe scanned the codebase AST and found the following symbols modified in this diff have active callers:\n`;
          let foundImpacts = false;
          
          for (const sym of changedSymbols) {
            const callers = await graphQueryManager.getCallers(sym);
            if (callers && callers.length > 0) {
              foundImpacts = true;
              impactContext += `- Symbol \`${sym}\` is called by:\n`;
              for (const caller of callers) {
                impactContext += `  * \`${caller.name}\` in file \`${caller.file_path}\` (line ${caller.start_line})\n`;
              }
            }
          }
          
          if (foundImpacts) {
            impactContext += `Please analyze if these changes might break or require updates in their callers. Include a "🔍 变更影响范围分析 (Change Impact Analysis)" section in your markdown report detailing this.\n`;
          } else {
            impactContext += `No active callers were found for the modified symbols in other files. Please state this in the "🔍 变更影响范围分析" section.\n`;
          }
        }
      } catch (gErr) {
        console.warn('Failed to perform CodeGraph impact analysis:', gErr);
      }

      await this.trace(runId, '代码审计', 'info', '正在进行代码审查...');

      const systemPrompt = `You are a senior full-stack architect and security engineer.
Please review the following git diff file for a code merge.

Focus on:
1. **Security Vulnerabilities (CRITICAL)**:
   - Check if there are direct database connections, secrets, passwords, or API keys written in the files.
   - Detect if there are direct write operations to the database initiated from React client-side components instead of Server Actions / API Routes.
2. **Code Quality**:
   - Proper use of React hooks, clean imports, and no debugger statements or console logs.
3. **UI Consistency**:
   - Proper use of Tailwind CSS classes and layouts.

Generate a detailed code review report in Markdown, including sections for:
- 📌 **改动概览 (Summary of Changes)**
- 🔒 **安全审计 (Security Audit)** - Must explicitly state if any direct db writes or key leaks were found.
- 🔍 **变更影响范围分析 (Change Impact Analysis)** - Traced caller analysis from CodeGraph.
- 🎨 **代码质量 & UI (Quality & Design)**
- 💡 **改进建议 (Recommendations)**`;

      const context = impactContext;
      const userMessage = `Git Diff:\n\`\`\`diff\n${diff}\n\`\`\``;

      let text: string;
      let usage: any;

      const auditPrompt = `${systemPrompt}\n${context}\n\n${userMessage}`;
      const result = await this.callLLM(runId, llm, {
        prompt: auditPrompt,
      });

      text = result.text;
      usage = result.usage;

      if (usage) {
        await this.trace(runId, 'Token 使用统计', 'info',
          `代码评审 Token 消耗: Input=${usage.inputTokens}, Output=${usage.outputTokens}`,
          { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, provider: llm.provider }
        );
      }

      await this.trace(runId, '评审完成', 'success', '代码自动评审完成，报告已成功生成。');

      // Post comment on GitHub PR if prNumber is supplied
      if (prNumber) {
        await this.trace(runId, '发布 PR 评论', 'info', `正在向 GitHub Pull Request #${prNumber} 发送评审意见...`);
        const posted = await this.postPRComment(prNumber, text);
        if (posted) {
          await this.trace(runId, 'PR 评论发表成功', 'success', `成功在 GitHub PR #${prNumber} 上发表了评审意见评论！`);
        } else {
          await this.trace(runId, 'PR 评论发表失败', 'warning', '未能成功发布 GitHub 评论（可能是 Token 权限不足或未配置）。');
        }
      }

      // Save report output in trace step details for UI retrieval
      await this.trace(runId, '生成评审报告', 'success', '已生成评审报告。', text);

      return { success: true, report: text };
    } catch (error: any) {
      console.error('ReviewBot failed:', error);
      await this.trace(runId, '评审失败', 'error', `代码评审遇到致命错误: ${error.message}`);
      return { success: false, report: '', error: error.message };
    }
  }

  private async postPRComment(prNumber: number, commentBody: string): Promise<boolean> {
    try {
      const list = await db.select().from(settings);
      const keysMap = new Map(list.map(s => [s.key, s.value]));
      const token = keysMap.get('github_token') || process.env.GITHUB_TOKEN;

      if (!token) return false;

      const details = await getRepoDetails();
      if (!details) return false;

      const res = await fetch(`https://api.github.com/repos/${details.owner}/${details.repo}/issues/${prNumber}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: `### 🤖 AI Review Bot 评审意见\n\n${commentBody}`,
        }),
      });

      return res.ok;
    } catch (error) {
      console.error('Failed to post comment to GitHub:', error);
      return false;
    }
  }
}

/**
 * Extracts added or modified symbols from a git diff patch.
 */
function extractChangedSymbols(diff: string): string[] {
  const symbols: string[] = [];
  const lines = diff.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const trimmed = line.slice(1).trim();
      
      // Match function
      const funcMatch = trimmed.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
      if (funcMatch) {
        symbols.push(funcMatch[1]);
        continue;
      }
      
      // Match class
      const classMatch = trimmed.match(/class\s+([a-zA-Z0-9_$]+)/);
      if (classMatch) {
        symbols.push(classMatch[1]);
        continue;
      }

      // Match arrow function const
      const arrowMatch = trimmed.match(/const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s*)?\(.*?\)\s*=>/);
      if (arrowMatch) {
        symbols.push(arrowMatch[1]);
        continue;
      }
    }
  }
  return Array.from(new Set(symbols));
}

