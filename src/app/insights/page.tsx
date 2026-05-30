'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn, translateSource, translateSentiment, translateSignalStatus } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { 
  Lightbulb, 
  Terminal, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  LineChart,
  UserCheck
} from 'lucide-react';
import Link from 'next/link';
import { MarkdownViewer } from '@/components/ui/markdown-viewer';

interface FeedbackSignal {
  id: number;
  source: string; // 'amplitude' | 'zendesk' | 'competitor'
  title: string;
  content: string;
  url: string | null;
  status: string; // 'pending' | 'analyzed'
  sentiment: string | null; // 'positive' | 'neutral' | 'negative'
  createdAt: string;
  updatedAt: string;
}

interface InsightReport {
  filename: string;
  title: string;
  content: string;
  createdAt: string;
}

interface TraceLog {
  id: number;
  agentName: string;
  runId: string;
  step: string;
  status: string;
  message: string;
  details: string | null;
  createdAt: string;
}

export default function InsightsPage() {
  const { addToast } = useToast();
  const [signals, setSignals] = useState<FeedbackSignal[]>([]);
  const [reports, setReports] = useState<InsightReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Agent triggers
  const [runningAgent, setRunningAgent] = useState<'collector' | 'generator' | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceLog[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  
  // UI Expand state
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  async function loadInsightsData() {
    try {
      const res = await fetch('/api/insights');
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals || []);
        setReports(data.reports || []);
      } else {
        const error = await res.json();
        addToast({
          type: 'error',
          title: '加载失败',
          description: error.error || '无法加载洞察数据',
        });
      }
    } catch (err) {
      console.error('Failed to load insights data:', err);
      addToast({
        type: 'error',
        title: '网络错误',
        description: '无法连接到服务器，请检查网络连接',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInsightsData();
  }, []);

  // Poll for agent run traces
  useEffect(() => {
    if (!activeRunId) return;

    async function fetchTraces() {
      try {
        const res = await fetch(`/api/traces?runId=${activeRunId}`);
        if (res.ok) {
          const data = await res.json();
          setTraces(data);

          if (data.length > 0) {
            const lastTrace = data[data.length - 1];
            if (
              (lastTrace.step === 'Success' && lastTrace.status === 'success') ||
              (lastTrace.step === 'Failed' && lastTrace.status === 'error')
            ) {
              setRunningAgent(null);
              setActiveRunId(null);
              loadInsightsData();
              
              // Show completion toast
              if (lastTrace.status === 'success') {
                addToast({
                  type: 'success',
                  title: 'Agent 执行完成',
                  description: lastTrace.message,
                  duration: 7000,
                });
              } else if (lastTrace.status === 'error') {
                addToast({
                  type: 'error',
                  title: 'Agent 执行失败',
                  description: lastTrace.message,
                  duration: 10000,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch traces:', err);
      }
    }

    fetchTraces();
    const interval = setInterval(fetchTraces, 2000);
    return () => clearInterval(interval);
  }, [activeRunId, addToast]);

  // Scroll to bottom of agent console log
  useEffect(() => {
    if (showConsole && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [traces, showConsole]);

  const handleRunCollector = async () => {
    setRunningAgent('collector');
    setTraces([]);
    setShowConsole(true);

    try {
      const res = await fetch('/api/insights', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActiveRunId(data.runId);
        
        addToast({
          type: 'info',
          title: 'Agent 已启动',
          description: '信号收集 Agent 正在运行中...',
        });
      } else {
        const error = await res.json();
        setRunningAgent(null);
        
        addToast({
          type: 'error',
          title: 'Agent 启动失败',
          description: error.error || '无法启动信号收集 Agent',
        });
      }
    } catch (err) {
      console.error('Failed to run signal collector:', err);
      setRunningAgent(null);
      
      addToast({
        type: 'error',
        title: '网络错误',
        description: '无法连接到服务器，请检查网络连接',
      });
    }
  };

  const handleRunGenerator = async () => {
    setRunningAgent('generator');
    setTraces([]);
    setShowConsole(true);

    try {
      const res = await fetch('/api/insights/report', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActiveRunId(data.runId);
        
        addToast({
          type: 'info',
          title: 'Agent 已启动',
          description: '报告生成 Agent 正在运行中...',
        });
      } else {
        const error = await res.json();
        setRunningAgent(null);
        
        addToast({
          type: 'error',
          title: 'Agent 启动失败',
          description: error.error || '无法启动报告生成 Agent',
        });
      }
    } catch (err) {
      console.error('Failed to run report generator:', err);
      setRunningAgent(null);
      
      addToast({
        type: 'error',
        title: '网络错误',
        description: '无法连接到服务器，请检查网络连接',
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm text-slate-100">
            聚合分析来自 Amplitude 的埋点异常、Zendesk 的工单反馈，以及对竞品动态的监测，形成周度产品规划洞察。
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <Button 
            onClick={handleRunCollector}
            disabled={!!runningAgent}
            className="bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-100 rounded-xl text-xs font-semibold"
          >
            {runningAgent === 'collector' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                正在采集...
              </>
            ) : (
              '采集最新反馈'
            )}
          </Button>

          <Button 
            onClick={handleRunGenerator}
            disabled={!!runningAgent || signals.filter(s => s.status === 'pending').length === 0}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/10"
          >
            {runningAgent === 'generator' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                正在合成...
              </>
            ) : (
              '汇总生成周报'
            )}
          </Button>
        </div>
      </div>

      {/* Active Console Panel */}
      {showConsole && (
        <Card className="border-slate-700/80 bg-slate-950 text-slate-100 overflow-hidden shadow-2xl">
          <div className="flex h-10 items-center justify-between border-b border-slate-700/80 px-4 bg-slate-950/90">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-blue-400 animate-pulse" />
              <span className="text-xs font-bold font-mono">Agent 执行控制台</span>
            </div>
            <button 
              onClick={() => setShowConsole(false)}
              className="text-slate-100 hover:text-slate-100 text-xs"
            >
              隐藏
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-4 font-mono text-xs space-y-2 bg-slate-950">
            {traces.length > 0 ? (
              traces.map((trace) => (
                <div key={trace.id} className="flex items-start gap-2.5">
                  <span className="text-slate-100">[{new Date(trace.createdAt).toLocaleTimeString()}]</span>
                  <span className={
                    trace.status === 'success' 
                      ? 'text-emerald-400 font-bold' 
                      : trace.status === 'error'
                      ? 'text-rose-400 font-bold'
                      : trace.status === 'warning'
                      ? 'text-amber-400'
                      : 'text-sky-400'
                  }>
                    {trace.step}
                  </span>
                  <span className="text-slate-200">{trace.message}</span>
                </div>
              ))
            ) : (
              <div className="text-slate-100 text-center py-4 italic animate-pulse">
                正在请求 Agent，调起本地数据分析流...
              </div>
            )}
            <div ref={consoleEndRef} />
          </div>
        </Card>
      )}

      {/* Main Tabs */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="reports" className="space-y-6">
          <TabsList className="bg-slate-950 border border-slate-700/80/60 p-1 rounded-xl">
            <TabsTrigger value="reports" className="rounded-lg text-xs font-semibold px-4 py-2">
              周度分析报告 ({reports.length})
            </TabsTrigger>
            <TabsTrigger value="signals" className="rounded-lg text-xs font-semibold px-4 py-2">
              用户反馈信号 ({signals.length})
            </TabsTrigger>
          </TabsList>

          {/* Weekly Reports Tab */}
          <TabsContent value="reports" className="space-y-4 outline-none">
            {reports.length > 0 ? (
              reports.map((rep) => {
                const isExpanded = expandedReport === rep.filename;
                return (
                  <Card key={rep.filename} className="border-slate-700/80 bg-slate-900/10 hover:border-slate-700/50 transition-colors">
                    <div className="p-5 flex justify-between items-center">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-slate-100 text-base flex items-center gap-2">
                          <Sparkles className="h-4.5 w-4.5 text-amber-400" />
                          {rep.title}
                        </h4>
                        <p className="text-xs text-slate-200 font-mono flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          发布时间: {new Date(rep.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => setExpandedReport(isExpanded ? null : rep.filename)}
                        className="p-1.5 rounded-lg border border-slate-700/80 hover:bg-slate-800 text-slate-100 hover:text-slate-100"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-700/80/40 p-6 bg-slate-950/40 space-y-6">
                        {/* Report content */}
                        <MarkdownViewer content={rep.content} />
                        
                        {/* Closing Loop Action */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/80/40">
                          <Link 
                            href={`/prototypes?name=${encodeURIComponent('根据周报原型优化')}&desc=${encodeURIComponent('请根据周报中的建议，创建相关组件进行优化。')}`}
                            className={cn(
                              buttonVariants({ variant: 'outline' }),
                              "border-slate-700/80 bg-slate-900/50 text-slate-200 hover:bg-slate-800 rounded-xl text-xs"
                            )}
                          >
                            <Terminal className="mr-1.5 h-3.5 w-3.5" />
                            一键启动原型建议
                          </Link>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            ) : (
              <Card className="border-slate-700/80 bg-slate-900/10 p-12 text-center text-slate-200 flex flex-col items-center gap-3">
                <Sparkles className="h-8 w-8 text-slate-700 animate-pulse" />
                <span>暂无分析周报。点击右上角“汇总生成周报”聚合分析反馈信号。</span>
              </Card>
            )}
          </TabsContent>

          {/* Feedback Signals Tab */}
          <TabsContent value="signals" className="outline-none">
            {signals.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {signals.map((sig) => (
                  <Card key={sig.id} className="border-slate-700/80 bg-slate-900/10 flex flex-col justify-between hover:border-slate-700/50 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium border ${
                          sig.source === 'amplitude'
                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                            : sig.source === 'zendesk'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {translateSource(sig.source)}
                        </span>
                        
                        {/* Sentiment badge */}
                        {sig.sentiment && (
                          <span className={cn(
                            "flex items-center gap-1 text-[9px] font-semibold",
                            sig.sentiment === 'positive' && 'text-emerald-400',
                            sig.sentiment === 'negative' && 'text-rose-400',
                            sig.sentiment === 'neutral' && 'text-slate-100'
                          )}>
                            {sig.sentiment === 'positive' && <TrendingUp className="h-3 w-3" />}
                            {sig.sentiment === 'negative' && <TrendingDown className="h-3 w-3" />}
                            {sig.sentiment === 'neutral' && <LineChart className="h-3 w-3" />}
                            {translateSentiment(sig.sentiment)}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-slate-100 text-sm font-semibold mt-3 line-clamp-1">{sig.title}</CardTitle>
                    </CardHeader>
                    
                    <CardContent className="pb-4">
                      <p className="text-slate-100 text-xs leading-relaxed line-clamp-4">{sig.content}</p>
                    </CardContent>
                    
                    <CardFooter className="pt-3 border-t border-slate-900 flex justify-between items-center text-[10px] text-slate-200 font-mono">
                      <span>状态: {translateSignalStatus(sig.status)}</span>
                      <span>{new Date(sig.createdAt).toLocaleDateString()}</span>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-slate-700/80 bg-slate-900/10 p-12 text-center text-slate-200 flex flex-col items-center gap-3">
                <Lightbulb className="h-8 w-8 text-slate-700" />
                <span>暂无用户信号。点击右上角“采集最新反馈”拉取模拟数据。</span>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
