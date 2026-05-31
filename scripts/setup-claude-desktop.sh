#!/bin/bash

# APOS Claude Desktop 配置脚本
# 安全地配置 Claude Desktop 使用 APOS MCP Server
# 自动备份原配置，支持恢复

set -e

echo "🚀 APOS Claude Desktop MCP 配置向导"
echo "===================================="
echo ""

# 配置文件路径
CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
BACKUP_FILE="$CONFIG_DIR/claude_desktop_config.json.backup.$(date +%Y%m%d_%H%M%S)"

# 检查配置目录是否存在
if [ ! -d "$CONFIG_DIR" ]; then
    echo "❌ Claude Desktop 配置目录不存在"
    echo "请先安装 Claude Desktop: https://claude.ai/download"
    exit 1
fi

echo "📁 配置目录: $CONFIG_DIR"
echo ""

# 检查配置文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚠️  配置文件不存在，将创建新文件"
    echo ""
else
    echo "✅ 找到现有配置文件"
    echo ""
    
    # 创建备份
    echo "📦 创建备份..."
    cp "$CONFIG_FILE" "$BACKUP_FILE"
    echo "✅ 备份已保存: $BACKUP_FILE"
    echo ""
    
    # 显示备份信息
    echo "💡 恢复方法："
    echo "   cp \"$BACKUP_FILE\" \"$CONFIG_FILE\""
    echo ""
fi

# 获取 APOS 项目路径
read -p "请输入 APOS 项目路径 (默认: /Users/clive/Documents/source/cousor/apos): " APOS_PATH
APOS_PATH="${APOS_PATH:-/Users/clive/Documents/source/cousor/apos}"

if [ ! -d "$APOS_PATH" ]; then
    echo "❌ APOS 项目路径不存在: $APOS_PATH"
    exit 1
fi

echo "✅ APOS 路径: $APOS_PATH"
echo ""

# 检查 MCP Server 文件是否存在
MCP_SERVER_FILE="$APOS_PATH/src/mcp/server.ts"
if [ ! -f "$MCP_SERVER_FILE" ]; then
    echo "❌ MCP Server 文件不存在: $MCP_SERVER_FILE"
    exit 1
fi

echo "✅ MCP Server 文件已找到"
echo ""

# 创建或更新配置
echo "📝 准备配置..."
echo ""

# 使用 jq 或 Python 来安全地修改 JSON
if command -v jq &> /dev/null; then
    echo "使用 jq 修改配置..."
    
    # 如果文件不存在，创建基础配置
    if [ ! -f "$CONFIG_FILE" ]; then
        cat > "$CONFIG_FILE" << 'EOF'
{
  "preferences": {
    "coworkWebSearchEnabled": true
  },
  "mcpServers": {}
}
EOF
    fi
    
    # 使用 jq 添加或更新 APOS MCP Server 配置
    jq ".mcpServers.apos = {
      \"command\": \"npx\",
      \"args\": [\"tsx\", \"$APOS_PATH/src/mcp/server.ts\"],
      \"env\": {
        \"APOS_DIR\": \"$APOS_PATH\",
        \"NODE_PATH\": \"$APOS_PATH/node_modules\"
      }
    }" "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
    
    mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
    
else
    echo "使用 Python 修改配置..."
    
    python3 << PYTHON_EOF
import json
import os

config_file = "$CONFIG_FILE"
apos_path = "$APOS_PATH"

# 读取或创建配置
if os.path.exists(config_file):
    with open(config_file, 'r') as f:
        config = json.load(f)
else:
    config = {
        "preferences": {
            "coworkWebSearchEnabled": True
        },
        "mcpServers": {}
    }

# 添加或更新 APOS MCP Server
config["mcpServers"]["apos"] = {
    "command": "npx",
    "args": ["tsx", f"{apos_path}/src/mcp/server.ts"],
    "env": {
        "APOS_DIR": apos_path,
        "NODE_PATH": f"{apos_path}/node_modules"
    }
}

# 写入配置
with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("✅ 配置已更新")
PYTHON_EOF
fi

echo "✅ 配置已写入: $CONFIG_FILE"
echo ""

# 显示配置内容
echo "📋 当前配置内容:"
echo "---"
cat "$CONFIG_FILE" | head -20
echo "..."
echo "---"
echo ""

# 提示重启 Claude Desktop
echo "🔄 需要重启 Claude Desktop 以应用配置"
echo ""
echo "请按以下步骤操作:"
echo "1. 完全关闭 Claude Desktop 应用"
echo "2. 重新打开 Claude Desktop"
echo "3. 在对话中使用 APOS MCP 工具"
echo ""

# 提供恢复说明
echo "💾 备份和恢复:"
echo "---"
echo "备份文件: $BACKUP_FILE"
echo ""
echo "如需恢复原配置，运行:"
echo "  cp \"$BACKUP_FILE\" \"$CONFIG_FILE\""
echo ""
echo "然后重启 Claude Desktop"
echo "---"
echo ""

echo "🎉 配置完成！"
echo ""
echo "下一步:"
echo "1. 重启 Claude Desktop"
echo "2. 在对话中告诉我使用 APOS 工具"
echo "3. 例如: '使用 rag_search 工具搜索用户认证相关的代码'"
echo ""
