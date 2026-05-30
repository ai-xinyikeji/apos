# APOS 改进路线图

## 当前状态评估

### ✅ 已完成 (60-70%)
- Multi-Agent 系统 (ProtoBuilder, SignalCollector, ReviewBot, ReportGenerator)
- RAG 向量检索 (LanceDB + Xenova)
- Git 工作流集成
- 多模型路由 (Claude, GPT, Gemini)
- Self-healing 编译检查
- 完整的 Web UI

### ❌ 缺失功能 (30-40%)
- OpenHands 集成
- Growth OS (A/B testing, UI optimization)
- Code Graph 关系图谱与 AST 语义内存 (纯向量 RAG 升级)

---

## Phase 1: Task DAG 并行系统 ✅ **已完成**

**目标**: 支持并行任务执行与多任务依赖调度。

### 1.1 Task DAG 设计 ✅
已在 [task-dag.ts](file:///Users/clive/Documents/source/cousor/apos/src/lib/orchestrator/task-dag.ts) 中实现，基于拓扑排序进行依赖解析与防环校验。
```typescript
export class TaskDAG {
  private nodes: Map<string, TaskNode>;
  private executionOrder: string[];
  
  addTask(task: Task): void;
  getReadyTasks(): Task[];
  validate(): { valid: boolean; error?: string };
  generateExecutionPlan(): string[];
}
```

### 1.2 并行执行引擎 ✅
已在 [task-executor.ts](file:///Users/clive/Documents/source/cousor/apos/src/lib/orchestrator/task-executor.ts) 中实现。利用 `Promise.allSettled` 在满足依赖关系的前提下以设定并发度运行：
* 执行 Agent 任务（如 `ProtoBuilder`, `ReviewBot`）
* 执行 Shell 指令（如测试、构建）
* 自动处理失败任务的后代依赖跳过（Skip cascade）

---

## Phase 2: 本地模型集成 ✅ **已完成**

**目标**: 集成 LM Studio 本地模型以优化大模型调用成本。

### 2.1 LM Studio 客户端与优先级路由 ✅
已实现自动感知 LM Studio 状态，并以 `LM Studio > Cloud Gemini > Cloud Claude` 的路由分层策略，将总结、自愈、审计等低推理成本的任务自动路由至本地运行。

### 2.2 本地 Embedding ✅
已集成 Xenova Transformers (`Xenova/all-MiniLM-L6-v2`) 运行 384 维向量编码，无外部 API 依赖。

---


## Phase 3: OpenHands 集成 🟢

**目标**: 集成 OpenHands 作为 Agent Runtime

### 4.1 安装 OpenHands

```bash
# 使用 Docker
docker pull ghcr.io/all-hands-ai/openhands:latest

# 或使用 Python
pip install openhands-ai
```

### 4.2 集成到 Orchestrator

```typescript
// runtime/agents/openhands-agent.ts
import { OpenHands } from 'openhands-ai';

export class OpenHandsAgent extends BaseAgent {
  private client = new OpenHands();
  
  async run(input: { task: string }): Promise<Result> {
    return await this.client.execute({
      task: input.task,
      workspace: process.cwd(),
      tools: ['shell', 'git', 'filesystem']
    });
  }
}
```

### 4.3 Shell Tool Use

```typescript
// OpenHands 自动处理:
// - npm install
// - git commit
// - file operations
// - test execution
```

---

## Phase 4: Growth OS 🔵

**目标**: 实现产品增长闭环

### 5.1 Usage Metrics

```typescript
// runtime/growth/metrics.ts
export class MetricsCollector {
  async track(event: string, properties: any): Promise<void> {
    await db.insert(events).values({
      event,
      properties: JSON.stringify(properties),
      timestamp: new Date()
    });
  }
}
```

### 5.2 Feature Ranking

```typescript
// runtime/growth/ranking.ts
export class FeatureRanker {
  async rank(): Promise<Feature[]> {
    const usage = await this.getUsageStats();
    const sentiment = await this.getSentiment();
    return this.calculateScore(usage, sentiment);
  }
}
```

### 5.3 A/B Testing

```typescript
// runtime/growth/experiments.ts
export class ExperimentEngine {
  async runExperiment(feature: string): Promise<Result> {
    const variantA = await this.deployVariant('A');
    const variantB = await this.deployVariant('B');
    return await this.compare(variantA, variantB);
  }
}
```

### 5.4 Auto UI Optimization

```typescript
// runtime/growth/optimizer.ts
export class UIOptimizer {
  async optimize(component: string): Promise<void> {
    const metrics = await this.getMetrics(component);
    const suggestions = await this.llm.analyze(metrics);
    await this.applyChanges(suggestions);
  }
}
```

---

## Phase 5: 完整 Product Discovery 🔵

**目标**: 自动化产品发现

### 6.1 GitHub 趋势分析

```typescript
// runtime/discovery/github.ts
export class GitHubTrendAnalyzer {
  async analyze(): Promise<Trend[]> {
    const trending = await fetch('https://api.github.com/trending');
    return await this.llm.extractInsights(trending);
  }
}
```

### 6.2 Reddit/HN 监测

```typescript
// runtime/discovery/social.ts
export class SocialListener {
  async listen(sources: string[]): Promise<Signal[]> {
    const reddit = await this.scrapeReddit();
    const hn = await this.scrapeHN();
    return [...reddit, ...hn];
  }
}
```

### 6.3 竞品分析

```typescript
// runtime/discovery/competitor.ts
export class CompetitorAnalyzer {
  async analyze(competitors: string[]): Promise<Insight[]> {
    const features = await this.extractFeatures(competitors);
    const gaps = await this.findGaps(features);
    return gaps;
  }
}
```

---

## Phase 6: Code Graph & Relational Memory 🔵

**目标**: 从单纯文本分块检索 (RAG) 升级为基于 AST (Abstract Syntax Tree) 的本地代码图关系语义网，极大降低 Agent 执行的 Token 消耗与幻觉率。

### 7.1 Tree-sitter AST 解析器集成
- 集成 `web-tree-sitter` 用于多语言 AST 解析
- 提取 Symbol 节点 (Classes, Functions, Methods, Variables, Routes)
- 提取 Relation 边 (Calls, Imports, Implements, Extends)

### 7.2 SQLite / Drizzle 图谱存储
- 在现有的 `apos.db` 中建立 `code_nodes` 与 `code_edges` 图谱表
- 使用 Drizzle ORM 管理图谱结构，支持 Symbol 快速匹配与全文本索引 (FTS5)

### 7.3 GraphRAG 混合检索
- 设计 `GraphQueryManager` 协调向量检索 (LanceDB) 与图谱查询 (SQLite)
- 自动提取依赖上下文（例如：若检索到某组件，自动抓取其依赖的子组件、Helper 函数和对应的 API Route 签名）

### 7.4 ReviewBot 变更影响分析 (Impact Analysis)
- 升级 `ReviewBotAgent`，通过改动 Diff 中的 Symbol 名称，在图谱中反向查询 Callers
- 评估变更对上游依赖的影响，自动标记潜在的破坏性改动 (Breaking Changes)

---

## 优先级排序

### 🔴 P0 (必须完成)
1. **Task DAG 并行系统** (已完成)
2. **本地模型集成** (已完成)

### 🟡 P1 (重要)
3. **OpenHands 集成** - Agent 增强
4. **Code Graph 关系内存** - 提升生成和分析精准度

### 🟢 P2 (可选)
5. **Growth OS (A/B Testing & UI Optimizer)** - 产品增长与 A/B 测试
6. **Product Discovery** - 自动化产品发现

### 🔵 P3 (未来)
7. **Multi-Repo 支持**
8. **Team Collaboration**
9. **Plugin System**

---

## 时间估算

| Phase | 工作量 | 预计时间 |
|-------|--------|---------|
| Phase 1: Task DAG | 中 | 1-2 周 (已完成) |
| Phase 2: 本地模型 | 中 | 1-2 周 (已完成) |
| Phase 3: OpenHands | 小 | 3-5 天 |
| Phase 4: Growth OS | 中 | 1-2 周 |
| Phase 5: Discovery | 中 | 1-2 周 |
| Phase 6: Code Graph | 中 | 1-2 周 |

**总计**: 约 1.5-2.5 个月 (全职开发)

---

## 技术债务清理

### 当前问题
1. ❌ 无自动任务队列系统（当前仅有简单的内存轮询）
2. ❌ 依赖云端 LLM (成本高)
3. ❌ RAG 向量检索缺乏代码结构和关系感知，易丢失导入/引用上下文或 split-function 导致幻觉

### 解决方案
1. ✅ 实现内置 Task Queue 与后台工作线程进行任务并发调度
2. ✅ 集成 LM Studio 实现成本优化
3. ✅ 引入 Tree-sitter 构建本地 SQLite 代码图，结合 LanceDB 实现 GraphRAG 混合检索与 ReviewBot 影响分析

---

## 最终架构目标

```
┌────────────────────────────┐
│      Next.js Web App       │
│   (React + shadcn/ui)      │
└────────────┬───────────────┘
             ↓
┌────────────────────────────┐
│    Node.js Orchestrator    │
│   (Next.js App Runtime)    │
│   ├─ Task Queue            │
│   ├─ Agent Dispatcher      │
│   └─ Workflow Engine       │
└────────────┬───────────────┘
             ↓
┌────────────────────────────┐
│   Model Router             │
│   ├─ LM Studio (local)     │
│   ├─ Gemini (cloud)        │
│   └─ Claude (cloud)        │
└────────────┬───────────────┘
             ↓
┌────────────────────────────┐
│   Multi-Agent System       │
│   ├─ Planner               │
│   ├─ Architect             │
│   ├─ Coder (OpenHands)     │
│   ├─ Reviewer              │
│   ├─ Debugger              │
│   └─ QA                    │
└────────────┬───────────────┘
             ↓
┌────────────────────────────┐
│   Memory Layer             │
│   ├─ SQLite (structured)   │
│   ├─ LanceDB (vectors)     │
│   └─ Code Graph (AST/rel)  │
└────────────┬───────────────┘
             ↓
┌────────────────────────────┐
│   Tool Layer               │
│   ├─ Shell Executor        │
│   ├─ Git Integration       │
│   ├─ Filesystem Ops        │
│   └─ Test Runner           │
└────────────────────────────┘
```

---

## 成功指标

### 技术指标
- ✅ 启动时间 < 3 秒
- ✅ 内存占用 < 500MB
- ✅ 本地模型占比 > 50%
- ✅ 任务并行度 > 3x

### 产品指标
- ✅ 代码生成成功率 > 80%
- ✅ 编译通过率 > 90%
- ✅ PR 创建成功率 > 95%
- ✅ 用户满意度 > 4.5/5

---

## 下一步行动

1. **并行进行**: Phase 3 (OpenHands 集成) 与 Phase 6 (Code Graph 关系内存)
2. **逐步推进**: Phase 4 & 5
3. **完成所有缺失功能并发布 Web 平台**
