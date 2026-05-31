/**
 * Extension Proxy Store
 *
 * 浏览器扩展代理任务队列。
 * 服务器把需要在真实浏览器里执行的 LLM 请求放入队列，
 * 扩展轮询取走任务、在浏览器里执行、再把结果 POST 回来。
 *
 * 这样可以完全绕过 ChatGPT / Gemini 的服务器端反爬检测。
 */

export type ExtProxyProvider = 'chatgpt' | 'gemini' | 'kimi';

export interface ExtProxyTask {
  id: string;
  provider: ExtProxyProvider;
  prompt: string;
  cookies: string;
  createdAt: number;
}

export interface ExtProxyResult {
  taskId: string;
  text?: string;
  error?: string;
}

interface PendingTask {
  task: ExtProxyTask;
  resolve: (result: ExtProxyResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// 全局单例 —— Next.js dev 模式下模块会热重载，用 globalThis 保持状态
declare global {
  // eslint-disable-next-line no-var
  var __extProxyStore: ExtProxyStore | undefined;
}

class ExtProxyStore {
  /** 等待扩展领取的任务队列 */
  private queue: ExtProxyTask[] = [];
  /** 已领取、等待结果的任务 */
  private pending = new Map<string, PendingTask>();
  /** 扩展最后一次心跳时间（ms） */
  private lastHeartbeat = 0;
  /** 任务超时时间（ms） */
  private readonly TIMEOUT_MS = 30_000;
  /** 扩展离线判定阈值（ms） */
  private readonly OFFLINE_THRESHOLD_MS = 15_000;

  /** 扩展是否在线（最近 15s 内有心跳） */
  isExtensionOnline(): boolean {
    return Date.now() - this.lastHeartbeat < this.OFFLINE_THRESHOLD_MS;
  }

  /** 扩展心跳 */
  heartbeat() {
    this.lastHeartbeat = Date.now();
  }

  /**
   * 服务器调用：把一个 LLM 请求委托给扩展执行。
   * 返回 Promise，扩展提交结果后 resolve。
   */
  dispatch(provider: ExtProxyProvider, prompt: string, cookies: string): Promise<ExtProxyResult> {
    const id = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: ExtProxyTask = { id, provider, prompt, cookies, createdAt: Date.now() };

    return new Promise<ExtProxyResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension proxy timeout after ${this.TIMEOUT_MS / 1000}s for task ${id}`));
      }, this.TIMEOUT_MS);

      this.pending.set(id, { task, resolve, reject, timer });
      this.queue.push(task);
    });
  }

  /**
   * 扩展调用：取走队列里的所有待处理任务。
   */
  dequeue(): ExtProxyTask[] {
    const tasks = [...this.queue];
    this.queue = [];
    return tasks;
  }

  /**
   * 扩展调用：提交任务结果。
   */
  submitResult(result: ExtProxyResult) {
    const pending = this.pending.get(result.taskId);
    if (!pending) return; // 已超时或重复提交
    clearTimeout(pending.timer);
    this.pending.delete(result.taskId);
    pending.resolve(result);
  }

  /** 当前队列长度（调试用） */
  queueLength(): number {
    return this.queue.length;
  }

  /** 当前 pending 数量（调试用） */
  pendingCount(): number {
    return this.pending.size;
  }
}

export function getExtProxyStore(): ExtProxyStore {
  if (!globalThis.__extProxyStore) {
    globalThis.__extProxyStore = new ExtProxyStore();
  }
  return globalThis.__extProxyStore;
}
