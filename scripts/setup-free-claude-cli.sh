#!/bin/bash

# APOS Claude CLI 完全免费配置（无需真实 API Key）
# 使用占位符 API Key + 本地模型

set -e

echo "🆓 APOS Claude CLI 完全免费配置"
echo "================================"
echo "使用本地 LM Studio 模型，零成本运行 Claude CLI"
echo ""

# 检测 shell 类型
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
    SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
    SHELL_NAME="bash"
else
    echo "❌ 无法检测 shell 类型"
    exit 1
fi

echo "📝 Shell: $SHELL_NAME"
echo "📝 配置文件: $SHELL_RC"
echo ""

# 检查是否已经配置
if grep -q "APOS 代理配置" "$SHELL_RC" 2>/dev/null; then
    echo "⚠️  检测到已有 APOS 配置"
    echo "是否覆盖？(y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "❌ 取消配置"
        exit 0
    fi
    # 删除旧配置
    sed -i.bak '/# APOS 代理配置/,/export ANTHROPIC_API_KEY=/d' "$SHELL_RC"
    echo "✅ 已删除旧配置"
fi

# 使用占位符 API Key（APOS 不验证，只是拦截请求）
PLACEHOLDER_KEY="sk-ant-apos-local-model-placeholder-key-00000000000000000000000000000000"

# 写入配置
cat >> "$SHELL_RC" << 'EOF'

# APOS 代理配置 - 完全免费本地模型
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=sk-ant-apos-local-model-placeholder-key-00000000000000000000000000000000
EOF

echo ""
echo "✅ 配置已写入 $SHELL_RC"
echo ""

# 应用配置到当前 shell
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=$PLACEHOLDER_KEY

echo "✅ 配置已应用到当前终端"
echo ""

# 验证配置
echo "🔍 验证配置..."
echo "ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
echo "ANTHROPIC_API_KEY: sk-ant-apos-local-model-placeholder-key-..."
echo ""

# 检查 APOS 服务器
echo "🔍 检查 APOS 服务器..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ APOS 服务器正在运行"
else
    echo "❌ APOS 服务器未运行"
    echo "   请在另一个终端运行: cd /Users/clive/Documents/source/cousor/apos && npm run dev"
    exit 1
fi
echo ""

# 检查 LM Studio
echo "🔍 检查 LM Studio..."
if curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo "✅ LM Studio 正在运行"
    echo ""
    echo "已加载的模型:"
    curl -s http://localhost:1234/v1/models | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | sed 's/^/   - /'
else
    echo "❌ LM Studio 未运行"
    echo "   请启动 LM Studio 并加载模型"
    exit 1
fi
echo ""

echo "================================"
echo "✅ 配置完成！完全免费，零 API 成本"
echo ""
echo "📝 使用方法："
echo ""
echo "1. 重新打开终端，或运行:"
echo "   source $SHELL_RC"
echo ""
echo "2. 测试 Claude CLI:"
echo "   claude \"1+1等于几？\""
echo ""
echo "3. 代码生成（自动使用本地模型）:"
echo "   claude \"写一个 Python 函数计算斐波那契数列\""
echo ""
echo "💡 工作原理："
echo "- Claude CLI 发送请求到 APOS 代理"
echo "- APOS 拦截请求，路由到本地 LM Studio"
echo "- 完全不使用 Anthropic API，零成本"
echo ""
echo "⚠️  注意："
echo "- 确保 APOS 服务器一直运行 (npm run dev)"
echo "- 确保 LM Studio 一直运行并加载了模型"
echo ""
