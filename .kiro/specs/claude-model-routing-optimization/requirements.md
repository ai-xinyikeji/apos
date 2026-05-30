# Requirements Document

## Introduction

本文档定义了 APOS（AI Product OS）系统中 Claude Desktop/CLI 模型路由规则优化功能的需求。该功能旨在增强现有的模型路由系统，实现更智能的路由决策、完善的 Claude 集成、实时成本追踪、改善的用户体验以及统一的配置管理。

APOS 已经实现了基础的模型路由功能，包括 LLM 路由、智能路由器、Claude 模型选择器、Claude CLI 代理配置和 Claude Desktop MCP 集成。本优化将在现有基础上进行增强，解决路由规则不够智能、Claude 模型选择不够精细、成本追踪不完善、用户体验问题以及配置文档不一致等问题。

## Glossary

- **Routing_System**: 模型路由系统，负责根据任务特征选择最优的 LLM 模型
- **Claude_Model_Selector**: Claude 模型选择器，负责在 Claude 模型家族中选择最优模型
- **Smart_Router**: 智能路由器，根据任务复杂度和成本预算进行路由决策
- **Cost_Tracker**: 成本追踪器，记录和统计 LLM API 调用的成本
- **Prompt_Caching**: Claude 提示缓存功能，缓存重复的提示内容以降低成本
- **Extended_Thinking**: Claude 扩展思考模式，使用 claude-3-7-sonnet 模型进行深度推理
- **MCP_Server**: Model Context Protocol 服务器，用于 Claude Desktop 工具集成
- **CLI_Proxy**: Claude CLI 代理，拦截 Claude CLI 请求并通过 APOS 路由
- **Task_Type**: 任务类型，包括 reasoning、coding、summarize、refactor、review、planning、explain 等
- **Context_Size**: 上下文大小，以字符或 token 数量衡量
- **Code_Complexity**: 代码复杂度，基于代码长度、嵌套深度等指标
- **Budget_Limit**: 预算限制，用户设定的成本上限
- **Routing_Decision**: 路由决策，包括选择的模型、决策原因和预估成本
- **Cost_Dashboard**: 成本仪表板，展示成本统计和优化建议的 UI 界面
- **LM_Studio**: 本地模型运行时，支持免费的本地 LLM 模型
- **Model_Provider**: 模型提供商，包括 Anthropic、OpenAI、Google、LM Studio 等

## Requirements

### Requirement 1: 多维度路由决策

**User Story:** 作为 APOS 用户，我希望系统能够根据任务类型、上下文大小、代码复杂度和成本预算等多个维度自动选择最优模型，以便在成本和质量之间取得最佳平衡。

#### Acceptance Criteria

1. WHEN THE Routing_System 接收到路由请求，THE Routing_System SHALL 分析任务类型并分类为 reasoning、coding、summarize、refactor、review、planning、explain 或 default 之一
2. WHEN THE Routing_System 分析任务，THE Routing_System SHALL 计算上下文大小并以 token 数量表示
3. WHEN 任务包含代码内容，THE Routing_System SHALL 计算代码复杂度分数（基于代码长度、嵌套深度和函数数量）
4. WHEN THE Routing_System 进行路由决策，THE Routing_System SHALL 检查用户设定的预算限制
5. WHEN THE Routing_System 完成分析，THE Routing_System SHALL 综合所有维度生成路由决策，包括选择的模型、决策原因和预估成本
6. WHEN 预估成本超过预算限制，THE Routing_System SHALL 选择成本更低的替代模型
7. WHEN 没有模型满足预算限制，THE Routing_System SHALL 选择成本最低的可用模型并记录预算超支警告

### Requirement 2: 用户自定义路由规则

**User Story:** 作为高级用户，我希望能够自定义路由规则，以便根据我的特定需求和偏好配置模型选择策略。

#### Acceptance Criteria

1. THE Routing_System SHALL 支持用户定义自定义路由规则
2. WHEN 用户创建自定义规则，THE Routing_System SHALL 允许用户指定任务类型、上下文大小范围、代码复杂度范围和目标模型
3. WHEN 用户创建自定义规则，THE Routing_System SHALL 允许用户设置规则优先级（1-100）
4. WHEN THE Routing_System 进行路由决策，THE Routing_System SHALL 按优先级顺序评估自定义规则
5. WHEN 自定义规则匹配任务特征，THE Routing_System SHALL 使用规则指定的模型
6. WHEN 没有自定义规则匹配，THE Routing_System SHALL 回退到默认路由策略
7. THE Routing_System SHALL 支持用户启用或禁用单个自定义规则
8. THE Routing_System SHALL 支持用户删除自定义规则

### Requirement 3: 自适应路由优化

**User Story:** 作为 APOS 用户，我希望系统能够根据历史表现自动调整路由策略，以便持续优化模型选择的准确性和成本效益。

#### Acceptance Criteria

1. WHEN THE Routing_System 完成一次路由，THE Routing_System SHALL 记录路由决策、实际使用的模型、实际成本和执行时间
2. WHEN 用户对结果提供反馈，THE Routing_System SHALL 记录用户满意度评分（1-5）
3. WHEN THE Routing_System 积累至少 100 条历史记录，THE Routing_System SHALL 启用自适应优化
4. WHEN 自适应优化启用，THE Routing_System SHALL 每 24 小时分析历史数据
5. WHEN THE Routing_System 分析历史数据，THE Routing_System SHALL 识别表现不佳的路由模式（满意度低于 3.0 或成本超支超过 20%）
6. WHEN THE Routing_System 识别表现不佳的模式，THE Routing_System SHALL 调整路由权重以改善未来决策
7. WHEN THE Routing_System 调整路由策略，THE Routing_System SHALL 记录调整原因和预期效果
8. THE Routing_System SHALL 支持用户查看自适应优化历史

### Requirement 4: Extended Thinking 支持

**User Story:** 作为需要深度推理的用户，我希望系统能够在复杂任务中使用 Claude Extended Thinking 模式，以便获得更准确和深入的分析结果。

#### Acceptance Criteria

1. THE Claude_Model_Selector SHALL 支持 claude-3-7-sonnet 模型（Extended Thinking）
2. WHEN 任务类型为 reasoning 或 planning，THE Claude_Model_Selector SHALL 评估是否使用 Extended Thinking
3. WHEN 上下文大小超过 50000 tokens，THE Claude_Model_Selector SHALL 优先考虑 Extended Thinking
4. WHEN 代码复杂度分数超过 80，THE Claude_Model_Selector SHALL 优先考虑 Extended Thinking
5. WHEN 用户明确请求深度分析，THE Claude_Model_Selector SHALL 使用 Extended Thinking
6. WHEN THE Claude_Model_Selector 使用 Extended Thinking，THE Claude_Model_Selector SHALL 在响应中包含思考过程摘要
7. WHEN Extended Thinking 完成，THE Claude_Model_Selector SHALL 记录思考 token 数量和总成本
8. THE Claude_Model_Selector SHALL 支持用户在设置中启用或禁用 Extended Thinking

### Requirement 5: Prompt Caching 智能应用

**User Story:** 作为关注成本的用户，我希望系统能够智能地应用 Prompt Caching 功能，以便在保持性能的同时显著降低 API 成本。

#### Acceptance Criteria

1. WHEN THE Routing_System 使用 Claude 模型，THE Routing_System SHALL 检查是否启用 Prompt Caching
2. WHEN Prompt Caching 启用且 system prompt 超过 1024 tokens，THE Routing_System SHALL 对 system prompt 应用缓存标记
3. WHEN Prompt Caching 启用且用户消息超过 2048 tokens，THE Routing_System SHALL 对用户消息应用缓存标记
4. WHEN THE Routing_System 发送请求到 Claude API，THE Routing_System SHALL 在请求中包含缓存控制参数
5. WHEN THE Routing_System 接收到 Claude API 响应，THE Routing_System SHALL 提取缓存统计信息（cache_creation_input_tokens、cache_read_input_tokens）
6. WHEN THE Routing_System 提取缓存统计，THE Routing_System SHALL 计算缓存节省的成本
7. WHEN 缓存命中率低于 30%，THE Routing_System SHALL 记录警告并建议调整缓存策略
8. THE Routing_System SHALL 在响应元数据中包含缓存统计信息

### Requirement 6: 实时成本追踪

**User Story:** 作为 APOS 管理员，我希望能够实时追踪 LLM API 调用的成本，以便监控预算使用情况并及时发现异常。

#### Acceptance Criteria

1. THE Cost_Tracker SHALL 记录每次 LLM API 调用的成本
2. WHEN THE Cost_Tracker 记录成本，THE Cost_Tracker SHALL 包含时间戳、模型提供商、模型名称、输入 tokens、输出 tokens、缓存 tokens 和总成本
3. WHEN THE Cost_Tracker 记录成本，THE Cost_Tracker SHALL 将记录存储到数据库
4. THE Cost_Tracker SHALL 支持按时间范围查询成本统计（今天、本周、本月、自定义范围）
5. THE Cost_Tracker SHALL 支持按模型提供商分组统计成本
6. THE Cost_Tracker SHALL 支持按任务类型分组统计成本
7. THE Cost_Tracker SHALL 计算缓存节省的总成本
8. WHEN 用户查询成本统计，THE Cost_Tracker SHALL 在 200 毫秒内返回结果

### Requirement 7: 成本预警系统

**User Story:** 作为 APOS 管理员，我希望系统能够在成本接近或超过预算时自动发出预警，以便及时采取措施控制成本。

#### Acceptance Criteria

1. THE Cost_Tracker SHALL 支持用户设置每日、每周和每月预算限制
2. WHEN THE Cost_Tracker 记录新的成本，THE Cost_Tracker SHALL 计算当前周期的累计成本
3. WHEN 累计成本达到预算限制的 80%，THE Cost_Tracker SHALL 发送警告通知
4. WHEN 累计成本达到预算限制的 100%，THE Cost_Tracker SHALL 发送严重警告通知
5. WHEN 累计成本超过预算限制，THE Cost_Tracker SHALL 记录预算超支事件
6. WHERE 用户启用自动降级，WHEN 累计成本超过预算限制，THE Routing_System SHALL 自动切换到成本更低的模型
7. THE Cost_Tracker SHALL 支持用户配置预警阈值（50%-100%）
8. THE Cost_Tracker SHALL 支持用户配置通知方式（UI 通知、邮件、Webhook）

### Requirement 8: 成本仪表板 UI

**User Story:** 作为 APOS 用户，我希望有一个直观的成本仪表板，以便可视化地查看成本统计、趋势和优化建议。

#### Acceptance Criteria

1. THE Cost_Dashboard SHALL 显示当前周期的总成本
2. THE Cost_Dashboard SHALL 显示按模型提供商分组的成本饼图
3. THE Cost_Dashboard SHALL 显示按任务类型分组的成本柱状图
4. THE Cost_Dashboard SHALL 显示过去 30 天的成本趋势折线图
5. THE Cost_Dashboard SHALL 显示缓存节省的总成本和节省百分比
6. THE Cost_Dashboard SHALL 显示预算使用进度条
7. WHEN 预算使用超过 80%，THE Cost_Dashboard SHALL 以警告颜色显示进度条
8. THE Cost_Dashboard SHALL 显示成本优化建议列表（基于历史数据分析）
9. THE Cost_Dashboard SHALL 支持用户选择时间范围（今天、本周、本月、自定义）
10. THE Cost_Dashboard SHALL 支持用户导出成本报告为 CSV 或 PDF 格式

### Requirement 9: 路由决策可视化

**User Story:** 作为 APOS 用户，我希望能够看到系统为什么选择了特定的模型，以便理解路由决策的逻辑并建立信任。

#### Acceptance Criteria

1. WHEN THE Routing_System 完成路由决策，THE Routing_System SHALL 生成决策解释
2. THE Routing_System SHALL 在决策解释中包含任务类型、复杂度评分和选择的模型
3. THE Routing_System SHALL 在决策解释中包含决策原因（例如"任务复杂度高，选择 Claude Opus 以确保准确性"）
4. THE Routing_System SHALL 在决策解释中包含预估成本和预估执行时间
5. WHEN 路由决策涉及预算限制，THE Routing_System SHALL 在解释中说明预算考虑
6. WHEN 路由决策使用自定义规则，THE Routing_System SHALL 在解释中标注使用的规则名称
7. THE Routing_System SHALL 在 UI 中显示路由决策解释
8. THE Routing_System SHALL 支持用户查看历史路由决策

### Requirement 10: 手动模型覆盖

**User Story:** 作为 APOS 用户，我希望能够手动覆盖系统的模型选择，以便在特定情况下使用我偏好的模型。

#### Acceptance Criteria

1. THE Routing_System SHALL 支持用户在请求中指定目标模型
2. WHEN 用户指定目标模型，THE Routing_System SHALL 验证模型是否可用
3. WHEN 目标模型可用，THE Routing_System SHALL 使用用户指定的模型
4. WHEN 目标模型不可用，THE Routing_System SHALL 返回错误消息并建议可用的替代模型
5. WHEN 用户使用手动覆盖，THE Routing_System SHALL 在决策记录中标注为手动覆盖
6. THE Routing_System SHALL 在 UI 中提供模型选择下拉菜单
7. THE Routing_System SHALL 在模型选择菜单中显示每个模型的成本和特点
8. THE Routing_System SHALL 支持用户为特定任务类型设置默认覆盖模型

### Requirement 11: 路由历史和性能分析

**User Story:** 作为 APOS 管理员，我希望能够查看路由历史和性能分析，以便评估路由系统的效果并识别优化机会。

#### Acceptance Criteria

1. THE Routing_System SHALL 记录所有路由决策到数据库
2. WHEN THE Routing_System 记录路由决策，THE Routing_System SHALL 包含时间戳、任务类型、选择的模型、决策原因、预估成本、实际成本和执行时间
3. THE Routing_System SHALL 支持用户查询路由历史（按时间范围、任务类型、模型过滤）
4. THE Routing_System SHALL 计算路由准确率（实际成本与预估成本的偏差）
5. THE Routing_System SHALL 计算平均响应时间（按模型和任务类型分组）
6. THE Routing_System SHALL 识别成本异常（实际成本超过预估成本 50% 以上）
7. THE Routing_System SHALL 生成性能分析报告，包括路由准确率、平均成本、平均响应时间和异常事件
8. THE Routing_System SHALL 支持用户导出路由历史为 CSV 格式

### Requirement 12: 统一路由配置界面

**User Story:** 作为 APOS 用户，我希望有一个统一的配置界面来管理所有路由相关的设置，以便轻松配置和调整路由行为。

#### Acceptance Criteria

1. THE Routing_System SHALL 提供统一的路由配置界面
2. THE 路由配置界面 SHALL 包含模型提供商配置部分（API Keys、Base URLs）
3. THE 路由配置界面 SHALL 包含路由策略配置部分（启用智能路由、优先级策略）
4. THE 路由配置界面 SHALL 包含任务类型映射配置部分（为每个任务类型选择默认模型）
5. THE 路由配置界面 SHALL 包含预算管理配置部分（每日/每周/每月预算限制）
6. THE 路由配置界面 SHALL 包含 Prompt Caching 配置部分（启用/禁用、缓存阈值）
7. THE 路由配置界面 SHALL 包含 Extended Thinking 配置部分（启用/禁用、触发条件）
8. THE 路由配置界面 SHALL 包含自定义规则管理部分（创建、编辑、删除规则）
9. WHEN 用户修改配置，THE 路由配置界面 SHALL 验证配置有效性
10. WHEN 配置验证失败，THE 路由配置界面 SHALL 显示具体的错误消息
11. WHEN 用户保存配置，THE 路由配置界面 SHALL 将配置持久化到数据库
12. THE 路由配置界面 SHALL 支持用户导出和导入配置为 JSON 格式

### Requirement 13: Claude CLI 代理增强

**User Story:** 作为 Claude CLI 用户，我希望 APOS 代理能够提供更丰富的功能和更好的性能，以便获得与 Web UI 一致的体验。

#### Acceptance Criteria

1. THE CLI_Proxy SHALL 拦截所有发送到 ANTHROPIC_BASE_URL 的请求
2. WHEN THE CLI_Proxy 接收到请求，THE CLI_Proxy SHALL 提取提示内容和参数
3. WHEN THE CLI_Proxy 提取提示内容，THE CLI_Proxy SHALL 分类任务类型
4. WHEN THE CLI_Proxy 分类任务类型，THE CLI_Proxy SHALL 调用 Routing_System 进行路由决策
5. WHEN THE CLI_Proxy 获得路由决策，THE CLI_Proxy SHALL 使用选择的模型执行请求
6. WHEN THE CLI_Proxy 执行请求，THE CLI_Proxy SHALL 应用 Prompt Caching（如果启用）
7. WHEN THE CLI_Proxy 完成请求，THE CLI_Proxy SHALL 记录成本和性能数据
8. WHEN THE CLI_Proxy 返回响应，THE CLI_Proxy SHALL 使用 Claude API 兼容的格式
9. THE CLI_Proxy SHALL 在响应头中包含路由决策信息（X-APOS-Model、X-APOS-Cost）
10. THE CLI_Proxy SHALL 支持流式响应（Server-Sent Events）

### Requirement 14: Claude Desktop MCP 工具增强

**User Story:** 作为 Claude Desktop 用户，我希望 APOS MCP 工具能够利用优化后的路由系统，以便在工具执行中获得更好的性能和更低的成本。

#### Acceptance Criteria

1. THE MCP_Server SHALL 为每个工具调用使用 Routing_System 进行模型选择
2. WHEN THE MCP_Server 执行代码搜索工具，THE MCP_Server SHALL 使用 coding 任务类型路由
3. WHEN THE MCP_Server 执行原型生成工具，THE MCP_Server SHALL 使用 coding 任务类型路由
4. WHEN THE MCP_Server 执行代码审查工具，THE MCP_Server SHALL 使用 review 任务类型路由
5. WHEN THE MCP_Server 执行架构设计工具，THE MCP_Server SHALL 使用 planning 任务类型路由
6. WHEN THE MCP_Server 完成工具执行，THE MCP_Server SHALL 记录成本到 Cost_Tracker
7. THE MCP_Server SHALL 在工具响应中包含成本信息
8. THE MCP_Server SHALL 支持用户在 Claude Desktop 中查看 APOS 成本统计

### Requirement 15: 向后兼容性

**User Story:** 作为现有 APOS 用户，我希望优化后的系统能够保持向后兼容，以便我的现有配置和工作流不会被破坏。

#### Acceptance Criteria

1. THE Routing_System SHALL 支持现有的 settings 数据库表结构
2. WHEN THE Routing_System 读取配置，THE Routing_System SHALL 兼容现有的配置键名
3. WHEN 用户未配置新的路由设置，THE Routing_System SHALL 使用默认值并保持现有行为
4. THE Routing_System SHALL 支持现有的 Claude CLI 环境变量配置（ANTHROPIC_BASE_URL、ANTHROPIC_API_KEY）
5. THE Routing_System SHALL 支持现有的 Claude Desktop MCP 配置格式
6. WHEN THE Routing_System 检测到旧版本配置，THE Routing_System SHALL 自动迁移到新格式
7. THE Routing_System SHALL 在迁移配置时保留所有现有设置
8. THE Routing_System SHALL 在日志中记录配置迁移信息

### Requirement 16: 离线模式支持

**User Story:** 作为使用本地模型的用户，我希望路由系统能够在离线模式下正常工作，以便在没有网络连接时仍然可以使用 APOS。

#### Acceptance Criteria

1. WHEN LM_Studio 正在运行，THE Routing_System SHALL 检测可用的本地模型
2. WHEN THE Routing_System 检测到本地模型，THE Routing_System SHALL 优先使用本地模型（如果任务适合）
3. WHEN THE Routing_System 无法连接到云端 API，THE Routing_System SHALL 自动回退到本地模型
4. WHEN THE Routing_System 使用本地模型，THE Routing_System SHALL 记录成本为 0
5. THE Routing_System SHALL 在路由决策中标注是否使用本地模型
6. WHEN 用户启用"离线优先"模式，THE Routing_System SHALL 总是优先使用本地模型
7. WHEN 本地模型不可用且无网络连接，THE Routing_System SHALL 返回明确的错误消息
8. THE Routing_System SHALL 在 UI 中显示本地模型状态（运行中/未运行）

### Requirement 17: 路由性能要求

**User Story:** 作为 APOS 用户，我希望路由决策能够快速完成，以便不会显著增加请求的总延迟。

#### Acceptance Criteria

1. THE Routing_System SHALL 在 100 毫秒内完成路由决策（不包括 LLM API 调用时间）
2. WHEN THE Routing_System 分析任务特征，THE Routing_System SHALL 使用缓存的分析结果（如果可用）
3. WHEN THE Routing_System 查询数据库，THE Routing_System SHALL 使用索引优化查询性能
4. THE Routing_System SHALL 在内存中缓存常用的配置和规则
5. WHEN THE Routing_System 缓存配置，THE Routing_System SHALL 每 5 分钟刷新缓存
6. THE Routing_System SHALL 使用异步方式记录路由历史和成本数据
7. WHEN 路由决策超过 100 毫秒，THE Routing_System SHALL 记录性能警告
8. THE Routing_System SHALL 提供性能监控指标（P50、P95、P99 延迟）

### Requirement 18: 多用户支持准备

**User Story:** 作为 APOS 开发者，我希望路由系统的设计能够支持未来的多用户场景，以便在需要时可以轻松扩展。

#### Acceptance Criteria

1. THE Routing_System SHALL 在数据库表中包含 user_id 字段（当前可为空）
2. THE Routing_System SHALL 支持按用户隔离配置和数据
3. THE Cost_Tracker SHALL 支持按用户统计成本
4. THE Routing_System SHALL 支持按用户设置预算限制
5. THE Routing_System SHALL 支持按用户定义自定义路由规则
6. THE Routing_System SHALL 在 API 中接受可选的 user_id 参数
7. WHEN user_id 未提供，THE Routing_System SHALL 使用默认用户配置
8. THE Routing_System SHALL 提供用户管理 API（创建、更新、删除用户配置）

### Requirement 19: 文档和示例更新

**User Story:** 作为 APOS 用户和开发者，我希望有完整和准确的文档，以便理解和使用优化后的路由系统。

#### Acceptance Criteria

1. THE 项目文档 SHALL 包含路由系统架构说明
2. THE 项目文档 SHALL 包含路由决策流程图
3. THE 项目文档 SHALL 包含所有路由配置选项的说明
4. THE 项目文档 SHALL 包含自定义路由规则的示例
5. THE 项目文档 SHALL 包含成本优化最佳实践
6. THE 项目文档 SHALL 包含 Claude CLI 代理配置指南
7. THE 项目文档 SHALL 包含 Claude Desktop MCP 配置指南
8. THE 项目文档 SHALL 包含 API 参考文档
9. THE 项目文档 SHALL 包含故障排查指南
10. THE 项目文档 SHALL 与实际实现保持 100% 一致

### Requirement 20: 测试和质量保证

**User Story:** 作为 APOS 开发者，我希望路由系统有完善的测试覆盖，以便确保功能正确性和稳定性。

#### Acceptance Criteria

1. THE Routing_System SHALL 有单元测试覆盖所有核心函数
2. THE Routing_System SHALL 有集成测试覆盖路由决策流程
3. THE Routing_System SHALL 有端到端测试覆盖 CLI 代理和 MCP 集成
4. THE 测试套件 SHALL 包含性能测试验证路由决策延迟
5. THE 测试套件 SHALL 包含成本计算准确性测试
6. THE 测试套件 SHALL 包含向后兼容性测试
7. THE 测试套件 SHALL 包含错误处理和边界条件测试
8. WHEN 运行测试套件，THE 测试套件 SHALL 在 5 分钟内完成
9. THE 测试套件 SHALL 达到至少 80% 的代码覆盖率
10. THE 项目 SHALL 在 CI/CD 流程中自动运行测试套件
