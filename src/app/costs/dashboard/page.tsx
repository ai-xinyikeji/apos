'use client';

/**
 * /costs/dashboard - 成本仪表板
 *
 * 展示：
 * - 总成本概览
 * - 按 Provider 分组（饼图文字版）
 * - 按任务类型分组（柱状图文字版）
 * - 成本趋势
 * - 预算进度
 * - 优化建议
 *
 * 对应需求：Requirement 8
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingDown, BarChart3, AlertTriangle, Download, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostSummary {
  totalCost: number;
  cacheSavings: number;
  byProvider: Record<string, number>;
  byTaskType: Record<string, number>;
  trend: Array<{ date: string; cost: number }>;
  period: string;
}

interface BudgetStatus {
  monthly: { limit: number; current: number; percentage: number } | null;
  daily:   { limit: number; current: number; percentage: number } | null;
  alerts: Array<{ id: string; severity: string; period: string; threshold: number }>;
}

type Period = 'today' | 'week' | 'month';

// ─── Sub-components ───────────────────────────────────────────────────────────

function CostOverview({ summary, budget }: { summary: CostSummary; budget: BudgetStatus }) {
  const savingsPct = summary.totalCost > 0
    ? ((summary.cacheSavings / (summary.totalCost + summary.cacheSavings)) * 100).toFixed(1)
    : '0.0';

  const budgetPct = budget.monthly?.percentage ?? 0;
  const budgetColor = budgetPct >= 100 ? 'text-red-500' : budgetPct >= 80 ? 'text-yellow-500' : 'text-green-500';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">总成本</CardTitle>
          <DollarSign className="h-4 w-4 text-cyan-400" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">${summary.totalCost.toFixed(4)}</div>
          <p className="text-xs text-slate-400 mt-1">本{summary.period === 'today' ? '日' : summary.period === 'week' ? '周' : '月'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">缓存节省</CardTitle>
          <TrendingDown className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-500">${summary.cacheSavings.toFixed(4)}</div>
          <p className="text-xs text-slate-400 mt-1">节省 {savingsPct}%</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">预算使用</CardTitle>
          <AlertTriangle className={`h-4 w-4 ${budgetColor}`} />
        </CardHeader>
        <CardContent>
          {budget.monthly ? (
            <>
              <div className={`text-3xl font-bold ${budgetColor}`}>{budgetPct}%</div>
              <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                <div
                  className={`h-2 rounded-full transition-all ${budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">${budget.monthly.current.toFixed(2)} / ${budget.monthly.limit.toFixed(2)}</p>
            </>
          ) : (
            <div className="text-sm text-slate-400">未设置预算</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderBreakdown({ byProvider }: { byProvider: Record<string, number> }) {
  const total = Object.values(byProvider).reduce((s, v) => s + v, 0);
  const colors: Record<string, string> = {
    anthropic: 'bg-blue-500',
    openai: 'bg-green-500',
    google: 'bg-yellow-500',
    lmstudio: 'bg-orange-500',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          按 Provider 分组
        </CardTitle>
      </CardHeader>
      <CardContent>
        {Object.entries(byProvider).length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">暂无数据</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(byProvider)
              .sort(([, a], [, b]) => b - a)
              .map(([provider, cost]) => {
                const pct = total > 0 ? (cost / total) * 100 : 0;
                return (
                  <div key={provider}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize font-medium">{provider}</span>
                      <span>${cost.toFixed(4)} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${colors[provider] ?? 'bg-slate-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskTypeBreakdown({ byTaskType }: { byTaskType: Record<string, number> }) {
  const total = Object.values(byTaskType).reduce((s, v) => s + v, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>按任务类型分组</CardTitle>
      </CardHeader>
      <CardContent>
        {Object.entries(byTaskType).length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">暂无数据</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(byTaskType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, cost]) => {
                const pct = total > 0 ? (cost / total) * 100 : 0;
                return (
                  <div key={type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{type}</span>
                      <span>${cost.toFixed(4)} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendChart({ trend }: { trend: Array<{ date: string; cost: number }> }) {
  const maxCost = Math.max(...trend.map(t => t.cost), 0.0001);

  return (
    <Card>
      <CardHeader>
        <CardTitle>成本趋势</CardTitle>
      </CardHeader>
      <CardContent>
        {trend.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">暂无趋势数据</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {trend.slice(-30).map(({ date, cost }) => (
              <div key={date} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full bg-cyan-500 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                  style={{ height: `${(cost / maxCost) * 100}%`, minHeight: '2px' }}
                  title={`${date}: $${cost.toFixed(4)}`}
                />
                <span className="text-xs text-slate-500 hidden group-hover:block absolute -bottom-5 whitespace-nowrap">
                  {date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OptimizationSuggestions({ summary }: { summary: CostSummary }) {
  const suggestions: string[] = [];

  const anthropicCost = summary.byProvider['anthropic'] ?? 0;
  const ollamaCost    = summary.byProvider['ollama'] ?? summary.byProvider['lmstudio'] ?? 0;
  const summarizeCost = summary.byTaskType['summarize'] ?? 0;
  const reviewCost    = summary.byTaskType['review'] ?? 0;

  if (anthropicCost > 1 && ollamaCost === 0) {
    suggestions.push('启用 Ollama 本地模型可免费处理简单任务，预计节省 20-40%');
  }
  if (summarizeCost > 0.5) {
    suggestions.push(`将 summarize 任务切换到 Gemini Flash，预计节省 $${(summarizeCost * 0.97).toFixed(4)}/月`);
  }
  if (reviewCost > 0.5) {
    suggestions.push(`将 review 任务切换到 Gemini Flash，预计节省 $${(reviewCost * 0.75).toFixed(4)}/月`);
  }
  if (summary.cacheSavings === 0 && summary.totalCost > 0) {
    suggestions.push('启用 Prompt Caching 可节省重复提示的成本（最高 90% 折扣）');
  }

  if (suggestions.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>💡 优化建议</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {suggestions.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="text-cyan-400 mt-0.5">→</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CostDashboardPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, budRes] = await Promise.all([
        fetch(`/api/costs/summary?period=${period}`),
        fetch('/api/costs/budget'),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (budRes.ok) setBudget(await budRes.json());
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!summary) return;
    const rows = [
      ['Provider', 'Cost'],
      ...Object.entries(summary.byProvider).map(([k, v]) => [k, v.toFixed(6)]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `costs-${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">💰 成本仪表板</h1>
          <p className="text-slate-400 text-sm mt-1">实时追踪 LLM API 调用成本</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          {(['today', 'week', 'month'] as Period[]).map(p => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === 'today' ? '今日' : p === 'week' ? '本周' : '本月'}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!summary}>
            <Download className="h-4 w-4 mr-1" />
            导出 CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">加载中...</div>
      ) : summary && budget ? (
        <>
          <CostOverview summary={summary} budget={budget} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <ProviderBreakdown byProvider={summary.byProvider} />
            <TaskTypeBreakdown byTaskType={summary.byTaskType} />
          </div>
          <TrendChart trend={summary.trend} />
          <OptimizationSuggestions summary={summary} />
        </>
      ) : (
        <div className="text-center text-slate-400 py-16">加载失败，请刷新重试</div>
      )}
    </div>
  );
}
