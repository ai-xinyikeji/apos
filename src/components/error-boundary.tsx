'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md w-full">
            <div className="rounded-2xl border border-rose-500/20 bg-rose-950/20 p-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-rose-500/10 p-4">
                  <AlertTriangle className="h-8 w-8 text-rose-400" />
                </div>
              </div>
              
              <h2 className="text-xl font-bold text-slate-100 mb-2">
                出错了
              </h2>
              
              <p className="text-sm text-slate-100 mb-6">
                {this.state.error?.message || '应用遇到了一个意外错误'}
              </p>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="text-xs text-slate-200 cursor-pointer hover:text-slate-100 mb-2">
                    查看错误详情
                  </summary>
                  <pre className="text-xs text-rose-300 bg-slate-950 p-4 rounded-lg overflow-auto max-h-40">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={this.handleReset}
                  className="bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-100"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重试
                </Button>
                
                <Button
                  onClick={() => window.location.href = '/'}
                  variant="outline"
                  className="border-slate-700/80 text-slate-200 hover:bg-slate-800"
                >
                  返回首页
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary wrapper for functional components
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
