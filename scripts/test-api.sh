#!/bin/bash

# APOS API Endpoint Test Script
# 测试所有 API 端点是否正常响应

BASE_URL="${1:-http://localhost:3000}"

echo "🧪 测试 API 端点"
echo "================"
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
  local method=$1
  local endpoint=$2
  local expected_status=$3
  
  echo -n "$method $endpoint ... "
  
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X $method "$BASE_URL$endpoint")
  
  if [ "$STATUS" -eq "$expected_status" ]; then
    echo -e "${GREEN}✅ $STATUS${NC}"
    ((PASSED++))
  else
    echo -e "${RED}❌ $STATUS (expected $expected_status)${NC}"
    ((FAILED++))
  fi
}

# Check if server is running
echo -n "检查服务器状态... "
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ 运行中${NC}"
  echo ""
else
  echo -e "${RED}❌ 未运行${NC}"
  echo ""
  echo "请先启动开发服务器: npm run dev"
  exit 1
fi

# Test GET endpoints
echo "GET 端点测试:"
test_endpoint "GET" "/api/prototypes" 200
test_endpoint "GET" "/api/insights" 200
test_endpoint "GET" "/api/pull-requests" 200
test_endpoint "GET" "/api/settings" 200
test_endpoint "GET" "/api/settings/status" 200
test_endpoint "GET" "/api/settings/usage" 200

echo ""
echo "POST 端点测试 (需要 body):"

# Test POST with invalid body (should return 400)
echo -n "POST /api/prototypes (invalid) ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE_URL/api/prototypes")

if [ "$STATUS" -eq 400 ]; then
  echo -e "${GREEN}✅ $STATUS (validation working)${NC}"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️  $STATUS (expected 400)${NC}"
  ((FAILED++))
fi

# Test POST with valid body
echo -n "POST /api/prototypes (valid) ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Prototype","description":"Test description"}' \
  "$BASE_URL/api/prototypes")

if [ "$STATUS" -eq 201 ] || [ "$STATUS" -eq 200 ]; then
  echo -e "${GREEN}✅ $STATUS${NC}"
  ((PASSED++))
else
  echo -e "${RED}❌ $STATUS${NC}"
  ((FAILED++))
fi

echo ""
echo "404 端点测试:"
test_endpoint "GET" "/api/nonexistent" 404

echo ""
echo "================"
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ 所有 API 测试通过！${NC}"
  exit 0
else
  echo -e "${RED}❌ 部分 API 测试失败${NC}"
  exit 1
fi
