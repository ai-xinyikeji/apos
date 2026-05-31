import Link from 'next/link';
import { db } from '@/lib/db';
import { prototypes, signals, agentTraces, metrics } from '@/lib/schema';
import { desc, sql } from 'drizzle-orm';
import { 
  Terminal, 
  Lightbulb, 
  GitPullRequest, 
  Activity, 
  Plus, 
  ArrowRight,
  TrendingUp,
  Cpu,
  Clock
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn, translatePrototypeStatus, translateSignalStatus, translateSource } from '@/lib/utils';

// Force dynamic rendering to query DB on every load
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Query statistics and items
  let stats = {
    prototypesCount: 0,
    signalsCount: 0,
    tracesCount: 0,
    pendingSignalsCount: 0,
  };

  let recentPrototypes: any[] = [];
  let recentSignals: any[] = [];
  let executionTraces: any[] = [];
  let mcpCallsCount = 0;
  let mostPopularTool = '暂无调用';

  try {
    // Stat calculations
    const [{ count: protoCount }] = await db.select({ count: sql<number>`count(*)` }).from(prototypes);
    const [{ count: sigCount }] = await db.select({ count: sql<number>`count(*)` }).from(signals);
    const [{ count: pendingCount }] = await db.select({ count: sql<number>`count(*)` }).from(signals).where(sql`status = 'pending'`);
    const [{ count: trCount }] = await db.select({ count: sql<number>`count(*)` }).from(agentTraces);

    stats = {
      prototypesCount: protoCount || 0,
      signalsCount: sigCount || 0,
      pendingSignalsCount: pendingCount || 0,
      tracesCount: trCount || 0,
    };

    // Lists
    recentPrototypes = await db.select().from(prototypes).orderBy(desc(prototypes.createdAt)).limit(5);
    recentSignals = await db.select().from(signals).orderBy(desc(signals.createdAt)).limit(5);
    
    // Group traces by run_id to show distinct runs in the dashboard
    executionTraces = await db.select()
      .from(agentTraces)
      .orderBy(desc(agentTraces.createdAt))
      .limit(5);

    // MCP Metrics calculation
    const mcpCalls = await db.select().from(metrics).where(sql`event = 'mcp_tool_call'`);
    mcpCallsCount = mcpCalls.length;

    const toolCounts: Record<string, number> = {};
    mcpCalls.forEach(call => {
      try {
        const props = JSON.parse(call.properties);
        if (props.tool) {
          toolCounts[props.tool] = (toolCounts[props.tool] || 0) + 1;
        }
      } catch (_) {}
    });

    let maxCalls = 0;
    Object.entries(toolCounts).forEach(([tool, count]) => {
      if (count > maxCalls) {
        maxCalls = count;
        mostPopularTool = `${tool} (${count}次)`;
      }
    });
  } catch (error) {
    console.error('Database query failed in dashboard page:', error);
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-700/80/80 bg-gradient-to-r from-cyan-950/40 via-blue-950/20 to-slate-950 p-8 shadow-2xl">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl"></div>
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              欢迎回到 AI Product OS
            </h2>
            <p className="text-slate-100 text-sm max-w-xl">
              这是一个本地优先的需求到代码生成系统。在这里，Agent 监测用户信号，自动转换为产品原型，并提报 PR 评审。
            </p>
          </div>
            <Link 
              href="/prototypes" 
              className={cn(
                buttonVariants({ variant: 'default' }),
                "rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-cyan-600/20 h-10 px-4 py-2 flex items-center justify-center font-semibold text-sm"
              )}
            >
              <Plus className="mr-2 h-4 w-4" /> 创建原型
            </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        {/* Prototypes Card */}
        <Link href="/prototypes" className="block group rounded-2xl border border-slate-700/80/60 bg-slate-900/20 p-6 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/40 hover:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">总原型项目</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <Terminal className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-slate-100">{stats.prototypesCount}</span>
            <span className="text-xs text-slate-200 block mt-1">分支部署于本地 Git 仓库</span>
          </div>
        </Link>

        {/* Signals Card */}
        <Link href="/insights" className="block group rounded-2xl border border-slate-700/80/60 bg-slate-900/20 p-6 backdrop-blur-sm transition-all duration-300 hover:border-blue-500/40 hover:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">需求信号</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
              <Lightbulb className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-slate-100">{stats.signalsCount}</span>
            <span className="text-xs text-amber-400/90 block mt-1">
              {stats.pendingSignalsCount} 个待分析的未处理信号
            </span>
          </div>
        </Link>

        {/* PR Card */}
        <Link href="/pull-requests" className="block group rounded-2xl border border-slate-700/80/60 bg-slate-900/20 p-6 backdrop-blur-sm transition-all duration-300 hover:border-amber-500/40 hover:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">PR 评审</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
              <GitPullRequest className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-slate-100">
              {recentPrototypes.filter(p => p.status === 'pr_created' || p.status === 'merged').length}
            </span>
            <span className="text-xs text-slate-200 block mt-1">已由 Review Bot 自动扫描</span>
          </div>
        </Link>

        {/* Traces Card */}
        <Link href="/workflows" className="block group rounded-2xl border border-slate-700/80/60 bg-slate-900/20 p-6 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/40 hover:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">Agent 执行步骤</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-slate-100">{stats.tracesCount}</span>
            <span className="text-xs text-emerald-400/90 block mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> 本地运行日志已就绪
            </span>
          </div>
        </Link>

        {/* MCP Card */}
        <Link href="/settings" className="block group rounded-2xl border border-slate-700/80/60 bg-slate-900/20 p-6 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/40 hover:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">MCP CLI 联动调用</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <Plus className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-slate-100">{mcpCallsCount}</span>
            <span className="text-xs text-slate-200 block mt-1 truncate">
              最常用: {mostPopularTool}
            </span>
          </div>
        </Link>
      </div>

      {/* Columns: Left (Prototypes & Signals), Right (Agent traces) */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Columns */}
        <div className="lg:col-span-2 space-y-8">
          {/* Recent Prototypes */}
          <div className="rounded-2xl border border-slate-700/80/60 bg-slate-900/10 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-700/80/40">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-cyan-400" />
                <h3 className="font-semibold text-slate-100">最近原型开发</h3>
              </div>
              <Link href="/prototypes" className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                全部原型 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            
            <div className="mt-4 divide-y divide-slate-900">
              {recentPrototypes.length > 0 ? (
                recentPrototypes.map((proto) => (
                  <Link key={proto.id} href="/prototypes" className="flex items-center justify-between py-3.5 group cursor-pointer hover:bg-slate-800/20 rounded-xl px-2 -mx-2 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors truncate">{proto.name}</p>
                      <p className="text-xs text-slate-200 truncate mt-1">分支: {proto.branchName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${
                        proto.status === 'merged' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : proto.status === 'failed'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          : proto.status === 'pr_created'
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                          : 'bg-slate-800 text-slate-100 border-slate-700/50'
                      }`}>
                        {translatePrototypeStatus(proto.status)}
                      </span>
                      <span className="text-[10px] text-slate-200">{new Date(proto.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8 text-sm text-slate-200">
                  暂无原型项目，点击右上角新建。
                </div>
              )}
            </div>
          </div>

          {/* Recent Signals */}
          <div className="rounded-2xl border border-slate-700/80/60 bg-slate-900/10 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-700/80/40">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold text-slate-100">最近信号收集</h3>
              </div>
              <Link href="/insights" className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                洞察中心 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            
            <div className="mt-4 divide-y divide-slate-900">
              {recentSignals.length > 0 ? (
                recentSignals.map((sig) => (
                  <Link key={sig.id} href="/insights" className="block py-3.5 group cursor-pointer hover:bg-slate-800/20 rounded-xl px-2 -mx-2 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate">{sig.title}</p>
                        <p className="text-xs text-slate-200 mt-1 line-clamp-2">{sig.content}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="rounded bg-slate-900 border border-slate-700/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-100">
                          {translateSource(sig.source)}
                        </span>
                        <span className="text-[10px] text-slate-200">{new Date(sig.createdAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8 text-sm text-slate-200">
                  暂无需求信号。Signal Agent 运行后会自动收集并显示。
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Activity Column */}
        <div className="space-y-8">
          <div className="rounded-2xl border border-slate-700/80/60 bg-slate-900/10 p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-700/80/40">
              <Cpu className="h-5 w-5 text-emerald-400 animate-pulse" />
              <h3 className="font-semibold text-slate-100">Agent 执行日志</h3>
            </div>
            
            <div className="mt-4 flex-1 space-y-4">
              {executionTraces.length > 0 ? (
                executionTraces.map((trace) => (
                  <div key={trace.id} className="relative pl-5 border-l border-slate-700/80/60 last:border-0 pb-1">
                    {/* Circle Node */}
                    <span className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-slate-950 ${
                      trace.status === 'error'
                        ? 'bg-rose-500'
                        : trace.status === 'warning'
                        ? 'bg-amber-500'
                        : trace.status === 'success'
                        ? 'bg-emerald-500'
                        : 'bg-cyan-500'
                    }`}></span>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200">{trace.agentName}</span>
                        <span className="text-[9px] text-slate-200 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(trace.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-100">{trace.step}</p>
                      <p className="text-[11px] text-slate-200 leading-normal">{trace.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-sm text-slate-200 flex flex-col items-center justify-center gap-2">
                  <Activity className="h-8 w-8 text-slate-700" />
                  <span>暂无 Agent 执行日志。</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
