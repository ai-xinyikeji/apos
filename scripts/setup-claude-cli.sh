#!/bin/bash

# APOS Claude CLI 代理配置脚本
# 自动配置 Claude CLI 使用 APOS 代理

set -e

echo "🚀 APOS Claude CLI 代理配置向导"
echo "================================"
echo ""

# 检测 shell 类型
if [ -n "$ZSH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
    SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
    SHELL_NAME="bash"
else
    echo "⚠️  无法检测 shell 类型，请手动配置"
    exit 1
fi

echo "检测到 shell: $SHELL_NAME"
echo "配置文件: $SHELL_CONFIG"
echo ""

# 检查 Claude CLI 是否安装
if ! command -v claude &> /dev/null; then
    echo "❌ 未检测到 Claude CLI"
    echo "请先安装 Claude Code CLI: https://docs.anthropic.com/claude/docs/claude-cli"
    exit 1
fi

echo "✅ Claude CLI 已安装 ($(claude --version))"
echo ""

# 获取 Anthropic API Key
echo "请输入你的 Anthropic API Key:"
echo "（可以在 https://console.anthropic.com/settings/keys 获取）"
read -p "API Key: " ANTHROPIC_API_KEY

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ API Key 不能为空"
    exit 1
fi

echo ""
echo "📝 准备写入配置..."
echo ""

# 检查是否已存在配置
if grep -q "ANTHROPIC_BASE_URL.*localhost:3000" "$SHELL_CONFIG" 2>/dev/null; then
    echo "⚠️  检测到已存在的 APOS 配置"
    read -p "是否覆盖？(y/N): " OVERWRITE
    if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
        echo "❌ 取消配置"
        exit 0
    fi
    # 删除旧配置
    sed -i.bak '/# APOS 代理配置/,/export ANTHROPIC_API_KEY/d' "$SHELL_CONFIG"
fi

# 写入新配置
cat >> "$SHELL_CONFIG" << EOF

# APOS 代理配置
# 让 Claude CLI 的所有请求通过 APOS 路由
# 使用本地模型（免费）+ 自动上下文压缩（节省 70% Token）
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
EOF

echo "✅ 配置已写入 $SHELL_CONFIG"
echo ""

# 应用配置
echo "📦 应用配置..."
source "$SHELL_CONFIG"

echo "✅ 配置已生效"
echo ""

# 检查 APOS 是否运行
echo "🔍 检查 APOS 服务状态..."
if curl -s http://localhost:3000/api/settings > /dev/null 2>&1; then
    echo "✅ APOS 服务正在运行"
else
    echo "⚠️  APOS 服务未运行"
    echo ""
    echo "请在 APOS 项目目录运行:"
    echo "  npm run dev"
fi

echo ""
echo "🎉 配置完成！"
echo ""
echo "现在你可以使用 Claude CLI，所有请求将自动通过 APOS 路由："
echo ""
echo "  claude \"写一个 TypeScript 函数计算斐波那契数列\""
echo ""
echo "💡 提示："
echo "  - 确保 APOS 服务正在运行 (npm run dev)"
echo "  - 确保 LM Studio 正在运行以使用免费本地模型"
echo "  - 在 APOS 设置页面启用上下文压缩以节省 70% Token"
echo ""
