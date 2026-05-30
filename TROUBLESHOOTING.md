# APOS 故障排查指南

## 🚨 Claude Desktop 对话中断问题

### 症状
- Claude Desktop 回答到一半就停止
- 出现超时错误
- MCP 工具调用失败

### 根本原因
**APOS 开发服务器没有运行**

### 快速解决

#### 方法 1: 使用健康检查脚本

```bash
cd /Users/clive/Documents/source/cousor/apos
./check-apos.sh
```

如果显示 "❌ APOS 服务器: 未运行"，运行：

```bash
./start-apos.sh
```

#### 方法 2: 手动启动

```bash
cd /Users/clive/Documents/source/cousor/apos
npm run dev
```

保持终端窗口打开，不要关闭。

#### 方法 3: 后台运行

```bash
cd /Users/clive/Documents/source/cousor/apos
nohup npm run dev > apos.log 2>&1 &
```

查看日志：
```bash
tail -f apos.log
```

停止服务：
```bash
lsof -ti :3000 | xargs kill
```

## 🔍 常见问题

### Q1: 如何确认 APOS 正在运行？

```bash
# 方法 1: 使用健康检查脚本
./check-apos.sh

# 方法 2: 检查端口
lsof -i :3000

# 方法 3: 访问网页
open http://localhost:3000
```

### Q2: 为什么 Claude Desktop 还是会中断？

可能的原因：

1. **网络问题**
   - 检查网络连接
   - 尝试切换网络

2. **Token 限制**
   - 对话上下文过长
   - 解决方案：开始新对话

3. **MCP 工具超时**
   - LM Studio 响应慢
   - 解决方案：使用更快的模型

4. **Claude API 限流**
   - 请求过于频繁
   - 解决方案：等待几分钟

### Q3: 如何避免中断？

**推荐方案：使用 Claude CLI + APOS 代理**

```bash
# 1. 设置环境变量
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=你的真实API密钥

# 2. 使用 Claude CLI
claude "你的问题"
```

**优势**：
- ✅ 不会中断
- ✅ 自动使用本地模型（免费）
- ✅ 自动上下文压缩
- ✅ 完全透明

### Q4: Claude Desktop 和 Claude CLI 有什么区别？

| 特性 | Claude Desktop | Claude CLI + APOS |
|------|---------------|-------------------|
| 对话模型 | Claude API（付费） | 本地模型（免费） |
| 工具执行 | 本地模型（免费） | 本地模型（免费） |
| 稳定性 | 可能中断 | 不会中断 |
| 成本 | 对话消耗 Token | 完全免费 |
| 推荐度 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### Q5: 如何查看 APOS 日志？

```bash
# 如果使用 npm run dev
# 日志直接显示在终端

# 如果使用后台运行
tail -f apos.log

# 查看最近 100 行
tail -n 100 apos.log
```

### Q6: 如何重启 APOS？

```bash
# 1. 停止服务
lsof -ti :3000 | xargs kill

# 2. 启动服务
./start-apos.sh

# 或者一行命令
lsof -ti :3000 | xargs kill && ./start-apos.sh
```

### Q7: LM Studio 是必需的吗？

**不是必需的**，但强烈推荐：

- ✅ 使用 LM Studio：完全免费，使用本地模型
- ⚠️ 不使用 LM Studio：会回退到 Claude API（付费）

检查 LM Studio 状态：
```bash
lsof -i :1234
```

如果未运行：
1. 打开 LM Studio 应用
2. 加载模型（推荐 Gemma 4 或 Qwen 3.5）
3. 点击 "Start Server"

### Q8: 如何配置自动启动？

#### 方法 1: 使用 launchd（macOS 推荐）

创建 `~/Library/LaunchAgents/com.apos.dev.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apos.dev</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/clive/Documents/source/cousor/apos/start-apos.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/clive/Documents/source/cousor/apos/apos.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/clive/Documents/source/cousor/apos/apos-error.log</string>
</dict>
</plist>
```

加载服务：
```bash
launchctl load ~/Library/LaunchAgents/com.apos.dev.plist
```

卸载服务：
```bash
launchctl unload ~/Library/LaunchAgents/com.apos.dev.plist
```

#### 方法 2: 添加到 shell 配置

```bash
# 添加到 ~/.zshrc
echo 'alias start-apos="cd /Users/clive/Documents/source/cousor/apos && ./start-apos.sh"' >> ~/.zshrc
echo 'alias check-apos="cd /Users/clive/Documents/source/cousor/apos && ./check-apos.sh"' >> ~/.zshrc
source ~/.zshrc

# 使用
start-apos
check-apos
```

## 🎯 最佳实践

### 1. 每天开始工作前

```bash
cd /Users/clive/Documents/source/cousor/apos
./check-apos.sh
```

### 2. 使用 Claude Desktop 前

确保 APOS 正在运行：
```bash
lsof -i :3000
```

### 3. 遇到中断时

1. 检查 APOS 状态：`./check-apos.sh`
2. 如果未运行，启动：`./start-apos.sh`
3. 重启 Claude Desktop
4. 重新开始对话

### 4. 长期使用

**推荐切换到 Claude CLI**：

```bash
# 永久配置
echo 'export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1' >> ~/.zshrc
echo 'export ANTHROPIC_API_KEY=你的真实API密钥' >> ~/.zshrc
source ~/.zshrc

# 使用
claude "你的问题"
```

## 📊 性能优化

### 1. 使用更快的本地模型

在 LM Studio 中加载：
- **Qwen 3.5 9B**（推荐，速度快）
- **Gemma 4 9B**（质量高）
- **Llama 3.3 70B**（最高质量，需要强大硬件）

### 2. 启用上下文压缩

APOS 自动压缩上下文，节省 70% Token。

### 3. 使用 Prompt Caching

对于重复的上下文，APOS 会自动缓存，降低 90% 成本。

## 🆘 紧急救援

如果所有方法都失败：

```bash
# 1. 完全重置
lsof -ti :3000 | xargs kill
rm -rf /Users/clive/Documents/source/cousor/apos/.next
rm -rf /Users/clive/Documents/source/cousor/apos/node_modules

# 2. 重新安装
cd /Users/clive/Documents/source/cousor/apos
npm install

# 3. 重新启动
npm run dev
```

## 📞 获取帮助

- 查看日志：`tail -f apos.log`
- 查看错误：`tail -f apos-error.log`
- 提交 Issue：https://github.com/your-repo/apos/issues

---

**记住**：使用 Claude CLI + APOS 代理是最稳定、最经济的方案！🚀
