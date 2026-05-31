'use client';

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Activity, 
  Clock, 
  Cpu, 
  ArrowLeft, 
  Coins, 
  DollarSign, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  ListTodo
} from 'lucide-react';
import Link from 'next/link';

interface RunItem {
  runId: string;
  agentName: string;
  createdAt: string;
  status: string; // 'success' | 'error' | 'info'
  tokens: { prompt: number; completion: number; total: number };
  steps: Array<{
    id: number;
    step: string;
    status: string;
    message: string;
    details: string | null;
    createdAt: string;
  }>;
}

interface SummaryData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export default function UsagePage() {
  const [summary, setSummary] = useState<SummaryData>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUSD: 0
  });
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  async function loadUsageData() {
    try {
      const res = await fetch('/api/settings/usage');
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setRuns(data.runs || []);
      }
    } catch (err) {
      console.error('Failed to load usage details:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsageData();
  }, []);

  const toggleExpand = (runId: string) => {
    setExpandedRunId(prev => (prev === runId ? null : runId));
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Link 
          href="/settings"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            "text-slate-100 hover:text-slate-100 rounded-lg"
          )}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-100 font-sans flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            Agent 额度与历史追踪
          </h2>
          <p className="text-sm text-slate-100">
            查看您本地大模型的运行历史、Token 消耗统计和估计的 API 花费。
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Tokens */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-200 text-xs flex items-center gap-1">
              <Coins className="h-3.5 w-3.5 text-cyan-400" />
              总 Token 消耗
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-100 font-mono">
              {summary.totalTokens.toLocaleString()}
            </span>
          </CardContent>
        </Card>

        {/* Input Tokens */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-200 text-xs flex items-center gap-1">
              输入 (Prompt) Tokens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-200 font-mono">
              {summary.promptTokens.toLocaleString()}
            </span>
          </CardContent>
        </Card>

        {/* Output Tokens */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-200 text-xs flex items-center gap-1">
              输出 (Completion) Tokens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-200 font-mono">
              {summary.completionTokens.toLocaleString()}
            </span>
          </CardContent>
        </Card>

        {/* Estimated Cost */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-200 text-xs flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              预估花费 (USD)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              ${summary.estimatedCostUSD.toFixed(4)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Execution History */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-cyan-400" />
          Agent 执行历史序列
        </h3>

        {runs.length > 0 ? (
          <div className="space-y-4">
            {runs.map((run) => {
              const isExpanded = expandedRunId === run.runId;
              
              return (
                <Card key={run.runId} className="border-slate-700/80 bg-slate-900/10 backdrop-blur-sm overflow-hidden hover:border-slate-700/50 transition-colors">
                  <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    {/* Run Header */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        {run.status === 'success' ? (
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                        ) : run.status === 'error' ? (
                          <XCircle className="h-4.5 w-4.5 text-rose-400" />
                        ) : (
                          <Loader2 className="h-4.5 w-4.5 text-amber-400 animate-spin" />
                        )}
                        <h4 className="font-semibold text-slate-100 text-sm">
                          {run.agentName}
                        </h4>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono border ${
                          run.status === 'success' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : run.status === 'error'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                        }`}>
                          {run.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                        <span>Run ID: {run.runId.slice(0, 8)}...</span>
                        {run.tokens.total > 0 && (
                          <span className="text-slate-100 font-semibold">
                            Tokens: {run.tokens.total.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand Trigger */}
                    <button
                      onClick={() => toggleExpand(run.runId)}
                      className="p-1.5 rounded-lg border border-slate-700/80 hover:bg-slate-800 text-slate-100 hover:text-slate-100 shrink-0"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Expanded Logs Panel */}
                  {isExpanded && (
                    <div className="border-t border-slate-700/80/40 bg-slate-950/50 p-5 font-mono text-xs space-y-3.5 max-h-80 overflow-y-auto">
                      {run.steps.map((step) => (
                        <div key={step.id} className="relative pl-5 border-l border-slate-700/80 last:border-0 pb-1">
                          {/* Indicator dot */}
                          <span className={`absolute -left-1 top-1 h-2 w-2 rounded-full ${
                            step.status === 'error'
                              ? 'bg-rose-500'
                              : step.status === 'success'
                              ? 'bg-emerald-500'
                              : step.status === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-cyan-500'
                          }`}></span>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-4 text-slate-200">
                              <span className="font-semibold text-slate-200">{step.step}</span>
                              <span>{new Date(step.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-slate-100 leading-normal">{step.message}</p>
                            {step.details && (
                              <pre className="mt-2 rounded-lg border border-slate-700/80 bg-slate-950 p-3 text-[10px] text-slate-100 overflow-x-auto max-w-full whitespace-pre-wrap leading-relaxed">
                                {step.details}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 rounded-2xl border border-dashed border-slate-700/80 text-slate-200 flex flex-col items-center gap-3">
            <Cpu className="h-10 w-10 text-slate-700" />
            <span>暂无 Agent 执行历史记录。运行任何 Agent 任务后日志均会归档于此。</span>
          </div>
        )}
      </div>
    </div>
  );
}
