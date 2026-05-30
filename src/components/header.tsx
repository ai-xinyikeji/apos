'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Key, 
  AlertTriangle, 
  CheckCircle,
  HelpCircle,
  X,
  Sparkles,
  BookOpen,
  Terminal,
  Cpu
} from 'lucide-react';
import { GithubIcon } from '@/components/icons';

interface KeyStatus {
  openai: boolean;
  anthropic: boolean;
  google: boolean;
  github: boolean;
}

export function Header() {
  const pathname = usePathname();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<KeyStatus>({
    openai: false,
    anthropic: false,
    google: false,
    github: false
  });

  useEffect(() => {
    setMounted(true);
    async function fetchStatus() {
      try {
        const res = await fetch('/api/settings/status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (err) {
        console.error('Failed to load settings status', err);
      }
    }
    fetchStatus();
    // Refresh status occasionally
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [pathname]); // Refresh on route change

  // Determine page title
  const getPageTitle = () => {
    switch (pathname) {
      case '/': return '仪表盘';
      case '/prototypes': return '原型开发中心';
      case '/insights': return '需求洞察中心';
      case '/pull-requests': return 'PR 评审与追踪';
      case '/components-catalog': return '本地组件展示站';
      case '/settings': return '系统配置';
      case '/workflows': return '工作流编排中心';
      case '/growth': return '产品增长中心';
      default: return 'AI Product OS';
    }
  };

  const hasLLM = status.openai || status.anthropic || status.google;
  const isFullyConfigured = hasLLM && status.github;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-700/80 bg-slate-950/40 px-8 backdrop-blur-sm">
      <h1 className="text-xl font-semibold text-slate-100">{getPageTitle()}</h1>

      <div className="flex items-center gap-6">
        {/* Status Badges */}
        <div className="flex items-center gap-3">
          {/* LLM Status */}
          <div className="flex items-center gap-1.5 rounded-full bg-slate-900 border border-slate-700/80 px-3 py-1 text-xs">
            <Key className="h-3.5 w-3.5 text-slate-100" />
            <span className="text-slate-200">大模型:</span>
            {hasLLM ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                已配置 <CheckCircle className="h-3 w-3" />
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-500 font-medium">
                未配置 <AlertTriangle className="h-3 w-3" />
              </span>
            )}
          </div>

          {/* GitHub Status */}
          <div className="flex items-center gap-1.5 rounded-full bg-slate-900 border border-slate-700/80 px-3 py-1 text-xs">
            <GithubIcon className="h-3.5 w-3.5 text-slate-100" />
            <span className="text-slate-200">GitHub:</span>
            {status.github ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                已配置 <CheckCircle className="h-3 w-3" />
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-500 font-medium">
                未配置 <AlertTriangle className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>

        {/* Warning Toast Redirect if incomplete */}
        {!isFullyConfigured && pathname !== '/settings' && (
          <Link 
            href="/settings" 
            className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 transition-all"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>系统未完全配置，点击配置秘钥</span>
          </Link>
        )}

        {/* Help Link */}
        <button 
          title="系统帮助"
          onClick={() => setIsHelpOpen(true)}
          className="text-slate-100 hover:text-cyan-400 transition-colors cursor-pointer"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

      {/* Help Modal */}
      {isHelpOpen && mounted && <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-700/80 px-6 py-4 bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-slate-100">AI Product OS 帮助中心</h3>
              </div>
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="text-slate-300 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800/50 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
              {/* Introduction */}
              <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 space-y-2">
                <h4 className="font-semibold text-slate-100 flex items-center gap-1.5 text-sm">
                  <Sparkles className="h-4 w-4 text-cyan-400 animate-pulse" />
                  什么是 AI Product OS (APOS)？
                </h4>
                <p className="text-slate-200 text-xs leading-relaxed">
                  APOS 是一个本地智能软件工程工作台，旨在通过大模型与自动化智能体（Agent）的紧密协同，让您在本地零门槛地进行产品原型设计、快速开发、需求洞察、PR 评审和工作流构建。
                </p>
              </div>

              {/* Core Guides */}
              <div className="space-y-4">
                <h4 className="font-semibold text-slate-100 text-xs uppercase tracking-wider pl-2 border-l-2 border-cyan-500">核心功能指引</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Item 1 */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/20 space-y-1.5">
                    <h5 className="font-semibold text-slate-100 flex items-center gap-1.5 text-xs">
                      <Terminal className="h-4 w-4 text-cyan-400" />
                      原型开发
                    </h5>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      输入您的页面想法、业务逻辑或直接上传手绘草图/设计稿，系统会自动在本地拉取 Git 分支，并在几分钟内生成高保真的 React 代码，同时提供交互式沙盒和 StackBlitz 导出。
                    </p>
                  </div>

                  {/* Item 2 */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/20 space-y-1.5">
                    <h5 className="font-semibold text-slate-100 flex items-center gap-1.5 text-xs">
                      <Cpu className="h-4 w-4 text-cyan-400" />
                      智能体与容灾
                    </h5>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      执行流自带容灾设计。当大模型遇到速率限制或 API Key 无额度等异常时，会自动重试并降级至备用模型（如本地 Ollama），确保开发链路绝不中断。
                    </p>
                  </div>

                  {/* Item 3 */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/20 space-y-1.5">
                    <h5 className="font-semibold text-slate-100 flex items-center gap-1.5 text-xs">
                      <BookOpen className="h-4 w-4 text-cyan-400" />
                      免 API 白嫖运行
                    </h5>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      通过搭配 Chrome 伴侣插件，系统能自动同步您的 ChatGPT、Gemini 和 Kimi 网页版 Session，无需 API 即可免费白嫖运行大模型，且完全不需要将密钥上传云端。
                    </p>
                  </div>

                  {/* Item 4 */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/20 space-y-1.5">
                    <h5 className="font-semibold text-slate-100 flex items-center gap-1.5 text-xs">
                      <Key className="h-4 w-4 text-cyan-400" />
                      配置中心
                    </h5>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      支持一键将本地 APOS 注册为标准的 MCP 服务器。您可以直接通过 Cursor、Claude Code 等 CLI 工具与 APOS 进行深度协同。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end border-t border-slate-700/80/40 p-4 bg-slate-900/30">
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold h-8 px-4 transition-colors cursor-pointer"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>}
    </header>
  );
}
