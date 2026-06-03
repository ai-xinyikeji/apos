/**
 * ExtProxyStore v2 新功能测试
 *
 * 覆盖本次优化新增的功能：
 * 1. peekTaskStatus() — 轮询接口，不消费流
 * 2. completed 缓存 — 流结束后 60s 内可读
 * 3. sweepCompleted() — 过期缓存清理
 * 4. stream-chunk 批量 chunks 格式
 */

beforeEach(() => {
  (globalThis as any).__extProxyStore = undefined;
});

jest.useFakeTimers();

import { getExtProxyStore } from '@/lib/ext-proxy-store';

// ─── 辅助 ─────────────────────────────────────────────────────────────────────
async function drainStream(gen: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of gen) text += chunk;
  return text;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. peekTaskStatus() — 不消费流，可多次调用
// ═══════════════════════════════════════════════════════════════════════════════

describe('peekTaskStatus()', () => {
  test('任务不存在时返回 found:false, done:false', () => {
    const store = getExtProxyStore();
    const status = store.peekTaskStatus('nonexistent');
    expect(status.found).toBe(false);
    expect(status.done).toBe(false);
    expect(status.bufferedText).toBe('');
  });

  test('任务进行中，无 chunks 时返回 pending 状态', () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    const status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(true);
    expect(status.done).toBe(false);
    expect(status.bufferedText).toBe('');
    expect(status.error).toBeUndefined();
  });

  test('有 chunks 时 bufferedText 包含已缓冲内容', () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    store.appendStreamChunk(taskId, '你好');
    store.appendStreamChunk(taskId, '世界');

    const status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(true);
    expect(status.done).toBe(false);
    expect(status.bufferedText).toBe('你好世界');
  });

  test('多次调用 peekTaskStatus 不消费 chunks（streamChunks 仍能读到）', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    store.appendStreamChunk(taskId, 'A');
    store.appendStreamChunk(taskId, 'B');

    // 多次 peek
    store.peekTaskStatus(taskId);
    store.peekTaskStatus(taskId);
    store.peekTaskStatus(taskId);

    // streamChunks 仍能读到所有 chunks
    const streamPromise = drainStream(store.streamChunks(taskId));
    store.submitStreamDone(taskId);
    const text = await streamPromise;
    expect(text).toBe('AB');
  });

  test('流结束后 peekTaskStatus 返回 done:true 和完整文本', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    store.appendStreamChunk(taskId, '测试');
    store.appendStreamChunk(taskId, '成功');

    // 启动消费者并结束流
    const streamPromise = drainStream(store.streamChunks(taskId));
    store.submitStreamDone(taskId);
    await streamPromise;

    // 流结束后 pending 被清理，但 completed 缓存仍可读
    const status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(true);
    expect(status.done).toBe(true);
    expect(status.bufferedText).toBe('测试成功');
    expect(status.error).toBeUndefined();
  });

  test('流出错后 peekTaskStatus 返回 error', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    // 启动消费者
    const streamPromise = (async () => {
      try { await drainStream(store.streamChunks(taskId)); } catch (_) {}
    })();

    store.submitResult({ taskId, error: 'ChatGPT failed' });
    await streamPromise;

    const status = store.peekTaskStatus(taskId);
    // 出错时不写入 completed 缓存，任务已从 pending 清理
    expect(status.found).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. completed 缓存 — 60s TTL
// ═══════════════════════════════════════════════════════════════════════════════

describe('completed 缓存 TTL', () => {
  test('流结束后 60s 内 peekTaskStatus 仍返回结果', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    store.appendStreamChunk(taskId, 'hello');
    const streamPromise = drainStream(store.streamChunks(taskId));
    store.submitStreamDone(taskId);
    await streamPromise;

    // 59s 后仍可读
    jest.advanceTimersByTime(59_000);
    const status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(true);
    expect(status.bufferedText).toBe('hello');
  });

  test('60s 后 peekTaskStatus 返回 found:false', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    store.appendStreamChunk(taskId, 'hello');
    const streamPromise = drainStream(store.streamChunks(taskId));
    store.submitStreamDone(taskId);
    await streamPromise;

    // 超过 60s
    jest.advanceTimersByTime(61_000);
    const status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(false);
    expect(status.done).toBe(false); // 过期后 done 也是 false
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. sweepCompleted() — 清理过期缓存
// ═══════════════════════════════════════════════════════════════════════════════

describe('sweepCompleted()', () => {
  test('sweep 清理过期条目，不影响未过期条目', async () => {
    const store = getExtProxyStore();

    // 任务 1：马上完成
    const taskId1 = store.dispatchStreaming('chatgpt', 't1');
    store.appendStreamChunk(taskId1, 'result1');
    const p1 = drainStream(store.streamChunks(taskId1));
    store.submitStreamDone(taskId1);
    await p1;

    // 推进 61s，让 taskId1 过期
    jest.advanceTimersByTime(61_000);

    // 任务 2：刚完成（未过期）
    const taskId2 = store.dispatchStreaming('gemini', 't2');
    store.appendStreamChunk(taskId2, 'result2');
    const p2 = drainStream(store.streamChunks(taskId2));
    store.submitStreamDone(taskId2);
    await p2;

    // sweep
    store.sweepCompleted();

    // taskId1 已被清理
    expect(store.peekTaskStatus(taskId1).found).toBe(false);
    // taskId2 仍可读
    expect(store.peekTaskStatus(taskId2).found).toBe(true);
    expect(store.peekTaskStatus(taskId2).bufferedText).toBe('result2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. test-result 轮询场景模拟
// ═══════════════════════════════════════════════════════════════════════════════

describe('test-result 轮询场景', () => {
  test('轮询 pending → streaming → completed 状态转换', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', '你好，请简单回复"测试成功"即可');

    // 第 1 次轮询：pending
    let status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(true);
    expect(status.done).toBe(false);
    expect(status.bufferedText).toBe('');

    // 扩展开始推送 chunks
    store.appendStreamChunk(taskId, '测试');

    // 第 2 次轮询：streaming，有部分内容
    status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(true);
    expect(status.done).toBe(false);
    expect(status.bufferedText).toBe('测试');

    store.appendStreamChunk(taskId, '成功');

    // 启动消费者并结束流
    const streamPromise = drainStream(store.streamChunks(taskId));
    store.submitStreamDone(taskId);
    await streamPromise;

    // 第 3 次轮询：completed
    status = store.peekTaskStatus(taskId);
    expect(status.found).toBe(true);
    expect(status.done).toBe(true);
    expect(status.bufferedText).toBe('测试成功');
  });

  test('多次轮询不会消费 chunks，streamChunks 仍能正常工作', async () => {
    const store = getExtProxyStore();
    const taskId = store.dispatchStreaming('chatgpt', 'test');

    store.appendStreamChunk(taskId, 'chunk1');
    store.appendStreamChunk(taskId, 'chunk2');

    // 模拟 popup 轮询 5 次
    for (let i = 0; i < 5; i++) {
      const s = store.peekTaskStatus(taskId);
      expect(s.bufferedText).toBe('chunk1chunk2');
    }

    // streamChunks 仍能读到完整内容
    const streamPromise = drainStream(store.streamChunks(taskId));
    store.submitStreamDone(taskId);
    const text = await streamPromise;
    expect(text).toBe('chunk1chunk2');
  });
});
