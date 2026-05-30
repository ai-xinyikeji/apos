'use client';

/**
 * 进度追踪和错误恢复测试页面
 */

import { useState } from 'react';
import { ProgressIndicator } from '@/components/progress-indicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, RefreshCw } from 'lucide-react';

export default function TestProgressPage() {
  const [runId, setRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTest = async (scenario: string) => {
    setIsRunning(true);
    setResult(null);

    try {
      const response = await fetch('/api/test-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });

      const data = await response.json();
      setRunId(data.runId);
      setResult(data);
    } catch (error) {
      console.error('Test failed:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const scenarios = [
    {
      id: 'success',
      name: '✅ 成功场景',
      description: '所有步骤都成功完成',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    },
    {
      id: 'error',
      name: '❌ 错误场景',
      description: '在代码生成步骤失败',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    },
    {
      id: 'retry',
      name: '🔄 重试场景',
      description: '触发自动重试机制',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    },
  ];

  return (
    <div className="container mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">智能体执行测试</h1>
        <p className="text-slate-100">
          测试实时进度追踪和错误恢复机制
        </p>
      </div>

      {/* 测试场景选择 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {scenarios.map((scenario) => (
          <Card key={scenario.id} className="relative overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">{scenario.name}</CardTitle>
              <CardDescription>{scenario.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => runTest(scenario.id)}
                disabled={isRunning}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-cyan-600/20 rounded-xl font-semibold h-8"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    运行中...
                  </>
                ) : (
                  <>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    运行测试
                  </>
                )}
              </Button>
            </CardContent>
            <div className={`absolute top-0 right-0 w-2 h-full ${scenario.color}`} />
          </Card>
        ))}
      </div>

      {/* 进度显示 */}
      {runId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">实时进度</h2>
            {result && (
              <Badge variant={result.success ? 'default' : 'destructive'}>
                {result.success ? '✅ 成功' : '❌ 失败'}
              </Badge>
            )}
          </div>
          <ProgressIndicator
            runId={runId}
            title="Agent 执行进度"
            showHistory={true}
            onComplete={() => {
              console.log('Test completed!');
            }}
            onError={(error) => {
              console.error('Test error:', error);
            }}
          />
        </div>
      )}

      {/* 功能说明 */}
      <Card>
        <CardHeader>
          <CardTitle>测试功能说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">✨ 实时进度追踪</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-100">
              <li>Server-Sent Events (SSE) 实时推送</li>
              <li>进度百分比计算</li>
              <li>步骤状态可视化</li>
              <li>执行历史记录</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">🛡️ 错误恢复机制</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-100">
              <li>自动重试（指数退避）</li>
              <li>智能错误分析</li>
              <li>模型降级策略</li>
              <li>恢复过程可视化</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">📊 集成到 BaseAgent</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-100">
              <li>所有 Agent 自动支持进度追踪</li>
              <li>所有 LLM 调用自动支持错误恢复</li>
              <li>统一的进度和错误处理</li>
              <li>零侵入式集成</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
