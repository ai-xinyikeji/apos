'use client';

/**
 * /routing/history - 路由历史页面
 *
 * 功能：
 * - 历史记录列表（分页）
 * - 过滤（任务类型、Provider、时间范围）
 * - 详情查看
 * - 性能统计
 * - CSV 导出
 *
 * 对应需求：Requirement 11
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoutingDecision {
  id: string;
  timestamp: string;
  taskType: string;
  promptPreview: string | null;
  contextSize: number;
  codeComplexity: number | null;
  selectedProvider: string;
  selectedModel: string;
  decisionReason: string;
  estimatedCost: number;
  actualCost: number | null;
  actualTime: number | null;
  usesExtendedThinking: number;
  usesPromptCaching: number;
  manualOverride: number;
}

interface HistoryResponse {
  decisions: RoutingDecision[];
  total: number;
  stats: { accuracy: number | null; avgCost: number; avgTime: number | null };
}

interface Filters {
  taskType: string;
  provider: string;
  startDate: string;
  endDate: string;
}

const TASK_TYPES = ['', 'reasoning', 'coding', 'summarize', 'refactor', 'review', 'planning', 'explain', 'default'];
const PROVIDERS  = ['', 'anthropic', 'openai', 'google', 'lmstudio'];
const PAGE_SIZE  = 20;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoutingHistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>({ taskType: '', provider: '', startDate: '', endDate: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<RoutingDecision | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (filters.taskType) params.set('taskType', filters.taskType);
    if (filters.provider) params.set('provider', filters.provider);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate)   params.set('endDate', filters.endDate);

    try {
      const res = await fetch(`/api/routing/history?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!data) return;
    const headers = ['ID', 'Timestamp', 'TaskType', 'Provider', 'Model', 'EstimatedCost', 'ActualCost', 'ContextSize'];
    const rows = data.decisions.map(d => [
      d.id, d.timestamp, d.taskType, d.selectedProvider, d.selectedModel,
      d.estimatedCost, d.actualCost ?? '', d.contextSize,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'routing-history.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const providerColor: Record<string, string> = {
    anthropic: 'bg-blue-500/10 text-blue-400',
    openai:    'bg-green-500/10 text-green-400',
    google:    'bg-yellow-500/10 text-yellow-400',
    lmstudio:  'bg-orange-500/10 text-orange-400',
  };

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">路由历史</h1>
          <p className="text-slate-400 text-sm mt-1">查看所有路由决策记录</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-1" /> 过滤
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
            <Download className="h-4 w-4 mr-1" /> 导出 CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">任务类型</Label>
                <select
                  value={filters.taskType}
                  onChange={e => { setFilters(p => ({ ...p, taskType: e.target.value })); setPage(0); }}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                >
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t || '全部'}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Provider</Label>
                <select
                  value={filters.provider}
                  onChange={e => { setFilters(p => ({ ...p, provider: e.target.value })); setPage(0); }}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                >
                  {PROVIDERS.map(p => <option key={p} value={p}>{p || '全部'}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">开始日期</Label>
                <Input type="date" value={filters.startDate} onChange={e => { setFilters(p => ({ ...p, startDate: e.target.value })); setPage(0); }} className="bg-slate-950 border-slate-700 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">结束日期</Label>
                <Input type="date" value={filters.endDate} onChange={e => { setFilters(p => ({ ...p, endDate: e.target.value })); setPage(0); }} className="bg-slate-950 border-slate-700 text-sm" />
              </div>
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setFilters({ taskType: '', provider: '', startDate: '', endDate: '' }); setPage(0); }}>
              <X className="h-3 w-3 mr-1" /> 清除过滤
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{data.total}</div>
              <div className="text-xs text-slate-400">总记录数</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">${(data.stats.avgCost / 100).toFixed(4)}</div>
              <div className="text-xs text-slate-400">平均成本</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {data.stats.accuracy !== null ? `${(data.stats.accuracy * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-xs text-slate-400">路由准确率</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-3 text-slate-400 font-medium">时间</th>
                    <th className="text-left p-3 text-slate-400 font-medium">任务类型</th>
                    <th className="text-left p-3 text-slate-400 font-medium">Provider / 模型</th>
                    <th className="text-right p-3 text-slate-400 font-medium">预估成本</th>
                    <th className="text-right p-3 text-slate-400 font-medium">上下文</th>
                    <th className="text-left p-3 text-slate-400 font-medium">标记</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.decisions.map(d => (
                    <tr
                      key={d.id}
                      className="border-b border-slate-700/30 hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => setSelected(d)}
                    >
                      <td className="p-3 text-slate-300 whitespace-nowrap">
                        {new Date(d.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-700/50">{d.taskType}</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs mr-1 ${providerColor[d.selectedProvider] ?? 'bg-slate-700/50'}`}>
                          {d.selectedProvider}
                        </span>
                        <span className="text-slate-400 text-xs">{d.selectedModel.split('-').slice(0, 3).join('-')}</span>
                      </td>
                      <td className="p-3 text-right font-mono">${(d.estimatedCost / 100).toFixed(4)}</td>
                      <td className="p-3 text-right text-slate-400">{d.contextSize.toLocaleString()}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {d.usesExtendedThinking === 1 && <span className="px-1 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400">ET</span>}
                          {d.usesPromptCaching === 1    && <span className="px-1 py-0.5 rounded text-xs bg-green-500/10 text-green-400">PC</span>}
                          {d.manualOverride === 1       && <span className="px-1 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400">手动</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!data?.decisions.length) && (
                    <tr><td colSpan={6} className="text-center text-slate-400 py-8">暂无路由历史记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-400">第 {page + 1} / {totalPages} 页，共 {data?.total} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <Card className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">路由决策详情</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['ID', selected.id],
                ['时间', new Date(selected.timestamp).toLocaleString('zh-CN')],
                ['任务类型', selected.taskType],
                ['Provider', selected.selectedProvider],
                ['模型', selected.selectedModel],
                ['决策原因', selected.decisionReason],
                ['预估成本', `$${(selected.estimatedCost / 100).toFixed(6)}`],
                ['实际成本', selected.actualCost !== null ? `$${(selected.actualCost / 100).toFixed(6)}` : 'N/A'],
                ['上下文大小', `${selected.contextSize.toLocaleString()} tokens`],
                ['代码复杂度', selected.codeComplexity !== null ? `${selected.codeComplexity}/100` : 'N/A'],
                ['Extended Thinking', selected.usesExtendedThinking ? '是' : '否'],
                ['Prompt Caching', selected.usesPromptCaching ? '是' : '否'],
                ['手动覆盖', selected.manualOverride ? '是' : '否'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-400 w-28 shrink-0">{k}</span>
                  <span className="text-slate-200 break-all">{v}</span>
                </div>
              ))}
              {selected.promptPreview && (
                <div>
                  <div className="text-slate-400 mb-1">提示预览</div>
                  <div className="bg-slate-800 rounded p-2 text-xs text-slate-300 max-h-24 overflow-y-auto">{selected.promptPreview}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
