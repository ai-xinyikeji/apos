# APOS 快速开始指南

## 🚀 5 分钟快速上手

### 步骤 1: 检查服务状态

```bash
cd /Users/clive/Documents/source/cousor/apos
./check-apos.sh
```

### 步骤 2: 启动服务（如果未运行）

```bash
./start-apos.sh
```

### 步骤 3: 选择使用方式

#### 方式 A: Claude CLI（推荐）⭐⭐⭐⭐⭐

```bash
# 一次性配置
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=你的真实API密钥

# 使用
claude "创建一个按钮组件"
```

**优势**：
- ✅ 完全免费（使用本地模型）
- ✅ 不会中断
- ✅ 自动上下文压缩

#### 方式 B: Claude Desktop + MCP ⭐⭐⭐

在 Claude Desktop 中：

```
你: 使用 APOS 的 rag_search 工具搜索用户认证相关的代码

我: [调用 rag_search MCP 工具]
   找到以下相关代码...
```

**注意**：需要明确告诉 Claude 使用 APOS 工具

#### 方式 C: APOS Web UI ⭐⭐⭐⭐

访问：http://localhost:3000

## 📋 常用命令

```bash
# 检查状态
./check-apos.sh

# 启动服务
./start-apos.sh

# 查看日志
tail -f apos.log

# 停止服务
lsof -ti :3000 | xargs kill

# 重启服务
lsof -ti :3000 | xargs kill && ./start-apos.sh
```

## 🆘 遇到问题？

查看完整故障排查指南：[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## 🎯 推荐配置

### 永久配置 Claude CLI

```bash
# 添加到 ~/.zshrc
echo 'export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1' >> ~/.zshrc
echo 'export ANTHROPIC_API_KEY=你的真实API密钥' >> ~/.zshrc
echo 'alias start-apos="cd /Users/clive/Documents/source/cousor/apos && ./start-apos.sh"' >> ~/.zshrc
echo 'alias check-apos="cd /Users/clive/Documents/source/cousor/apos && ./check-apos.sh"' >> ~/.zshrc
source ~/.zshrc
```

### 每天开始工作

```bash
check-apos  # 检查状态
start-apos  # 如果未运行，启动服务
```

## 📚 更多资源

- [完整文档](./README.md)
- [架构设计](./ARCHITECTURE.md)
- [Claude 集成指南](./CLAUDE_DESKTOP_GUIDE.md)
- [故障排查](./TROUBLESHOOTING.md)

---

**现在就开始使用吧！** 🚀
