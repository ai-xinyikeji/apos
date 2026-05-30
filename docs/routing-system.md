# APOS 路由系统文档

## 概述

APOS 增强路由系统（EnhancedRoutingSystem）根据任务特征自动选择最优 LLM 模型，在成本和质量之间取得最佳平衡。

## 架构

```
请求
  │
  ▼
TaskClassifier          → 分类任务类型（reasoning/coding/summarize 等）
  │
  ▼
MultiDimAnalyzer        → 计算上下文大小、代码复杂度、预估成本
  │
  ▼
CustomRulesEngine       → 匹配用户自定义规则（按优先级）
  │
  ▼
ModelSelector           → 选择模型（含 Extended Thinking / Prompt Caching 判断）
  │
  ▼
BudgetChecker           → 检查预算，必要时降级
  │
  ▼
DecisionExplainer       → 生成人类可读的决策解释
  │
  ▼
路由结果（provider + model + 解释 + 预算状态）
```

## 核心组件

### TaskClassifier
- 文件：`src/lib/routing/task-classifier.ts`
- 支持 8 种任务类型：`reasoning`, `coding`, `summarize`, `refactor`, `review`, `planning`, `explain`, `default`
- 基于关键词权重匹配 + 模式识别
- 性能：< 10ms

### MultiDimAnalyzer
- 文件：`src/lib/routing/multi-dim-analyzer.ts`
- 计算上下文大小（chars/4 ≈ tokens）
- 代码复杂度评分 0-100（行数 + 嵌套深度 + 函数数量 + 控制流）
- 预估 API 成本

### CustomRulesEngine
- 文件：`src/lib/routing/custom-rules-engine.ts`
- 从数据库加载规则，5 分钟 TTL 缓存
- 按优先级（1-100）排序匹配
- 支持条件：任务类型、上下文大小范围、代码复杂度范围

### BudgetChecker
- 文件：`src/lib/routing/budget-checker.ts`
- 查询 `cost_records` 表统计当前周期支出
- 读取 `settings` 表中的预算限制
- 30 秒查询缓存，满足 < 50ms 性能要求

### ModelSelector
- 文件：`src/lib/routing/model-selector.ts`
- 默认任务类型→模型映射
- Extended Thinking：reasoning/planning 任务或上下文 > 50K tokens 或复杂度 > 80
- Prompt Caching：上下文 > 1024 tokens
- 超预算时自动降级

### DecisionExplainer
- 文件：`src/lib/routing/decision-explainer.ts`
- 生成决策摘要和详细说明
- 包含预算影响和自定义规则标注

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/routing/route` | 获取路由决策 |
| GET  | `/api/routing/history` | 查询路由历史 |
| GET  | `/api/routing/rules` | 列出自定义规则 |
| POST | `/api/routing/rules` | 创建规则 |
| PUT  | `/api/routing/rules/:id` | 更新规则 |
| DELETE | `/api/routing/rules/:id` | 删除规则 |
| PATCH | `/api/routing/rules/:id/toggle` | 启用/禁用规则 |

## 成本 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/costs/summary` | 成本汇总（按周期） |
| GET  | `/api/costs/budget` | 预算状态 |
| POST | `/api/costs/budget` | 更新预算配置 |
| GET  | `/api/costs/alerts` | 未确认的预算预警 |
| POST | `/api/costs/alerts/:id/acknowledge` | 确认预警 |

## 配置项（settings 表）

| Key | 默认值 | 说明 |
|-----|--------|------|
| `enable_smart_routing` | `true` | 启用智能路由 |
| `enable_prompt_caching` | `true` | 启用 Prompt Caching |
| `enable_extended_thinking` | `false` | 启用 Extended Thinking |
| `offline_first_mode` | `false` | 离线优先模式 |
| `budget_daily` | — | 每日预算限额（美元） |
| `budget_weekly` | — | 每周预算限额（美元） |
| `budget_monthly` | — | 每月预算限额（美元） |
| `budget_alert_thresholds` | `[50,80,100]` | 预警阈值（百分比） |
| `budget_auto_downgrade` | `false` | 超预算自动降级 |

## UI 页面

- `/costs/dashboard` — 成本仪表板（总览、Provider 分组、任务类型分组、趋势、优化建议）
- `/settings/routing` — 路由配置（通用设置、预算管理、自定义规则）
- `/routing/history` — 路由历史（列表、过滤、详情、分页、导出）

## 性能指标

- 路由决策：< 100ms (P95)
- 成本查询：< 200ms
- 规则缓存 TTL：5 分钟
- 预算查询缓存 TTL：30 秒

## 故障排查

**路由决策超时**
- 检查数据库连接是否正常
- 检查 `custom_rules` 表是否有大量规则（> 100 条）
- 查看日志中的 `[EnhancedRoutingSystem] Routing took Xms` 警告

**成本记录缺失**
- 确认 `cost_records` 表已创建（运行 `npm run db:push`）
- 检查 CostRecorder 的批量队列是否正常 flush

**预算预警不触发**
- 确认 `budget_monthly`/`budget_daily` 等设置已配置
- 检查 `budget_alert_thresholds` 格式是否为 JSON 数组

**Extended Thinking 未启用**
- 确认 `enable_extended_thinking` 设置为 `true`
- 检查任务类型是否为 `reasoning` 或 `planning`，或上下文 > 50K tokens
