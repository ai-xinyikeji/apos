# APOS 架构文档

## 系统概览

APOS 是一个基于 AI Agent 的产品开发自动化系统，采用本地优先架构：

```
用户反馈信号 → AI 分析 → 原型生成 → 代码审查 → PR 合并
```

## 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  (Next.js App Router + React Components + Tailwind)     │
├─────────────────────────────────────────────────────────┤
│                    Application Layer                     │
│         (API Routes + Business Logic + Agents)           │
├─────────────────────────────────────────────────────────┤
│                      Service Layer                       │
│    (LLM Service + RAG Service + Git Service + DB)       │
├─────────────────────────────────────────────────────────┤
│                    Infrastructure Layer                  │
│  (SQLite + LanceDB + File System + GitHub API)          │
└─────────────────────────────────────────────────────────┘
```

## Agent 系统

### BaseAgent 抽象类

所有 Agent 继承自 `BaseAgent<TInput, TOutput>`：

```typescript
abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract run(input: TInput, runId: string): Promise<TOutput>;

  protected async getLLM(): Promise<LLMConfig>
  protected async trace(runId, step, status, message, details?): Promise<void>
}
```

### ProtoBuilderAgent

**执行流程**：
1. 可行性评估（可选）— 分析技术可行性，生成报告
2. RAG 代码检索 — 语义搜索相关组件，注入上下文
3. 代码生成 — 多模态输入（文字 + 图片），LLM 生成 JSON 格式代码
4. 自愈编译检查 — 运行 `npm run build`，LLM 自动修复（最多 3 次）
5. Git 操作 — 创建分支、提交、推送、创建 PR

### ReviewBotAgent

**执行流程**：
1. 获取 Git Diff（与 main/master 对比）
2. CodeGraph 变更影响分析（AST 调用链追踪）
3. LLM 代码审查（安全漏洞、代码质量、UI 一致性）
4. 生成 Markdown 报告
5. 发布 GitHub PR 评论（可选）

### SignalCollectorAgent

收集用户反馈信号（Amplitude / Zendesk / 竞品），LLM 生成模拟信号并存入数据库。

### ReportGeneratorAgent

读取 pending 状态的 signals，LLM 生成周报，保存到 `data/reports/`。

## 智能路由系统

```
请求
  │
  ▼
TaskClassifier      → 分类任务类型（reasoning/coding/summarize 等）
  │
  ▼
MultiDimAnalyzer    → 计算上下文大小、代码复杂度、预估成本
  │
  ▼
CustomRulesEngine   → 匹配用户自定义规则（按优先级）
  │
  ▼
ModelSelector       → 选择模型（含 Extended Thinking / Prompt Caching 判断）
  │
  ▼
BudgetChecker       → 检查预算，必要时降级
  │
  ▼
DecisionExplainer   → 生成人类可读的决策解释
```

**路由优先级**：Ollama（免费）→ Gemini Flash（便宜）→ Claude（准确）

详见 [docs/routing-system.md](./docs/routing-system.md)

## RAG 向量检索

```
Code Files → Chunk & Embed (Xenova/all-MiniLM-L6-v2, 384 dims)
           → LanceDB (code_chunks)
           → Semantic Search (Cosine Similarity)
```

- 文件扫描：`src/` 下的 `.ts/.tsx/.js/.jsx`
- 分块：每 60 行一块，重叠 15 行
- 检索：Top-3 最相关代码片段注入 Prompt

## 上下文压缩

混合压缩引擎，节省 70%+ Token：

| 引擎 | 适用 | 速度 | 压缩率 |
|------|------|------|--------|
| AST（TypeScript Compiler API + Babel） | TS/JS 文件 | < 50ms | ~70% |
| LLM（Ollama 本地模型） | 其他语言 | < 2s | ~70% |

压缩级别：`light`（~50%）/ `medium`（~70%）/ `aggressive`（~85%）

## 数据库 Schema

```
settings        — 键值配置（API Keys、路由设置、预算等）
signals         — 用户反馈信号（source / status / sentiment）
prototypes      — 原型项目（status 状态机）
agent_traces    — Agent 执行日志（run_id 分组）
routing_decisions — 路由决策历史
cost_records    — API 调用成本记录
custom_rules    — 用户自定义路由规则
budget_alerts   — 预算预警记录
```

### Prototype 状态机

```
draft → assessing → draft
      → generating → generated / pr_created → merged
                   → failed → generating（重试）
```

## 前端架构

- **页面**：`/`（Dashboard）、`/prototypes`、`/insights`、`/pull-requests`、`/settings`、`/settings/routing`、`/costs/dashboard`、`/routing/history`、`/workflows`
- **状态管理**：React useState + 直接 fetch + 2 秒轮询 Agent Traces
- **组件原则**：Server Components 优先，仅交互时用 `'use client'`

## 安全性

- 路径遍历防护：`fullPath.startsWith(process.cwd())`
- Git 操作限制在当前仓库
- LLM 输出 JSON Schema 校验
- 待完善：API Keys 加密存储、速率限制、身份验证

## 部署

### 本地开发

```bash
npm run dev  →  Next.js Dev Server (Port 3000)
                    ↓
                SQLite (data/apos.db)
                LanceDB (data/vectordb/)
```

### 生产部署（Docker）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
VOLUME ["/app/data"]
CMD ["npm", "start"]
```

环境变量参考 `.env.example`。
