# Design Document

## 1. Introduction

本文档描述了 APOS Claude Desktop/CLI 模型路由规则优化功能的技术设计。该设计基于 requirements.md 中定义的 20 个需求，旨在实现：

1. **增强的路由决策引擎** - 多维度智能路由
2. **成本追踪和预警系统** - 实时成本监控
3. **成本仪表板 UI** - 可视化成本分析
4. **Claude CLI 代理增强** - 更好的 CLI 体验
5. **统一配置管理** - 集中式配置界面

### 1.1 设计目标

- **性能**: 路由决策 < 100ms
- **成本优化**: 降低 30%+ API 成本
- **准确率**: 路由准确率 > 95%
- **兼容性**: 100% 向后兼容
- **可维护性**: 模块化、可测试

### 1.2 技术栈

- **后端**: TypeScript + Next.js 16 App Router
- **数据库**: SQLite + Drizzle ORM
- **前端**: React 19 + Tailwind CSS 4
- **图表**: Recharts
- **缓存**: 内存缓存 + TTL

## 2. High-Level Design

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude CLI / Desktop                     │
│                  (ANTHROPIC_BASE_URL Proxy)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Enhanced Routing System                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Task         │  │ Multi-Dim    │  │ Custom       │     │
│  │ Classifier   │→ │ Analyzer     │→ │ Rules Engine │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Budget       │  │ Model        │  │ Decision     │     │
│  │ Checker      │→ │ Selector     │→ │ Explainer    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cost Tracking System                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Cost         │  │ Budget       │  │ Alert        │     │
│  │ Recorder     │→ │ Monitor      │→ │ Manager      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                         Database Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ routing_     │  │ cost_        │  │ custom_      │     │
│  │ decisions    │  │ records      │  │ rules        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 Enhanced Routing System

**职责**: 智能路由决策引擎

**子组件**:
- `TaskClassifier`: 任务类型分类
- `MultiDimAnalyzer`: 多维度分析（上下文、复杂度、预算）
- `CustomRulesEngine`: 自定义规则匹配
- `BudgetChecker`: 预算检查
- `ModelSelector`: 模型选择
- `DecisionExplainer`: 决策解释生成

#### 2.2.2 Cost Tracking System

**职责**: 成本追踪和预警

**子组件**:
- `CostRecorder`: 成本记录
- `BudgetMonitor`: 预算监控
- `AlertManager`: 预警管理

#### 2.2.3 Cost Dashboard UI

**职责**: 成本可视化界面

**页面**: `/costs`

**组件**:
- `CostOverview`: 总成本概览
- `ProviderBreakdown`: 按提供商分组
- `TaskTypeBreakdown`: 按任务类型分组
- `TrendChart`: 成本趋势图
- `BudgetProgress`: 预算进度条
- `OptimizationSuggestions`: 优化建议


## 3. Low-Level Design

### 3.1 Enhanced Routing System

#### 3.1.1 TaskClassifier

**文件**: `src/lib/routing/task-classifier.ts`

**接口**:
```typescript
interface TaskClassificationResult {
  taskType: TaskType;
  confidence: number;
  keywords: string[];
}

class TaskClassifier {
  classify(prompt: string): TaskClassificationResult;
}
```

**实现策略**:
1. 关键词匹配（快速路径）
2. 模式识别（代码块、问题标记）
3. 回退到 'default' 类型

**性能目标**: < 10ms

#### 3.1.2 MultiDimAnalyzer

**文件**: `src/lib/routing/multi-dim-analyzer.ts`

**接口**:
```typescript
interface AnalysisResult {
  contextSize: number;        // tokens
  codeComplexity: number;     // 0-100
  estimatedCost: number;      // USD
  requiresExtendedThinking: boolean;
}

class MultiDimAnalyzer {
  analyze(prompt: string, taskType: TaskType): AnalysisResult;
  
  private calculateContextSize(prompt: string): number;
  private calculateCodeComplexity(code: string): number;
  private estimateCost(contextSize: number, model: string): number;
}
```

**代码复杂度计算**:
```typescript
function calculateCodeComplexity(code: string): number {
  let score = 0;
  
  // 代码长度 (0-30 分)
  const lines = code.split('\n').length;
  score += Math.min(lines / 100, 30);
  
  // 嵌套深度 (0-30 分)
  const maxNesting = calculateMaxNesting(code);
  score += Math.min(maxNesting * 5, 30);
  
  // 函数数量 (0-20 分)
  const functionCount = (code.match(/function|=>|class/g) || []).length;
  score += Math.min(functionCount * 2, 20);
  
  // 复杂控制流 (0-20 分)
  const complexPatterns = (code.match(/if|for|while|switch|try/g) || []).length;
  score += Math.min(complexPatterns, 20);
  
  return Math.min(score, 100);
}
```

#### 3.1.3 CustomRulesEngine

**文件**: `src/lib/routing/custom-rules-engine.ts`

**数据结构**:
```typescript
interface CustomRule {
  id: string;
  name: string;
  priority: number;          // 1-100
  enabled: boolean;
  conditions: {
    taskTypes?: TaskType[];
    contextSizeMin?: number;
    contextSizeMax?: number;
    codeComplexityMin?: number;
    codeComplexityMax?: number;
  };
  targetModel: string;
  targetProvider: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RuleMatchResult {
  matched: boolean;
  rule?: CustomRule;
  reason: string;
}

class CustomRulesEngine {
  private rules: CustomRule[] = [];
  private cache: Map<string, CustomRule[]>;
  
  async loadRules(): Promise<void>;
  matchRule(analysis: AnalysisResult, taskType: TaskType): RuleMatchResult;
  addRule(rule: CustomRule): Promise<void>;
  updateRule(id: string, updates: Partial<CustomRule>): Promise<void>;
  deleteRule(id: string): Promise<void>;
  toggleRule(id: string, enabled: boolean): Promise<void>;
}
```

**匹配算法**:
```typescript
matchRule(analysis: AnalysisResult, taskType: TaskType): RuleMatchResult {
  // 按优先级排序
  const sortedRules = this.rules
    .filter(r => r.enabled)
    .sort((a, b) => b.priority - a.priority);
  
  for (const rule of sortedRules) {
    // 检查任务类型
    if (rule.conditions.taskTypes && 
        !rule.conditions.taskTypes.includes(taskType)) {
      continue;
    }
    
    // 检查上下文大小
    if (rule.conditions.contextSizeMin && 
        analysis.contextSize < rule.conditions.contextSizeMin) {
      continue;
    }
    if (rule.conditions.contextSizeMax && 
        analysis.contextSize > rule.conditions.contextSizeMax) {
      continue;
    }
    
    // 检查代码复杂度
    if (rule.conditions.codeComplexityMin && 
        analysis.codeComplexity < rule.conditions.codeComplexityMin) {
      continue;
    }
    if (rule.conditions.codeComplexityMax && 
        analysis.codeComplexity > rule.conditions.codeComplexityMax) {
      continue;
    }
    
    // 匹配成功
    return {
      matched: true,
      rule,
      reason: `Matched custom rule: ${rule.name} (priority: ${rule.priority})`
    };
  }
  
  return { matched: false, reason: 'No custom rules matched' };
}
```


#### 3.1.4 BudgetChecker

**文件**: `src/lib/routing/budget-checker.ts`

**接口**:
```typescript
interface BudgetStatus {
  withinBudget: boolean;
  currentSpend: number;
  budgetLimit: number;
  percentageUsed: number;
  recommendedModel?: string;
}

class BudgetChecker {
  async checkBudget(
    estimatedCost: number,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<BudgetStatus>;
  
  async getCurrentSpend(period: string): Promise<number>;
  async getBudgetLimit(period: string): Promise<number>;
  suggestAlternativeModel(originalModel: string, maxCost: number): string | null;
}
```

**实现**:
```typescript
async checkBudget(estimatedCost: number, period: 'daily' | 'weekly' | 'monthly'): Promise<BudgetStatus> {
  const currentSpend = await this.getCurrentSpend(period);
  const budgetLimit = await this.getBudgetLimit(period);
  
  const projectedSpend = currentSpend + estimatedCost;
  const percentageUsed = (projectedSpend / budgetLimit) * 100;
  const withinBudget = projectedSpend <= budgetLimit;
  
  let recommendedModel: string | undefined;
  if (!withinBudget) {
    const remainingBudget = budgetLimit - currentSpend;
    recommendedModel = this.suggestAlternativeModel(originalModel, remainingBudget);
  }
  
  return {
    withinBudget,
    currentSpend: projectedSpend,
    budgetLimit,
    percentageUsed,
    recommendedModel
  };
}
```

#### 3.1.5 ModelSelector

**文件**: `src/lib/routing/model-selector.ts`

**接口**:
```typescript
interface ModelSelectionResult {
  model: any;
  provider: string;
  modelName: string;
  reason: string;
  estimatedCost: number;
  usesExtendedThinking: boolean;
  usesPromptCaching: boolean;
}

class ModelSelector {
  async select(
    taskType: TaskType,
    analysis: AnalysisResult,
    budgetStatus: BudgetStatus,
    customRule?: CustomRule
  ): Promise<ModelSelectionResult>;
  
  private selectClaudeModel(analysis: AnalysisResult): string;
  private shouldUseExtendedThinking(analysis: AnalysisResult): boolean;
  private shouldUsePromptCaching(contextSize: number): boolean;
}
```

**Extended Thinking 决策**:
```typescript
private shouldUseExtendedThinking(analysis: AnalysisResult): boolean {
  // 检查是否启用
  const enabled = await getSetting('enable_extended_thinking');
  if (!enabled) return false;
  
  // 任务类型检查
  if (taskType === 'reasoning' || taskType === 'planning') {
    return true;
  }
  
  // 上下文大小检查
  if (analysis.contextSize > 50000) {
    return true;
  }
  
  // 代码复杂度检查
  if (analysis.codeComplexity > 80) {
    return true;
  }
  
  return false;
}
```

**Prompt Caching 决策**:
```typescript
private shouldUsePromptCaching(contextSize: number): boolean {
  const enabled = await getSetting('enable_prompt_caching');
  if (!enabled) return false;
  
  // System prompt 阈值: 1024 tokens
  // User message 阈值: 2048 tokens
  return contextSize > 1024;
}
```

#### 3.1.6 DecisionExplainer

**文件**: `src/lib/routing/decision-explainer.ts`

**接口**:
```typescript
interface DecisionExplanation {
  summary: string;
  details: {
    taskType: string;
    complexity: string;
    selectedModel: string;
    reason: string;
    estimatedCost: string;
    estimatedTime: string;
    budgetImpact?: string;
    customRule?: string;
  };
}

class DecisionExplainer {
  explain(
    taskType: TaskType,
    analysis: AnalysisResult,
    selection: ModelSelectionResult,
    budgetStatus: BudgetStatus,
    customRule?: CustomRule
  ): DecisionExplanation;
}
```

**实现示例**:
```typescript
explain(...): DecisionExplanation {
  let summary = `Selected ${selection.modelName} for ${taskType} task`;
  
  const details = {
    taskType: taskType,
    complexity: this.formatComplexity(analysis.codeComplexity),
    selectedModel: selection.modelName,
    reason: selection.reason,
    estimatedCost: `$${selection.estimatedCost.toFixed(4)}`,
    estimatedTime: this.estimateTime(selection.provider),
  };
  
  if (customRule) {
    details.customRule = `Using custom rule: ${customRule.name}`;
    summary += ` (custom rule applied)`;
  }
  
  if (!budgetStatus.withinBudget) {
    details.budgetImpact = `⚠️ Budget exceeded. Recommended: ${budgetStatus.recommendedModel}`;
  }
  
  return { summary, details };
}
```


### 3.2 Cost Tracking System

#### 3.2.1 CostRecorder

**文件**: `src/lib/cost/cost-recorder.ts`

**接口**:
```typescript
interface CostRecord {
  id: string;
  timestamp: Date;
  userId?: string;
  provider: string;
  modelName: string;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  routingDecisionId: string;
}

class CostRecorder {
  async record(record: Omit<CostRecord, 'id' | 'timestamp'>): Promise<void>;
  async batchRecord(records: Omit<CostRecord, 'id' | 'timestamp'>[]): Promise<void>;
}
```

**成本计算**:
```typescript
function calculateCost(record: CostRecord): number {
  const rates = MODEL_PRICING[record.provider][record.modelName];
  
  let cost = 0;
  
  // 输入 tokens
  cost += (record.inputTokens / 1_000_000) * rates.input;
  
  // 输出 tokens
  cost += (record.outputTokens / 1_000_000) * rates.output;
  
  // 缓存创建 tokens (Claude)
  if (record.cacheCreationTokens > 0) {
    cost += (record.cacheCreationTokens / 1_000_000) * rates.cacheWrite;
  }
  
  // 缓存读取 tokens (Claude) - 90% 折扣
  if (record.cacheReadTokens > 0) {
    cost += (record.cacheReadTokens / 1_000_000) * rates.cacheRead;
  }
  
  return cost;
}
```

**定价表**:
```typescript
const MODEL_PRICING = {
  anthropic: {
    'claude-3-5-sonnet-20241022': {
      input: 3.00,
      output: 15.00,
      cacheWrite: 3.75,
      cacheRead: 0.30,
    },
    'claude-3-5-haiku-20241022': {
      input: 0.80,
      output: 4.00,
      cacheWrite: 1.00,
      cacheRead: 0.08,
    },
    'claude-3-opus-20240229': {
      input: 15.00,
      output: 75.00,
      cacheWrite: 18.75,
      cacheRead: 1.50,
    },
    'claude-3-7-sonnet-20250219': {  // Extended Thinking
      input: 3.00,
      output: 15.00,
      cacheWrite: 3.75,
      cacheRead: 0.30,
    },
  },
  openai: {
    'gpt-4o': {
      input: 2.50,
      output: 10.00,
    },
    'gpt-4o-mini': {
      input: 0.15,
      output: 0.60,
    },
  },
  google: {
    'gemini-1.5-pro-latest': {
      input: 1.25,
      output: 5.00,
    },
    'gemini-1.5-flash': {
      input: 0.075,
      output: 0.30,
    },
  },
  lmstudio: {
    '*': {
      input: 0,
      output: 0,
    },
  },
};
```

#### 3.2.2 BudgetMonitor

**文件**: `src/lib/cost/budget-monitor.ts`

**接口**:
```typescript
interface BudgetConfig {
  daily?: number;
  weekly?: number;
  monthly?: number;
  alertThresholds: number[];  // [0.5, 0.8, 1.0]
  autoDowngrade: boolean;
}

interface BudgetAlert {
  id: string;
  timestamp: Date;
  period: 'daily' | 'weekly' | 'monthly';
  threshold: number;
  currentSpend: number;
  budgetLimit: number;
  severity: 'info' | 'warning' | 'critical';
  acknowledged: boolean;
}

class BudgetMonitor {
  async checkBudgets(): Promise<BudgetAlert[]>;
  async acknowledgeAlert(alertId: string): Promise<void>;
  async shouldDowngrade(): Promise<boolean>;
}
```

**监控逻辑**:
```typescript
async checkBudgets(): Promise<BudgetAlert[]> {
  const config = await this.getBudgetConfig();
  const alerts: BudgetAlert[] = [];
  
  for (const period of ['daily', 'weekly', 'monthly'] as const) {
    const limit = config[period];
    if (!limit) continue;
    
    const currentSpend = await this.getCurrentSpend(period);
    const percentage = currentSpend / limit;
    
    for (const threshold of config.alertThresholds) {
      if (percentage >= threshold) {
        const severity = 
          threshold >= 1.0 ? 'critical' :
          threshold >= 0.8 ? 'warning' : 'info';
        
        alerts.push({
          id: generateId(),
          timestamp: new Date(),
          period,
          threshold,
          currentSpend,
          budgetLimit: limit,
          severity,
          acknowledged: false,
        });
      }
    }
  }
  
  return alerts;
}
```

#### 3.2.3 AlertManager

**文件**: `src/lib/cost/alert-manager.ts`

**接口**:
```typescript
interface AlertConfig {
  uiNotifications: boolean;
  email?: string;
  webhook?: string;
}

class AlertManager {
  async sendAlert(alert: BudgetAlert): Promise<void>;
  private async sendUINotification(alert: BudgetAlert): Promise<void>;
  private async sendEmail(alert: BudgetAlert, email: string): Promise<void>;
  private async sendWebhook(alert: BudgetAlert, url: string): Promise<void>;
}
```


### 3.3 Database Schema

#### 3.3.1 routing_decisions 表

```sql
CREATE TABLE routing_decisions (
  id TEXT PRIMARY KEY,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  
  -- 任务信息
  task_type TEXT NOT NULL,
  prompt_preview TEXT,
  context_size INTEGER NOT NULL,
  code_complexity INTEGER,
  
  -- 路由决策
  selected_provider TEXT NOT NULL,
  selected_model TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  custom_rule_id TEXT,
  manual_override BOOLEAN DEFAULT FALSE,
  
  -- 成本预估
  estimated_cost REAL NOT NULL,
  estimated_time INTEGER,
  
  -- 实际结果
  actual_cost REAL,
  actual_time INTEGER,
  execution_status TEXT,
  
  -- Extended Thinking
  uses_extended_thinking BOOLEAN DEFAULT FALSE,
  thinking_tokens INTEGER,
  
  -- Prompt Caching
  uses_prompt_caching BOOLEAN DEFAULT FALSE,
  cache_creation_tokens INTEGER,
  cache_read_tokens INTEGER,
  
  -- 用户反馈
  user_satisfaction INTEGER,  -- 1-5
  user_feedback TEXT,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_routing_decisions_timestamp ON routing_decisions(timestamp);
CREATE INDEX idx_routing_decisions_user_id ON routing_decisions(user_id);
CREATE INDEX idx_routing_decisions_task_type ON routing_decisions(task_type);
CREATE INDEX idx_routing_decisions_provider ON routing_decisions(selected_provider);
```

#### 3.3.2 cost_records 表

```sql
CREATE TABLE cost_records (
  id TEXT PRIMARY KEY,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  
  -- 模型信息
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  
  -- Token 使用
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  
  -- 成本
  total_cost REAL NOT NULL,
  cache_savings REAL DEFAULT 0,
  
  -- 关联
  routing_decision_id TEXT,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (routing_decision_id) REFERENCES routing_decisions(id)
);

CREATE INDEX idx_cost_records_timestamp ON cost_records(timestamp);
CREATE INDEX idx_cost_records_user_id ON cost_records(user_id);
CREATE INDEX idx_cost_records_provider ON cost_records(provider);
CREATE INDEX idx_cost_records_task_type ON cost_records(task_type);
```

#### 3.3.3 custom_rules 表

```sql
CREATE TABLE custom_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- 条件
  task_types TEXT,  -- JSON array
  context_size_min INTEGER,
  context_size_max INTEGER,
  code_complexity_min INTEGER,
  code_complexity_max INTEGER,
  
  -- 目标模型
  target_provider TEXT NOT NULL,
  target_model TEXT NOT NULL,
  
  -- 统计
  match_count INTEGER DEFAULT 0,
  last_matched_at DATETIME,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custom_rules_user_id ON custom_rules(user_id);
CREATE INDEX idx_custom_rules_priority ON custom_rules(priority DESC);
CREATE INDEX idx_custom_rules_enabled ON custom_rules(enabled);
```

#### 3.3.4 budget_alerts 表

```sql
CREATE TABLE budget_alerts (
  id TEXT PRIMARY KEY,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  
  period TEXT NOT NULL,  -- 'daily', 'weekly', 'monthly'
  threshold REAL NOT NULL,
  current_spend REAL NOT NULL,
  budget_limit REAL NOT NULL,
  severity TEXT NOT NULL,  -- 'info', 'warning', 'critical'
  
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at DATETIME,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_budget_alerts_user_id ON budget_alerts(user_id);
CREATE INDEX idx_budget_alerts_timestamp ON budget_alerts(timestamp);
CREATE INDEX idx_budget_alerts_acknowledged ON budget_alerts(acknowledged);
```

#### 3.3.5 扩展 settings 表

```sql
-- 新增配置项
INSERT INTO settings (key, value) VALUES
  -- 路由配置
  ('enable_smart_routing', 'true'),
  ('enable_extended_thinking', 'false'),
  ('enable_prompt_caching', 'true'),
  ('offline_first_mode', 'false'),
  
  -- 预算配置
  ('budget_daily', '10.00'),
  ('budget_weekly', '50.00'),
  ('budget_monthly', '200.00'),
  ('budget_alert_thresholds', '[0.5, 0.8, 1.0]'),
  ('budget_auto_downgrade', 'false'),
  
  -- 缓存配置
  ('cache_system_prompt_threshold', '1024'),
  ('cache_user_message_threshold', '2048'),
  
  -- Extended Thinking 配置
  ('extended_thinking_context_threshold', '50000'),
  ('extended_thinking_complexity_threshold', '80'),
  
  -- 性能配置
  ('routing_cache_ttl', '300'),  -- 5 minutes
  ('config_cache_ttl', '300');
```


### 3.4 API Design

#### 3.4.1 路由 API

**POST /api/routing/route**

请求:
```typescript
{
  prompt: string;
  taskType?: TaskType;
  manualModel?: string;
  userId?: string;
}
```

响应:
```typescript
{
  decision: {
    provider: string;
    model: string;
    modelName: string;
    reason: string;
    estimatedCost: number;
    estimatedTime: number;
  };
  explanation: DecisionExplanation;
  budgetStatus: BudgetStatus;
  decisionId: string;
}
```

**GET /api/routing/history**

查询参数:
- `startDate`: ISO 8601 日期
- `endDate`: ISO 8601 日期
- `taskType`: 任务类型过滤
- `provider`: 提供商过滤
- `limit`: 返回数量限制
- `offset`: 分页偏移

响应:
```typescript
{
  decisions: RoutingDecision[];
  total: number;
  stats: {
    accuracy: number;
    avgCost: number;
    avgTime: number;
  };
}
```

#### 3.4.2 成本 API

**GET /api/costs/summary**

查询参数:
- `period`: 'today' | 'week' | 'month' | 'custom'
- `startDate`: 自定义开始日期
- `endDate`: 自定义结束日期

响应:
```typescript
{
  totalCost: number;
  byProvider: Record<string, number>;
  byTaskType: Record<string, number>;
  cacheSavings: number;
  trend: Array<{ date: string; cost: number }>;
}
```

**GET /api/costs/budget**

响应:
```typescript
{
  daily: {
    limit: number;
    current: number;
    percentage: number;
  };
  weekly: { ... };
  monthly: { ... };
  alerts: BudgetAlert[];
}
```

**POST /api/costs/budget**

请求:
```typescript
{
  daily?: number;
  weekly?: number;
  monthly?: number;
  alertThresholds?: number[];
  autoDowngrade?: boolean;
}
```

#### 3.4.3 自定义规则 API

**GET /api/routing/rules**

响应:
```typescript
{
  rules: CustomRule[];
}
```

**POST /api/routing/rules**

请求:
```typescript
{
  name: string;
  priority: number;
  conditions: {
    taskTypes?: TaskType[];
    contextSizeMin?: number;
    contextSizeMax?: number;
    codeComplexityMin?: number;
    codeComplexityMax?: number;
  };
  targetProvider: string;
  targetModel: string;
}
```

**PUT /api/routing/rules/:id**

**DELETE /api/routing/rules/:id**

**PATCH /api/routing/rules/:id/toggle**

#### 3.4.4 Claude CLI 代理 API

**POST /api/v1/messages**

这是现有的 Claude CLI 代理端点，需要增强：

```typescript
// 增强的处理流程
export async function POST(req: Request) {
  // 1. 提取请求
  const body = await req.json();
  const { messages, system, model, max_tokens, stream } = body;
  
  // 2. 任务分类
  const taskType = classifyTask(messages);
  
  // 3. 路由决策
  const routingResult = await routeRequest({
    prompt: extractPrompt(messages),
    taskType,
    system,
  });
  
  // 4. 应用 Prompt Caching
  const enhancedMessages = applyPromptCaching(messages, system);
  
  // 5. 执行请求
  const response = await executeRequest(routingResult.decision.model, {
    messages: enhancedMessages,
    system,
    max_tokens,
    stream,
  });
  
  // 6. 记录成本
  await recordCost({
    provider: routingResult.decision.provider,
    model: routingResult.decision.modelName,
    taskType,
    ...extractTokenUsage(response),
  });
  
  // 7. 添加路由信息到响应头
  return new Response(response.body, {
    headers: {
      ...response.headers,
      'X-APOS-Model': routingResult.decision.modelName,
      'X-APOS-Cost': routingResult.decision.estimatedCost.toString(),
      'X-APOS-Decision-Id': routingResult.decisionId,
    },
  });
}
```


### 3.5 UI Design

#### 3.5.1 成本仪表板页面 (/costs)

**布局**:
```
┌─────────────────────────────────────────────────────────────┐
│  Cost Dashboard                                    [Export] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Total Cost  │  │ Cache       │  │ Budget      │        │
│  │ $45.23      │  │ Savings     │  │ Usage       │        │
│  │ This Month  │  │ $12.45 (22%)│  │ 45% ████░░  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
├─────────────────────────────────────────────────────────────┤
│  Cost by Provider (Pie Chart)                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ●  Anthropic: $25.00 (55%)                         │   │
│  │  ●  OpenAI: $15.00 (33%)                            │   │
│  │  ●  Google: $5.23 (12%)                             │   │
│  │  ●  LM Studio: $0.00 (0%)                           │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Cost by Task Type (Bar Chart)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  coding     ████████████████░░░░  $18.00           │   │
│  │  reasoning  ████████████░░░░░░░░  $12.00           │   │
│  │  review     ████████░░░░░░░░░░░░  $8.00            │   │
│  │  summarize  ████░░░░░░░░░░░░░░░░  $4.23            │   │
│  │  planning   ███░░░░░░░░░░░░░░░░░  $3.00            │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Cost Trend (Line Chart - Last 30 Days)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  $2.5                                        ╱      │   │
│  │  $2.0                                   ╱───╯       │   │
│  │  $1.5                              ╱───╯            │   │
│  │  $1.0                         ╱───╯                 │   │
│  │  $0.5                    ╱───╯                      │   │
│  │  $0.0  ─────────────────╯                           │   │
│  │        Day 1    Day 10    Day 20    Day 30          │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Optimization Suggestions                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  💡 Switch 'summarize' tasks to LM Studio           │   │
│  │     Potential savings: $4.23/month                  │   │
│  │                                                      │   │
│  │  💡 Enable Prompt Caching for 'coding' tasks        │   │
│  │     Potential savings: $5.40/month (30% reduction)  │   │
│  │                                                      │   │
│  │  💡 Use Gemini Flash for 'review' tasks             │   │
│  │     Potential savings: $6.00/month (75% reduction)  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**组件**:
```typescript
// src/app/costs/page.tsx
export default async function CostsPage() {
  const summary = await getCostSummary('month');
  const budget = await getBudgetStatus();
  const suggestions = await getOptimizationSuggestions();
  
  return (
    <div className="container mx-auto p-6">
      <CostOverview summary={summary} budget={budget} />
      <ProviderBreakdown data={summary.byProvider} />
      <TaskTypeBreakdown data={summary.byTaskType} />
      <TrendChart data={summary.trend} />
      <OptimizationSuggestions suggestions={suggestions} />
    </div>
  );
}
```

#### 3.5.2 路由配置页面 (/settings/routing)

**布局**:
```
┌─────────────────────────────────────────────────────────────┐
│  Routing Configuration                                       │
├─────────────────────────────────────────────────────────────┤
│  General Settings                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ☑ Enable Smart Routing                             │   │
│  │  ☑ Enable Prompt Caching                            │   │
│  │  ☐ Enable Extended Thinking                         │   │
│  │  ☐ Offline First Mode                               │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Task Type Mapping                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  coding     → [LM Studio ▼]                         │   │
│  │  reasoning  → [Claude Sonnet ▼]                     │   │
│  │  summarize  → [LM Studio ▼]                         │   │
│  │  review     → [Gemini Flash ▼]                      │   │
│  │  planning   → [Claude Sonnet ▼]                     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Budget Management                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Daily Limit:    [$10.00]                           │   │
│  │  Weekly Limit:   [$50.00]                           │   │
│  │  Monthly Limit:  [$200.00]                          │   │
│  │                                                      │   │
│  │  Alert Thresholds: [50%] [80%] [100%]               │   │
│  │  ☐ Auto-downgrade when budget exceeded              │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Custom Rules                                [+ Add Rule]   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ☑ High Complexity Code → Claude Opus               │   │
│  │     Priority: 90  |  Matched: 45 times              │   │
│  │     [Edit] [Delete]                                  │   │
│  │                                                      │   │
│  │  ☑ Large Context → Extended Thinking                │   │
│  │     Priority: 80  |  Matched: 12 times              │   │
│  │     [Edit] [Delete]                                  │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  [Save Configuration]  [Export]  [Import]                   │
└─────────────────────────────────────────────────────────────┘
```

#### 3.5.3 路由历史页面 (/routing/history)

**布局**:
```
┌─────────────────────────────────────────────────────────────┐
│  Routing History                                             │
│  [Filter: All Tasks ▼] [Provider: All ▼] [Date Range ▼]    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2025-01-15 14:32:15                                │   │
│  │  Task: coding | Model: LM Studio (qwen3.5-9b)       │   │
│  │  Cost: $0.00 | Time: 2.3s | Satisfaction: ★★★★★    │   │
│  │  Reason: Simple coding task, using local model      │   │
│  │  [View Details]                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2025-01-15 14:28:42                                │   │
│  │  Task: reasoning | Model: Claude Sonnet             │   │
│  │  Cost: $0.0234 | Time: 4.1s | Satisfaction: ★★★★☆  │   │
│  │  Reason: Complex reasoning task, high accuracy      │   │
│  │  [View Details]                                      │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Performance Stats                                           │
│  Routing Accuracy: 96.5% | Avg Cost: $0.012 | Avg Time: 3.2s│
└─────────────────────────────────────────────────────────────┘
```


### 3.6 性能优化策略

#### 3.6.1 缓存策略

**配置缓存**:
```typescript
class ConfigCache {
  private cache: Map<string, any> = new Map();
  private ttl = 5 * 60 * 1000; // 5 minutes
  private timestamps: Map<string, number> = new Map();
  
  async get(key: string): Promise<any> {
    const timestamp = this.timestamps.get(key);
    if (timestamp && Date.now() - timestamp < this.ttl) {
      return this.cache.get(key);
    }
    
    // 从数据库加载
    const value = await db.select().from(settings).where(eq(settings.key, key));
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
    return value;
  }
  
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
      this.timestamps.delete(key);
    } else {
      this.cache.clear();
      this.timestamps.clear();
    }
  }
}
```

**规则缓存**:
```typescript
class RulesCache {
  private rules: CustomRule[] = [];
  private lastLoad = 0;
  private ttl = 5 * 60 * 1000;
  
  async getRules(): Promise<CustomRule[]> {
    if (Date.now() - this.lastLoad < this.ttl) {
      return this.rules;
    }
    
    this.rules = await db.select().from(customRules).where(eq(customRules.enabled, true));
    this.lastLoad = Date.now();
    return this.rules;
  }
}
```

#### 3.6.2 异步记录

**成本记录异步化**:
```typescript
class AsyncCostRecorder {
  private queue: CostRecord[] = [];
  private batchSize = 10;
  private flushInterval = 5000; // 5 seconds
  
  constructor() {
    setInterval(() => this.flush(), this.flushInterval);
  }
  
  async record(record: CostRecord): Promise<void> {
    this.queue.push(record);
    
    if (this.queue.length >= this.batchSize) {
      await this.flush();
    }
  }
  
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, this.batchSize);
    await db.insert(costRecords).values(batch);
  }
}
```

#### 3.6.3 数据库索引优化

```sql
-- 复合索引优化查询
CREATE INDEX idx_cost_records_user_timestamp 
  ON cost_records(user_id, timestamp DESC);

CREATE INDEX idx_routing_decisions_user_timestamp 
  ON routing_decisions(user_id, timestamp DESC);

-- 覆盖索引优化统计查询
CREATE INDEX idx_cost_records_summary 
  ON cost_records(timestamp, provider, task_type, total_cost);
```

#### 3.6.4 查询优化

**成本统计查询**:
```typescript
// 优化前：多次查询
const totalCost = await db.select({ sum: sum(costRecords.totalCost) })
  .from(costRecords)
  .where(between(costRecords.timestamp, startDate, endDate));

const byProvider = await db.select({
  provider: costRecords.provider,
  sum: sum(costRecords.totalCost)
})
  .from(costRecords)
  .where(between(costRecords.timestamp, startDate, endDate))
  .groupBy(costRecords.provider);

// 优化后：单次查询
const stats = await db.execute(sql`
  SELECT 
    SUM(total_cost) as total_cost,
    provider,
    task_type,
    SUM(total_cost) OVER (PARTITION BY provider) as provider_cost,
    SUM(total_cost) OVER (PARTITION BY task_type) as task_type_cost
  FROM cost_records
  WHERE timestamp BETWEEN ${startDate} AND ${endDate}
  GROUP BY provider, task_type
`);
```

### 3.7 向后兼容性设计

#### 3.7.1 配置迁移

```typescript
async function migrateConfig(): Promise<void> {
  const version = await getSetting('routing_config_version');
  
  if (!version || version < '2.0') {
    console.log('[Migration] Migrating routing config to v2.0');
    
    // 保留现有配置
    const existingConfig = await db.select().from(settings);
    
    // 添加新配置（使用默认值）
    const newSettings = [
      { key: 'enable_smart_routing', value: 'true' },
      { key: 'enable_extended_thinking', value: 'false' },
      { key: 'enable_prompt_caching', value: 'true' },
      // ... 其他新配置
    ];
    
    for (const setting of newSettings) {
      const exists = existingConfig.find(s => s.key === setting.key);
      if (!exists) {
        await db.insert(settings).values(setting);
      }
    }
    
    // 更新版本号
    await setSetting('routing_config_version', '2.0');
    console.log('[Migration] Migration complete');
  }
}
```

#### 3.7.2 API 兼容性

```typescript
// 支持旧版 API 格式
export async function POST(req: Request) {
  const body = await req.json();
  
  // 检测旧版格式
  if (body.agentName && !body.taskType) {
    // 从 agentName 推断 taskType
    body.taskType = inferTaskTypeFromAgentName(body.agentName);
  }
  
  // 继续处理...
}
```

### 3.8 测试策略

#### 3.8.1 单元测试

```typescript
// src/lib/routing/__tests__/task-classifier.test.ts
describe('TaskClassifier', () => {
  it('should classify coding tasks', () => {
    const classifier = new TaskClassifier();
    const result = classifier.classify('Write a TypeScript function');
    expect(result.taskType).toBe('coding');
    expect(result.confidence).toBeGreaterThan(0.8);
  });
  
  it('should classify reasoning tasks', () => {
    const classifier = new TaskClassifier();
    const result = classifier.classify('Explain the architecture');
    expect(result.taskType).toBe('reasoning');
  });
});
```

#### 3.8.2 集成测试

```typescript
// src/lib/routing/__tests__/routing-system.integration.test.ts
describe('Routing System Integration', () => {
  it('should route simple coding task to LM Studio', async () => {
    const result = await routeRequest({
      prompt: 'Write a hello world function',
      taskType: 'coding',
    });
    
    expect(result.decision.provider).toBe('lmstudio');
    expect(result.decision.estimatedCost).toBe(0);
  });
  
  it('should route complex reasoning task to Claude', async () => {
    const result = await routeRequest({
      prompt: 'Design a distributed system architecture',
      taskType: 'reasoning',
    });
    
    expect(result.decision.provider).toBe('anthropic');
    expect(result.decision.modelName).toContain('claude');
  });
});
```

#### 3.8.3 性能测试

```typescript
// src/lib/routing/__tests__/routing-performance.test.ts
describe('Routing Performance', () => {
  it('should complete routing decision in < 100ms', async () => {
    const start = Date.now();
    
    await routeRequest({
      prompt: 'Test prompt',
      taskType: 'coding',
    });
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
```

## 4. Implementation Plan

### Phase 1: Core Routing Enhancement (Week 1-2)
- [ ] Implement TaskClassifier
- [ ] Implement MultiDimAnalyzer
- [ ] Implement CustomRulesEngine
- [ ] Implement BudgetChecker
- [ ] Implement ModelSelector with Extended Thinking
- [ ] Implement DecisionExplainer
- [ ] Add database tables and migrations
- [ ] Write unit tests

### Phase 2: Cost Tracking System (Week 3)
- [ ] Implement CostRecorder
- [ ] Implement BudgetMonitor
- [ ] Implement AlertManager
- [ ] Add cost tracking to routing flow
- [ ] Write integration tests

### Phase 3: UI Development (Week 4)
- [ ] Build Cost Dashboard page
- [ ] Build Routing Configuration page
- [ ] Build Routing History page
- [ ] Implement charts and visualizations
- [ ] Add export functionality

### Phase 4: CLI & MCP Enhancement (Week 5)
- [ ] Enhance Claude CLI proxy
- [ ] Add routing to MCP tools
- [ ] Add response headers
- [ ] Test end-to-end flows

### Phase 5: Testing & Documentation (Week 6)
- [ ] Complete test coverage (>80%)
- [ ] Performance testing
- [ ] Update documentation
- [ ] Migration guide
- [ ] User guide

## 5. Success Metrics

- **Performance**: Routing decision < 100ms (P95)
- **Cost Reduction**: 30%+ reduction in API costs
- **Accuracy**: 95%+ routing accuracy
- **Test Coverage**: 80%+ code coverage
- **User Satisfaction**: 4.5+ average rating

