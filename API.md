# APOS API 文档

本文档描述 APOS 系统的所有 API 端点。

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **Content-Type**: `application/json`
- **认证**: 当前版本无需认证（本地单用户）

## API 端点

### 1. Prototypes API

#### 1.1 获取所有原型

```http
GET /api/prototypes
```

**响应示例**:

```json
[
  {
    "id": 1,
    "name": "用户列表卡片",
    "description": "显示用户列表的卡片组件，支持分页和搜索",
    "branchName": "feature/user-list-card",
    "status": "pr_created",
    "codePath": null,
    "previewUrl": null,
    "commitHash": "a1b2c3d",
    "prNumber": 42,
    "prUrl": "https://github.com/owner/repo/pull/42",
    "feasibilityReport": "## 技术可行性\n简单...",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
]
```

**状态码**:
- `200 OK`: 成功
- `500 Internal Server Error`: 数据库错误

---

#### 1.2 创建原型草稿

```http
POST /api/prototypes
```

**请求体**:

```json
{
  "name": "用户列表卡片",
  "description": "显示用户列表的卡片组件，支持分页和搜索"
}
```

**字段说明**:
- `name` (string, required): 原型名称
- `description` (string, required): 功能描述

**响应示例**:

```json
{
  "id": 1,
  "name": "用户列表卡片",
  "description": "显示用户列表的卡片组件，支持分页和搜索",
  "branchName": "feature/user-list-card-1737123456",
  "status": "draft",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**状态码**:
- `200 OK`: 创建成功
- `400 Bad Request`: 缺少必填字段
- `500 Internal Server Error`: 数据库错误

---

#### 1.3 运行原型生成 Agent

```http
POST /api/prototypes/run
```

**请求体**:

```json
{
  "prototypeId": 1,
  "assessOnly": false,
  "image": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

**字段说明**:
- `prototypeId` (number, required): 原型 ID
- `assessOnly` (boolean, optional): 是否仅评估可行性，默认 `false`
- `image` (string, optional): Base64 编码的图片（手绘草图）

**响应示例**:

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "ProtoBuilder Agent 已启动"
}
```

**状态码**:
- `200 OK`: Agent 启动成功
- `400 Bad Request`: 缺少 prototypeId
- `404 Not Found`: 原型不存在
- `500 Internal Server Error`: Agent 执行错误

**说明**:
- 返回 `runId` 后，可通过 `/api/traces?runId=xxx` 轮询执行日志
- Agent 执行是异步的，不会阻塞响应

---

### 2. Insights API

#### 2.1 获取信号和报告

```http
GET /api/insights
```

**响应示例**:

```json
{
  "signals": [
    {
      "id": 1,
      "source": "zendesk",
      "title": "Zendesk #1084: 用户需要 CSV 导出功能",
      "content": "多位用户反馈希望能够将报表数据导出为 CSV 格式...",
      "url": "https://zendesk.com/tickets/1084",
      "status": "pending",
      "sentiment": "neutral",
      "createdAt": "2024-01-15T09:00:00.000Z",
      "updatedAt": "2024-01-15T09:00:00.000Z"
    }
  ],
  "reports": [
    {
      "filename": "weekly-20240115-100000.md",
      "title": "产品洞察周报 - 2024-01-15",
      "content": "# 产品洞察周报\n\n## 核心发现...",
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

**状态码**:
- `200 OK`: 成功
- `500 Internal Server Error`: 数据库或文件系统错误

---

#### 2.2 运行信号收集 Agent

```http
POST /api/insights
```

**请求体**:

```json
{
  "sources": ["amplitude", "zendesk", "competitor"]
}
```

**字段说明**:
- `sources` (string[], optional): 数据源列表，默认全部

**响应示例**:

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440001",
  "message": "SignalCollector Agent 已启动"
}
```

**状态码**:
- `200 OK`: Agent 启动成功
- `500 Internal Server Error`: Agent 执行错误

---

#### 2.3 生成周度报告

```http
POST /api/insights/report
```

**请求体**: 无

**响应示例**:

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440002",
  "message": "ReportGenerator Agent 已启动"
}
```

**状态码**:
- `200 OK`: Agent 启动成功
- `400 Bad Request`: 没有待分析的信号
- `500 Internal Server Error`: Agent 执行错误

---

### 3. Pull Requests API

#### 3.1 获取所有 Pull Requests

```http
GET /api/pull-requests
```

**响应示例**:

```json
[
  {
    "id": 1,
    "name": "用户列表卡片",
    "branchName": "feature/user-list-card",
    "prNumber": 42,
    "prUrl": "https://github.com/owner/repo/pull/42",
    "status": "pr_created",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]
```

**状态码**:
- `200 OK`: 成功
- `500 Internal Server Error`: 数据库错误

---

#### 3.2 运行代码审查 Agent

```http
POST /api/pull-requests/review
```

**请求体**:

```json
{
  "prototypeId": 1
}
```

**字段说明**:
- `prototypeId` (number, required): 原型 ID

**响应示例**:

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440003",
  "message": "ReviewBot Agent 已启动"
}
```

**状态码**:
- `200 OK`: Agent 启动成功
- `400 Bad Request`: 缺少 prototypeId
- `404 Not Found`: 原型不存在或无 PR
- `500 Internal Server Error`: Agent 执行错误

---

#### 3.3 获取审查报告

```http
GET /api/pull-requests/report?runId=xxx
```

**查询参数**:
- `runId` (string, required): Agent 运行 ID

**响应示例**:

```json
{
  "report": "# 代码审查报告\n\n## 📌 改动概览\n...",
  "status": "success"
}
```

**状态码**:
- `200 OK`: 成功
- `400 Bad Request`: 缺少 runId
- `404 Not Found`: 未找到报告
- `500 Internal Server Error`: 数据库错误

---

### 4. Settings API

#### 4.1 获取所有配置

```http
GET /api/settings
```

**响应示例**:

```json
{
  "llm_provider": "anthropic",
  "llm_model": "claude-3-5-sonnet-20241022",
  "anthropic_api_key": "sk-ant-***",
  "github_token": "ghp_***"
}
```

**说明**:
- API Keys 会被部分隐藏（显示前缀 + `***`）

**状态码**:
- `200 OK`: 成功
- `500 Internal Server Error`: 数据库错误

---

#### 4.2 更新配置

```http
POST /api/settings
```

**请求体**:

```json
{
  "llm_provider": "anthropic",
  "llm_model": "claude-3-5-sonnet-20241022",
  "anthropic_api_key": "sk-ant-api03-xxx",
  "github_token": "ghp_xxx"
}
```

**字段说明**:
- `llm_provider` (string): LLM 提供商（`anthropic` | `openai` | `google`）
- `llm_model` (string): 模型名称
- `anthropic_api_key` (string, optional): Anthropic API Key
- `openai_api_key` (string, optional): OpenAI API Key
- `google_api_key` (string, optional): Google API Key
- `github_token` (string, optional): GitHub Personal Access Token

**响应示例**:

```json
{
  "success": true
}
```

**状态码**:
- `200 OK`: 更新成功
- `500 Internal Server Error`: 数据库错误

---

#### 4.3 获取系统状态

```http
GET /api/settings/status
```

**响应示例**:

```json
{
  "llm": {
    "configured": true,
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022"
  },
  "github": {
    "configured": true,
    "hasToken": true
  },
  "database": {
    "connected": true,
    "prototypesCount": 5,
    "signalsCount": 12
  },
  "rag": {
    "indexed": true,
    "chunksCount": 234
  }
}
```

**状态码**:
- `200 OK`: 成功
- `500 Internal Server Error`: 系统错误

---

#### 4.4 获取 Token 使用统计

```http
GET /api/settings/usage
```

**响应示例**:

```json
{
  "total": {
    "promptTokens": 125000,
    "completionTokens": 45000,
    "totalTokens": 170000
  },
  "byAgent": {
    "ProtoBuilder": {
      "promptTokens": 80000,
      "completionTokens": 30000,
      "runs": 15
    },
    "ReviewBot": {
      "promptTokens": 30000,
      "completionTokens": 10000,
      "runs": 8
    },
    "SignalCollector": {
      "promptTokens": 10000,
      "completionTokens": 3000,
      "runs": 5
    },
    "ReportGenerator": {
      "promptTokens": 5000,
      "completionTokens": 2000,
      "runs": 2
    }
  },
  "estimatedCost": {
    "anthropic": "$2.55",
    "openai": "$0.00",
    "google": "$0.00"
  }
}
```

**说明**:
- Token 统计从 `agent_traces` 表的 `details` 字段解析
- 成本估算基于各提供商的定价

**状态码**:
- `200 OK`: 成功
- `500 Internal Server Error`: 数据库错误

---

### 5. Traces API

#### 5.1 获取执行日志

```http
GET /api/traces?runId=xxx
```

**查询参数**:
- `runId` (string, required): Agent 运行 ID

**响应示例**:

```json
[
  {
    "id": 1,
    "agentName": "ProtoBuilder",
    "runId": "550e8400-e29b-41d4-a716-446655440000",
    "step": "Start",
    "status": "info",
    "message": "开始为原型项目 [用户列表卡片] 生成代码",
    "details": null,
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "id": 2,
    "agentName": "ProtoBuilder",
    "runId": "550e8400-e29b-41d4-a716-446655440000",
    "step": "RAG Indexing",
    "status": "info",
    "message": "正在更新本地代码库的向量语义索引",
    "details": null,
    "createdAt": "2024-01-15T10:30:05.000Z"
  },
  {
    "id": 3,
    "agentName": "ProtoBuilder",
    "runId": "550e8400-e29b-41d4-a716-446655440000",
    "step": "Success",
    "status": "success",
    "message": "原型 [用户列表卡片] 生成完毕！",
    "details": "{\"prUrl\":\"https://github.com/owner/repo/pull/42\"}",
    "createdAt": "2024-01-15T10:35:00.000Z"
  }
]
```

**状态码**:
- `200 OK`: 成功
- `400 Bad Request`: 缺少 runId
- `500 Internal Server Error`: 数据库错误

---

## 数据模型

### Prototype

```typescript
interface Prototype {
  id: number;
  name: string;
  description: string;
  branchName: string;
  status: 'draft' | 'assessing' | 'generating' | 'generated' | 'pr_created' | 'merged' | 'failed';
  codePath: string | null;
  previewUrl: string | null;
  commitHash: string | null;
  prNumber: number | null;
  prUrl: string | null;
  feasibilityReport: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Signal

```typescript
interface Signal {
  id: number;
  source: 'amplitude' | 'zendesk' | 'competitor';
  title: string;
  content: string;
  url: string | null;
  status: 'pending' | 'analyzed' | 'archived';
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  createdAt: string;
  updatedAt: string;
}
```

### AgentTrace

```typescript
interface AgentTrace {
  id: number;
  agentName: 'ProtoBuilder' | 'ReviewBot' | 'SignalCollector' | 'ReportGenerator';
  runId: string;
  step: string;
  status: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details: string | null; // JSON string
  createdAt: string;
}
```

### Report

```typescript
interface Report {
  filename: string;
  title: string;
  content: string;
  createdAt: string;
}
```

---

## 错误处理

所有 API 端点遵循统一的错误响应格式：

```json
{
  "error": "错误描述信息"
}
```

### 常见错误码

- `400 Bad Request`: 请求参数错误或缺失
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器内部错误

---

## 使用示例

### 完整工作流示例

#### 1. 创建原型

```bash
curl -X POST http://localhost:3000/api/prototypes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "用户列表卡片",
    "description": "显示用户列表的卡片组件，支持分页和搜索"
  }'
```

#### 2. 运行可行性评估

```bash
curl -X POST http://localhost:3000/api/prototypes/run \
  -H "Content-Type: application/json" \
  -d '{
    "prototypeId": 1,
    "assessOnly": true
  }'
```

#### 3. 轮询执行日志

```bash
curl http://localhost:3000/api/traces?runId=550e8400-e29b-41d4-a716-446655440000
```

#### 4. 生成代码

```bash
curl -X POST http://localhost:3000/api/prototypes/run \
  -H "Content-Type: application/json" \
  -d '{
    "prototypeId": 1,
    "assessOnly": false
  }'
```

#### 5. 运行代码审查

```bash
curl -X POST http://localhost:3000/api/pull-requests/review \
  -H "Content-Type: application/json" \
  -d '{
    "prototypeId": 1
  }'
```

---

## WebSocket 支持

当前版本使用 HTTP 轮询获取实时日志。未来版本将支持 WebSocket 推送：

```javascript
// 未来版本
const ws = new WebSocket('ws://localhost:3000/api/traces/stream');
ws.onmessage = (event) => {
  const trace = JSON.parse(event.data);
  console.log(trace);
};
```

---

## 速率限制

当前版本无速率限制。生产环境建议添加：

- 每个 IP 每分钟最多 60 次请求
- Agent 执行每小时最多 10 次

---

## 版本控制

API 版本通过 URL 路径管理（未来）：

```
/api/v1/prototypes
/api/v2/prototypes
```

当前版本为 `v1`（隐式）。

---

## 更新日志

### v0.1.0 (2024-01-15)

- 初始 API 版本
- 支持原型管理、信号收集、代码审查
- 实时执行日志轮询
