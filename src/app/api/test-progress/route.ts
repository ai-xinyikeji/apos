/**
 * 测试进度追踪和错误恢复功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGlobalProgressTracker, COMMON_STEPS } from '@/lib/progress-tracker';
import { getGlobalErrorRecovery } from '@/lib/error-recovery';

export const runtime = 'nodejs';

/**
 * POST /api/test-progress
 * 测试进度追踪功能
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scenario = 'success', runId = crypto.randomUUID() } = body;

    const tracker = getGlobalProgressTracker();
    const recovery = getGlobalErrorRecovery();

    // 注册步骤
    const steps = COMMON_STEPS.PROTO_BUILDER.map(s => ({ ...s }));
    tracker.registerSteps(runId, steps);

    // 模拟执行
    const executeScenario = async () => {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // 更新为运行中
        tracker.updateStep(runId, step.name, 'running', `正在执行 ${step.name}...`);

        // 模拟延迟
        await new Promise(resolve => setTimeout(resolve, 500));

        // 根据场景决定结果
        if (scenario === 'error' && step.name === 'generate_code') {
          // 模拟错误
          tracker.updateStep(
            runId,
            step.name,
            'failed',
            '代码生成失败',
            { error: 'Simulated error' }
          );
          throw new Error('Simulated error in generate_code');
        }

        if (scenario === 'retry' && step.name === 'compile_check') {
          // 模拟需要重试的错误
          await recovery.executeWithRecovery(
            async () => {
              // 第一次失败
              if (Math.random() > 0.5) {
                throw new Error('Rate limit exceeded');
              }
              return true;
            },
            {
              runId,
              agentName: 'TestAgent',
              taskType: 'default',
              attempt: 0,
              error: new Error(),
            },
            {
              maxRetries: 3,
              initialDelay: 500,
              maxDelay: 2000,
              backoffMultiplier: 2,
            }
          );
        }

        // 更新为完成
        tracker.updateStep(runId, step.name, 'completed', `${step.name} 完成`);
      }
    };

    // 执行场景
    try {
      await executeScenario();

      return NextResponse.json({
        success: true,
        runId,
        message: '测试完成',
        scenario,
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        runId,
        message: '测试失败',
        scenario,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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
 * GET /api/test-progress
 * 获取测试场景列表
 */
export async function GET() {
  return NextResponse.json({
    scenarios: [
      {
        id: 'success',
        name: '成功场景',
        description: '所有步骤都成功完成',
      },
      {
        id: 'error',
        name: '错误场景',
        description: '在代码生成步骤失败',
      },
      {
        id: 'retry',
        name: '重试场景',
        description: '在编译检查步骤触发重试机制',
      },
    ],
  });
}
