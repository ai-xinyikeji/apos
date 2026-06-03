/**
 * ExtProxyStore 单元测试
 *
 * 覆盖核心流程：
 * 1. 正常流式传输（dispatch → chunks → done）
 * 2. 错误路径（扩展报错 → streamChunks throw）
 * 3. 超时路径（120s 超时 → streamChunks throw）
 * 4. dispatch() 非流式路径（submitResult resolve）
 * 5. 并发任务互不干扰
 */

// 重置全局单例，每个测试用独立实例
beforeEach(() => {
  (globalThis as any).__extProxyStore = undefined;
});

// 使用真实计时器控制
jest.useFakeTimers();

import { getExtProxyStore } from '@/lib/ext-proxy-store';

// ─── 辅助：把 AsyncIterable 收集成数组 ────────────────────────────────────────
async function collectStream(gen: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

// ─── 辅助：把 AsyncIterable 收集成数组，期望它 throw ─────────────────────────
async function collectStreamExpectError(gen: AsyncIterable<string>): Promise<Error> {
  try {
    for await (const _ of gen) { /* drain */ }
    throw new Error('Expected stream to throw but it did not');
  } catch (e) {
    return e as Error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 正常流式传输
// ═══════════════════════════════════════════════════════════════════════════════

describe('正常流式传输', () => {
  test('dispatchStreaming → appendStreamChunk × N → submitStreamDone 能收到所有 chunks', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'hello');

    // 模拟扩展推送 chunks
    const streamPromise = collectStream(store.streamChunks(taskId));

    store.appendStreamChunk(taskId, 'Hello');
    store.appendStreamChunk(taskId, ', ');
    store.appendStreamChunk(taskId, 'world');
    store.submitStreamDone(taskId);

    const chunks = await streamPromise;
    expect(chunks).toEqual(['Hello', ', ', 'world']);
  });

  test('chunks 在 submitStreamDone 之前已缓冲，streamChunks 能全部取出', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('gemini', 'test');

    // 先推送所有 chunks，再开始消费
    store.appendStreamChunk(taskId, 'A');
    store.appendStreamChunk(taskId, 'B');
    store.appendStreamChunk(taskId, 'C');
    store.submitStreamDone(taskId);

    const chunks = await collectStream(store.streamChunks(taskId));
    expect(chunks).toEqual(['A', 'B', 'C']);
  });

  test('空响应（无 chunk 直接 done）正常结束', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('kimi', 'empty');

    const streamPromise = collectStream(store.streamChunks(taskId));
    store.submitStreamDone(taskId);

    const chunks = await streamPromise;
    expect(chunks).toEqual([]);
  });

  test('任务完成后 dequeue 返回空', async () => {
    const store = getExtProxyStore();
    store.dispatchStreaming('chatgpt', 'test');

    // 取走任务
    const tasks = store.dequeue();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].provider).toBe('chatgpt');
    expect(tasks[0].prompt).toBe('test');

    // 再次 dequeue 应为空
    expect(store.dequeue()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 错误路径
// ═══════════════════════════════════════════════════════════════════════════════

describe('错误路径', () => {
  test('submitResult(error) 导致 streamChunks throw', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'fail');

    const streamPromise = collectStreamExpectError(store.streamChunks(taskId));

    // 模拟扩展报错
    store.submitResult({ taskId, error: 'ChatGPT send button is disabled' });

    const err = await streamPromise;
    expect(err.message).toBe('ChatGPT send button is disabled');
  });

  test('错误前已推送的 chunks 能被消费，然后 throw', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'partial');

    const received: string[] = [];
    let thrownError: Error | null = null;

    const consumePromise = (async () => {
      try {
        for await (const chunk of store.streamChunks(taskId)) {
          received.push(chunk);
        }
      } catch (e) {
        thrownError = e as Error;
      }
    })();

    store.appendStreamChunk(taskId, 'partial ');
    store.appendStreamChunk(taskId, 'response');
    store.submitResult({ taskId, error: 'Connection lost' });

    await consumePromise;

    expect(received).toEqual(['partial ', 'response']);
    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toBe('Connection lost');
  });

  test('submitResult(error) 后 pending 由 streamChunks 清理', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('kimi', 'test');

    expect(store.pendingCount()).toBe(1);

    // 启动消费者
    const streamPromise = collectStreamExpectError(store.streamChunks(taskId));

    // 报错
    store.submitResult({ taskId, error: 'some error' });

    // 等消费者退出
    await streamPromise;

    // 消费者退出后 pending 被清理
    expect(store.pendingCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 超时路径
// ═══════════════════════════════════════════════════════════════════════════════

describe('超时路径', () => {
  test('120s 超时后 streamChunks throw 超时错误', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'slow');

    const streamPromise = collectStreamExpectError(store.streamChunks(taskId));

    // 推进时间到超时
    jest.advanceTimersByTime(120_001);

    const err = await streamPromise;
    expect(err.message).toContain('请求超时');
    expect(err.message).toContain('chatgpt.com');
  });

  test('超时后 pending 由 streamChunks 清理', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('gemini', 'slow');

    expect(store.pendingCount()).toBe(1);

    // 启动消费者
    const streamPromise = collectStreamExpectError(store.streamChunks(taskId));

    // 触发超时
    jest.advanceTimersByTime(120_001);

    // 等消费者退出
    await streamPromise;

    // 消费者退出后 pending 被清理
    expect(store.pendingCount()).toBe(0);
  });

  test('超时前已推送的 chunks 能被消费，然后 throw', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'partial-timeout');

    const received: string[] = [];
    let thrownError: Error | null = null;

    const consumePromise = (async () => {
      try {
        for await (const chunk of store.streamChunks(taskId)) {
          received.push(chunk);
          // 消费第一个 chunk 后暂停，等超时触发
        }
      } catch (e) {
        thrownError = e as Error;
      }
    })();

    store.appendStreamChunk(taskId, 'before timeout');
    // 推进时间触发超时
    jest.advanceTimersByTime(120_001);

    await consumePromise;

    expect(received).toContain('before timeout');
    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toContain('请求超时');
  });

  test('dispatch() 非流式超时走 reject 路径', async () => {
    const store = getExtProxyStore();
    const promise = store.dispatch('kimi', 'slow');

    jest.advanceTimersByTime(120_001);

    await expect(promise).rejects.toThrow('请求超时');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. dispatch() 非流式路径
// ═══════════════════════════════════════════════════════════════════════════════

describe('dispatch() 非流式路径', () => {
  test('submitResult(text) 正常 resolve', async () => {
    const store = getExtProxyStore();
    const promise = store.dispatch('chatgpt', 'hello');

    store.submitResult({ taskId: store.dequeue()[0].id, text: 'world' });

    const result = await promise;
    expect(result.text).toBe('world');
    expect(result.error).toBeUndefined();
  });

  test('submitResult(error) 通过 resolve 返回 error 字段（dispatch 路径不 reject）', async () => {
    const store = getExtProxyStore();
    const promise = store.dispatch('gemini', 'fail');
    const taskId = store.dequeue()[0].id;

    store.submitResult({ taskId, error: 'Gemini error' });

    const result = await promise;
    expect(result.error).toBe('Gemini error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 并发任务互不干扰
// ═══════════════════════════════════════════════════════════════════════════════

describe('并发任务', () => {
  test('两个并发 streaming 任务的 chunks 不会串流', async () => {
    const store = getExtProxyStore();
    const taskId1 = store.dispatchStreaming('chatgpt', 'task1');
    const taskId2 = store.dispatchStreaming('gemini', 'task2');

    const stream1 = collectStream(store.streamChunks(taskId1));
    const stream2 = collectStream(store.streamChunks(taskId2));

    store.appendStreamChunk(taskId1, 'A1');
    store.appendStreamChunk(taskId2, 'B1');
    store.appendStreamChunk(taskId1, 'A2');
    store.appendStreamChunk(taskId2, 'B2');
    store.submitStreamDone(taskId1);
    store.submitStreamDone(taskId2);

    const [chunks1, chunks2] = await Promise.all([stream1, stream2]);

    expect(chunks1).toEqual(['A1', 'A2']);
    expect(chunks2).toEqual(['B1', 'B2']);
  });

  test('一个任务出错不影响另一个任务', async () => {
    const store = getExtProxyStore();
    const taskId1 = store.dispatchStreaming('chatgpt', 'ok');
    const taskId2 = store.dispatchStreaming('kimi', 'fail');

    const stream1 = collectStream(store.streamChunks(taskId1));
    const stream2 = collectStreamExpectError(store.streamChunks(taskId2));

    store.appendStreamChunk(taskId1, 'ok chunk');
    store.submitStreamDone(taskId1);
    store.submitResult({ taskId: taskId2, error: 'Kimi failed' });

    const [chunks1, err2] = await Promise.all([stream1, stream2]);

    expect(chunks1).toEqual(['ok chunk']);
    expect(err2.message).toBe('Kimi failed');
  });

  test('dequeue 一次取走所有待处理任务', () => {
    const store = getExtProxyStore();
    store.dispatchStreaming('chatgpt', 'p1');
    store.dispatchStreaming('gemini', 'p2');
    store.dispatchStreaming('kimi', 'p3');

    const tasks = store.dequeue();
    expect(tasks).toHaveLength(3);
    expect(tasks.map(t => t.provider)).toEqual(['chatgpt', 'gemini', 'kimi']);
    expect(store.queueLength()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. 心跳 / 在线状态
// ═══════════════════════════════════════════════════════════════════════════════

describe('心跳 / 在线状态', () => {
  test('初始状态为离线', () => {
    const store = getExtProxyStore();
    expect(store.isExtensionOnline()).toBe(false);
  });

  test('heartbeat() 后变为在线', () => {
    const store = getExtProxyStore();
    store.heartbeat();
    expect(store.isExtensionOnline()).toBe(true);
  });

  test('15s 后变为离线', () => {
    const store = getExtProxyStore();
    store.heartbeat();
    jest.advanceTimersByTime(15_001);
    expect(store.isExtensionOnline()).toBe(false);
  });
});
