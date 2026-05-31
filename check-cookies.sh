#!/bin/bash
# Check cookie sync status

echo "=== Cookie Sync Status ==="
echo ""

sqlite3 data/apos.db "SELECT 
  key, 
  length(value) as length,
  datetime(updated_at, 'localtime') as last_updated,
  CAST((julianday('now') - julianday(updated_at)) * 24 * 60 AS INTEGER) as minutes_ago
FROM settings 
WHERE key LIKE '%cookies%' 
ORDER BY updated_at DESC;"

echo ""
echo "=== Recommendation ==="
echo "If 'minutes_ago' > 60, please sync cookies manually from the extension."
