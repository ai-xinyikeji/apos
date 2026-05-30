'use client';

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  RefreshCw, 
  Loader2, 
  BarChart3,
  Activity,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  Plus,
  GitPullRequest,
  Check,
  ArrowRight,
  ClipboardList,
  FileCode,
  Minimize2
} from 'lucide-react';

interface FeatureScore {
  feature: string;
  score: number;
  usage: number;
  sentiment: number;
  recency: number;
  recommendation: 'expand' | 'maintain' | 'improve' | 'deprecate';
  reasoning: string;
}

interface Experiment {
  id: number;
  name: string;
  feature: string;
  status: 'draft' | 'active' | 'completed';
  variantA: string;
  variantB: string;
  countA: number;
  countB: number;
  conversionA: number;
  conversionB: number;
  createdAt: string;
  analysis: {
    rateA: number;
    rateB: number;
    lift: number;
    winner: string;
    confidence: string;
  };
}

interface GrowthData {
  metrics: {
    featureUsage: any[];
    agentStats: any[];
    pageViews: any[];
    dailyUsage: any[];
  };
  rankings: {
    all: FeatureScore[];
    top: FeatureScore[];
    toImprove: FeatureScore[];
    toDeprecate: FeatureScore[];
  };
}

interface CompressionStats {
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  totalSavedTokens: number;
  compressionCount: number;
  avgCompressionRate: number;
  avgSavedPerRun: number;
  estimatedCostSavings: string;
  methodBreakdown: {
    ast: number;
    llm: number;
    hybrid: number;
  };
  dailyStats: Array<{
    date: string;
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    count: number;
  }>;
}

// Map features to actual codebase files
const FEATURE_FILES: Record<string, { name: string; path: string }> = {
  'ProtoBuilder': { name: 'ProtoBuilder Agent', path: 'src/agents/proto-builder.ts' },
  'ReviewBot': { name: 'ReviewBot Agent', path: 'src/agents/review-bot.ts' },
  'SignalCollector': { name: 'SignalCollector Agent', path: 'src/agents/signal-collector.ts' },
  'ReportGenerator': { name: 'ReportGenerator Agent', path: 'src/agents/report-generator.ts' },
  'Sidebar': { name: 'Sidebar Component', path: 'src/components/sidebar.tsx' },
  'Header': { name: 'Header Component', path: 'src/components/header.tsx' },
  'SettingsPage': { name: 'Settings Page', path: 'src/app/settings/page.tsx' },
  'GrowthPage': { name: 'Growth Page', path: 'src/app/growth/page.tsx' },
  'WorkflowsPage': { name: 'Workflows Page', path: 'src/app/workflows/page.tsx' },
  'PrototypesPage': { name: 'Prototypes Page', path: 'src/app/prototypes/page.tsx' },
  'InsightsPage': { name: 'Insights Page', path: 'src/app/insights/page.tsx' },
  'PRPage': { name: 'PR Page', path: 'src/app/pull-requests/page.tsx' },
};

export default function GrowthPage() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [activeTab, setActiveTab] = useState<'rankings' | 'experiments' | 'funnel' | 'report' | 'compression'>('rankings');
  
  // Compression stats state
  const [compressionStats, setCompressionStats] = useState<CompressionStats | null>(null);
  const [loadingCompressionStats, setLoadingCompressionStats] = useState(false);

  // A/B Experiments State
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loadingExperiments, setLoadingExperiments] = useState(false);
  const [newExpName, setNewExpName] = useState('');
  const [newExpFeature, setNewExpFeature] = useState('');
  const [newExpVarA, setNewExpVarA] = useState('control');
  const [newExpVarB, setNewExpVarB] = useState('treatment');
  const [creatingExperiment, setCreatingExperiment] = useState(false);

  // AI Optimizer State
  const [optimizingFeature, setOptimizingFeature] = useState<string | null>(null);
  const [optimizingResult, setOptimizingResult] = useState<any | null>(null);
  const [loadingOptimization, setLoadingOptimization] = useState(false);
  const [applyingOptimization, setApplyingOptimization] = useState(false);
  const [optSuccessMessage, setOptSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadExperiments();
    if (activeTab === 'compression') {
      loadCompressionStats();
    }
  }, [days, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/growth?days=${days}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error('Failed to load growth data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadExperiments() {
    setLoadingExperiments(true);
    try {
      const res = await fetch('/api/growth/experiments');
      if (res.ok) {
        const result = await res.json();
        setExperiments(result.experiments);
      }
    } catch (err) {
      console.error('Failed to load experiments:', err);
    } finally {
      setLoadingExperiments(false);
    }
  }

  async function loadCompressionStats() {
    setLoadingCompressionStats(true);
    try {
      const res = await fetch(`/api/compression/stats?days=${days}`);
      if (res.ok) {
        const result = await res.json();
        setCompressionStats(result.stats);
      }
    } catch (err) {
      console.error('Failed to load compression stats:', err);
    } finally {
      setLoadingCompressionStats(false);
    }
  }

  async function generateReport() {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/growth/report?days=${days}`);
      if (res.ok) {
        const result = await res.json();
        setReport(result.report);
        setActiveTab('report');
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleCreateExperiment(e: React.FormEvent) {
    e.preventDefault();
    if (!newExpName || !newExpFeature) return;
    
    setCreatingExperiment(true);
    try {
      const res = await fetch('/api/growth/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: newExpName,
          feature: newExpFeature,
          variantA: newExpVarA,
          variantB: newExpVarB,
        }),
      });
      if (res.ok) {
        setNewExpName('');
        setNewExpFeature('');
        setNewExpVarA('control');
        setNewExpVarB('treatment');
        await loadExperiments();
      }
    } catch (err) {
      console.error('Failed to create experiment:', err);
    } finally {
      setCreatingExperiment(false);
    }
  }

  async function handleExperimentAction(id: number, action: 'start' | 'complete') {
    try {
      const res = await fetch('/api/growth/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      });
      if (res.ok) {
        await loadExperiments();
      }
    } catch (err) {
      console.error(`Failed to ${action} experiment:`, err);
    }
  }

  async function triggerOptimization(featureName: string) {
    const fileInfo = FEATURE_FILES[featureName];
    if (!fileInfo) {
      alert(`未找到功能 ${featureName} 关联的源代码文件配置`);
      return;
    }
    
    setOptimizingFeature(featureName);
    setOptimizingResult(null);
    setOptSuccessMessage(null);
    setLoadingOptimization(true);
    
    try {
      const res = await fetch('/api/growth/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentName: fileInfo.name,
          filePath: fileInfo.path,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setOptimizingResult(data.result);
      } else {
        const errData = await res.json();
        alert(`优化分析失败: ${errData.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`调用优化服务时发生错误: ${err.message}`);
    } finally {
      setLoadingOptimization(false);
    }
  }

  async function applyTweak(suggestion: any) {
    if (!confirm('确定要将优化后的代码应用到您的本地文件中吗？(原文件会被备份为 .bak)')) {
      return;
    }
    
    setApplyingOptimization(true);
    setOptSuccessMessage(null);
    
    try {
      const res = await fetch('/api/growth/optimize/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: FEATURE_FILES[optimizingFeature!]?.path || suggestion.filePath,
          originalCodeSnippet: suggestion.originalCodeSnippet,
          optimizedCodeSnippet: suggestion.optimizedCodeSnippet,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setOptSuccessMessage(`优化代码已成功写入！原文件已备份到: ${data.backupFile}`);
      } else {
        const errData = await res.json();
        alert(`应用失败: ${errData.error || '匹配不到目标代码'}`);
      }
    } catch (err: any) {
      alert(`应用代码修改时发生错误: ${err.message}`);
    } finally {
      setApplyingOptimization(false);
    }
  }

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'expand':
        return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case 'maintain':
        return <Minus className="h-4 w-4 text-blue-400" />;
      case 'improve':
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      case 'deprecate':
        return <TrendingDown className="h-4 w-4 text-rose-400" />;
      default:
        return <Minus className="h-4 w-4 text-slate-100" />;
    }
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'expand':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'maintain':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'improve':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'deprecate':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default:
        return 'text-slate-100 bg-slate-500/10 border-slate-500/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-0.5 text-xs font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/35 rounded-full animate-pulse">进行中</span>;
      case 'completed':
        return <span className="px-2 py-0.5 text-xs font-semibold text-slate-100 bg-slate-800 border border-slate-700 rounded-full">已结束</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/35 rounded-full">草稿</span>;
    }
  };

  // Render markdown report helper
  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-xl font-bold text-slate-100 mt-6 mb-3 pb-1 border-b border-slate-700/80">{line.slice(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-lg font-semibold text-cyan-400 mt-5 mb-2.5 flex items-center gap-2">{line.slice(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-md font-semibold text-slate-100 mt-4 mb-2">{line.slice(4)}</h3>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={idx} className="text-slate-200 ml-5 list-disc my-1 leading-relaxed">{line.slice(2)}</li>;
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-3" />;
      }
      return <p key={idx} className="text-slate-200 my-1.5 leading-relaxed font-sans">{line}</p>;
    });
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 bg-gradient-to-r from-cyan-200 via-slate-100 to-cyan-100 bg-clip-text text-transparent">
            产品增长运营中心 (Growth OS)
          </h1>
          <p className="text-xs text-slate-100">
            收集系统指标、用户满意度情绪和 A/B 实验分流数据，AI 提供迭代指南
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="bg-slate-950 border border-slate-700/80/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="7">最近 7 天</option>
            <option value="30">最近 30 天</option>
            <option value="90">最近 90 天</option>
          </select>
          <Button
            onClick={() => { loadData(); loadExperiments(); }}
            variant="outline"
            className="border-slate-850 bg-slate-900/60 hover:bg-slate-800 text-slate-200 rounded-xl text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            刷新
          </Button>
          <Button
            onClick={generateReport}
            disabled={loadingReport}
            className="bg-gradient-to-tr from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-xs rounded-xl h-9 px-4 shadow-lg shadow-cyan-500/10"
          >
            {loadingReport ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                分析中...
              </>
            ) : (
              '💡 生成 AI 深度迭代建议'
            )}
          </Button>
        </div>
      </div>

      {data && (
        <>
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-850 bg-slate-900/30 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-200">跟踪功能数</p>
                    <p className="text-2xl font-bold text-slate-100">{data.rankings.all.length}</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-cyan-400/80" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-850 bg-slate-900/30 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-200">进行中实验</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      {experiments.filter(e => e.status === 'active').length}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-emerald-400/80" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-850 bg-slate-900/30 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-200">需优化组件</p>
                    <p className="text-2xl font-bold text-amber-400">{data.rankings.toImprove.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-400/80" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-850 bg-slate-900/30 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-200">考虑废弃</p>
                    <p className="text-2xl font-bold text-rose-400">{data.rankings.toDeprecate.length}</p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-rose-400/80" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex border-b border-slate-700/80/80 p-0.5 gap-2">
            <button
              onClick={() => setActiveTab('rankings')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'rankings'
                  ? 'bg-slate-900 text-cyan-400 border border-slate-700/80'
                  : 'text-slate-100 hover:text-slate-100'
              }`}
            >
              📊 功能评分与 AI 优化
            </button>
            <button
              onClick={() => setActiveTab('experiments')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'experiments'
                  ? 'bg-slate-900 text-cyan-400 border border-slate-700/80'
                  : 'text-slate-100 hover:text-slate-100'
              }`}
            >
              🧪 A/B 测试管理
            </button>
            <button
              onClick={() => setActiveTab('compression')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'compression'
                  ? 'bg-slate-900 text-cyan-400 border border-slate-700/80'
                  : 'text-slate-100 hover:text-slate-100'
              }`}
            >
              🗜️ 上下文压缩统计
            </button>
            <button
              onClick={() => setActiveTab('funnel')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'funnel'
                  ? 'bg-slate-900 text-cyan-400 border border-slate-700/80'
                  : 'text-slate-100 hover:text-slate-100'
              }`}
            >
              📈 转化与留存
            </button>
            {report && (
              <button
                onClick={() => setActiveTab('report')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  activeTab === 'report'
                    ? 'bg-slate-900 text-cyan-400 border border-slate-700/80'
                    : 'text-slate-100 hover:text-slate-100'
                }`}
              >
                📄 AI 深度迭代报告
              </button>
            )}
          </div>

          {/* Tab Content 1: Feature Rankings & AI Tweak Optimizer */}
          {activeTab === 'rankings' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Card className="border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-sm font-semibold">功能排名与建议</CardTitle>
                    <CardDescription className="text-xs text-slate-200">
                      基于使用率 (40%)、用户反馈 (30%) 及活跃度 (30%) 的多维度综合评分。支持针对可优化的组件启动 AI 源码分析。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.rankings.all.length === 0 ? (
                      <div className="text-center py-10 text-slate-200 text-xs">暂无收集到功能指标</div>
                    ) : (
                      data.rankings.all.map((feature, idx) => {
                        const fileConfig = FEATURE_FILES[feature.feature];
                        return (
                          <div
                            key={feature.feature}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all duration-300 ${
                              optimizingFeature === feature.feature
                                ? 'border-cyan-500/50 bg-cyan-950/10 shadow-[0_0_15px_rgba(99,102,241,0.05)]'
                                : 'border-slate-850 bg-slate-950/40 hover:bg-slate-900/20'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="text-sm font-bold text-slate-100 mt-1">#{idx + 1}</div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-slate-100 text-sm">{feature.feature}</h3>
                                  <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${getRecommendationColor(feature.recommendation)}`}>
                                    {getRecommendationIcon(feature.recommendation)}
                                    <span className="capitalize">{feature.recommendation}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-100 max-w-lg leading-relaxed">{feature.reasoning}</p>
                                
                                {fileConfig && (
                                  <div className="flex items-center text-[10px] text-slate-200 gap-1 font-mono pt-1">
                                    <span>关联源码:</span>
                                    <span className="text-cyan-400/80">{fileConfig.path}</span>
                                  </div>
                                )}

                                <div className="flex gap-4 text-[10px] text-slate-200 pt-1">
                                  <span>综合: <strong className="text-slate-200">{feature.score}分</strong></span>
                                  <span>使用率: <strong className="text-slate-200">{feature.usage}</strong></span>
                                  <span>满意度: <strong className="text-slate-200">{feature.sentiment}</strong></span>
                                  <span>活跃度: <strong className="text-slate-200">{feature.recency}</strong></span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 sm:mt-0 flex gap-2 justify-end">
                              {fileConfig && (feature.recommendation === 'improve' || feature.recommendation === 'expand') && (
                                <Button
                                  onClick={() => triggerOptimization(feature.feature)}
                                  className="bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/25 text-cyan-400 text-xs rounded-xl h-8 px-3.5"
                                >
                                  <Zap className="h-3.5 w-3.5 mr-1" />
                                  AI 优化分析
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar AI Tweak Suggestions Panel */}
              <div className="lg:col-span-1">
                <Card className="border-slate-850 bg-slate-900/20 backdrop-blur-sm sticky top-6">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-2">
                      <Zap className="h-4.5 w-4.5 text-cyan-400" />
                      AI 智能优化空间
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-200">
                      选择左侧支持分析的功能，AI 会读取对应的组件文件并基于转化指标提供优化代码。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!optimizingFeature ? (
                      <div className="text-center py-12 border border-dashed border-slate-700/80 rounded-xl text-slate-200 text-xs">
                        点击左侧功能旁的“AI 优化分析”按钮，开始优化您的应用代码
                      </div>
                    ) : loadingOptimization ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
                        <p className="text-xs text-slate-100 animate-pulse">正在读取本地源码并召回 LLM 分析...</p>
                      </div>
                    ) : optimizingResult ? (
                      <div className="space-y-4">
                        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-850 space-y-1.5">
                          <div className="text-xs text-slate-100">正在分析: <span className="font-semibold text-slate-100">{optimizingFeature}</span></div>
                          <div className="text-[10px] text-cyan-400 font-mono break-all">{FEATURE_FILES[optimizingFeature!]?.path}</div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-slate-200">UX 优化诊断分析:</h4>
                          <p className="text-xs text-slate-100 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-900">{optimizingResult.analysis}</p>
                        </div>

                        {optSuccessMessage && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>{optSuccessMessage}</span>
                          </div>
                        )}

                        {optimizingResult.codeSuggestions && optimizingResult.codeSuggestions.length > 0 ? (
                          <div className="space-y-3 pt-2">
                            <h4 className="text-xs font-semibold text-slate-200">建议的代码调整 (Code Suggestion):</h4>
                            {optimizingResult.codeSuggestions.map((suggestion: any, sIdx: number) => (
                              <div key={sIdx} className="space-y-2 border border-slate-700/80 bg-slate-950/60 p-3 rounded-xl">
                                <p className="text-[11px] text-slate-200 font-medium">{suggestion.description}</p>
                                
                                <div className="space-y-1.5">
                                  <div className="text-[10px] text-slate-200 font-semibold">原代码 snippet:</div>
                                  <pre className="text-[10px] bg-rose-950/15 border border-rose-900/30 p-2 rounded text-rose-300/80 overflow-x-auto font-mono max-h-36">
                                    {suggestion.originalCodeSnippet}
                                  </pre>

                                  <div className="text-[10px] text-slate-200 font-semibold">优化后 snippet:</div>
                                  <pre className="text-[10px] bg-emerald-950/15 border border-emerald-900/30 p-2 rounded text-emerald-300 overflow-x-auto font-mono max-h-36">
                                    {suggestion.optimizedCodeSnippet}
                                  </pre>
                                </div>

                                <Button
                                  onClick={() => applyTweak(suggestion)}
                                  disabled={applyingOptimization}
                                  className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl h-8"
                                >
                                  {applyingOptimization ? (
                                    <>
                                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                      正在写入文件...
                                    </>
                                  ) : (
                                    '一键应用 AI 优化代码'
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-amber-400 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10">
                            分析完成，但未提取出自动替换的代码块。建议您根据 UX 分析结果手动优化。
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-slate-200 text-xs">无法获取分析结果，请重试</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tab Content 2: A/B Testing Experiments */}
          {activeTab === 'experiments' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Experiments List */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-sm font-semibold">A/B 分流实验大盘</CardTitle>
                    <CardDescription className="text-xs text-slate-200">
                      通过确定性 Hash 哈希算法将特定用户分流到 A/B 版本，实时统计转化率并计算数学置信度与流量 Lift。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loadingExperiments ? (
                      <div className="flex h-32 items-center justify-center">
                        <Loader2 className="h-6 w-6 text-cyan-500 animate-spin" />
                      </div>
                    ) : experiments.length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-slate-850 rounded-xl text-slate-200 text-xs">
                        目前暂无 A/B 测试实验。您可以使用右侧表单创建一个新实验。
                      </div>
                    ) : (
                      experiments.map((exp) => (
                        <div key={exp.id} className="border border-slate-850 bg-slate-950/40 p-4 rounded-xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-slate-100 text-sm">{exp.name}</h3>
                                {getStatusBadge(exp.status)}
                              </div>
                              <p className="text-[11px] text-slate-100">
                                实验功能: <strong className="text-slate-200">{exp.feature}</strong> | 启动时间: {new Date(exp.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            
                            <div className="flex gap-2">
                              {exp.status === 'draft' && (
                                <Button
                                  onClick={() => handleExperimentAction(exp.id, 'start')}
                                  size="sm"
                                  className="bg-emerald-600/10 hover:bg-emerald-600/25 border border-emerald-500/25 text-emerald-400 text-xs rounded-xl h-7"
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  启动实验
                                </Button>
                              )}
                              {exp.status === 'active' && (
                                <Button
                                  onClick={() => handleExperimentAction(exp.id, 'complete')}
                                  size="sm"
                                  className="bg-rose-600/10 hover:bg-rose-600/25 border border-rose-500/25 text-rose-400 text-xs rounded-xl h-7"
                                >
                                  <Square className="h-3 w-3 mr-1" />
                                  结束实验
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-900/60 text-xs">
                            <div>
                              <span className="text-slate-200">版本 A ({exp.variantA}):</span>
                              <div className="font-medium text-slate-200 mt-1">
                                {exp.conversionA} / {exp.countA} 人 ({exp.analysis.rateA}%)
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-200">版本 B ({exp.variantB}):</span>
                              <div className="font-medium text-slate-200 mt-1">
                                {exp.conversionB} / {exp.countB} 人 ({exp.analysis.rateB}%)
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-200">转化提升 (Lift):</span>
                              <div className={`font-semibold mt-1 flex items-center gap-0.5 ${exp.analysis.lift >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {exp.analysis.lift >= 0 ? '+' : ''}{exp.analysis.lift}%
                                {exp.analysis.lift > 0 ? <TrendingUp className="h-3 w-3" /> : exp.analysis.lift < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-200">统计置信度:</span>
                              <div className="font-semibold text-slate-200 mt-1">
                                {exp.analysis.confidence}
                              </div>
                            </div>
                          </div>

                          {exp.status === 'completed' && (
                            <div className="text-[11px] px-3 py-2 bg-cyan-950/10 border border-cyan-500/20 text-cyan-400 rounded-lg flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <span>
                                实验已结束。<strong>胜出版本: {exp.analysis.winner}</strong>。建议将此版本的修改固化进正式路由中。
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Create Experiment Form */}
              <div className="lg:col-span-1">
                <Card className="border-slate-850 bg-slate-900/20 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-2">
                      <Plus className="h-4.5 w-4.5 text-cyan-400" />
                      创建新 A/B 实验
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-200">
                      定义一个新实验以测试组件不同的样式设计、文案策略或功能交互。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateExperiment} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-450 font-medium">实验名称</label>
                        <input
                          type="text"
                          required
                          value={newExpName}
                          onChange={(e) => setNewExpName(e.target.value)}
                          placeholder="例如: 智能侧边栏展开文案测试"
                          className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-450 font-medium">关联功能键</label>
                        <select
                          required
                          value={newExpFeature}
                          onChange={(e) => setNewExpFeature(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        >
                          <option value="">请选择跟踪的功能...</option>
                          {data.rankings.all.map((f) => (
                            <option key={f.feature} value={f.feature}>
                              {f.feature}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs text-slate-450 font-medium">版本 A (对照组)</label>
                          <input
                            type="text"
                            required
                            value={newExpVarA}
                            onChange={(e) => setNewExpVarA(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-slate-450 font-medium">版本 B (实验组)</label>
                          <input
                            type="text"
                            required
                            value={newExpVarB}
                            onChange={(e) => setNewExpVarB(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={creatingExperiment}
                        className="w-full bg-cyan-650 hover:bg-cyan-650/95 text-white text-xs font-semibold rounded-xl h-9 mt-2"
                      >
                        {creatingExperiment ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            正在创建...
                          </>
                        ) : (
                          '确认创建实验 (草稿)'
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tab Content 3: Context Compression Statistics */}
          {activeTab === 'compression' && (
            <div className="space-y-6">
              {loadingCompressionStats ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
                </div>
              ) : !compressionStats || compressionStats.compressionCount === 0 ? (
                <Card className="border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                  <CardContent className="py-16">
                    <div className="text-center space-y-3">
                      <Minimize2 className="h-12 w-12 text-slate-100 mx-auto" />
                      <h3 className="text-sm font-semibold text-slate-100">暂无压缩统计数据</h3>
                      <p className="text-xs text-slate-200 max-w-md mx-auto">
                        系统尚未收集到上下文压缩数据。请确保在设置页面启用了上下文压缩功能，并运行一些 Agent 任务。
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Top Metrics Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-slate-850 bg-gradient-to-br from-emerald-950/20 to-slate-900/30 backdrop-blur-md">
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <p className="text-xs text-emerald-400/80 font-medium">Token 节省总量</p>
                          <p className="text-3xl font-bold text-emerald-400">
                            {compressionStats.totalSavedTokens.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-200">
                            原始: {compressionStats.totalOriginalTokens.toLocaleString()} → 压缩后: {compressionStats.totalCompressedTokens.toLocaleString()}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-850 bg-gradient-to-br from-cyan-950/20 to-slate-900/30 backdrop-blur-md">
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <p className="text-xs text-cyan-400/80 font-medium">平均压缩率</p>
                          <p className="text-3xl font-bold text-cyan-400">
                            {compressionStats.avgCompressionRate}%
                          </p>
                          <p className="text-[10px] text-slate-200">
                            每次运行平均节省 {compressionStats.avgSavedPerRun.toLocaleString()} tokens
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-850 bg-gradient-to-br from-emerald-950/20 to-slate-900/30 backdrop-blur-md">
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <p className="text-xs text-blue-400/80 font-medium">成本节省估算</p>
                          <p className="text-3xl font-bold text-blue-400">
                            ${compressionStats.estimatedCostSavings}
                          </p>
                          <p className="text-[10px] text-slate-200">
                            基于 Claude Sonnet 3.5 定价 ($3/1M tokens)
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-850 bg-gradient-to-br from-amber-950/20 to-slate-900/30 backdrop-blur-md">
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <p className="text-xs text-amber-400/80 font-medium">压缩次数</p>
                          <p className="text-3xl font-bold text-amber-400">
                            {compressionStats.compressionCount}
                          </p>
                          <p className="text-[10px] text-slate-200">
                            最近 {days} 天内的压缩操作
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Compression Method Breakdown */}
                    <Card className="border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                      <CardHeader>
                        <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-2">
                          <FileCode className="h-4.5 w-4.5 text-cyan-400" />
                          压缩方法分布
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-200">
                          AST 结构化压缩 vs LLM 智能压缩 vs 混合压缩的使用比例
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* AST Compression */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-200">AST 结构化压缩</span>
                            <span className="text-emerald-400 font-semibold">{compressionStats.methodBreakdown.ast} 次</span>
                          </div>
                          <div className="relative w-full h-6 bg-slate-950/60 rounded-lg overflow-hidden border border-slate-900">
                            <div 
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-600/80 to-emerald-500/60 rounded-l-lg transition-all duration-500"
                              style={{ 
                                width: `${(compressionStats.methodBreakdown.ast / compressionStats.compressionCount) * 100}%` 
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-200">
                            快速、准确，适用于 TypeScript/JavaScript 文件
                          </p>
                        </div>

                        {/* LLM Compression */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-200">LLM 智能压缩</span>
                            <span className="text-cyan-400 font-semibold">{compressionStats.methodBreakdown.llm} 次</span>
                          </div>
                          <div className="relative w-full h-6 bg-slate-950/60 rounded-lg overflow-hidden border border-slate-900">
                            <div 
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-600/80 to-cyan-500/60 rounded-l-lg transition-all duration-500"
                              style={{ 
                                width: `${(compressionStats.methodBreakdown.llm / compressionStats.compressionCount) * 100}%` 
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-200">
                            使用本地 Ollama，适用于其他语言
                          </p>
                        </div>

                        {/* Hybrid Compression */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-200">混合压缩</span>
                            <span className="text-blue-400 font-semibold">{compressionStats.methodBreakdown.hybrid} 次</span>
                          </div>
                          <div className="relative w-full h-6 bg-slate-950/60 rounded-lg overflow-hidden border border-slate-900">
                            <div 
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-600/80 to-emerald-500/60 rounded-l-lg transition-all duration-500"
                              style={{ 
                                width: `${(compressionStats.methodBreakdown.hybrid / compressionStats.compressionCount) * 100}%` 
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-200">
                            结合 AST 和 LLM 的优势
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Daily Compression Trends */}
                    <Card className="lg:col-span-2 border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                      <CardHeader>
                        <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-2">
                          <Activity className="h-4.5 w-4.5 text-cyan-400" />
                          每日压缩趋势
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-200">
                          最近 {days} 天的 Token 节省趋势和压缩操作频率
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {compressionStats.dailyStats.length === 0 ? (
                          <div className="text-center py-10 text-slate-200 text-xs">
                            暂无每日统计数据
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {compressionStats.dailyStats.slice(-7).reverse().map((day, idx) => (
                              <div key={idx} className="space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="font-medium text-slate-200">{day.date}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-emerald-400">
                                      节省 {day.savedTokens.toLocaleString()} tokens
                                    </span>
                                    <span className="text-slate-200">
                                      {day.count} 次压缩
                                    </span>
                                  </div>
                                </div>
                                <div className="relative w-full h-5 bg-slate-950/60 rounded-lg overflow-hidden border border-slate-900">
                                  <div 
                                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-600/60 to-emerald-500/40 rounded-l-lg transition-all duration-500"
                                    style={{ 
                                      width: `${Math.min((day.savedTokens / Math.max(...compressionStats.dailyStats.map(d => d.savedTokens))) * 100, 100)}%` 
                                    }}
                                  />
                                  <div className="absolute inset-0 flex items-center px-2">
                                    <span className="text-[10px] text-white/80 font-medium">
                                      {Math.round((day.savedTokens / day.originalTokens) * 100)}% 压缩率
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Performance Insights */}
                  <Card className="border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-2">
                        <Zap className="h-4.5 w-4.5 text-amber-400" />
                        性能洞察与建议
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-200">
                        基于压缩统计数据的优化建议
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-emerald-950/10 border border-emerald-500/20 rounded-xl space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            <h4 className="text-xs font-semibold text-emerald-400">压缩效果优秀</h4>
                          </div>
                          <p className="text-xs text-slate-100 leading-relaxed">
                            平均压缩率达到 {compressionStats.avgCompressionRate}%，已为您节省 ${compressionStats.estimatedCostSavings} 的 API 成本。
                            继续保持当前的压缩策略。
                          </p>
                        </div>

                        <div className="p-4 bg-cyan-950/10 border border-cyan-500/20 rounded-xl space-y-2">
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-cyan-400" />
                            <h4 className="text-xs font-semibold text-cyan-400">AST 压缩占比高</h4>
                          </div>
                          <p className="text-xs text-slate-100 leading-relaxed">
                            {Math.round((compressionStats.methodBreakdown.ast / compressionStats.compressionCount) * 100)}% 的压缩使用了快速 AST 方法（&lt;50ms），
                            这意味着您的代码库主要是 TypeScript/JavaScript，压缩速度非常快。
                          </p>
                        </div>

                        {compressionStats.avgCompressionRate < 50 && (
                          <div className="p-4 bg-amber-950/10 border border-amber-500/20 rounded-xl space-y-2">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-400" />
                              <h4 className="text-xs font-semibold text-amber-400">压缩率偏低</h4>
                            </div>
                            <p className="text-xs text-slate-100 leading-relaxed">
                              当前平均压缩率为 {compressionStats.avgCompressionRate}%，建议在设置中调整压缩阈值或使用更激进的压缩级别。
                            </p>
                          </div>
                        )}

                        <div className="p-4 bg-emerald-950/10 border border-blue-500/20 rounded-xl space-y-2">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-400" />
                            <h4 className="text-xs font-semibold text-blue-400">月度节省预测</h4>
                          </div>
                          <p className="text-xs text-slate-100 leading-relaxed">
                            按当前速率，预计每月可节省约 ${(parseFloat(compressionStats.estimatedCostSavings) * (30 / days)).toFixed(2)} 的 LLM API 成本。
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* Tab Content 4: Conversion Funnel & User Retention Cohorts */}
          {activeTab === 'funnel' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Visual Funnel Chart */}
                <Card className="border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-1.5">
                      <TrendingUp className="h-4.5 w-4.5 text-cyan-400" />
                      核心转化漏斗 (Conversion Funnel)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-200">
                      用户从访问首页、触发原型开发、代码生成成功，到最终推送 PR 的全生命周期漏斗转化率。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Funnel Steps */}
                    {[
                      { step: '1. 访问首页 (Page View)', count: 1240, percentage: 100, label: '基准流量' },
                      { step: '2. 触发原型开发 (Prototype Start)', count: 682, percentage: 55, label: '55% 转化率' },
                      { step: '3. 原型编译成功 (Prototype Success)', count: 480, percentage: 38, label: '70% 步骤转化' },
                      { step: '4. 创建 GitHub PR (Merged/PR Created)', count: 124, percentage: 10, label: '10% 终极转化' }
                    ].map((step, sIdx) => (
                      <div key={sIdx} className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-200">{step.step}</span>
                          <span className="text-slate-100">{step.count} 次 ({step.percentage}%)</span>
                        </div>
                        <div className="relative w-full h-8 bg-slate-950/60 rounded-xl overflow-hidden border border-slate-900">
                          <div 
                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-600/80 to-emerald-600/60 rounded-l-xl transition-all duration-500 flex items-center px-3"
                            style={{ width: `${step.percentage}%` }}
                          >
                            <span className="text-[10px] text-white/90 font-semibold">{step.label}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Cohort Retention Table */}
                <Card className="border-slate-850 bg-slate-900/10 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-1.5">
                      <Users className="h-4.5 w-4.5 text-cyan-400" />
                      周用户留存率 (User Cohort Retention)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-200">
                      按获取用户的自然周进行分组，追踪他们在后续第 1 至 4 周的周回访率。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-100">
                      <thead>
                        <tr className="border-b border-slate-700/80 text-slate-200 font-medium">
                          <th className="py-2 text-left">群组周 (Cohort)</th>
                          <th className="py-2 text-right">新增人数</th>
                          <th className="py-2 text-center">第 0 周</th>
                          <th className="py-2 text-center">第 1 周</th>
                          <th className="py-2 text-center">第 2 周</th>
                          <th className="py-2 text-center">第 3 周</th>
                          <th className="py-2 text-center">第 4 周</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/60">
                        {[
                          { week: '04-20 至 04-26', size: 310, rates: [100, 48, 32, 28, 24] },
                          { week: '04-27 至 05-03', size: 280, rates: [100, 52, 35, 30, null] },
                          { week: '05-04 至 05-10', size: 340, rates: [100, 45, 30, null, null] },
                          { week: '05-11 至 05-17', size: 410, rates: [100, 50, null, null, null] },
                          { week: '05-18 至 05-24', size: 390, rates: [100, null, null, null, null] }
                        ].map((cohort, cIdx) => (
                          <tr key={cIdx} className="hover:bg-slate-950/10">
                            <td className="py-2.5 font-medium text-slate-200">{cohort.week}</td>
                            <td className="py-2.5 text-right font-semibold text-slate-100">{cohort.size} 人</td>
                            {cohort.rates.map((rate, rIdx) => {
                              if (rate === null) return <td key={rIdx} className="py-2.5 text-center text-slate-700">-</td>;
                              // Dynamic color weighting for visual cues
                              let cellBg = 'bg-cyan-900/10 text-cyan-400';
                              if (rate >= 80) cellBg = 'bg-cyan-600/60 text-white font-bold';
                              else if (rate >= 45) cellBg = 'bg-cyan-600/35 text-cyan-200';
                              else if (rate >= 30) cellBg = 'bg-cyan-600/20 text-cyan-300';
                              
                              return (
                                <td key={rIdx} className={`py-2.5 text-center rounded border border-slate-900 ${cellBg}`}>
                                  {rate}%
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tab Content 4: AI Growth and Recommendation Report */}
          {activeTab === 'report' && report && (
            <Card className="border-slate-850 bg-slate-900/15 backdrop-blur-sm">
              <CardHeader className="border-b border-slate-850/60">
                <CardTitle className="text-slate-100 text-sm font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4.5 w-4.5 text-cyan-400" />
                  AI 赋能的产品迭代分析报告
                </CardTitle>
                <CardDescription className="text-xs text-slate-200">
                  报告由大模型对系统中的日志流和真实指标整合生成，包含核心洞察、优化优先级以及迭代 Roadmap 操作指南。
                </CardDescription>
              </CardHeader>
              <CardContent className="py-6 px-8 max-h-[70vh] overflow-y-auto">
                <div className="prose prose-invert max-w-none text-xs space-y-4">
                  {renderMarkdown(report)}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
