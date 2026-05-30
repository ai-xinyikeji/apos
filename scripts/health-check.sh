#!/bin/bash

# APOS Health Check Script
# 快速检查系统健康状态

set -e

echo "🔍 APOS 健康检查"
echo "=================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查数据库
echo -n "检查数据库文件... "
if [ -f "data/apos.db" ]; then
  echo -e "${GREEN}✅ 存在${NC}"
else
  echo -e "${RED}❌ 不存在${NC}"
  echo "运行: npm run db:push"
  exit 1
fi

# 2. 检查环境变量
echo -n "检查环境变量文件... "
if [ -f ".env.local" ]; then
  echo -e "${GREEN}✅ 存在${NC}"
  
  # 检查是否配置了至少一个 LLM Provider
  if grep -q "ANTHROPIC_API_KEY\|OPENAI_API_KEY\|GOOGLE_GENERATIVE_AI_API_KEY" .env.local; then
    echo -e "  ${GREEN}✅ LLM API Key 已配置${NC}"
  else
    echo -e "  ${YELLOW}⚠️  未找到 LLM API Key${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  不存在${NC}"
  echo "创建 .env.local 文件并配置 API Keys"
fi

# 3. 检查依赖
echo -n "检查依赖安装... "
if [ -d "node_modules" ]; then
  echo -e "${GREEN}✅ 已安装${NC}"
else
  echo -e "${RED}❌ 未安装${NC}"
  echo "运行: npm install"
  exit 1
fi

# 4. 检查关键文件
echo -n "检查关键文件... "
MISSING_FILES=()

if [ ! -f "package.json" ]; then
  MISSING_FILES+=("package.json")
fi

if [ ! -f "next.config.ts" ]; then
  MISSING_FILES+=("next.config.ts")
fi

if [ ! -f "drizzle.config.ts" ]; then
  MISSING_FILES+=("drizzle.config.ts")
fi

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ 完整${NC}"
else
  echo -e "${RED}❌ 缺失文件: ${MISSING_FILES[*]}${NC}"
  exit 1
fi

# 5. 检查 TypeScript 编译
echo -n "检查 TypeScript 编译... "
if npm run build > /tmp/apos-build.log 2>&1; then
  echo -e "${GREEN}✅ 成功${NC}"
else
  echo -e "${RED}❌ 失败${NC}"
  echo "查看日志: /tmp/apos-build.log"
  exit 1
fi

# 6. 检查数据库表
echo -n "检查数据库表... "
TABLES=$(sqlite3 data/apos.db ".tables" 2>/dev/null || echo "")
if echo "$TABLES" | grep -q "prototypes"; then
  echo -e "${GREEN}✅ 表结构正常${NC}"
else
  echo -e "${RED}❌ 表结构异常${NC}"
  echo "运行: npm run db:push"
  exit 1
fi

# 7. 检查端口占用
echo -n "检查端口 3000... "
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  已被占用${NC}"
else
  echo -e "${GREEN}✅ 可用${NC}"
fi

echo ""
echo -e "${GREEN}✅ 所有检查通过！${NC}"
echo ""
echo "下一步:"
echo "  1. 启动开发服务器: npm run dev"
echo "  2. 访问: http://localhost:3000"
echo "  3. 配置 LLM Provider: http://localhost:3000/settings"
