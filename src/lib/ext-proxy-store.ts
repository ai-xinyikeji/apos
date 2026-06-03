/**
 * Extension Proxy Store
 *
 * 浏览器扩展代理任务队列。
 * 服务器把需要在真实浏览器里执行的 LLM 请求放入队列，
 * 扩展轮询取走任务、在浏览器里执行、再把结果流式 POST 回来。
 *
 * 流程：
 *   dispatch() → 扩展轮询取走任务 → 触发真实浏览器对话
 *   → 拦截 SSE 流 → appendStreamChunk() 逐块推送
 *   → submitStreamDone() 结束 → streamChunks() generator 实时 yield
 */

export type ExtProxyProvider = 'chatgpt' | 'gemini' | 'kimi' | 'google';

export interface ExtProxyTask {
  id: string;
  provider: ExtProxyProvider;
  prompt: string;
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
  // Streaming support
  chunks: string[];
  accumulatedText: string;          // running total — never mutated by consumers
  streamResolvers: Array<() => void>;
  streamDone: boolean;
  streamError?: Error;
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
  /** 已完成任务的最终文本缓存（供轮询接口读取，60s 后过期） */
  private completed = new Map<string, { text: string; expireAt: number }>();
  /** 扩展最后一次心跳时间（ms） */
  private lastHeartbeat = 0;
  /** 任务超时时间（ms） */
  private readonly TIMEOUT_MS = 120_000;
  /** 扩展离线判定阈值（ms） */
  private readonly OFFLINE_THRESHOLD_MS = 15_000;
  /** 已完成缓存保留时间（ms） */
  private readonly COMPLETED_TTL_MS = 60_000;

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
  dispatch(provider: ExtProxyProvider, prompt: string, taskId?: string): Promise<ExtProxyResult> {
    const id = taskId || `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: ExtProxyTask = { id, provider, prompt, createdAt: Date.now() };

    return new Promise<ExtProxyResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(
          `网页版模型 (${provider}) 请求超时（120s）。请确保：\n` +
          `1. Chrome 中已加载并启用 apos-extension/ 插件\n` +
          `2. 已在 Chrome 中打开 ${
            provider === 'chatgpt' ? 'chatgpt.com 并登录' :
            provider === 'gemini'  ? 'gemini.google.com 并登录' :
            provider === 'kimi'    ? 'kimi.moonshot.cn 并登录' :
            provider === 'google'  ? 'www.google.com（无需登录）' :
            provider
          }\n` +
          `3. 插件 Service Worker 处于活跃状态（可在 chrome://extensions 检查）`
        ));
      }, this.TIMEOUT_MS);

      this.pending.set(id, {
        task, resolve, reject, timer,
        chunks: [], accumulatedText: '', streamResolvers: [], streamDone: false,
      });
      this.queue.push(task);
    });
  }

  /**
   * 服务器调用：把一个 LLM 流式请求委托给扩展执行。
   * 立即返回 taskId，调用方通过 streamChunks(taskId) 消费流。
   * 与 dispatch() 的区别：不等待完成，适合 streaming HTTP 响应。
   */
  dispatchStreaming(provider: ExtProxyProvider, prompt: string): string {
    const id = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: ExtProxyTask = { id, provider, prompt, createdAt: Date.now() };

    const timer = setTimeout(() => {
      const pending = this.pending.get(id);
      if (pending) {
        // 把超时错误存入 streamError，让 streamChunks() 能抛出。
        // 不立即删除 pending — streamChunks() 会在看到 streamDone 后自己清理。
        pending.streamError = new Error(
          `网页版模型 (${provider}) 请求超时（120s）。请确保：\n` +
          `1. Chrome 中已加载并启用 apos-extension/ 插件\n` +
          `2. 已在 Chrome 中打开并登录 ${
            provider === 'chatgpt' ? 'chatgpt.com' :
            provider === 'gemini'  ? 'gemini.google.com' :
            provider === 'google'  ? 'www.google.com' :
            'kimi.moonshot.cn'
          }\n` +
          `3. 插件 Service Worker 处于活跃状态（可在 chrome://extensions 检查）`
        );
        pending.streamDone = true;
        const resolvers = pending.streamResolvers.splice(0);
        for (const r of resolvers) r();
      }
    }, this.TIMEOUT_MS);

    this.pending.set(id, {
      task,
      resolve: () => {},
      reject: () => {},
      timer,
      chunks: [], accumulatedText: '', streamResolvers: [], streamDone: false, streamError: undefined,
    });
    this.queue.push(task);
    return id;
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
   * 扩展调用：提交一次性任务结果（错误回传用）。
   * 对于 streaming 任务，会把错误存入 streamError 并唤醒 streamChunks()。
   */
  submitResult(result: ExtProxyResult) {
    const pending = this.pending.get(result.taskId);
    if (!pending) return;
    clearTimeout(pending.timer);

    if (result.error) {
      // 流式任务：把错误存入 streamError，让 streamChunks() 抛出。
      // 不立即删除 pending — streamChunks() 会在看到 streamDone 后自己清理。
      pending.streamError = new Error(result.error);
      pending.streamDone = true;
      const resolvers = pending.streamResolvers.splice(0);
      for (const r of resolvers) r();
    } else {
      // 正常结果（dispatch() 非流式路径）
      this.pending.delete(result.taskId);
    }

    // Resolve 主 Promise（dispatch() 路径用；dispatchStreaming() 的 resolve 是 no-op）
    pending.resolve(result);
  }

  /**
   * 扩展调用：追加流式 chunk。
   */
  appendStreamChunk(taskId: string, chunk: string) {
    const pending = this.pending.get(taskId);
    if (!pending) return;
    pending.chunks.push(chunk);
    pending.accumulatedText += chunk;   // 维护完整文本，不受 shift() 影响
    // Wake up any waiters
    const resolvers = pending.streamResolvers.splice(0);
    for (const r of resolvers) r();
  }

  /**
   * 扩展调用：标记流结束。
   */
  submitStreamDone(taskId: string) {
    const pending = this.pending.get(taskId);
    if (!pending) return;
    pending.streamDone = true;
    // Wake up any waiters — generator will drain remaining chunks then return
    const resolvers = pending.streamResolvers.splice(0);
    for (const r of resolvers) r();
    clearTimeout(pending.timer);
    // 用 accumulatedText（完整文本）写入 completed 缓存，
    // 不受 streamChunks shift() 消费影响
    const finalText = pending.accumulatedText;
    this.completed.set(taskId, { text: finalText, expireAt: Date.now() + this.COMPLETED_TTL_MS });
    // Resolve the main promise (dispatch() path) with accumulated text.
    // For dispatchStreaming() path resolve is a no-op.
    pending.resolve({ taskId, text: finalText });
  }

  /**
   * 服务器调用：获取流式 async generator，用于 streaming 响应。
   * 在 dispatchStreaming() 之后调用，taskId 必须存在于 pending 中。
   * 如果流出错（扩展报错或超时），会 throw 错误。
   *
   * 超时场景：dispatchStreaming 的 timer 会在删除 pending 之前先设置
   * streamError + streamDone 并唤醒所有 waiter，所以下一次循环顶部
   * 的 if (pending.streamError) 能捕获到错误，不会静默退出。
   */
  async *streamChunks(taskId: string): AsyncIterable<string> {
    try {
      while (true) {
        const pending = this.pending.get(taskId);

        if (!pending) {
          // pending 已被 submitStreamDone 正常清理，流结束
          return;
        }

        // Yield any buffered chunks first (before checking errors or done)
        while (pending.chunks.length > 0) {
          yield pending.chunks.shift()!;
        }

        if (pending.streamDone) {
          // Clean up pending (timer already cleared by whoever set streamDone)
          this.pending.delete(taskId);
          // Check for error after draining all chunks
          if (pending.streamError) throw pending.streamError;
          return;
        }

        // Check for error (set before streamDone in some edge cases)
        if (pending.streamError) {
          this.pending.delete(taskId);
          throw pending.streamError;
        }

        // Wait for next chunk or done/error signal
        await new Promise<void>(resolve => {
          pending.streamResolvers.push(resolve);
        });
      }
    } finally {
      // 触发提前中断、退出时，保障清理 pending，释放资源
      const pending = this.pending.get(taskId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(taskId);
      }
    }
  }

  /**
   * 轮询接口：读取任务当前状态和已缓冲的 chunks，不消费流。
   * 专为 test-result 等轮询场景设计，可安全多次调用。
   */
  peekTaskStatus(taskId: string): {
    found: boolean;
    done: boolean;
    error?: string;
    bufferedText: string;
  } {
    // 先检查 completed 缓存（流已结束但 pending 可能已被清理）
    const cached = this.completed.get(taskId);
    if (cached) {
      if (Date.now() > cached.expireAt) {
        // 过期：任务已完成但缓存失效，告知调用方未找到
        this.completed.delete(taskId);
        return { found: false, done: false, bufferedText: '' };
      }
      return { found: true, done: true, bufferedText: cached.text };
    }

    const pending = this.pending.get(taskId);
    if (!pending) {
      return { found: false, done: false, bufferedText: '' };
    }

    const done = pending.streamDone;
    const error = pending.streamError?.message;
    const bufferedText = pending.accumulatedText;

    // 如果任务已经结束（完成或超时/出错失败），将其从 pending 队列中清理（peek 轮询场景不通过生成器自动清理）
    if (done || error) {
      this.pending.delete(taskId);
    }

    return {
      found: true,
      done,
      error,
      bufferedText,
    };
  }

  /**
   * 清理过期的 completed 缓存条目，并清理 pending 队列中因任何原因滞留的超期任务
   */
  sweepCompleted() {
    const now = Date.now();
    for (const [id, entry] of this.completed) {
      if (now > entry.expireAt) this.completed.delete(id);
    }

    // 强制清理 pending 中已经创建超过 130 秒的超期任务，避免由于页面重载、断连等异常导致的内存泄漏与任务积压
    for (const [id, pending] of this.pending) {
      const ageMs = now - pending.task.createdAt;
      if (ageMs > 130 * 1000) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
      }
    }
  }

  /**
   * 清除队列中的所有任务以及所有挂起的任务，解决积压问题
   */
  clear() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    this.queue = [];
    this.pending.clear();
    this.completed.clear();
  }

  /**
   * 取消指定的任务，释放资源（用于客户端提前断开连接时清理）
   */
  cancelTask(taskId: string) {
    const pending = this.pending.get(taskId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(taskId);
    }
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
    // 每 15 秒清理一次过期的 completed 缓存和超期挂起任务
    setInterval(() => globalThis.__extProxyStore?.sweepCompleted(), 15 * 1000);
  }
  return globalThis.__extProxyStore;
}
