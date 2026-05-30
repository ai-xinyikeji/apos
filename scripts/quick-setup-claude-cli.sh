#!/bin/bash

# APOS Claude CLI 快速配置脚本
# 自动配置环境变量，让 Claude CLI 通过 APOS 代理

set -e

echo "🚀 APOS Claude CLI 快速配置"
echo "================================"
echo ""

# 检测 shell 类型
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
    SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
    SHELL_NAME="bash"
else
    echo "❌ 无法检测 shell 类型，请手动配置"
    exit 1
fi

echo "📝 检测到 shell: $SHELL_NAME"
echo "📝 配置文件: $SHELL_RC"
echo ""

# 检查是否已经配置
if grep -q "APOS 代理配置" "$SHELL_RC" 2>/dev/null; then
    echo "⚠️  检测到已有 APOS 配置，是否覆盖？(y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "❌ 取消配置"
        exit 0
    fi
    # 删除旧配置
    sed -i.bak '/# APOS 代理配置/,/export ANTHROPIC_API_KEY=/d' "$SHELL_RC"
    echo "✅ 已删除旧配置"
fi

# 提示输入 API Key
echo "请输入你的 Anthropic API Key:"
echo "(如果没有，请访问 https://console.anthropic.com/ 获取)"
read -r API_KEY

if [ -z "$API_KEY" ]; then
    echo "❌ API Key 不能为空"
    exit 1
fi

# 写入配置
echo "" >> "$SHELL_RC"
echo "# APOS 代理配置" >> "$SHELL_RC"
echo "export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1" >> "$SHELL_RC"
echo "export ANTHROPIC_API_KEY=$API_KEY" >> "$SHELL_RC"

echo ""
echo "✅ 配置已写入 $SHELL_RC"
echo ""

# 应用配置到当前 shell
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=$API_KEY

echo "✅ 配置已应用到当前终端"
echo ""

# 验证配置
echo "🔍 验证配置..."
echo "ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:10}..."
echo ""

# 检查 APOS 服务器
echo "🔍 检查 APOS 服务器..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ APOS 服务器正在运行"
else
    echo "⚠️  APOS 服务器未运行，请先运行: npm run dev"
fi
echo ""

# 检查 LM Studio
echo "🔍 检查 LM Studio..."
if curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo "✅ LM Studio 正在运行（将使用本地模型，完全免费）"
else
    echo "⚠️  LM Studio 未运行（将使用云端 API，会消耗 Token）"
fi
echo ""

echo "================================"
echo "✅ 配置完成！"
echo ""
echo "📝 下一步："
echo "1. 重新打开终端，或运行: source $SHELL_RC"
echo "2. 测试 Claude CLI: claude \"1+1等于几？\""
echo ""
echo "💡 提示："
echo "- 确保 APOS 服务器正在运行 (npm run dev)"
echo "- 启动 LM Studio 可以完全免费使用本地模型"
echo "- 在 http://localhost:3000/settings 可以查看配置状态"
echo ""
