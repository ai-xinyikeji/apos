# 故障排查

## 服务启动问题

### APOS 服务未运行

```bash
# 检查状态
./check-apos.sh
lsof -i :3000

# 启动服务
./start-apos.sh
# 或
npm run dev

# 后台运行
nohup npm run dev > apos.log 2>&1 &

# 重启
lsof -ti :3000 | xargs kill && ./start-apos.sh
```

### 数据库错误

```bash
# 重新初始化 Schema
npm run db:push

# 查看数据库
npm run db:studio
```

### 构建失败

```bash
# 查看详细错误
npm run build

# 清理缓存重试
rm -rf .next && npm run build
```

## Ollama 本地模型

### 检查 Ollama 状态

```bash
# 检查是否运行
lsof -i :11434
curl http://localhost:11434/v1/models

# 启动 Ollama
ollama serve

# 拉取推荐模型
ollama pull qwen2.5-coder:7b   # 代码任务（推荐）
ollama pull gemma4:31b          # 通用任务（需要较大内存）
```

### Ollama 不可用时的回退

系统会自动回退到云端模型（需要配置 API Key）。在 `/settings` 页面配置 Anthropic / OpenAI / Google API Key 作为备用。

## Claude CLI 代理

### 配置

```bash
# 添加到 ~/.zshrc
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=your_key

source ~/.zshrc
```

### 验证

```bash
claude "hello"
# 应该看到响应头包含 X-APOS-Model
```

### 常见问题

**请求超时**：确认 APOS 服务在 `http://localhost:3000` 正常运行

**模型路由到云端**：检查 Ollama 是否运行，或在 `/settings` 开启"Ollama 优先"

## MCP 工具（Claude Desktop）

### 配置检查

```bash
# 查看 MCP 配置
cat ~/.config/claude/claude_desktop_config.json

# 重新生成配置
./scripts/setup-claude-desktop.sh
```

### 工具调用失败

1. 确认 APOS 服务运行中
2. 重启 Claude Desktop
3. 查看 APOS 日志：`tail -f apos.log`

## 成本和路由系统

### 路由决策超时

- 检查数据库连接
- 检查 `custom_rules` 表是否有大量规则（> 100 条）

### 成本记录缺失

- 确认 `cost_records` 表已创建：`npm run db:push`
- 检查 CostRecorder 批量队列是否正常 flush

### 预算预警不触发

- 确认 `budget_monthly`/`budget_daily` 等设置已配置
- 检查 `budget_alert_thresholds` 格式是否为 JSON 数组

## 紧急重置

```bash
# 完全重置（会丢失数据库数据）
lsof -ti :3000 | xargs kill
rm -rf .next node_modules
npm install
npm run db:push
npm run dev
```

## 查看日志

```bash
# 开发模式日志（直接在终端）
npm run dev

# 后台运行日志
tail -f apos.log
tail -f apos-error.log

# Agent 执行日志（数据库）
npm run db:studio  # 查看 agent_traces 表
```
