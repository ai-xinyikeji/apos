import { BaseAgent } from './base';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface OpenHandsInput {
  task: string;
  workspacePath?: string;
}

export interface OpenHandsOutput {
  success: boolean;
  logs: string;
  filesModified: string[];
  error?: string;
}

export class OpenHandsAgent extends BaseAgent<OpenHandsInput, OpenHandsOutput> {
  public readonly name = 'OpenHands';

  public async run(input: OpenHandsInput, runId: string): Promise<OpenHandsOutput> {
    const { task, workspacePath = /* turbopackIgnore: true */ process.cwd() } = input;
    await this.trace(runId, 'Start', 'info', `开始调用 OpenHands 执行任务: "${task.slice(0, 60)}..."`);

    // 1. Retrieve OpenHands settings
    let apiUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    try {
      const [setting] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'OPENHANDS_API_URL'));
      if (setting && setting.value) {
        apiUrl = setting.value;
      }
    } catch (err) {
      console.warn('Failed to load OPENHANDS_API_URL from settings:', err);
    }

    await this.trace(runId, 'Config Check', 'info', `OpenHands API 地址配置为: ${apiUrl}`);

    // 2. Try to connect to OpenHands server
    let useDockerFallback = true;
    try {
      const response = await fetch(`${apiUrl}/api/status`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        useDockerFallback = false;
        await this.trace(runId, 'Server Connect', 'success', '成功连接到 OpenHands 服务，准备分发任务...');
      }
    } catch (e) {
      await this.trace(runId, 'Server Offline', 'warning', 'OpenHands API 服务未在线。将尝试使用本地 Shell 环境执行兜底。');
    }

    if (!useDockerFallback) {
      // API Execution path
      try {
        await this.trace(runId, 'API Dispatch', 'info', '分发任务包到 OpenHands 运行时...');
        const res = await fetch(`${apiUrl}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, workspace: workspacePath }),
        });
        
        if (!res.ok) {
          throw new Error(`OpenHands API error: ${res.statusText}`);
        }
        
        const data = await res.json();
        await this.trace(runId, 'API Success', 'success', 'OpenHands 任务执行成功。');
        return {
          success: true,
          logs: data.logs || 'Task completed successfully by OpenHands API.',
          filesModified: data.filesModified || [],
        };
      } catch (err: any) {
        await this.trace(runId, 'API Failure', 'warning', `OpenHands API 执行失败: ${err.message}. 自动切换至本地 Shell 代理...`);
      }
    }

    // 3. Fallback path: Shell Execution / Simulation
    try {
      await this.trace(runId, 'Local Shell Exec', 'info', '正在通过本地 Shell 并配合大模型代理执行任务...');
      
      const llm = await this.getLLM();
      const prompt = `
You are an expert developer proxy. We need to complete the following development task in the workspace [${workspacePath}]:
Task: ${task}

Please write a step-by-step shell execution plan to accomplish this task.
Return the commands as a JSON list, e.g.:
\`\`\`json
[
  "npm install lodash",
  "touch src/helper.ts"
]
\`\`\`
`;
      const { generateText } = await import('@/lib/llm');
      const { text } = await generateText({
        model: llm.model,
        prompt,
      });

      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
      const jsonStr = jsonMatch[1]?.trim() || text.trim();
      const commands: string[] = JSON.parse(jsonStr);

      const logs: string[] = [];
      const filesModified: string[] = [];

      for (const cmd of commands) {
        await this.trace(runId, 'Shell Command', 'info', `正在运行: ${cmd}`);
        try {
          const { stdout, stderr } = await execAsync(cmd, { cwd: workspacePath });
          logs.push(`$ ${cmd}\n${stdout || ''}\n${stderr || ''}`);
        } catch (execErr: any) {
          logs.push(`$ ${cmd}\nFailed: ${execErr.message}`);
          await this.trace(runId, 'Command Error', 'warning', `命令执行失败: ${cmd}. 错误: ${execErr.message}`);
        }
      }

      await this.trace(runId, 'Fallback Success', 'success', '本地 Shell 代理任务执行完成。');
      return {
        success: true,
        logs: logs.join('\n\n'),
        filesModified,
      };
    } catch (err: any) {
      await this.trace(runId, 'Fallback Failure', 'error', `本地 Shell 代理执行失败: ${err.message}`);
      return {
        success: false,
        logs: `Failed both OpenHands API and local Shell proxy: ${err.message}`,
        filesModified: [],
        error: err.message,
      };
    }
  }
}
