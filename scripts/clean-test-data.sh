#!/bin/bash

# APOS Test Data Cleanup Script
# 清理测试数据，保留生产数据

set -e

echo "🧹 清理测试数据"
echo "================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if database exists
if [ ! -f "data/apos.db" ]; then
  echo -e "${RED}❌ 数据库文件不存在${NC}"
  exit 1
fi

# Backup database
BACKUP_FILE="data/apos.db.backup.$(date +%Y%m%d_%H%M%S)"
echo -n "备份数据库... "
cp data/apos.db "$BACKUP_FILE"
echo -e "${GREEN}✅ 已备份到 $BACKUP_FILE${NC}"

# Clean test prototypes
echo -n "清理测试原型... "
COUNT=$(sqlite3 data/apos.db "SELECT COUNT(*) FROM prototypes WHERE name LIKE '测试%' OR name LIKE 'Test%';")
if [ "$COUNT" -gt 0 ]; then
  sqlite3 data/apos.db "DELETE FROM prototypes WHERE name LIKE '测试%' OR name LIKE 'Test%';"
  echo -e "${GREEN}✅ 删除了 $COUNT 个测试原型${NC}"
else
  echo -e "${YELLOW}⚠️  没有找到测试原型${NC}"
fi

# Clean test signals
echo -n "清理测试信号... "
COUNT=$(sqlite3 data/apos.db "SELECT COUNT(*) FROM signals WHERE title LIKE '测试%' OR title LIKE 'Test%';")
if [ "$COUNT" -gt 0 ]; then
  sqlite3 data/apos.db "DELETE FROM signals WHERE title LIKE '测试%' OR title LIKE 'Test%';"
  echo -e "${GREEN}✅ 删除了 $COUNT 个测试信号${NC}"
else
  echo -e "${YELLOW}⚠️  没有找到测试信号${NC}"
fi

# Clean old traces (older than 7 days)
echo -n "清理旧日志 (>7天)... "
COUNT=$(sqlite3 data/apos.db "SELECT COUNT(*) FROM agent_traces WHERE created_at < datetime('now', '-7 days');")
if [ "$COUNT" -gt 0 ]; then
  sqlite3 data/apos.db "DELETE FROM agent_traces WHERE created_at < datetime('now', '-7 days');"
  echo -e "${GREEN}✅ 删除了 $COUNT 条旧日志${NC}"
else
  echo -e "${YELLOW}⚠️  没有找到旧日志${NC}"
fi

# Clean test branches
echo -n "清理测试分支... "
TEST_BRANCHES=$(git branch | grep -E 'proto/test-|proto/测试-' | wc -l | tr -d ' ')
if [ "$TEST_BRANCHES" -gt 0 ]; then
  git branch | grep -E 'proto/test-|proto/测试-' | xargs git branch -D 2>/dev/null || true
  echo -e "${GREEN}✅ 删除了 $TEST_BRANCHES 个测试分支${NC}"
else
  echo -e "${YELLOW}⚠️  没有找到测试分支${NC}"
fi

# Clean test reports
echo -n "清理测试报告... "
if [ -d "data/reports" ]; then
  TEST_REPORTS=$(find data/reports -name "*test*.md" -o -name "*测试*.md" | wc -l | tr -d ' ')
  if [ "$TEST_REPORTS" -gt 0 ]; then
    find data/reports -name "*test*.md" -o -name "*测试*.md" -delete
    echo -e "${GREEN}✅ 删除了 $TEST_REPORTS 个测试报告${NC}"
  else
    echo -e "${YELLOW}⚠️  没有找到测试报告${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  报告目录不存在${NC}"
fi

# Vacuum database
echo -n "优化数据库... "
sqlite3 data/apos.db "VACUUM;"
echo -e "${GREEN}✅ 完成${NC}"

echo ""
echo -e "${GREEN}✅ 清理完成！${NC}"
echo ""
echo "数据库备份: $BACKUP_FILE"
echo ""
echo "如需恢复，运行:"
echo "  cp $BACKUP_FILE data/apos.db"
