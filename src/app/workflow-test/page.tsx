'use client';

/**
 * 多 Agent 工作流测试页面
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { ProgressIndicator } from '@/components/progress-indicator';

interface Scenario {
  id: string;
  name: string;
  description: string;
  tasks: number;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  weights: { cost: number; quality: number; speed: number };
}

export default function WorkflowTestPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('full-stack');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('balanced');
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // 加载场景和策略
  useEffect(() => {
    fetch('/api/workflow-test')
      .then(res => res.json())
      .then(data => {
        setScenarios(data.scenarios);
        setStrategies(data.strategies);
      });
  }, []);

  const runWorkflow = async () => {
    setIsRunning(true);
    setResult(null);
    const newRunId = crypto.randomUUID();
    setRunId(newRunId);

    try {
      const response = await fetch('/api/workflow-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: selectedScenario,
          strategy: selectedStrategy,
          runId: newRunId,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Workflow failed:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">多 Agent 协作工作流</h1>
        <p className="text-slate-200">
          测试智能 Agent 分配和协作执行
        </p>
      </div>

      {/* 场景选择 */}
      <Card>
        <CardHeader>
          <CardTitle>选择测试场景</CardTitle>
          <CardDescription>不同的开发场景需要不同的 Agent 协作</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                onClick={() => setSelectedScenario(scenario.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedScenario === scenario.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-700/80 hover:border-cyan-500/50 bg-slate-900/10'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold">{scenario.name}</h3>
                  <Badge variant="outline">{scenario.tasks} 任务</Badge>
                </div>
                <p className="text-sm text-slate-200">{scenario.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 策略选择 */}
      <Card>
        <CardHeader>
          <CardTitle>选择执行策略</CardTitle>
          <CardDescription>不同策略会影响 Agent 选择和成本</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                onClick={() => setSelectedStrategy(strategy.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedStrategy === strategy.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-700/80 hover:border-cyan-500/50 bg-slate-900/10'
                }`}
              >
                <h3 className="font-semibold mb-2">{strategy.name}</h3>
                <p className="text-sm text-slate-200 mb-3">{strategy.description}</p>
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline">
                    💰 {(strategy.weights.cost * 100).toFixed(0)}%
                  </Badge>
                  <Badge variant="outline">
                    🎯 {(strategy.weights.quality * 100).toFixed(0)}%
                  </Badge>
                  <Badge variant="outline">
                    ⚡ {(strategy.weights.speed * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 执行按钮 */}
      <div className="flex justify-center">
        <Button
          onClick={runWorkflow}
          disabled={isRunning}
          size="lg"
          className="w-full md:w-auto bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-cyan-600/20 rounded-xl font-semibold h-10 px-6"
        >
          {isRunning ? (
            <>
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
              执行中...
            </>
          ) : (
            <>
              <PlayCircle className="mr-2 h-5 w-5" />
              运行工作流
            </>
          )}
        </Button>
      </div>

      {/* 进度显示 */}
      {runId && (
        <ProgressIndicator
          runId={runId}
          title="工作流执行进度"
          showHistory={true}
        />
      )}

      {/* 结果显示 */}
      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>执行结果</CardTitle>
              {result.success ? (
                <Badge className="bg-green-500">
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  成功
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-4 w-4" />
                  失败
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 统计信息 */}
            {result.results && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {result.results.filter((r: any) => r.success).length}
                  </div>
                  <div className="text-sm text-slate-200">成功任务</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {result.results.filter((r: any) => !r.success).length}
                  </div>
                  <div className="text-sm text-slate-200">失败任务</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold flex items-center">
                    <Clock className="mr-1 h-5 w-5" />
                    {(result.duration / 1000).toFixed(1)}s
                  </div>
                  <div className="text-sm text-slate-200">总耗时</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    ${result.results.reduce((sum: number, r: any) => sum + r.cost, 0).toFixed(4)}
                  </div>
                  <div className="text-sm text-slate-200">总成本</div>
                </div>
              </div>
            )}

            {/* 任务详情 */}
            {result.results && (
              <div className="space-y-2">
                <h3 className="font-semibold">任务详情</h3>
                {result.results.map((task: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {task.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="font-medium">{task.taskId}</div>
                        <div className="text-sm text-slate-200">
                          Agent: {task.agent}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">{(task.duration / 1000).toFixed(2)}s</div>
                      <div className="text-xs text-slate-200">
                        ${task.cost.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 报告 */}
            {result.report && (
              <div>
                <h3 className="font-semibold mb-2">执行报告</h3>
                <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                  {result.report}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 功能说明 */}
      <Card>
        <CardHeader>
          <CardTitle>多 Agent 协作说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">🤖 智能 Agent 分配</h3>
            <p className="text-sm text-slate-200">
              根据任务类型、复杂度和执行策略，自动选择最优的 Agent 执行任务
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">⚖️ 多维度优化</h3>
            <p className="text-sm text-slate-200">
              平衡成本、质量和速度三个维度，根据不同策略做出最优决策
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">🔄 自动错误恢复</h3>
            <p className="text-sm text-slate-200">
              任务失败时自动重试，使用智能降级策略保证工作流完成
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">📊 详细报告</h3>
            <p className="text-sm text-slate-200">
              生成完整的执行报告，包括成本、耗时、Agent 使用情况等
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
