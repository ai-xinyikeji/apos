# LLM 404 错误修复总结

## 问题描述

用户在 APOS Web UI 上看到多个功能报错 "Not Found"，特别是信号收集功能（SignalCollectorAgent）。

错误日志示例：
```
[10:41:17 PM] 采集失败 信号收集失败: Not Found
```

## 根本原因分析

1. **Web 模型扩展未连接**: 当使用 ChatGPT Web、Gemini Web 或 Kimi Web 等网页版模型时，如果浏览器扩展未连接或配置不正确，会返回 "Not Found" 错误

2. **API 模型配置错误**: 当使用 API 模型时，如果模型名称不存在或 base URL 配置错误，会返回 404 错误

3. **不一致的错误处理**: 项目中有两种错误处理方式：
   - **BaseAgent.callLLM()**: 已经包含完善的 404 检测和自动 fallback 机制
   - **直接调用 generateText()**: 部分代码直接调用，需要手动实现 fallback 逻辑

## 已有的正确实现

### 1. lib/llm.ts 中的 generateText()

已经包含：
- 404 错误自动检测
- 自动 fallback 到 getFallbackModel()
- fallback 优先级: Ollama → Gemini API → DeepSeek API → OpenAI API → Anthropic API

### 2. agents/base.ts 中的 callLLM()

已经包含：
- 404 错误检测
- 自动切换到 routeModel('default')
- 完整的 trace 日志

### 3. ProtoBuilderAgent

✅ 正确使用 `this.callLLM()`，有完整的 fallback 支持

## 需要修复的问题

### 1. ❌ SignalCollectorAgent (src/agents/signal-collector.ts)

**当前实现问题**:
- 直接调用 `generateText()` 而不是使用 `this.callLLM()`
- 手动实现了 fallback 逻辑（重复造轮子）
- JSON 解析错误处理不够健壮

**修复方案**:
- 改用 `this.callLLM()` 替代手动 fallback
- 增强 JSON 解析的错误恢复能力
- 优化错误提示信息

### 2. ⚠️ lib/growth/optimizer.ts

**当前实现**:
- 直接调用 `generateText()` 并手动实现 404 fallback
- 逻辑重复

**修复方案**:
- 保持现有实现（已经有 fallback）
- 但建议未来重构为使用统一的 Agent 模式

### 3. ⚠️ lib/discovery/google-search.ts

**当前实现**:
- 通过浏览器扩展执行，不直接调用 LLM
- 已经有完善的错误处理和降级策略

**修复方案**:
- 保持现有实现（不需要修改）

### 4. ⚠️ 其他 discovery 模块

- **github.ts**: 已有 404 fallback ✅
- **competitor.ts**: 已有 404 fallback ✅

## 修复优先级

### P0 - 立即修复
1. **SignalCollectorAgent**: 改用 `callLLM()` 方法
2. **JSON 解析增强**: 添加更健壮的 JSON 提取和验证逻辑

### P1 - 中期优化
1. **统一错误提示**: 所有 LLM 调用失败时，提供清晰的配置指引
2. **扩展健康检查**: 在 UI 中显示扩展连接状态

### P2 - 长期优化
1. **重构 optimizer.ts**: 转换为 Agent 模式，使用统一的 callLLM()
2. **监控和告警**: 添加 LLM 调用成功率监控

## 修复后的预期效果

1. **自动降级**: 任何 LLM 404 错误都会自动尝试 fallback 模型
2. **清晰的错误提示**: 用户能看到具体是哪个模型失败，以及如何配置
3. **统一的日志**: 所有 fallback 尝试都会记录到 agent_traces 表
4. **更高的可用性**: 即使主模型失败，系统仍能继续工作

## 测试计划

### 1. 单元测试
- [ ] 测试 SignalCollectorAgent 在主模型 404 时自动 fallback
- [ ] 测试 JSON 解析在各种格式下的容错能力

### 2. 集成测试
- [ ] 测试扩展未连接时的降级行为
- [ ] 测试 API key 配置错误时的错误提示

### 3. 端到端测试
- [ ] 在 APOS UI 触发信号收集，验证错误恢复
- [ ] 验证所有使用 LLM 的功能（原型生成、深度分析等）

## 配置建议

为确保 fallback 机制正常工作，建议用户至少配置以下之一：

1. **本地模型（推荐）**: 安装 Ollama 并启动本地模型
2. **API 模型**: 配置 Gemini API Key（免费额度充足）
3. **Web 模型**: 安装并配置浏览器扩展

配置优先级: Ollama > Gemini API > Web Models

## 相关文件

- `src/agents/signal-collector.ts` - 需要修复
- `src/agents/base.ts` - 参考实现（callLLM）
- `src/lib/llm.ts` - 核心 fallback 逻辑
- `src/lib/ext-proxy-store.ts` - Web 模型代理
