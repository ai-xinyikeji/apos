# APOS LLM 配置指南

## 问题诊断

如果你在 APOS Web UI 看到 "Not Found" 或 "404" 错误，这通常是由以下原因之一造成的：

### 1. Web 模型扩展未连接

**症状**：
- 错误信息：`网页版模型 (chatgpt/gemini/kimi) 请求超时（120s）`
- 或：`Google 搜索需要浏览器扩展在线`

**解决方案**：
1. 确保在 Chrome 中已加载 APOS 扩展（位于 `apos-extension/` 目录）
2. 在 Chrome 中打开相应的网站：
   - ChatGPT Web: https://chatgpt.com（需要登录）
   - Gemini Web: https://gemini.google.com（需要登录）
   - Kimi Web: https://kimi.moonshot.cn（需要登录）
   - Google 搜索: https://www.google.com（无需登录）
3. 确保扩展的 Service Worker 处于活跃状态
   - 打开 `chrome://extensions`
   - 找到 APOS 扩展
   - 点击 "Service Worker" 查看状态

### 2. API 模型配置错误

**症状**：
- 错误信息：`Not Found` 或 `404`
- 特定 API 模型调用失败

**解决方案**：
1. 检查 API Key 是否正确配置
2. 检查模型名称是否正确
3. 检查 Base URL 是否正确（特别是自定义 API）

### 3. 未配置任何模型

**症状**：
- 错误信息：`未配置大模型 API 密钥或网页版 Cookies`

**解决方案**：
至少配置以下之一：
- Ollama 本地模型（推荐）
- Gemini API Key（免费额度充足）
- OpenAI API Key
- Web 模型 + 浏览器扩展

## 推荐配置方案

### 方案 1：Ollama 本地模型（推荐）

**优点**：
- 完全免费
- 无网络延迟
- 隐私安全
- 自动作为 fallback

**配置步骤**：
1. 安装 Ollama: https://ollama.ai/download
2. 启动模型：
   ```bash
   ollama pull qwen2.5-coder:7b
   ollama serve
   ```
3. 在 APOS 配置中心启用 Ollama

**验证**：
```bash
curl http://localhost:11434/v1/models
```

### 方案 2：Gemini API（推荐）

**优点**：
- 免费额度充足（每天 50 次）
- 响应速度快
- 支持多模态（图像）

**配置步骤**：
1. 获取 API Key: https://aistudio.google.com/app/apikey
2. 在 APOS 配置中心填入 Google API Key
3. 选择任务路由模型为 "Gemini API"

### 方案 3：Web 模型 + 浏览器扩展

**优点**：
- 完全免费（使用现有账号）
- 支持最新模型

**配置步骤**：
1. 在 Chrome 中加载 `apos-extension/` 扩展
2. 打开并登录相应网站（chatgpt.com / gemini.google.com）
3. 在 APOS 配置中心选择 Web 模型

**限制**：
- 需要保持浏览器标签打开
- 可能受到速率限制
- 依赖网络连接

## 自动 Fallback 机制

APOS 已内置完善的自动 fallback 机制。当主模型失败时，系统会自动尝试以下顺序：

1. **Ollama 本地模型**（如果可用）
2. **Gemini API**（如果已配置）
3. **DeepSeek API**（如果已配置）
4. **OpenAI API**（如果已配置）
5. **Anthropic Claude API**（如果已配置）
6. **环境变量中的 API Key**（如果存在）

### Fallback 日志示例

当 fallback 生效时，你会在日志中看到：

```
[Agent: SignalCollector] [Run: xxx] [WARNING] LLM 切换 - 当前模型返回 404，正在切换到备用模型...
[APOS LLM] Fallback: Using Ollama local model
```

## 任务类型智能路由

APOS 支持为不同任务类型配置不同的模型，优化成本和性能：

| 任务类型 | 推荐模型 | 说明 |
|---------|---------|------|
| reasoning | Claude 3.5 Sonnet / DeepSeek Reasoner | 需要深度推理 |
| coding | Qwen2.5-Coder / DeepSeek Chat | 代码生成 |
| summarize | Gemini Flash / Ollama | 快速总结 |
| refactor | Qwen-Coder / Claude | 代码重构 |
| review | Claude / GPT-4 | 代码审查 |
| planning | Claude 3.5 Sonnet | 架构设计 |
| explain | Gemini / GPT-4o | 解释说明 |

在配置中心可以为每个任务类型单独配置模型。

## 常见问题排查

### Q1: 扩展显示在线，但仍然超时

**A**: 检查以下几点：
1. 目标网站是否已登录
2. 网站是否在正确的标签页（不是 chrome:// 页面）
3. 尝试刷新网站标签页
4. 检查浏览器控制台是否有错误

### Q2: Ollama 安装后无法检测

**A**: 检查 Ollama 服务是否正在运行：
```bash
# 检查服务状态
curl http://localhost:11434/v1/models

# 如果失败，手动启动
ollama serve
```

### Q3: API Key 已配置但仍然失败

**A**: 检查：
1. API Key 是否正确（没有多余空格）
2. API Key 是否有效（未过期、有额度）
3. Base URL 是否正确（特别是自定义 API）
4. 网络是否能访问 API 端点

### Q4: 所有模型都失败

**A**: 系统会抛出错误：
```
LLM 调用失败（主模型 404，备用模型也失败）
```

此时需要：
1. 至少配置一个可用的模型
2. 检查网络连接
3. 查看详细日志确定具体原因

## 监控和调试

### 查看 Agent 执行日志

在 APOS UI 中：
1. 打开"配置中心" → "Agent 执行记录"
2. 查看每个 Agent 的 trace 日志
3. 关注 "LLM 切换" 或 "错误" 状态的日志

### 查看实时日志

在终端中运行 APOS：
```bash
npm run dev
```

日志会显示：
- `[APOS LLM Router] Using ...` - 路由选择
- `[APOS LLM] Fallback: ...` - Fallback 尝试
- `[Agent: XXX] [WARNING] LLM 切换` - 模型切换

### 启用调试模式

设置环境变量：
```bash
export DEBUG=apos:*
npm run dev
```

## 性能优化建议

### 1. 本地优先策略

配置顺序：
1. Ollama（本地） - 用于快速、频繁的任务
2. Gemini API - 用于需要云端能力的任务
3. Web 模型 - 作为备用

### 2. 任务路由优化

在配置中心针对不同任务类型选择最合适的模型：
- 简单任务 → Ollama / Gemini Flash
- 复杂推理 → Claude / GPT-4
- 代码生成 → Qwen-Coder / DeepSeek

### 3. 成本控制

- 优先使用免费模型（Ollama、Gemini 免费额度）
- 为昂贵模型设置每日预算限制
- 监控 Token 使用量（在配置中心查看）

## 配置检查清单

使用以下清单确保 APOS 正确配置：

- [ ] 至少配置了一个模型（Ollama / API / Web）
- [ ] 如果使用 Web 模型，扩展已加载并在线
- [ ] 如果使用 API 模型，API Key 已正确配置
- [ ] 如果使用 Ollama，服务正在运行
- [ ] 测试了基本功能（如信号收集、原型生成）
- [ ] 查看了日志确认没有错误
- [ ] 理解了 fallback 机制的工作原理

## 获取帮助

如果以上方法都无法解决问题：

1. 查看完整的错误日志（包括 stack trace）
2. 检查 GitHub Issues: https://github.com/your-repo/apos/issues
3. 提供以下信息：
   - 错误消息的完整内容
   - 使用的模型类型
   - APOS 版本
   - Node.js 版本
   - 操作系统

## 更新历史

- **2024-06-02**: 修复 SignalCollectorAgent 404 错误，改用 callLLM 统一处理
- **2024-06-02**: 增强 JSON 解析容错能力
- **2024-06-02**: 完善 fallback 日志和错误提示
