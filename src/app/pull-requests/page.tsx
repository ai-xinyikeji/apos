'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  GitPullRequest, 
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
  Code
} from 'lucide-react';
import { cn, translatePrototypeStatus } from '@/lib/utils';
import { MarkdownViewer } from '@/components/ui/markdown-viewer';

interface PullRequest {
  id: number;
  name: string;
  description: string;
  branchName: string;
  status: string; // 'generated' | 'pr_created' | 'merged' | 'closed'
  commitHash: string | null;
  prNumber: number | null;
  prUrl: string | null;
  createdAt: string;
  updatedAt: string;
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

export default function PullRequestsPage() {
  const [prList, setPrList] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Review Status
  const [runningId, setRunningId] = useState<number | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceLog[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  
  // Reports cache
  const [reports, setReports] = useState<Record<string, { report: string | null; createdAt: string }>>({});
  const [expandedPrId, setExpandedPrId] = useState<number | null>(null);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  async function loadPullRequests() {
    try {
      const res = await fetch('/api/pull-requests');
      if (res.ok) {
        const data = await res.json();
        setPrList(data);
      }
    } catch (err) {
      console.error('Failed to load pull requests:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPullRequests();
  }, []);

  // Poll for Review Bot Traces
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
              setRunningId(null);
              setActiveRunId(null);
              loadPullRequests();
              
              // Refresh report for the active PR if it's currently expanded
              const activePR = prList.find(p => p.id === runningId);
              if (activePR) {
                fetchReport(activePR.branchName);
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
  }, [activeRunId]);

  // Scroll to bottom of agent console log
  useEffect(() => {
    if (showConsole && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [traces, showConsole]);

  const fetchReport = async (branchName: string) => {
    try {
      const res = await fetch(`/api/pull-requests/report?branchName=${branchName}`);
      if (res.ok) {
        const data = await res.json();
        setReports(prev => ({
          ...prev,
          [branchName]: {
            report: data.report,
            createdAt: data.createdAt
          }
        }));
      }
    } catch (err) {
      console.error('Failed to fetch review report:', err);
    }
  };

  const handleRunReview = async (protoId: number, branchName: string, prNumber: number | null) => {
    setRunningId(protoId);
    setTraces([]);
    setShowConsole(true);

    try {
      const res = await fetch('/api/pull-requests/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prototypeId: protoId, branchName, prNumber }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveRunId(data.runId);
      } else {
        setRunningId(null);
      }
    } catch (err) {
      console.error('Failed to run review:', err);
      setRunningId(null);
    }
  };

  const toggleExpand = (proto: PullRequest) => {
    const isExpanded = expandedPrId === proto.id;
    if (!isExpanded) {
      setExpandedPrId(proto.id);
      if (!reports[proto.branchName]) {
        fetchReport(proto.branchName);
      }
    } else {
      setExpandedPrId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm text-slate-100">
            监控当前合并分支，自动分析代码改动，防范数据库直接写入、安全密钥泄漏等风险。
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadPullRequests} 
          disabled={loading}
          className="border-slate-700/80 bg-slate-900/50 text-slate-200 hover:bg-slate-800 rounded-xl"
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> 刷新 PR 列表
        </Button>
      </div>

      <div className="space-y-6">
        {/* Active Console Panel */}
        {showConsole && (
          <Card className="border-slate-700/80 bg-slate-950 text-slate-100 overflow-hidden shadow-2xl">
            <div className="flex h-10 items-center justify-between border-b border-slate-700/80 px-4 bg-slate-950/90">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-bold font-mono">Review Bot 执行控制台</span>
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
                  正在初始化 Review Bot 并提取代码改动差异...
                </div>
              )}
              <div ref={consoleEndRef} />
            </div>
          </Card>
        )}

        {/* PR List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
          </div>
        ) : prList.length > 0 ? (
          <div className="space-y-4">
            {prList.map((pr) => {
              const isExpanded = expandedPrId === pr.id;
              const isRunning = runningId === pr.id;
              const reportInfo = reports[pr.branchName];

              return (
                <Card key={pr.id} className="border-slate-700/80 bg-slate-900/10 backdrop-blur-sm overflow-hidden hover:border-slate-700/50 transition-colors">
                  <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    {/* PR Title & Metadata */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="h-4.5 w-4.5 text-cyan-400" />
                        <h4 className="font-semibold text-slate-100 text-base">
                          {pr.prNumber ? `#${pr.prNumber} ` : ''}{pr.name}
                        </h4>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${
                          pr.status === 'merged' 
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : pr.status === 'closed'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : pr.status === 'pr_created'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-800 text-slate-100 border-slate-700/50'
                        }`}>
                          {translatePrototypeStatus(pr.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200 font-mono">
                        <span>Head: {pr.branchName}</span>
                        <span>Base: main</span>
                      </div>
                    </div>

                    {/* Action Panel */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Run Audit */}
                      <Button
                        size="sm"
                        disabled={isRunning}
                        onClick={() => handleRunReview(pr.id, pr.branchName, pr.prNumber)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs"
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            正在审计...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            自动审计
                          </>
                        )}
                      </Button>

                      {/* View Link */}
                      {pr.prUrl && (
                        <a
                          href={pr.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 px-3 py-1.5 text-xs text-slate-200 bg-slate-950 hover:bg-slate-900"
                        >
                          在 GitHub 查看 <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {/* Expand / Collapse */}
                      <button
                        onClick={() => toggleExpand(pr)}
                        className="p-1.5 rounded-lg border border-slate-700/80 hover:bg-slate-800 text-slate-100 hover:text-slate-100"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Report Panel */}
                  {isExpanded && (
                    <div className="border-t border-slate-700/80/40 p-5 bg-slate-950/40 space-y-5">
                      {/* Original description */}
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-200 block uppercase">原型改动需求:</span>
                        <p className="text-slate-200 text-sm">{pr.description}</p>
                      </div>

                      {/* Code Review Report */}
                      <div className="border-t border-slate-700/80/40 pt-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-slate-200 uppercase flex items-center gap-1">
                            <Code className="h-3.5 w-3.5 text-cyan-400" />
                            AI 代码安全审计报告:
                          </span>
                          {reportInfo?.createdAt && (
                            <span className="text-[10px] text-slate-200 flex items-center gap-1 font-mono">
                              <Clock className="h-3 w-3" />
                              审计时间: {new Date(reportInfo.createdAt).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {reportInfo ? (
                          reportInfo.report ? (
                            <MarkdownViewer content={reportInfo.report} />
                          ) : (
                            <div className="rounded-xl border border-slate-700/80/60 bg-slate-900/10 p-5 text-center text-xs text-slate-200 italic">
                              本分支暂无安全审计日志。请点击右侧“自动审计”按钮，调起 Review Agent。
                            </div>
                          )
                        ) : (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 text-cyan-500 animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 rounded-2xl border border-dashed border-slate-700/80 text-slate-200 flex flex-col items-center gap-3">
            <GitPullRequest className="h-10 w-10 text-slate-700" />
            <span>目前没有已生成代码或已提报 PR 的分支。请前往“原型开发”创建原型。</span>
          </div>
        )}
      </div>
    </div>
  );
}
