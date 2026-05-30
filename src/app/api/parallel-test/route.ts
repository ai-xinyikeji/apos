import { ParallelAgentExecutor } from '@/lib/parallel-executor';
import { ProtoBuilderAgent } from '@/agents/proto-builder';
import { ArchitectAgent } from '@/agents/architect-agent';

export const dynamic = 'force-dynamic';

/**
 * POST /api/parallel-test
 * 
 * 测试并行执行功能
 * 
 * 示例请求:
 * {
 *   "scenario": "multi-component" | "architecture-first"
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const scenario = body.scenario || 'multi-component';

    const executor = new ParallelAgentExecutor();

    if (scenario === 'multi-component') {
      // 场景 1: 并行生成多个独立组件
      const tasks = [
        {
          id: 'header',
          agent: new ProtoBuilderAgent(),
          input: {
            prototypeId: 0,
            name: 'Header Component',
            description: '创建一个响应式的页面头部组件，包含 Logo 和导航菜单',
            branchName: 'test-header',
            assessOnly: true,
          },
          dependencies: [],
          priority: 1,
        },
        {
          id: 'footer',
          agent: new ProtoBuilderAgent(),
          input: {
            prototypeId: 0,
            name: 'Footer Component',
            description: '创建一个页面底部组件，包含版权信息和链接',
            branchName: 'test-footer',
            assessOnly: true,
          },
          dependencies: [],
          priority: 1,
        },
        {
          id: 'sidebar',
          agent: new ProtoBuilderAgent(),
          input: {
            prototypeId: 0,
            name: 'Sidebar Component',
            description: '创建一个侧边栏组件，包含导航菜单',
            branchName: 'test-sidebar',
            assessOnly: true,
          },
          dependencies: [],
          priority: 2,
        },
      ];

      const results = await executor.executeParallel(tasks);
      const report = executor.generateReport(results);

      return Response.json({
        success: true,
        scenario: 'multi-component',
        results: Array.from(results.entries()).map(([id, result]) => ({
          id,
          success: result.success,
          duration: result.duration,
          error: result.error?.message,
        })),
        report,
      });
    } else if (scenario === 'architecture-first') {
      // 场景 2: 先架构设计，再并行实现
      const tasks = [
        {
          id: 'architecture',
          agent: new ArchitectAgent(),
          input: {
            requirements: '设计一个用户认证系统，支持邮箱登录和第三方登录',
            constraints: ['使用 Next.js', '使用 PostgreSQL', '支持 JWT'],
          },
          dependencies: [],
          priority: 10,
        },
        {
          id: 'login-page',
          agent: new ProtoBuilderAgent(),
          input: {
            prototypeId: 0,
            name: 'Login Page',
            description: '根据架构设计实现登录页面',
            branchName: 'test-login',
            assessOnly: true,
          },
          dependencies: ['architecture'],
          priority: 5,
        },
        {
          id: 'register-page',
          agent: new ProtoBuilderAgent(),
          input: {
            prototypeId: 0,
            name: 'Register Page',
            description: '根据架构设计实现注册页面',
            branchName: 'test-register',
            assessOnly: true,
          },
          dependencies: ['architecture'],
          priority: 5,
        },
      ];

      const results = await executor.executeParallel(tasks);
      const report = executor.generateReport(results);

      return Response.json({
        success: true,
        scenario: 'architecture-first',
        results: Array.from(results.entries()).map(([id, result]) => ({
          id,
          success: result.success,
          duration: result.duration,
          error: result.error?.message,
        })),
        report,
      });
    }

    return Response.json({
      success: false,
      error: 'Unknown scenario',
    }, { status: 400 });
  } catch (error: any) {
    console.error('Parallel test failed:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
