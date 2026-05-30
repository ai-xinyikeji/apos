/**
 * 多 Agent 工作流测试 API
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createWorkflow,
  WORKFLOW_STRATEGIES,
  type WorkflowTask,
} from '@/lib/orchestrator/multi-agent-workflow';

export const runtime = 'nodejs';

/**
 * POST /api/workflow-test
 * 测试多 Agent 协作工作流
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      scenario = 'full-stack',
      strategy = 'balanced',
      runId = crypto.randomUUID(),
    } = body;

    // 选择策略
    const strategyConfig =
      WORKFLOW_STRATEGIES[strategy.toUpperCase().replace('-', '_') as keyof typeof WORKFLOW_STRATEGIES] ||
      WORKFLOW_STRATEGIES.BALANCED;

    // 创建工作流
    const workflow = createWorkflow(strategyConfig);

    // 根据场景生成任务
    const tasks = generateScenarioTasks(scenario);

    // 执行工作流
    const startTime = Date.now();
    const results = await workflow.executeWorkflow(tasks, runId);
    const duration = Date.now() - startTime;

    // 生成报告
    const report = workflow.generateReport(results);

    return NextResponse.json({
      success: true,
      runId,
      scenario,
      strategy: strategyConfig.name,
      duration,
      results,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflow-test
 * 获取可用的测试场景和策略
 */
export async function GET() {
  return NextResponse.json({
    scenarios: [
      {
        id: 'full-stack',
        name: '全栈开发',
        description: '完整的产品开发流程：设计 → 前端 → 后端 → 审查',
        tasks: 4,
      },
      {
        id: 'refactor',
        name: '代码重构',
        description: '代码重构流程：审查 → 重构 → 测试',
        tasks: 3,
      },
      {
        id: 'feature',
        name: '功能开发',
        description: '新功能开发：设计 → 实现 → 审查',
        tasks: 3,
      },
      {
        id: 'optimization',
        name: '性能优化',
        description: '性能优化流程：分析 → 优化 → 验证',
        tasks: 3,
      },
    ],
    strategies: [
      {
        id: 'cost-optimized',
        name: '成本优先',
        description: '尽可能使用便宜的模型',
        weights: { cost: 0.7, quality: 0.2, speed: 0.1 },
      },
      {
        id: 'quality-optimized',
        name: '质量优先',
        description: '使用最好的模型保证质量',
        weights: { cost: 0.1, quality: 0.7, speed: 0.2 },
      },
      {
        id: 'speed-optimized',
        name: '速度优先',
        description: '快速完成任务',
        weights: { cost: 0.2, quality: 0.2, speed: 0.6 },
      },
      {
        id: 'balanced',
        name: '平衡模式',
        description: '成本、质量、速度均衡',
        weights: { cost: 0.33, quality: 0.34, speed: 0.33 },
      },
    ],
  });
}

/**
 * 根据场景生成任务
 */
function generateScenarioTasks(scenario: string): WorkflowTask[] {
  const scenarios: Record<string, WorkflowTask[]> = {
    'full-stack': [
      {
        id: 'design',
        type: 'design',
        complexity: 'high',
        input: {
          requirements: '设计一个用户认证系统',
          context: '使用 Next.js + PostgreSQL',
          constraints: ['支持 OAuth', '支持 2FA'],
        },
      },
      {
        id: 'frontend',
        type: 'code',
        complexity: 'medium',
        input: {
          name: '登录页面',
          description: '实现用户登录界面',
        },
        dependencies: ['design'],
      },
      {
        id: 'backend',
        type: 'code',
        complexity: 'medium',
        input: {
          name: '认证 API',
          description: '实现认证接口',
        },
        dependencies: ['design'],
      },
      {
        id: 'review',
        type: 'review',
        complexity: 'medium',
        input: {
          branchName: 'feature/auth',
          prNumber: 123,
        },
        dependencies: ['frontend', 'backend'],
      },
    ],
    refactor: [
      {
        id: 'review',
        type: 'review',
        complexity: 'medium',
        input: {
          branchName: 'main',
          prNumber: 0,
        },
      },
      {
        id: 'refactor',
        type: 'refactor',
        complexity: 'high',
        input: {
          target: 'src/lib/legacy.ts',
          improvements: ['提取重复代码', '优化性能', '改进类型'],
        },
        dependencies: ['review'],
      },
      {
        id: 'test',
        type: 'test',
        complexity: 'low',
        input: {
          target: 'src/lib/legacy.ts',
          coverage: 80,
        },
        dependencies: ['refactor'],
      },
    ],
    feature: [
      {
        id: 'design',
        type: 'design',
        complexity: 'medium',
        input: {
          requirements: '添加导出功能',
          context: '现有系统支持 CSV 导出',
          constraints: ['支持 Excel', '支持 PDF'],
        },
      },
      {
        id: 'implement',
        type: 'code',
        complexity: 'medium',
        input: {
          name: '导出功能',
          description: '实现多格式导出',
        },
        dependencies: ['design'],
      },
      {
        id: 'review',
        type: 'review',
        complexity: 'low',
        input: {
          branchName: 'feature/export',
          prNumber: 456,
        },
        dependencies: ['implement'],
      },
    ],
    optimization: [
      {
        id: 'analyze',
        type: 'review',
        complexity: 'medium',
        input: {
          branchName: 'main',
          focus: 'performance',
        },
      },
      {
        id: 'optimize',
        type: 'refactor',
        complexity: 'high',
        input: {
          target: 'src/lib/slow-function.ts',
          improvements: ['缓存结果', '减少数据库查询', '并行处理'],
        },
        dependencies: ['analyze'],
      },
      {
        id: 'verify',
        type: 'test',
        complexity: 'medium',
        input: {
          target: 'src/lib/slow-function.ts',
          benchmarks: true,
        },
        dependencies: ['optimize'],
      },
    ],
  };

  return scenarios[scenario] || scenarios['full-stack'];
}
