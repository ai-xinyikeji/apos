'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 p-8">
      <div className="max-w-lg w-full">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-950/10 backdrop-blur-sm p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-rose-500/10 p-6">
              <AlertTriangle className="h-12 w-12 text-rose-400" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-slate-100 mb-3">
            应用遇到错误
          </h1>
          
          <p className="text-slate-100 mb-2">
            很抱歉，应用运行时出现了问题。
          </p>
          
          <p className="text-sm text-slate-200 mb-8">
            {error.message || '未知错误'}
          </p>
          
          {process.env.NODE_ENV === 'development' && error.digest && (
            <p className="text-xs text-slate-100 mb-6 font-mono">
              Error Digest: {error.digest}
            </p>
          )}
          
          {process.env.NODE_ENV === 'development' && error.stack && (
            <details className="mb-8 text-left">
              <summary className="text-sm text-slate-200 cursor-pointer hover:text-slate-100 mb-3">
                查看错误堆栈
              </summary>
              <pre className="text-xs text-rose-300 bg-slate-950 p-4 rounded-lg overflow-auto max-h-60 border border-slate-700/80">
                {error.stack}
              </pre>
            </details>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={reset}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-emerald-500 text-white border-0"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              重新加载
            </Button>
            
            <Button
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="border-slate-700/80 bg-slate-900/50 text-slate-200 hover:bg-slate-800"
            >
              <Home className="h-4 w-4 mr-2" />
              返回首页
            </Button>
          </div>
          
          <div className="mt-8 pt-6 border-t border-slate-700/80">
            <p className="text-xs text-slate-100">
              如果问题持续存在，请检查：
            </p>
            <ul className="text-xs text-slate-200 mt-2 space-y-1">
              <li>• 网络连接是否正常</li>
              <li>• API Keys 是否正确配置</li>
              <li>• 数据库文件是否存在</li>
              <li>• 浏览器控制台是否有更多错误信息</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
