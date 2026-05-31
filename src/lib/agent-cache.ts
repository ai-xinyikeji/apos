import crypto from 'crypto';

export interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/**
 * Agent Cache - 缓存 Agent 执行结果
 * 
 * 功能:
 * - 内存缓存
 * - TTL 过期机制
 * - 命中率统计
 * - 自动清理
 * 
 * 使用场景:
 * - 重复的可行性评估
 * - 相同的代码审查
 * - 重复的 RAG 检索
 */
export class AgentCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: { maxSize?: number; cleanupIntervalMs?: number } = {}) {
    this.maxSize = options.maxSize || 1000;
    
    // 启动自动清理
    const cleanupIntervalMs = options.cleanupIntervalMs || 60000; // 默认 1 分钟
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    // 更新命中次数
    entry.hits++;
    this.hits++;
    
    return entry.value as T;
  }

  /**
   * 设置缓存值
   */
  async set<T>(key: string, value: T, ttl: number = 3600000): Promise<void> {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // 删除最旧的条目
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0,
    });
  }

  /**
   * 删除缓存值
   */
  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 生成缓存键
   * 
   * @param agentName - Agent 名称
   * @param input - 输入参数
   * @returns 缓存键
   */
  generateKey(agentName: string, input: any): string {
    const inputStr = JSON.stringify(input, Object.keys(input).sort());
    const hash = this.hash(inputStr);
    return `${agentName}:${hash}`;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[AgentCache] 清理了 ${cleaned} 个过期条目`);
    }
  }

  /**
   * 驱逐最旧的条目
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`[AgentCache] 驱逐最旧条目: ${oldestKey}`);
    }
  }

  /**
   * 哈希函数
   */
  private hash(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
  }

  /**
   * 销毁缓存（清理定时器）
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  /**
   * 获取缓存大小（字节）
   */
  getSizeInBytes(): number {
    let size = 0;
    
    for (const entry of this.cache.values()) {
      try {
        const json = JSON.stringify(entry.value);
        size += json.length * 2; // UTF-16 编码，每个字符 2 字节
      } catch {
        // 忽略无法序列化的值
      }
    }
    
    return size;
  }

  /**
   * 获取热门缓存键（按命中次数排序）
   */
  getHotKeys(limit: number = 10): Array<{ key: string; hits: number }> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, hits: entry.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);

    return entries;
  }

  /**
   * 预热缓存
   * 
   * @param entries - 预热条目
   */
  async warmup<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
    
    console.log(`[AgentCache] 预热了 ${entries.length} 个缓存条目`);
  }
}

// 全局单例
let globalCache: AgentCache | null = null;

/**
 * 获取全局缓存实例
 */
export function getGlobalCache(): AgentCache {
  if (!globalCache) {
    globalCache = new AgentCache({
      maxSize: 1000,
      cleanupIntervalMs: 60000,
    });
  }
  return globalCache;
}

/**
 * 缓存装饰器 - 自动缓存 Agent 方法
 */
export function Cached(ttl: number = 3600000) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cache = getGlobalCache();
      const agentName = (this as any).name || (this as any).constructor.name;
      const cacheKey = cache.generateKey(`${agentName}.${propertyKey}`, args);

      // 尝试从缓存获取
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        console.log(`[AgentCache] 缓存命中: ${agentName}.${propertyKey}`);
        return cached;
      }

      // 执行原方法
      const result = await originalMethod.apply(this, args);

      // 保存到缓存
      await cache.set(cacheKey, result, ttl);

      return result;
    };

    return descriptor;
  };
}
