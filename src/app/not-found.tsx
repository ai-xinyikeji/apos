'use client';

import Link from 'next/link';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <div className="max-w-md w-full text-center px-6">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-slate-900 border border-slate-700/80 mb-6">
            <FileQuestion className="h-12 w-12 text-slate-100" />
          </div>
          
          <h1 className="text-6xl font-bold text-slate-100 mb-4">404</h1>
          
          <h2 className="text-2xl font-semibold text-slate-100 mb-3">
            页面未找到
          </h2>
          
          <p className="text-slate-100 mb-8">
            抱歉，您访问的页面不存在或已被移除。
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: 'default' }),
              "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-emerald-500 text-white border-0"
            )}
          >
            <Home className="h-4 w-4 mr-2" />
            返回首页
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              "border-slate-700/80 bg-slate-900/50 text-slate-200 hover:bg-slate-800"
            )}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回上一页
          </button>
        </div>
        
        <div className="mt-12 pt-8 border-t border-slate-700/80">
          <p className="text-xs text-slate-100 mb-3">常用页面：</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/prototypes"
              className="text-xs text-slate-200 hover:text-cyan-400 transition-colors"
            >
              原型开发
            </Link>
            <span className="text-slate-800">•</span>
            <Link
              href="/insights"
              className="text-xs text-slate-200 hover:text-cyan-400 transition-colors"
            >
              洞察中心
            </Link>
            <span className="text-slate-800">•</span>
            <Link
              href="/pull-requests"
              className="text-xs text-slate-200 hover:text-cyan-400 transition-colors"
            >
              Pull Requests
            </Link>
            <span className="text-slate-800">•</span>
            <Link
              href="/settings"
              className="text-xs text-slate-200 hover:text-cyan-400 transition-colors"
            >
              设置
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
