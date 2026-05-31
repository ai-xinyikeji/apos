#!/bin/bash

# APOS 健康检查脚本
# 用法: ./check-apos.sh

echo "🔍 检查 APOS 服务状态..."

# 检查 APOS 服务器
if lsof -i :3000 | grep LISTEN > /dev/null; then
    echo "✅ APOS 服务器: 运行中 (http://localhost:3000)"
else
    echo "❌ APOS 服务器: 未运行"
    echo "💡 运行 ./start-apos.sh 启动服务"
fi

# 检查 LM Studio
if lsof -i :1234 | grep LISTEN > /dev/null; then
    echo "✅ LM Studio: 运行中 (http://localhost:1234)"
else
    echo "⚠️  LM Studio: 未运行（可选）"
    echo "💡 打开 LM Studio 应用并启动本地服务器"
fi

# 检查 MCP 配置
MCP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$MCP_CONFIG" ]; then
    if grep -q "apos" "$MCP_CONFIG"; then
        echo "✅ Claude Desktop MCP: 已配置"
    else
        echo "⚠️  Claude Desktop MCP: 未配置"
        echo "💡 查看 CLAUDE_DESKTOP_SETUP.md 进行配置"
    fi
else
    echo "⚠️  Claude Desktop: 未安装或未配置"
fi

echo ""
echo "📊 系统状态总结:"
if lsof -i :3000 | grep LISTEN > /dev/null; then
    echo "✅ 可以使用 Claude Desktop + MCP"
    echo "✅ 可以使用 Claude CLI + APOS 代理"
else
    echo "❌ 需要启动 APOS 服务器"
fi
