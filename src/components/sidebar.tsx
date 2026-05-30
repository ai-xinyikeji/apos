'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Terminal, 
  Lightbulb, 
  GitPullRequest, 
  Settings, 
  Cpu, 
  Activity,
  Layers,
  TrendingUp,
  DollarSign,
  FlaskConical
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: '仪表盘', href: '/', icon: LayoutDashboard },
  { name: '原型开发', href: '/prototypes', icon: Terminal },
  { name: '需求洞察', href: '/insights', icon: Lightbulb },
  { name: 'PR 追踪', href: '/pull-requests', icon: GitPullRequest },
  { name: '工作流编排', href: '/workflows', icon: Activity },
  { name: '产品增长', href: '/growth', icon: TrendingUp },
  { name: '成本分析', href: '/costs', icon: DollarSign },
  { name: '智能体测试', href: '/test-progress', icon: FlaskConical },
  { name: '多 Agent 协作', href: '/workflow-test', icon: Layers },
  { name: '系统设置', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-slate-700/80/60 bg-slate-950/80 backdrop-blur-md">
      {/* Header Logo */}
      <div className="flex h-16 items-center px-6 border-b border-slate-700/80/60">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-emerald-500 shadow-lg shadow-cyan-500/20">
            <Cpu className="h-5 w-5 text-white animate-pulse" />
          </div>
          <span className="bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-lg font-bold tracking-wider text-transparent">
            AI Product OS
          </span>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-cyan-600/20 to-blue-600/10 text-cyan-400 border-l-2 border-cyan-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                  : "text-slate-100 hover:bg-slate-900/50 hover:text-slate-100"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                isActive ? "text-cyan-400" : "text-slate-100 group-hover:text-slate-200"
              )} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <div className="p-4 border-t border-slate-700/80/60 bg-slate-950/40">
        <div className="flex items-center gap-3 rounded-xl bg-slate-900/40 border border-slate-700/80/40 p-3">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">本地服务已就绪</p>
            <p className="text-[10px] text-slate-200 truncate">SQLite: data/apos.db</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
