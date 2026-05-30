# APOS 架构文档

## 系统概览

APOS 是一个基于 AI Agent 的产品开发自动化系统，采用本地优先架构，核心流程为：

```
用户反馈信号 → AI 分析 → 原型生成 → 代码审查 → PR 合并
```

## 核心架构

### 1. 分层架构

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

## Agent 系统设计

### BaseAgent 抽象类

所有 Agent 继承自 `BaseAgent<TInput, TOutput>`，提供：

- **LLM 调用**: 统一的 LLM 接口（支持 Anthropic/OpenAI/Google）
- **Trace 记录**: 自动记录执行步骤到数据库
- **错误处理**: 统一的异常捕获和日志
- **类型安全**: 泛型约束输入输出

```typescript
abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract run(input: TInput, runId: string): Promise<TOutput>;
  
  protected async getLLM(): Promise<LLMConfig>
  protected async trace(runId: string, step: string, status: string, message: string, details?: any): Promise<void>
}
```

### Agent 工作流

#### 1. ProtoBuilderAgent

**输入**:
- prototypeId: 原型 ID
- name: 原型名称
- description: 功能描述
- branchName: Git 分支名
- image?: 手绘草图（Base64）
- assessOnly?: 是否仅评估

**执行流程**:

```
1. 可行性评估（可选）
   ├─ 读取现有 UI 组件列表
   ├─ LLM 分析技术可行性
   └─ 生成 Markdown 报告

2. RAG 代码检索
   ├─ 索引本地代码库（LanceDB）
   ├─ 语义搜索相关组件
   └─ 注入上下文到 Prompt

3. 代码生成
   ├─ 构建 Prompt（需求 + 可行性 + RAG）
   ├─ 多模态输入（文字 + 图片）
   ├─ LLM 生成 JSON 格式代码
   └─ 解析并写入文件

4. 自愈编译检查
   ├─ 运行 npm run build
   ├─ 检测编译错误
   ├─ LLM 自动修复（最多 3 次）
   └─ 重新写入修复后的代码

5. Git 操作
   ├─ 创建功能分支
   ├─ 提交代码
   ├─ 推送到远程
   └─ 创建 Pull Request

6. 更新数据库状态
```

**输出**:
- success: 是否成功
- prUrl?: PR 链接
- error?: 错误信息

#### 2. SignalCollectorAgent

**输入**:
- sources?: 数据源列表（默认：amplitude, zendesk, competitor）

**执行流程**:

```
1. LLM 生成模拟信号
   ├─ 构建 Prompt（指定数据源）
   ├─ LLM 生成 JSON 格式信号
   └─ 解析信号列表

2. 保存到数据库
   ├─ 插入 signals 表
   ├─ 设置状态为 pending
   └─ 记录情感分析结果

3. 返回统计信息
```

**输出**:
- success: 是否成功
- count: 收集到的信号数量

#### 3. ReviewBotAgent

**输入**:
- prototypeId: 原型 ID
- branchName: 分支名
- prNumber?: PR 编号

**执行流程**:

```
1. 获取 Git Diff
   ├─ 确定基础分支（main/master）
   ├─ 执行 git diff
   └─ 提取代码变更

2. LLM 代码审查
   ├─ 安全漏洞检测
   │   ├─ 客户端直接写数据库
   │   ├─ 密钥硬编码
   │   └─ 未授权 API 访问
   ├─ 代码质量分析
   │   ├─ React Hooks 使用
   │   ├─ 导入规范
   │   └─ Console/Debugger 检查
   └─ UI 一致性检查

3. 生成 Markdown 报告
   ├─ 改动概览
   ├─ 安全审计
   ├─ 代码质量
   └─ 改进建议

4. 发布 GitHub 评论（可选）
   ├─ 调用 GitHub API
   └─ 发布到 PR

5. 保存报告到 Trace
```

**输出**:
- success: 是否成功
- report: Markdown 报告
- error?: 错误信息

#### 4. ReportGeneratorAgent

**输入**:
- 无（自动读取 pending 状态的 signals）

**执行流程**:

```
1. 查询待分析信号
   ├─ 从数据库读取 pending signals
   └─ 按来源分组

2. LLM 生成周报
   ├─ 构建 Prompt（所有信号）
   ├─ LLM 分析趋势和洞察
   └─ 生成 Markdown 报告

3. 保存报告文件
   ├─ 写入 data/reports/ 目录
   └─ 文件名：weekly-YYYYMMDD-HHMMSS.md

4. 更新信号状态
   ├─ 标记为 analyzed
   └─ 更新时间戳

5. 返回报告内容
```

**输出**:
- success: 是否成功
- report: 报告内容
- filename: 文件名

## RAG 向量检索系统

### 架构设计

```
┌──────────────┐
│  Code Files  │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  Chunk & Embed   │  ← Xenova/all-MiniLM-L6-v2
│  (384 dims)      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│    LanceDB       │  ← Vector Storage
│  (code_chunks)   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Semantic Search  │  ← Cosine Similarity
└──────────────────┘
```

### 索引流程

1. **文件扫描**: 递归扫描 `src/` 目录下的 `.ts`, `.tsx`, `.js`, `.jsx` 文件
2. **代码分块**: 每 60 行为一个 chunk，重叠 15 行
3. **向量化**: 使用 Xenova Transformers 生成 384 维向量
4. **存储**: 写入 LanceDB `code_chunks` 表

### 检索流程

1. **查询向量化**: 将需求描述转换为 384 维向量
2. **相似度搜索**: LanceDB 执行 L2 距离搜索
3. **返回结果**: Top-K 最相关的代码片段（默认 K=3）
4. **注入上下文**: 将检索结果添加到 LLM Prompt

### 数据结构

```typescript
interface CodeChunk {
  vector: number[];      // 384-dim embedding
  text: string;          // Code content with context
  filePath: string;      // Relative file path
  startLine: number;     // Starting line number
}
```

## 数据库设计

### ER 图

```
┌─────────────┐
│  settings   │
├─────────────┤
│ id (PK)     │
│ key (UK)    │
│ value       │
│ created_at  │
│ updated_at  │
└─────────────┘

┌─────────────────┐
│    signals      │
├─────────────────┤
│ id (PK)         │
│ source          │  ← 'amplitude' | 'zendesk' | 'competitor'
│ title           │
│ content         │
│ url             │
│ status          │  ← 'pending' | 'analyzed' | 'archived'
│ sentiment       │  ← 'positive' | 'neutral' | 'negative'
│ created_at      │
│ updated_at      │
└─────────────────┘

┌─────────────────────┐
│    prototypes       │
├─────────────────────┤
│ id (PK)             │
│ name                │
│ description         │
│ branch_name         │
│ status              │  ← 'draft' | 'assessing' | 'generating' | 
│ code_path           │     'generated' | 'pr_created' | 'merged' | 'failed'
│ preview_url         │
│ commit_hash         │
│ pr_number           │
│ pr_url              │
│ feasibility_report  │
│ created_at          │
│ updated_at          │
└─────────────────────┘

┌─────────────────┐
│  agent_traces   │
├─────────────────┤
│ id (PK)         │
│ agent_name      │  ← 'ProtoBuilder' | 'ReviewBot' | etc.
│ run_id          │  ← UUID for grouping
│ step            │
│ status          │  ← 'info' | 'success' | 'warning' | 'error'
│ message         │
│ details         │  ← JSON string
│ created_at      │
└─────────────────┘
```

### 状态机

#### Prototype 状态流转

```
draft
  ├─→ assessing (评估中)
  │     └─→ draft (评估完成)
  │
  └─→ generating (生成中)
        ├─→ generated (生成成功，无 GitHub Token)
        ├─→ pr_created (PR 已创建)
        │     └─→ merged (PR 已合并)
        └─→ failed (生成失败)
              └─→ generating (重试)
```

#### Signal 状态流转

```
pending (待分析)
  └─→ analyzed (已分析)
        └─→ archived (已归档)
```

## API 设计

### RESTful 端点

#### Prototypes

```
GET    /api/prototypes           # 获取所有原型
POST   /api/prototypes           # 创建原型草稿
POST   /api/prototypes/run       # 触发 Agent 执行
```

#### Insights

```
GET    /api/insights             # 获取信号和报告
POST   /api/insights             # 运行 SignalCollector
POST   /api/insights/report      # 运行 ReportGenerator
```

#### Pull Requests

```
GET    /api/pull-requests        # 获取所有 PR
POST   /api/pull-requests/review # 运行 ReviewBot
GET    /api/pull-requests/report # 获取审查报告
```

#### Settings

```
GET    /api/settings             # 获取所有配置
POST   /api/settings             # 更新配置
GET    /api/settings/status      # 获取系统状态
GET    /api/settings/usage       # 获取 Token 使用统计
```

#### Compression (NEW!)

```
POST   /api/compression/compress # 压缩内容
GET    /api/compression/compress # 获取压缩系统状态
GET    /api/compression/stats    # 获取压缩统计数据
```

#### Traces

```
GET    /api/traces?runId=xxx     # 获取执行日志
```

## Context Compression System (NEW!)

### 架构设计

Context Compression System 是一个混合压缩引擎，用于减少发送给 LLM 的上下文大小，从而节省 Token 和成本。

#### 压缩流程

```
┌─────────────────────────────────────────────────────────┐
│                    Input Context                         │
│              (Messages / Files / Code)                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Language Detection   │
         │  (TypeScript/JS/etc)  │
         └───────────┬───────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────┐          ┌──────────────┐
│ AST-based    │          │ LLM-based    │
│ Compression  │          │ Compression  │
│ (TS/JS)      │          │ (Other)      │
└──────┬───────┘          └──────┬───────┘
       │                         │
       │  Fast & Accurate        │  Universal
       │  < 50ms                 │  < 2s
       │                         │
       └────────────┬────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  Compressed      │
         │  Context         │
         │  (70% smaller)   │
         └──────────────────┘
```

#### 核心组件

**1. AST Analyzer** (`extractCodeSummaryAST`)
- 使用 TypeScript Compiler API 解析 TS/TSX
- 使用 Babel Parser 解析 JS/JSX
- 提取：
  - 函数签名（参数、返回类型）
  - 类定义（方法、属性）
  - 接口和类型
  - 导入/导出语句
  - TODO/FIXME 注释

**2. LLM Compressor** (`compressCodeBlock`)
- 使用本地 LM Studio 模型
- 保留 API 表面
- 移除实现细节
- 回退机制：AST 失败时使用

**3. Message Pipeline** (`compressMessages`)
- 扫描 Anthropic 格式消息
- 提取代码块（markdown fences）
- 批量压缩
- 保持消息结构

**4. Compression Levels**

| Level | Threshold | Max Tokens | Compression Rate | Use Case |
|-------|-----------|------------|------------------|----------|
| light | 10,000 chars | 4,096 | ~50% | 保留细节 |
| medium | 5,000 chars | 2,048 | ~70% | 平衡 |
| aggressive | 2,000 chars | 1,024 | ~85% | 最大压缩 |

#### 集成点

**1. Claude CLI Proxy** (`/api/v1/messages`)
```typescript
// 自动拦截 Claude CLI 请求
if (compressionEnabled && totalChars > threshold) {
  const level = totalChars > 50000 ? 'aggressive' : 
                totalChars > 20000 ? 'medium' : 'light';
  
  const result = await compressMessages(messages, system, level);
  // 使用压缩后的消息继续处理
}
```

**2. ProtoBuilder Agent RAG**
```typescript
// RAG 检索后压缩
if (compressionEnabled && ragContext.length > 5000) {
  const { compressed, stats } = await compressFile(
    'rag-context.txt',
    ragContext,
    'medium'
  );
  
  if (stats.reduction > 20) {
    ragContext = compressed; // 使用压缩版本
  }
}
```

#### 性能指标

- **AST 压缩速度**: < 50ms
- **LLM 压缩速度**: < 2s (本地模型)
- **平均压缩率**: 70%
- **Token 节省**: 70%+
- **成本节省**: $3-5 per 1M tokens

#### 错误处理

```typescript
try {
  // 尝试压缩
  const compressed = await compress(content);
  return compressed;
} catch (error) {
  // 失败时回退到原始内容
  console.warn('Compression failed, using original');
  return content;
}
```

压缩失败不会影响主流程，系统会自动回退到原始内容。

## 前端架构

### 页面结构

```
/                    # Dashboard (统计概览)
/prototypes          # 原型管理
/insights            # 洞察中心
/pull-requests       # PR 管理
/settings            # 系统设置 (包含压缩配置)
/components-catalog  # 组件目录（开发用）
```

### 状态管理

- **本地状态**: React useState/useRef
- **服务端状态**: 直接 fetch + 轮询
- **实时更新**: 2 秒轮询 Agent Traces

### 组件设计原则

1. **Server Components 优先**: 默认使用 RSC，减少客户端 JS
2. **Client Components**: 仅在需要交互时使用 `'use client'`
3. **数据获取**: 直接在 Server Component 中查询数据库
4. **样式**: Tailwind CSS + CVA (Class Variance Authority)

## 安全性设计

### 威胁模型

1. **代码注入**: LLM 生成恶意代码
   - 缓解：路径遍历检查、沙箱执行
   
2. **密钥泄露**: API Keys 暴露
   - 缓解：本地存储、环境变量、不提交到 Git

3. **未授权访问**: 无认证机制
   - 当前状态：本地单用户使用
   - 未来：添加身份验证

4. **供应链攻击**: 依赖包漏洞
   - 缓解：定期更新依赖、使用 npm audit

### 安全检查清单

- [x] 路径遍历防护（`fullPath.startsWith(process.cwd())`）
- [x] Git 操作安全（仅操作当前仓库）
- [x] LLM 输出验证（JSON Schema 校验）
- [ ] API Keys 加密存储
- [ ] 速率限制
- [ ] 输入清理和验证

## 性能优化

### 前端优化

1. **代码分割**: Next.js 自动分割
2. **图片优化**: next/image 组件
3. **字体优化**: next/font 自动优化
4. **CSS 优化**: Tailwind CSS JIT 模式

### 后端优化

1. **数据库索引**: 
   - `settings.key` 唯一索引
   - `agent_traces.run_id` 查询优化

2. **RAG 优化**:
   - 向量缓存（内存中保持 extractor）
   - 批量索引（减少 I/O）

3. **LLM 调用优化**:
   - 流式响应（未实现）
   - 缓存常见查询（未实现）

## 扩展性设计

### 水平扩展

当前架构为单机部署，未来可扩展为：

```
┌─────────────┐
│  Load       │
│  Balancer   │
└──────┬──────┘
       │
   ┌───┴───┬───────┬───────┐
   │       │       │       │
┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐
│ App │ │ App │ │ App │ │ App │
│ Node│ │ Node│ │ Node│ │ Node│
└──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
   │       │       │       │
   └───┬───┴───────┴───────┘
       │
┌──────▼──────┐
│  Shared DB  │
│  (Postgres) │
└─────────────┘
```

### 插件系统

未来可支持自定义 Agent：

```typescript
interface AgentPlugin {
  name: string;
  version: string;
  run(input: any): Promise<any>;
  schema: JSONSchema;
}

// 注册插件
AgentRegistry.register(new CustomAgent());
```

## 监控和日志

### 日志级别

- **info**: 正常执行步骤
- **success**: 成功完成
- **warning**: 非致命错误
- **error**: 致命错误

### 监控指标

- Agent 执行时间
- LLM Token 消耗
- 编译成功率
- PR 创建成功率

### 未来改进

- [ ] 集成 OpenTelemetry
- [ ] 添加性能追踪
- [ ] 错误报警机制

## 部署架构

### 本地开发

```
npm run dev  →  Next.js Dev Server (Port 3000)
                    ↓
                SQLite (data/apos.db)
                LanceDB (data/vectordb/)
```

### 生产部署（推荐）

```
Docker Container
  ├─ Next.js App (npm start)
  ├─ SQLite Volume Mount
  ├─ LanceDB Volume Mount
  └─ Environment Variables
```

### 环境变量

```env
# Required
ANTHROPIC_API_KEY=xxx
# or
OPENAI_API_KEY=xxx
# or
GOOGLE_GENERATIVE_AI_API_KEY=xxx

# Optional
GITHUB_TOKEN=xxx
NODE_ENV=production
```

## 故障排查

### 常见问题

1. **LLM 调用失败**
   - 检查 API Key 配置
   - 检查网络连接
   - 查看 agent_traces 表

2. **RAG 检索无结果**
   - 运行索引：访问 /prototypes 触发 RAG
   - 检查 data/vectordb/ 目录

3. **Git 操作失败**
   - 检查 Git 配置
   - 确保有写权限
   - 查看 simple-git 日志

4. **编译检查失败**
   - 手动运行 `npm run build`
   - 检查 TypeScript 配置
   - 查看自愈日志

## 未来规划

### 短期（1-3 个月）

- [ ] 完善 Chrome 扩展
- [ ] 添加单元测试
- [ ] 错误处理优化
- [ ] 性能监控面板

### 中期（3-6 个月）

- [ ] 多仓库支持
- [ ] 团队协作功能
- [ ] 自定义 Agent 模板
- [ ] WebSocket 实时通信

### 长期（6-12 个月）

- [ ] 云端部署版本
- [ ] 企业级权限管理
- [ ] 插件市场
- [ ] AI 模型微调
