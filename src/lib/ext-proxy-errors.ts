/**
 * Extension Proxy Error Types and Classes
 * 
 * 提供结构化的错误分类和处理策略
 */

export enum ExtProxyErrorType {
  /** 扩展离线 */
  EXTENSION_OFFLINE = 'EXTENSION_OFFLINE',
  /** 未找到对应的浏览器标签页 */
  TAB_NOT_FOUND = 'TAB_NOT_FOUND',
  /** Content Script 执行错误 */
  CONTENT_SCRIPT_ERROR = 'CONTENT_SCRIPT_ERROR',
  /** 流式传输超时 */
  STREAM_TIMEOUT = 'STREAM_TIMEOUT',
  /** Provider (ChatGPT/Gemini/Kimi) 错误 */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** 网络错误 */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** 任务队列已满 */
  QUEUE_FULL = 'QUEUE_FULL',
  /** 未知错误 */
  UNKNOWN = 'UNKNOWN',
}

/**
 * 扩展代理错误类
 */
export class ExtProxyError extends Error {
  constructor(
    /** 错误类型 */
    public type: ExtProxyErrorType,
    /** 错误消息 */
    message: string,
    /** 是否可以重试 */
    public retryable: boolean = false,
    /** 用户应该采取的行动 */
    public userAction?: string,
    /** 原始错误 */
    public cause?: Error
  ) {
    super(message);
    this.name = 'ExtProxyError';
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, ExtProxyError.prototype);
  }

  /**
   * 转换为 JSON 格式（用于 API 响应）
   */
  toJSON() {
    return {
      type: this.type,
      message: this.message,
      retryable: this.retryable,
      userAction: this.userAction,
      name: this.name,
    };
  }
}

/**
 * 错误工厂函数
 */

export function createExtensionOfflineError(): ExtProxyError {
  return new ExtProxyError(
    ExtProxyErrorType.EXTENSION_OFFLINE,
    '浏览器扩展离线',
    false,
    '请确保 Chrome 扩展已加载并启用（访问 chrome://extensions 检查）'
  );
}

export function createTabNotFoundError(provider: string): ExtProxyError {
  const siteMap: Record<string, string> = {
    chatgpt: 'chatgpt.com',
    gemini: 'gemini.google.com',
    kimi: 'kimi.moonshot.cn',
  };
  
  return new ExtProxyError(
    ExtProxyErrorType.TAB_NOT_FOUND,
    `未找到 ${provider} 的浏览器标签页`,
    false,
    `请在 Chrome 中打开并登录 ${siteMap[provider] || provider}`
  );
}

export function createContentScriptError(provider: string, originalError?: Error): ExtProxyError {
  return new ExtProxyError(
    ExtProxyErrorType.CONTENT_SCRIPT_ERROR,
    `Content Script 执行失败: ${originalError?.message || '未知错误'}`,
    true,  // 可以重试
    `尝试刷新 ${provider} 页面`,
    originalError
  );
}

export function createStreamTimeoutError(provider: string, timeoutMs: number): ExtProxyError {
  return new ExtProxyError(
    ExtProxyErrorType.STREAM_TIMEOUT,
    `${provider} 流式传输超时（${timeoutMs / 1000}秒）`,
    true,  // 可以重试
    '请检查网络连接和 Provider 网站状态'
  );
}

export function createProviderError(provider: string, statusCode: number, message?: string): ExtProxyError {
  return new ExtProxyError(
    ExtProxyErrorType.PROVIDER_ERROR,
    `${provider} 返回错误 (${statusCode}): ${message || '未知错误'}`,
    statusCode >= 500,  // 5xx 错误可以重试
    statusCode === 401 || statusCode === 403
      ? `请重新登录 ${provider}`
      : '请稍后重试'
  );
}

export function createNetworkError(originalError: Error): ExtProxyError {
  return new ExtProxyError(
    ExtProxyErrorType.NETWORK_ERROR,
    `网络错误: ${originalError.message}`,
    true,  // 网络错误通常可以重试
    '请检查网络连接',
    originalError
  );
}

export function createQueueFullError(queueLength: number): ExtProxyError {
  return new ExtProxyError(
    ExtProxyErrorType.QUEUE_FULL,
    `任务队列已满（${queueLength} 个任务）`,
    true,  // 可以稍后重试
    '请等待当前任务完成后再试'
  );
}

/**
 * 判断错误是否可以重试
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof ExtProxyError) {
    return error.retryable;
  }
  
  // 默认情况下，网络错误和超时错误可以重试
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnrefused')
  );
}

/**
 * 从普通错误创建 ExtProxyError
 */
export function wrapError(error: Error, type: ExtProxyErrorType = ExtProxyErrorType.UNKNOWN): ExtProxyError {
  if (error instanceof ExtProxyError) {
    return error;
  }
  
  return new ExtProxyError(
    type,
    error.message,
    isRetryableError(error),
    undefined,
    error
  );
}
