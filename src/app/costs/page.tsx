import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingDown, Zap, BarChart3 } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface CostData {
  costs: Array<{
    date: string;
    agent: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    estimatedCost: number;
  }>;
  total: {
    totalCost: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheRead: number;
    totalCacheCreation: number;
  };
  cacheSavings: {
    normalCost: number;
    cacheCost: number;
    savings: number;
    savingsPercent: number;
  };
  byProvider: Array<{
    provider: string;
    totalCost: number;
    totalTokens: number;
    count: number;
  }>;
  byAgent: Array<{
    agent: string;
    totalCost: number;
    totalTokens: number;
    count: number;
  }>;
}

async function getCostData(): Promise<CostData> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/costs`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch cost data');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching cost data:', error);
    return {
      costs: [],
      total: {
        totalCost: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheRead: 0,
        totalCacheCreation: 0,
      },
      cacheSavings: {
        normalCost: 0,
        cacheCost: 0,
        savings: 0,
        savingsPercent: 0,
      },
      byProvider: [],
      byAgent: [],
    };
  }
}

export default async function CostsPage() {
  const data = await getCostData();
  const { costs, total, cacheSavings, byProvider, byAgent } = data;

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">💰 成本分析</h1>
        <p className="text-slate-100">
          实时追踪 AI 模型调用成本，优化资源使用
        </p>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总成本</CardTitle>
            <DollarSign className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${total.totalCost.toFixed(2)}</div>
            <p className="text-xs text-slate-100 mt-1">
              最近 {costs.length} 次调用
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总 Token</CardTitle>
            <BarChart3 className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(total.totalTokens / 1000000).toFixed(2)}M
            </div>
            <p className="text-xs text-slate-100 mt-1">
              输入: {(total.totalInputTokens / 1000).toFixed(0)}K | 输出: {(total.totalOutputTokens / 1000).toFixed(0)}K
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">缓存节省</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              ${cacheSavings.savings.toFixed(2)}
            </div>
            <p className="text-xs text-slate-100 mt-1">
              节省 {cacheSavings.savingsPercent.toFixed(1)}% | 缓存读取: {(total.totalCacheRead / 1000).toFixed(0)}K
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均成本</CardTitle>
            <Zap className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${costs.length > 0 ? (total.totalCost / costs.length).toFixed(4) : '0.0000'}
            </div>
            <p className="text-xs text-slate-100 mt-1">
              每次调用
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 按 Provider 统计 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>按 Provider 统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {byProvider.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      item.provider === 'anthropic' ? 'bg-blue-500' :
                      item.provider === 'openai' ? 'bg-green-500' :
                      item.provider === 'google' ? 'bg-blue-500' :
                      item.provider === 'lmstudio' ? 'bg-orange-500' :
                      'bg-gray-500'
                    }`} />
                    <span className="font-medium capitalize">{item.provider || 'unknown'}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${item.totalCost.toFixed(2)}</div>
                    <div className="text-xs text-slate-100">
                      {(item.totalTokens / 1000).toFixed(0)}K tokens | {item.count} 次
                    </div>
                  </div>
                </div>
              ))}
              {byProvider.length === 0 && (
                <div className="text-center text-slate-100 py-4">
                  暂无数据
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>按 Agent 统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {byAgent.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan-500" />
                    <span className="font-medium">{item.agent || 'unknown'}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${item.totalCost.toFixed(2)}</div>
                    <div className="text-xs text-slate-100">
                      {(item.totalTokens / 1000).toFixed(0)}K tokens | {item.count} 次
                    </div>
                  </div>
                </div>
              ))}
              {byAgent.length === 0 && (
                <div className="text-center text-slate-100 py-4">
                  暂无数据
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 详细列表 */}
      <Card>
        <CardHeader>
          <CardTitle>成本明细</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">日期</th>
                  <th className="text-left p-2">Agent</th>
                  <th className="text-left p-2">Provider</th>
                  <th className="text-right p-2">输入</th>
                  <th className="text-right p-2">输出</th>
                  <th className="text-right p-2">缓存读取</th>
                  <th className="text-right p-2">成本</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/50">
                    <td className="p-2 text-sm">{row.date}</td>
                    <td className="p-2 text-sm">{row.agent}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        row.provider === 'anthropic' ? 'bg-blue-500/10 text-blue-500' :
                        row.provider === 'openai' ? 'bg-green-500/10 text-green-500' :
                        row.provider === 'google' ? 'bg-blue-500/10 text-blue-500' :
                        row.provider === 'lmstudio' ? 'bg-orange-500/10 text-orange-500' :
                        'bg-gray-500/10 text-gray-500'
                      }`}>
                        {row.provider || 'unknown'}
                      </span>
                    </td>
                    <td className="text-right p-2 text-sm">
                      {row.inputTokens.toLocaleString()}
                    </td>
                    <td className="text-right p-2 text-sm">
                      {row.outputTokens.toLocaleString()}
                    </td>
                    <td className="text-right p-2 text-sm text-green-600">
                      {row.cacheReadTokens > 0 ? row.cacheReadTokens.toLocaleString() : '-'}
                    </td>
                    <td className="text-right p-2 font-mono text-sm font-bold">
                      ${row.estimatedCost.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {costs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-100 py-8">
                      暂无成本数据。开始使用 Agent 后，成本统计将显示在这里。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 优化建议 */}
      {total.totalCost > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>💡 优化建议</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {cacheSavings.savingsPercent < 50 && (
                <div className="flex items-start gap-2">
                  <span className="text-yellow-500">⚠️</span>
                  <span>
                    Prompt Caching 节省率较低 ({cacheSavings.savingsPercent.toFixed(1)}%)，
                    建议检查是否正确配置了缓存。
                  </span>
                </div>
              )}
              {byProvider.find(p => p.provider === 'anthropic' && p.totalCost > 1) && (
                <div className="flex items-start gap-2">
                  <span className="text-blue-500">💡</span>
                  <span>
                    Claude 成本较高，考虑对简单任务使用 Gemini Flash 或本地模型。
                  </span>
                </div>
              )}
              {!byProvider.find(p => p.provider === 'lmstudio') && (
                <div className="flex items-start gap-2">
                  <span className="text-green-500">✨</span>
                  <span>
                    启用 Ollama 本地模型可以免费处理简单任务，进一步降低成本。
                  </span>
                </div>
              )}
              {cacheSavings.savingsPercent >= 70 && (
                <div className="flex items-start gap-2">
                  <span className="text-green-500">✅</span>
                  <span>
                    Prompt Caching 工作良好！已节省 {cacheSavings.savingsPercent.toFixed(1)}% 的成本。
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
