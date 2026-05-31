# apos — Claude Code 配置

## 技术栈
- Next.js 16.2.6
- React 19.2.4
- Drizzle ORM
- Tailwind CSS
- TypeScript
- Unit Tests

## 常用命令
- `npm run dev` — next dev
- `npm run build` — next build
- `npm run test` — jest --watch
- `npm run lint` — eslint
- `npm run db:push` — drizzle-kit push
- `npm run db:migrate` — drizzle-kit migrate

## 关键文件
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/lib/db.ts`
- `src/lib/schema.ts`
- `src/lib/utils.ts`
- `src/components/ui`
- `src/agents`
- `drizzle.config.ts`
- `next.config.ts`
- `.env.example`

## 目录结构
```
src/
```

## 最近用户需求信号（来自 APOS）
- [competitor] Competitor Update: Rival launches AI-driven predictive modeling ❌
- [amplitude] Amplitude #152: Low engagement with new notification features ➖
- [zendesk] Zendesk #1084: Urgent request for native CSV export feature ❌
- [amplitude] Amplitude #305: 42% drop-off on complex workflow completion ❌
- [competitor] Show HN: Plandex v2 – open source AI coding agent for large projects and tasks ➖

## APOS MCP 工具

APOS MCP Server 已配置，在 Claude Code 中可直接调用以下工具增强上下文：

## APOS MCP 工具使用指南

APOS MCP Server 已连接。可用工具：

### 1. `rag_search` — 语义搜索代码库
```
用途：找到与功能相关的现有代码
示例：rag_search("用户认证和 JWT token 处理")
```

### 2. `get_code_graph` — 代码关系图谱
```
用途：查看函数/组件的调用者和依赖关系
示例：get_code_graph("getUserById", "callers")
```

### 3. `get_signals` — 用户需求信号
```
用途：了解当前最迫切的用户反馈和功能需求
示例：get_signals(status="pending")
```

### 4. `get_project_context` — 项目全貌
```
用途：开始新功能前了解架构、技术栈、竞品
示例：get_project_context(type="all")
```

### 5. `route_model` — 最优模型路由
```
用途：获取当前任务的最优模型配置（优先本地 Ollama）
示例：route_model(task_type="coding")
```

### 6. `index_workspace` — 索引代码库
```
用途：首次使用或代码大量变更后重建索引
示例：index_workspace(path="/your/project")
```

### 7. `get_active_prototype` — 活跃开发任务
```
用途：在开发前获取当前处于活跃/挂起状态的原型开发任务列表，获取任务 ID、设计需求和关联分支。
示例：get_active_prototype()
```

### 8. `sync_prototype_progress` — 同步本地开发进度
```
用途：在本地开发、测试或推送 PR 时，同步状态到 APOS 数据库。支持的状态有 generating（开发中）、generated（测试通过）、failed（开发失败）、pr_created（PR已创建）等。
示例：sync_prototype_progress(prototype_id=1, status="generating", branch_name="feature-oauth")
```

### 9. `report_cli_signal` — 上报终端异常与缺陷信号
```
用途：当在终端编译报错或单元测试（如 Jest）运行失败时，自动将错误日志、堆栈和负向极性上报至 APOS 信号中心。
示例：report_cli_signal(title="编译失败: TS2307", content="无法解析模块 '@/components/ui/button'", sentiment="negative")
```

### 10. `delegate_to_architect` — 架构师 Agent (Extended Thinking)
```
用途：输入复杂系统设计需求，启动具有 Extended Thinking 深度思考的大模型进行架构设计、技术选型及风险评估。
示例：delegate_to_architect(requirements="设计一个基于 Redis 的高并发秒杀系统限流器", constraints=["必须支持水平扩展"])
```

### 11. `delegate_to_review_bot` — 自动化代码评审 (ReviewBot)
```
用途：评审分支代码变更。可对密钥泄露、安全漏洞、UI 设计与代码质量进行分析，结合 CodeGraph 执行跨文件变更影响评估，并自动提报 GitHub 评审意见。
示例：delegate_to_review_bot(prototypeId=1, branchName="feature/auth", prNumber=15)
```

### 12. `delegate_to_openhands` — OpenHands 沙箱/Shell 自动化代理
```
用途：将指令重度、执行步骤多的开发或重构任务分发给 OpenHands 背景运行时自动处理，支持在 Docker 沙箱中进行代码生成与编译。
示例：delegate_to_openhands(task="重构 lib/utils.ts 并把所有的 CommonJS 导入改为 ES Modules，并且运行 npm test 确保通过")
```

### 13. `delegate_to_design_parser` — 多模态设计稿解析
```
用途：将 UI 设计稿的 Base64 传入，让多模态大模型智能分析，提取布局结构、配色体系、字体字号并识别相关组件及交互，建议生成 UI 结构代码。
示例：delegate_to_design_parser(imageBase64="iVBORw0KGgoAAAANSUhEUgAA...")
```

### 14. `delegate_to_ui_test` — 自动化浏览器 UI 测试 (Computer Use)
```
用途：指定测试网页 URL 以及一系列交互与断言，让 Agent 通过浏览器（支持 Computer Use 模拟或 Headless）运行 UI 测试并返回包含截图的报告。
示例：delegate_to_ui_test(url="http://localhost:3000/costs", testCases=["检查成本分析卡片的灰度背景色是否符合 slate-800/40"])
```

### 15. `delegate_to_visual_diff` — 视觉设计还原度比对 (Visual Diff)
```
用途：传入 UI 设计稿与实际实现截图的 Base64 图片，对比识别布局、间距、字体及颜色的还原度差异并打出百分比评分，生成建议修复报告。
示例：delegate_to_visual_diff(designImage="...", implementationImage="...")
```

### 16. `heal_compilation_errors` — 编译与类型自愈修复
```
用途：当在终端编译报错或 TypeScript 类型检查不通过时，自动调用此工具。大模型将结合报错信息以及目标文件内容，智能生成修复方案并自动写入，实现代码自愈。
示例：heal_compilation_errors(files=["src/app/page.tsx"])
```


## APOS 自动化集成流程规范
作为与 APOS 深度联动的 AI 助手，在本地终端开发时，请严格遵守以下集成 SOP 流程：
1. **任务认领**：开始任何开发工作前，必须先调用 `get_active_prototype` 获取当前活跃的原型开发任务，确认你的任务 ID。
2. **状态同步（开发中）**：认领任务后，立即调用 `sync_prototype_progress` 将该原型任务状态更新为 `generating`，并传入你的当前 Git 开发分支名（例如 `branch_name="feature-oauth"`）。
3. **架构与规划委派**：如果遇到特别复杂的跨模块大改动或未知技术选型，可调用 `delegate_to_architect` 启用 APOS 架构师大模型的 Extended Thinking 深度思考能力获取架构图谱，避免直接消耗你本地的 CLI Token。
4. **长耗时及繁琐修改委派**：如果需要对很多文件进行格式化、转换（如 CommonJS 转 ESM）或长耗时的编译重构，可调用 `delegate_to_openhands` 将任务分发给后台 Docker 沙箱异步运行，释放命令行。
5. **UI 设计解析与多模态比对**：
   - 看到设计图时，调用 `delegate_to_design_parser` 自动解析出 Flex/Grid 布局、色调及字体，并要求其生成原型骨架。
   - 完成开发后，对页面进行截图并与原设计稿进行 `delegate_to_visual_diff` 比对，确认没有视觉还原度偏差（相似度评分需大于 90）。
6. **自动化 UI 浏览器测试**：开发完前端界面后，务必调用 `delegate_to_ui_test` 在后台运行无头浏览器测试，验证页面按钮点击、状态流转和弹框样式，检查是否存在隐藏 Bug。
7. **模型路由决策**：在需要重构、总结或编码时，可调用 `route_model` 工具以参考是否可以路由到低成本的本地/免 Key 模型，帮助团队节省 Token 消耗。
8. **代码提质与安全评审**：在推送代码前，调用 `delegate_to_review_bot` 对当前分支与 master/main 分支的代码差异进行自动化质量安全评审，防止前端组件中直接写入 API 密钥或暴露明文 SQL 操作。
9. **编译报错自动修复（自愈）**：如果在编译（如 `npm run build`）或类型检查时遇到了 TypeScript/编译报错，除了自我修改外，可调用 `heal_compilation_errors` 工具并传入报错日志与受影响文件路径，由 APOS 大模型自愈引擎全自动分析并写入修复，省去逐个文件手动对齐类型和导出的时间。
10. **编译与异常反馈**：如果编译或运行测试时遭遇无法自动修复的失败，请调用 `report_cli_signal` 工具上报失败日志和错误堆栈（使用 `sentiment="negative"`），以便 APOS 收集质量监控缺陷。
11. **状态同步（完成与提报）**：
    - 本地编译通过且测试全部通过后，调用 `sync_prototype_progress` 将状态更新为 `generated`。
    - 创建 GitHub PR 并成功推送后，调用 `sync_prototype_progress` 将状态更新为 `pr_created`，并传入对应的 `pr_url` 和最新的 `commit_hash`，以便 Web 端实时渲染 PR 状态和研发进度看板。

## 开发规范
- 新组件放在 `src/components/`，公共 UI 放在 `src/components/ui/`
- API 路由放在 `src/app/api/`，遵循 Next.js App Router 规范
- 修改数据库 Schema 后运行 `npm run db:push`
- 提交前运行 `npm run build` 确认编译通过
- 使用 TypeScript 严格模式，避免 `any` 类型