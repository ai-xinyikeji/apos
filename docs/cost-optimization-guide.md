# APOS 成本优化指南

## 快速节省策略

### 1. 启用 Prompt Caching（最高节省 90%）
在 `/settings/routing` 中开启 **Prompt Caching**。
- System prompt > 1024 tokens 时自动缓存
- 用户消息 > 2048 tokens 时自动缓存
- Claude 缓存读取价格仅为正常输入价格的 10%

### 2. 使用 Ollama 处理简单任务（免费）
- 在 `/settings` 中启用 **Ollama 优先**
- 适合：summarize、format、简单 Q&A
- 成本：$0
- 默认地址：`http://localhost:11434`

### 3. 为 summarize/review 任务配置 Gemini Flash
在 `/settings/routing` 的自定义规则中添加：
- 条件：任务类型 = `summarize` 或 `review`
- 目标：`google` / `gemini-1.5-flash`
- 节省：相比 Claude Sonnet 约 97%

### 4. 设置预算限额
在 `/settings/routing` 的预算管理中设置每月限额，启用超预算自动降级。

## 模型成本对比

| 模型 | 输入 ($/1M tokens) | 输出 ($/1M tokens) |
|------|-------------------|-------------------|
| Ollama (本地) | $0 | $0 |
| Gemini Flash | $0.075 | $0.30 |
| GPT-4o Mini | $0.15 | $0.60 |
| Claude Haiku | $0.80 | $4.00 |
| Claude Sonnet | $3.00 | $15.00 |
| Claude Opus | $15.00 | $75.00 |

## 任务类型推荐模型

| 任务类型 | 推荐模型 | 原因 |
|---------|---------|------|
| summarize | Ollama / Gemini Flash | 简单任务，不需要高准确度 |
| explain | Claude Haiku | 轻量解释，成本低 |
| review | Gemini Flash | 代码审查，性价比高 |
| coding | Claude Sonnet | 需要较高准确度 |
| refactor | Claude Sonnet | 需要理解代码结构 |
| reasoning | Claude Sonnet + ET | 需要深度推理 |
| planning | Claude Sonnet + ET | 需要系统性思考 |

ET = Extended Thinking

## 监控成本

访问 `/costs/dashboard` 查看：
- 实时成本趋势
- 按 Provider 和任务类型的成本分布
- 缓存节省统计
- 个性化优化建议
