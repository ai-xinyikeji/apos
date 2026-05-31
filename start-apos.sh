#!/bin/bash

# APOS 启动脚本
# 用法: ./start-apos.sh

echo "🚀 启动 APOS 服务..."

# 检查 APOS 是否已经运行
if lsof -i :3000 | grep LISTEN > /dev/null; then
    echo "✅ APOS 已经在运行"
    exit 0
fi

# 启动 APOS
cd /Users/clive/Documents/source/cousor/apos
npm run dev &

# 等待服务器启动
echo "⏳ 等待服务器启动..."
for i in {1..30}; do
    if lsof -i :3000 | grep LISTEN > /dev/null; then
        echo "✅ APOS 启动成功！"
        echo "📍 访问: http://localhost:3000"
        exit 0
    fi
    sleep 1
done

echo "❌ APOS 启动失败"
exit 1
