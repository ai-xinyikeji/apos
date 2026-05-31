# APOS — AI Product OS

> 本地优先的需求到代码生成系统

APOS 是一个智能产品开发操作系统，通过 AI Agent 自动化从用户反馈到代码实现的完整流程：监测用户信号 → AI 分析 → 原型生成 → 代码审查 → PR 合并。

## 核心特性

- **ProtoBuilder Agent** — 从需求描述生成完整 React 代码，支持多模态图片输入、自愈编译检查、RAG 代码检索
- **ReviewBot Agent** — 自动化代码审查，安全漏洞检测，自动发布 GitHub PR 评论
- **SignalCollector Agent** — 收集用户反馈信号（Amplitude / Zendesk / 竞品）
- **智能模型路由** — 自动选择最优模型：Ollama（免费）→ Gemini Flash（便宜）→ Claude（准确）
- **上下文压缩** — AST + LLM 双引擎压缩，节省 70%+ Token
- **成本追踪** — 实时成本仪表板，预算预警，自动降级
- **Task DAG** — 并行任务执行，2-5x 加速
- **Growth OS** — 自动 Metrics 收集，功能排名，数据驱动决策

## 快速开始

### 环境要求

- Node.js 20+
- Git
- Ollama（本地模型，可选但推荐）

### 安装

```bash
git clone <repository-url>
cd apos
npm install
npm run db:push
```

### 配置

创建 `.env.local`：

```env
# 至少配置一个 AI Provider
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
GOOGLE_GENERATIVE_AI_API_KEY=your_key

# GitHub Token（用于 PR 创建，可选）
GITHUB_TOKEN=your_token

# Ollama（默认 localhost:11434，可选）
OLLAMA_BASE_URL=http://localhost:11434
```

### 启动

```bash
npm run dev
# 访问 http://localhost:3000
```

### 启用 Ollama 本地模型（推荐，免费）

```bash
brew install ollama
ollama pull qwen2.5-coder:7b   # 推荐代码模型
ollama serve
```

然后在 `/settings` 页面开启"Ollama 优先"。

## 三种使用方式

### 方式 1：Web UI（完整功能）

访问 `http://localhost:3000`，使用图形界面进行原型开发、代码审查等。

### 方式 2：Claude CLI 代理（推荐，完全免费）

让 Claude CLI 的所有请求自动通过 APOS 路由，使用 Ollama 本地模型。

```bash
# 配置（添加到 ~/.zshrc）
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=your_key

# 使用
claude "写一个 TypeScript 函数计算斐波那契数列"
```

自动配置脚本：`./scripts/setup-claude-cli.sh`

### 方式 3：Claude Desktop MCP 工具

在 Claude Desktop 对话中调用 APOS 工具（代码搜索、原型生成、代码审查等）。

自动配置脚本：`./scripts/setup-claude-desktop.sh`

## 常用命令

```bash
# 开发
npm run dev          # 启动开发服务器
npm run build        # 生产构建
npm run lint         # 代码检查

# 数据库
npm run db:push      # 推送 Schema 到数据库
npm run db:generate  # 生成迁移文件
npm run db:studio    # 打开数据库管理界面

# 测试
npm test             # 运行测试套件

# 脚本
./check-apos.sh      # 检查服务状态
./start-apos.sh      # 启动服务（后台）
./scripts/health-check.sh   # 系统健康检查
./scripts/test-api.sh       # API 端点测试
```

## 项目结构

```
apos/
├── src/
│   ├── agents/          # AI Agent 实现
│   ├── app/             # Next.js App Router（页面 + API）
│   ├── components/      # React 组件
│   └── lib/             # 核心库（LLM、RAG、压缩、路由等）
├── data/                # 本地数据（SQLite + LanceDB）
├── drizzle/             # 数据库迁移文件
├── docs/                # 详细文档
├── scripts/             # 工具脚本
└── apos-extension/      # Chrome 扩展
```

## 文档

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、Agent 设计、数据库 Schema |
| [API.md](./API.md) | 所有 API 端点参考 |
| [docs/routing-system.md](./docs/routing-system.md) | 智能路由系统详解 |
| [docs/cost-optimization-guide.md](./docs/cost-optimization-guide.md) | 成本优化指南 |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 常见问题排查 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献指南 + 测试说明 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新记录 + 路线图 |

## 技术栈

- **框架**: Next.js 16 App Router + React 19
- **样式**: Tailwind CSS 4 + shadcn/ui
- **数据库**: SQLite (Drizzle ORM) + LanceDB（向量）
- **AI**: Vercel AI SDK，支持 Anthropic / OpenAI / Google / Ollama
- **工具**: TypeScript Compiler API（AST 压缩）、simple-git

## 许可证

MIT
