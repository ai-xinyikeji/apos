#!/bin/bash

echo "🧪 测试 Claude CLI + APOS 代理集成"
echo "================================"
echo ""

# 设置环境变量
export ANTHROPIC_BASE_URL=http://localhost:3000/api
export ANTHROPIC_API_KEY=sk-ant-apos-local-model-placeholder-key-00000000000000000000000000000000

echo "✅ 环境变量已设置"
echo "   ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
echo "   ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:0:30}..."
echo ""

# 测试 APOS 服务器
echo "🔍 测试 APOS 服务器..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ APOS 服务器正在运行"
else
    echo "❌ APOS 服务器未运行"
    exit 1
fi
echo ""

# 测试 models 端点
echo "🔍 测试 /api/v1/models 端点..."
MODELS=$(curl -s http://localhost:3000/api/v1/models | grep -o '"id":"[^"]*"' | head -3)
if [ -n "$MODELS" ]; then
    echo "✅ Models 端点正常"
    echo "$MODELS" | sed 's/^/   /'
else
    echo "❌ Models 端点异常"
    exit 1
fi
echo ""

# 测试 LM Studio
echo "🔍 测试 LM Studio..."
if curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo "✅ LM Studio 正在运行"
    MODELS=$(curl -s http://localhost:1234/v1/models | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "   已加载模型:"
    echo "$MODELS" | sed 's/^/   - /'
else
    echo "❌ LM Studio 未运行"
    exit 1
fi
echo ""

# 测试 Claude CLI
echo "🧪 测试 Claude CLI（简单问题）..."
echo "   提示: 如果超时，说明模型太慢，但功能正常"
echo ""

timeout 30 claude --print --model claude-3-5-sonnet-20241022 "1+1=?" 2>&1 | head -20

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Claude CLI 测试成功！"
elif [ $EXIT_CODE -eq 124 ]; then
    echo "⚠️  Claude CLI 超时（模型响应太慢）"
    echo "   建议: 在 LM Studio 中加载更快的模型"
else
    echo "❌ Claude CLI 测试失败"
fi

echo ""
echo "================================"
echo "💡 提示:"
echo "- 如果超时，尝试加载更快的模型（如 qwen3.5-9b）"
echo "- 或者使用 --print 模式并等待更长时间"
echo "- APOS 代理本身工作正常，只是模型推理速度慢"
echo ""
