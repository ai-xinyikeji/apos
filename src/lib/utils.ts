import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 原型状态 → 中文 */
export function translatePrototypeStatus(status: string): string {
  const map: Record<string, string> = {
    draft: '草案',
    assessing: '评估中',
    generating: '生成中',
    generated: '已生成',
    pr_created: 'PR 已提交',
    merged: '已合并',
    failed: '失败',
  };
  return map[status] ?? status;
}

/** 信号/原型状态 → 中文 */
export function translateSignalStatus(status: string): string {
  const map: Record<string, string> = {
    pending: '待分析',
    analyzed: '已分析',
    processing: '处理中',
    error: '出错',
  };
  return map[status] ?? status;
}

/** 情绪/情感 → 中文 */
export function translateSentiment(sentiment: string): string {
  const map: Record<string, string> = {
    positive: '正向',
    neutral: '中性',
    negative: '负向',
  };
  return map[sentiment] ?? sentiment;
}

/** 来源渠道 → 中文 */
export function translateSource(source: string): string {
  const map: Record<string, string> = {
    amplitude: 'Amplitude 埋点',
    zendesk: 'Zendesk 工单',
    competitor: '竞品监测',
    github: 'GitHub 趋势',
    hackernews: 'Hacker News',
    reddit: 'Reddit',
    twitter: 'Twitter/X',
    social: '社交媒体',
  };
  return map[source?.toLowerCase()] ?? source?.toUpperCase() ?? '未知';
}

/** Agent 执行步骤状态 → 中文 */
export function translateTraceStatus(status: string): string {
  const map: Record<string, string> = {
    success: '成功',
    error: '失败',
    warning: '警告',
    info: '信息',
    running: '运行中',
  };
  return map[status] ?? status;
}
