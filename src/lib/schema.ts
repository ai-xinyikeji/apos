import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').unique().notNull(),
  value: text('value').notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const signals = sqliteTable('signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(), // 'amplitude' | 'zendesk' | 'manual' | 'competitor'
  title: text('title').notNull(),
  content: text('content').notNull(),
  url: text('url'),
  status: text('status').notNull().default('pending'), // 'pending' | 'analyzed' | 'archived' | 'created_prototype'
  sentiment: text('sentiment'), // 'positive' | 'neutral' | 'negative'
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const prototypes = sqliteTable('prototypes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  branchName: text('branch_name').notNull(),
  status: text('status').notNull().default('draft'), // 'draft' | 'assessing' | 'generating' | 'generated' | 'failed' | 'pr_created' | 'merged'
  codePath: text('code_path'),
  previewUrl: text('preview_url'),
  commitHash: text('commit_hash'),
  prNumber: integer('pr_number'),
  prUrl: text('pr_url'),
  feasibilityReport: text('feasibility_report'), // Markdown report from assessment
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const agentTraces = sqliteTable('agent_traces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentName: text('agent_name').notNull(), // 'ProtoBuilder' | 'ReviewBot' | 'SignalCollector' | 'ReportGenerator'
  runId: text('run_id').notNull(), // UUID to group steps in a single execution
  step: text('step').notNull(), // Step name/action
  status: text('status').notNull(), // 'info' | 'success' | 'warning' | 'error'
  message: text('message').notNull(),
  details: text('details'), // JSON string for more data (e.g. prompt, response, diff)
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const metrics = sqliteTable('metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  event: text('event').notNull(), // Event name (e.g. 'feature_used', 'page_view', 'agent_execution')
  properties: text('properties').notNull(), // JSON string with event properties
  timestamp: text('timestamp').$defaultFn(() => new Date().toISOString()),
});

export const codeNodes = sqliteTable('code_nodes', {
  id: text('id').primaryKey(), // unique identifier: file_path + "#" + qualified_name
  kind: text('kind').notNull(), // 'class' | 'method' | 'function' | 'variable' | 'interface' | 'route'
  name: text('name').notNull(),
  qualifiedName: text('qualified_name').notNull(),
  filePath: text('file_path').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  docstring: text('docstring'),
  signature: text('signature'),
  isExported: integer('is_exported').default(0),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const codeEdges = sqliteTable('code_edges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  target: text('target').notNull(),
  kind: text('kind').notNull(), // 'calls' | 'imports' | 'extends' | 'implements' | 'contains'
  line: integer('line'),
  col: integer('col'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const experiments = sqliteTable('experiments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  feature: text('feature').notNull(),
  status: text('status').notNull().default('draft'), // 'draft' | 'active' | 'completed'
  variantA: text('variant_a').notNull(),
  variantB: text('variant_b').notNull(),
  countA: integer('count_a').default(0),
  countB: integer('count_b').default(0),
  conversionA: integer('conversion_a').default(0),
  conversionB: integer('conversion_b').default(0),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const workflows = sqliteTable('workflows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  description: text('description').notNull(),
  tasks: text('tasks').notNull(), // JSON string representation of Task[] array
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

/**
 * Conversation memory table — stores per-session summaries and key facts
 * for the 3-layer context management system.
 */
export const conversationMemories = sqliteTable('conversation_memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),       // Claude Code session identifier
  summary: text('summary').notNull(),             // Rolling summary of older messages
  keyFacts: text('key_facts'),                    // JSON: important facts extracted from conversation
  messageCount: integer('message_count').default(0), // How many messages this summary covers
  totalTokensEstimate: integer('total_tokens_estimate').default(0),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

/**
 * Routing decisions table — stores model routing decisions for analysis and optimization
 */
export const routingDecisions = sqliteTable('routing_decisions', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull().$defaultFn(() => new Date().toISOString()),
  userId: text('user_id'),
  
  // Task information
  taskType: text('task_type').notNull(), // 'reasoning' | 'coding' | 'summarize' | 'refactor' | 'review' | 'planning' | 'explain' | 'default'
  promptPreview: text('prompt_preview'),
  contextSize: integer('context_size').notNull(),
  codeComplexity: integer('code_complexity'),
  
  // Routing decision
  selectedProvider: text('selected_provider').notNull(),
  selectedModel: text('selected_model').notNull(),
  decisionReason: text('decision_reason').notNull(),
  customRuleId: text('custom_rule_id'),
  manualOverride: integer('manual_override').default(0), // SQLite boolean (0 or 1)
  
  // Cost estimation
  estimatedCost: integer('estimated_cost').notNull(), // Store as integer (cents) to avoid floating point issues
  estimatedTime: integer('estimated_time'),
  
  // Actual results
  actualCost: integer('actual_cost'), // Store as integer (cents)
  actualTime: integer('actual_time'),
  executionStatus: text('execution_status'),
  
  // Extended Thinking
  usesExtendedThinking: integer('uses_extended_thinking').default(0),
  thinkingTokens: integer('thinking_tokens'),
  
  // Prompt Caching
  usesPromptCaching: integer('uses_prompt_caching').default(0),
  cacheCreationTokens: integer('cache_creation_tokens'),
  cacheReadTokens: integer('cache_read_tokens'),
  
  // User feedback
  userSatisfaction: integer('user_satisfaction'), // 1-5
  userFeedback: text('user_feedback'),
  
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  timestampIdx: index('idx_routing_decisions_timestamp').on(table.timestamp),
  userIdIdx: index('idx_routing_decisions_user_id').on(table.userId),
  taskTypeIdx: index('idx_routing_decisions_task_type').on(table.taskType),
  providerIdx: index('idx_routing_decisions_provider').on(table.selectedProvider),
}));

/**
 * Cost records table — stores LLM API call costs for tracking and analysis
 */
export const costRecords = sqliteTable('cost_records', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull().$defaultFn(() => new Date().toISOString()),
  userId: text('user_id'),
  
  // Model information
  provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'google' | 'lmstudio'
  modelName: text('model_name').notNull(),
  taskType: text('task_type').notNull(),
  
  // Token usage
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cacheCreationTokens: integer('cache_creation_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  
  // Cost (stored as integer cents to avoid floating point issues)
  totalCost: integer('total_cost').notNull(), // Total cost in cents
  cacheSavings: integer('cache_savings').default(0), // Cache savings in cents
  
  // Association
  routingDecisionId: text('routing_decision_id'),
  
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  timestampIdx: index('idx_cost_records_timestamp').on(table.timestamp),
  userIdIdx: index('idx_cost_records_user_id').on(table.userId),
  providerIdx: index('idx_cost_records_provider').on(table.provider),
  taskTypeIdx: index('idx_cost_records_task_type').on(table.taskType),
}));

/**
 * Custom rules table — stores user-defined routing rules
 */
export const customRules = sqliteTable('custom_rules', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  priority: integer('priority').notNull().default(50), // 1-100
  enabled: integer('enabled').notNull().default(1), // SQLite boolean (0 or 1)
  
  // Conditions (JSON arrays/ranges)
  taskTypes: text('task_types'), // JSON array: ["coding", "review"]
  contextSizeMin: integer('context_size_min'),
  contextSizeMax: integer('context_size_max'),
  codeComplexityMin: integer('code_complexity_min'),
  codeComplexityMax: integer('code_complexity_max'),
  
  // Target model
  targetProvider: text('target_provider').notNull(),
  targetModel: text('target_model').notNull(),
  
  // Statistics
  matchCount: integer('match_count').default(0),
  lastMatchedAt: text('last_matched_at'),
  
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  userIdIdx: index('idx_custom_rules_user_id').on(table.userId),
  priorityIdx: index('idx_custom_rules_priority').on(table.priority),
  enabledIdx: index('idx_custom_rules_enabled').on(table.enabled),
}));

/**
 * Budget alerts table — stores budget threshold alerts for cost monitoring
 */
export const budgetAlerts = sqliteTable('budget_alerts', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull().$defaultFn(() => new Date().toISOString()),
  userId: text('user_id'),
  
  period: text('period').notNull(), // 'daily' | 'weekly' | 'monthly'
  threshold: integer('threshold').notNull(), // Threshold percentage (stored as integer, e.g., 80 for 80%)
  currentSpend: integer('current_spend').notNull(), // Current spend in cents
  budgetLimit: integer('budget_limit').notNull(), // Budget limit in cents
  severity: text('severity').notNull(), // 'info' | 'warning' | 'critical'
  
  acknowledged: integer('acknowledged').default(0), // SQLite boolean (0 or 1)
  acknowledgedAt: text('acknowledged_at'),
  
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  userIdIdx: index('idx_budget_alerts_user_id').on(table.userId),
  timestampIdx: index('idx_budget_alerts_timestamp').on(table.timestamp),
  acknowledgedIdx: index('idx_budget_alerts_acknowledged').on(table.acknowledged),
}));

