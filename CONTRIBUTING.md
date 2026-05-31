# 贡献指南

## 开发环境设置

```bash
git clone <repository-url>
cd apos
npm install
cp .env.example .env.local   # 填入 API Keys
npm run db:push
npm run dev
```

## 开发流程

### 分支命名

- `feature/` — 新功能
- `fix/` — Bug 修复
- `docs/` — 文档更新
- `refactor/` — 代码重构

### 提交规范（Conventional Commits）

```
feat: add user authentication
fix: resolve compilation error in ProtoBuilder
docs: update API documentation
refactor: extract LLM service to separate module
```

### Pull Request

1. 创建功能分支
2. 编写代码，遵循下方编码规范
3. 运行 `npm run lint` 和 `npm run build` 确认无错误
4. 提交 PR，描述变更内容和测试方式

## 编码规范

### TypeScript

- 所有新代码使用 TypeScript，避免 `any`
- 变量/函数用 `camelCase`，类/接口用 `PascalCase`
- 复杂函数添加 JSDoc 注释

### React 组件

- 默认使用 Server Components，仅在需要交互时加 `'use client'`
- 明确定义 Props 接口
- 使用 Tailwind CSS，避免内联样式

### 数据库

- 使用 Drizzle ORM，不直接写 SQL
- 复杂操作使用事务

## 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定模块（推荐，避免超时）
npx jest --testPathPattern="task-classifier" --forceExit --no-coverage
npx jest --testPathPattern="model-selector|budget-checker" --forceExit --no-coverage
npx jest --testPathPattern="proto-builder|review-bot" --forceExit --no-coverage

# 构建检查（TypeScript 类型检查）
npm run build
```

### 测试结构

```
src/
├── agents/__tests__/          # Agent 单元测试
├── lib/__tests__/             # 核心库单元测试
├── lib/routing/__tests__/     # 路由系统测试
├── lib/cost/__tests__/        # 成本系统测试
└── app/api/__tests__/         # API 路由测试
```

### 脚本测试

```bash
./scripts/health-check.sh      # 系统健康检查
./scripts/test-api.sh          # API 端点测试
./scripts/test-ollama.sh       # Ollama 集成测试
./scripts/test-orchestrator.sh # Task DAG 测试
./scripts/clean-test-data.sh   # 清理测试数据
```

### 手动测试清单

- [ ] `http://localhost:3000` 无报错
- [ ] `/settings` 页面可以保存 API Key，Ollama 状态检测正常
- [ ] ProtoBuilder：创建原型 → 可行性评估 → 代码生成 → 查看日志
- [ ] ReviewBot：对有 PR 的原型运行代码审查
- [ ] `/costs/dashboard` 成本仪表板正常显示
- [ ] `/settings/routing` 自定义规则创建、编辑、删除正常

## 报告 Bug

创建 Issue 时请包含：
- 复现步骤
- 期望行为 vs 实际行为
- 环境信息（OS、Node.js 版本）
- 相关日志或截图

## 许可证

提交代码即表示您同意将代码以 MIT 许可证发布。
