'use client';

/**
 * 实时进度指示器组件
 */

import { useProgress } from '@/hooks/use-progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProgressIndicatorProps {
  runId: string;
  title?: string;
  showHistory?: boolean;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function ProgressIndicator({
  runId,
  title = 'Agent 执行进度',
  showHistory = true,
  onComplete,
  onError,
}: ProgressIndicatorProps) {
  const { progress, currentStep, status, message, updates, isConnected } = useProgress({
    runId,
    onComplete: (update) => {
      onComplete?.();
    },
    onError: (update) => {
      onError?.(update.message);
    },
  });

  const getStatusIcon = (stepStatus: typeof status) => {
    switch (stepStatus) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
  };

  const getStatusColor = (stepStatus: typeof status) => {
    switch (stepStatus) {
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'warning':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge variant="outline" className="text-green-600">
                <Circle className="h-2 w-2 fill-green-600 mr-1" />
                实时连接
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-600">
                <Circle className="h-2 w-2 fill-gray-600 mr-1" />
                已断开
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 进度条 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-200">总体进度</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* 当前步骤 */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
          {getStatusIcon(status)}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{currentStep || '等待中...'}</span>
              <Badge variant="outline" className="text-xs">
                {status}
              </Badge>
            </div>
            <p className="text-sm text-slate-200">{message || '准备开始...'}</p>
          </div>
        </div>

        {/* 历史步骤 */}
        {showHistory && updates.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-200">执行历史</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {updates.map((update, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-3 p-2 rounded text-sm',
                    update.status === 'error' && 'bg-red-50 dark:bg-red-950/20',
                    update.status === 'warning' && 'bg-yellow-50 dark:bg-yellow-950/20',
                    update.status === 'success' && 'bg-green-50 dark:bg-green-950/20'
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(update.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{update.step}</span>
                      <span className="text-xs text-slate-200">
                        {new Date(update.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-200 mt-0.5">{update.message}</p>
                    {update.details && (
                      <details className="mt-1">
                        <summary className="text-xs text-slate-200 cursor-pointer hover:text-foreground">
                          查看详情
                        </summary>
                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(update.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 简化版进度条（用于列表等紧凑场景）
 */
export function CompactProgressIndicator({ runId }: { runId: string }) {
  const { progress, currentStep, status } = useProgress({ runId });

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'warning':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-200 truncate">{currentStep}</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', getStatusColor())}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
