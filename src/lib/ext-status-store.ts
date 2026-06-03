/**
 * Extension Status Store
 *
 * 存储浏览器插件的实时状态和日志，供设置页展示。
 * 使用 globalThis 单例，在 Next.js 热重载时保持状态。
 */

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface ExtLogEntry {
  ts: number;          // timestamp ms
  level: LogLevel;
  msg: string;
}

export interface ExtTabStatus {
  open: boolean;
  tabId?: number;
  url?: string;
  lastSeenAt?: number;
}

export interface ExtStatusSnapshot {
  online: boolean;
  lastHeartbeatAt: number | null;
  version: string | null;
  tabs: {
    chatgpt: ExtTabStatus;
    gemini: ExtTabStatus;
    kimi: ExtTabStatus;
    google: ExtTabStatus;
  };
  logs: ExtLogEntry[];
}

declare global {
  // eslint-disable-next-line no-var
  var __extStatusStore: ExtStatusStore | undefined;
}

const MAX_LOGS = 80;
const OFFLINE_THRESHOLD_MS = 20_000;

class ExtStatusStore {
  private lastHeartbeatAt: number | null = null;
  private version: string | null = null;
  private tabs: ExtStatusSnapshot['tabs'] = {
    chatgpt: { open: false },
    gemini:  { open: false },
    kimi:    { open: false },
    google:  { open: false },
  };
  private logs: ExtLogEntry[] = [];

  heartbeat(version?: string) {
    this.lastHeartbeatAt = Date.now();
    if (version) this.version = version;
  }

  updateTabs(tabs: Partial<ExtStatusSnapshot['tabs']>) {
    for (const [k, v] of Object.entries(tabs)) {
      (this.tabs as any)[k] = { ...(this.tabs as any)[k], ...v };
    }
  }

  addLog(level: LogLevel, msg: string) {
    this.logs.push({ ts: Date.now(), level, msg });
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }
  }

  getSnapshot(): ExtStatusSnapshot {
    const online = this.lastHeartbeatAt !== null &&
      Date.now() - this.lastHeartbeatAt < OFFLINE_THRESHOLD_MS;
    return {
      online,
      lastHeartbeatAt: this.lastHeartbeatAt,
      version: this.version,
      tabs: { ...this.tabs },
      logs: [...this.logs],
    };
  }

  clearLogs() {
    this.logs = [];
  }
}

export function getExtStatusStore(): ExtStatusStore {
  if (!globalThis.__extStatusStore) {
    globalThis.__extStatusStore = new ExtStatusStore();
  }
  return globalThis.__extStatusStore;
}
