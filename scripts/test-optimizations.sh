#!/bin/bash

# APOS 优化功能测试脚本
# 用于验证 Phase 1 所有优化是否正常工作

set -e

echo "🚀 APOS 优化功能测试"
echo "===================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
test_file_exists() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $description (文件不存在: $file)"
        ((TESTS_FAILED++))
    fi
}

test_api_endpoint() {
    local endpoint=$1
    local description=$2
    
    if curl -s -f "http://localhost:3000$endpoint" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $description"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} $description (需要启动开发服务器)"
        ((TESTS_FAILED++))
    fi
}

echo "📁 测试文件存在性"
echo "-------------------"

# 测试新增文件
test_file_exists "src/lib/claude-optimizer.ts" "Claude Optimizer 文件"
test_file_exists "src/lib/smart-router.ts" "Smart Router 文件"
test_file_exists "src/app/api/costs/route.ts" "成本 API 文件"
test_file_exists "src/app/costs/page.tsx" "成本页面文件"

echo ""
echo "📝 测试文档文件"
echo "-------------------"

test_file_exists "CLAUDE_INTEGRATION_PLAN.md" "Claude 集成计划"
test_file_exists "OPTIMIZATION_RECOMMENDATIONS.md" "优化建议文档"
test_file_exists "QUICK_START_OPTIMIZATION.md" "快速实施指南"
test_file_exists "IMPLEMENTATION_COMPLETE.md" "实施完成报告"

echo ""
echo "🔍 测试代码集成"
echo "-------------------"

# 检查 ProtoBuilder 是否导入了 ClaudeOptimizer
if grep -q "ClaudeOptimizer" "src/agents/proto-builder.ts"; then
    echo -e "${GREEN}✓${NC} ProtoBuilder 已集成 Claude Optimizer"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} ProtoBuilder 未集成 Claude Optimizer"
    ((TESTS_FAILED++))
fi

# 检查 ReviewBot 是否导入了 ClaudeOptimizer
if grep -q "ClaudeOptimizer" "src/agents/review-bot.ts"; then
    echo -e "${GREEN}✓${NC} ReviewBot 已集成 Claude Optimizer"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} ReviewBot 未集成 Claude Optimizer"
    ((TESTS_FAILED++))
fi

# 检查 Sidebar 是否添加了成本分析链接
if grep -q "DollarSign" "src/components/sidebar.tsx"; then
    echo -e "${GREEN}✓${NC} Sidebar 已添加成本分析链接"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} Sidebar 未添加成本分析链接"
    ((TESTS_FAILED++))
fi

# 检查 MCP Server 是否添加了 create_prototype
if grep -q "create_prototype" "src/mcp/server.ts"; then
    echo -e "${GREEN}✓${NC} MCP Server 已添加 create_prototype 工具"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} MCP Server 未添加 create_prototype 工具"
    ((TESTS_FAILED++))
fi

echo ""
echo "🌐 测试 API 端点 (需要启动服务器)"
echo "-----------------------------------"

# 检查开发服务器是否运行
if curl -s -f "http://localhost:3000" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 开发服务器正在运行"
    ((TESTS_PASSED++))
    
    # 测试 API 端点
    test_api_endpoint "/api/costs" "成本统计 API"
    test_api_endpoint "/costs" "成本分析页面"
else
    echo -e "${YELLOW}⚠${NC} 开发服务器未运行，跳过 API 测试"
    echo -e "${YELLOW}  提示: 运行 'npm run dev' 启动服务器后重新测试${NC}"
fi

echo ""
echo "📊 测试结果"
echo "==========="
echo -e "通过: ${GREEN}$TESTS_PASSED${NC}"
echo -e "失败: ${RED}$TESTS_FAILED${NC}"
echo -e "总计: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 所有测试通过！${NC}"
    echo ""
    echo "下一步:"
    echo "1. 运行 'npm run dev' 启动开发服务器"
    echo "2. 访问 http://localhost:3000/costs 查看成本分析"
    echo "3. 创建一个原型测试 Prompt Caching"
    echo "4. 查看执行日志验证缓存节省"
    exit 0
else
    echo ""
    echo -e "${RED}⚠️  有 $TESTS_FAILED 个测试失败${NC}"
    echo ""
    echo "请检查上述失败的测试项"
    exit 1
fi
