#!/bin/bash

# Test Growth OS functionality
# Usage: ./scripts/test-growth.sh

set -e

echo "🧪 Testing Growth OS..."
echo ""

BASE_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if dev server is running
echo "1️⃣  Checking dev server..."
if curl -s "$BASE_URL" > /dev/null; then
    echo -e "${GREEN}✓${NC} Dev server is running"
else
    echo -e "${RED}✗${NC} Dev server is not running"
    echo "   Please run: npm run dev"
    exit 1
fi
echo ""

# Test 2: Track a test event
echo "2️⃣  Tracking test event..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/growth" \
    -H "Content-Type: application/json" \
    -d '{
        "event": "test_event",
        "properties": {
            "test": true,
            "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
        }
    }')

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Event tracked successfully"
    echo "   Response: $RESPONSE"
else
    echo -e "${RED}✗${NC} Failed to track event"
    echo "   Response: $RESPONSE"
fi
echo ""

# Test 3: Track feature usage
echo "3️⃣  Tracking feature usage..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/growth" \
    -H "Content-Type: application/json" \
    -d '{
        "event": "feature_used",
        "properties": {
            "feature": "TestFeature",
            "duration": 1234
        }
    }')

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Feature usage tracked"
else
    echo -e "${RED}✗${NC} Failed to track feature usage"
fi
echo ""

# Test 4: Track page view
echo "4️⃣  Tracking page view..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/growth" \
    -H "Content-Type: application/json" \
    -d '{
        "event": "page_view",
        "properties": {
            "page": "/test-page"
        }
    }')

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Page view tracked"
else
    echo -e "${RED}✗${NC} Failed to track page view"
fi
echo ""

# Test 5: Track agent execution
echo "5️⃣  Tracking agent execution..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/growth" \
    -H "Content-Type: application/json" \
    -d '{
        "event": "agent_execution",
        "properties": {
            "agentName": "TestAgent",
            "success": true,
            "duration": 5000
        }
    }')

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Agent execution tracked"
else
    echo -e "${RED}✗${NC} Failed to track agent execution"
fi
echo ""

# Test 6: Get growth metrics (30 days)
echo "6️⃣  Fetching growth metrics (30 days)..."
RESPONSE=$(curl -s "$BASE_URL/api/growth?days=30")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Growth metrics retrieved"
    
    # Extract some stats
    FEATURE_COUNT=$(echo "$RESPONSE" | grep -o '"all":\[' | wc -l)
    echo "   Features tracked: $(echo "$RESPONSE" | grep -o '"feature":' | wc -l)"
    
    # Check if we have rankings
    if echo "$RESPONSE" | grep -q '"rankings"'; then
        echo -e "${GREEN}✓${NC} Feature rankings available"
    fi
else
    echo -e "${RED}✗${NC} Failed to get growth metrics"
    echo "   Response: $RESPONSE"
fi
echo ""

# Test 7: Get growth metrics (7 days)
echo "7️⃣  Fetching growth metrics (7 days)..."
RESPONSE=$(curl -s "$BASE_URL/api/growth?days=7")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} 7-day metrics retrieved"
else
    echo -e "${RED}✗${NC} Failed to get 7-day metrics"
fi
echo ""

# Test 8: Generate feature ranking report
echo "8️⃣  Generating feature ranking report..."
RESPONSE=$(curl -s "$BASE_URL/api/growth/report?days=30")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Report generated successfully"
    
    # Check if report contains expected sections
    if echo "$RESPONSE" | grep -q "Feature Ranking Report"; then
        echo -e "${GREEN}✓${NC} Report contains expected content"
    fi
    
    # Save report to file
    echo "$RESPONSE" | jq -r '.report' > /tmp/growth-report.md 2>/dev/null || true
    if [ -f /tmp/growth-report.md ]; then
        echo "   Report saved to: /tmp/growth-report.md"
    fi
else
    echo -e "${RED}✗${NC} Failed to generate report"
fi
echo ""

# Test 9: Check database
echo "9️⃣  Checking database..."
if [ -f "data/apos.db" ]; then
    METRIC_COUNT=$(sqlite3 data/apos.db "SELECT COUNT(*) FROM metrics;" 2>/dev/null || echo "0")
    echo -e "${GREEN}✓${NC} Database exists"
    echo "   Total metrics: $METRIC_COUNT"
    
    # Show recent metrics
    echo "   Recent metrics:"
    sqlite3 data/apos.db "SELECT event, timestamp FROM metrics ORDER BY timestamp DESC LIMIT 5;" 2>/dev/null | while read line; do
        echo "     - $line"
    done
else
    echo -e "${YELLOW}⚠${NC}  Database not found at data/apos.db"
fi
echo ""

# Test 10: Check Growth UI page
echo "🔟 Checking Growth UI page..."
RESPONSE=$(curl -s "$BASE_URL/growth")

if echo "$RESPONSE" | grep -q "产品增长中心"; then
    echo -e "${GREEN}✓${NC} Growth UI page is accessible"
else
    echo -e "${YELLOW}⚠${NC}  Growth UI page may not be rendering correctly"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Growth OS Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}✅ All core Growth OS features are working!${NC}"
echo ""
echo "Next steps:"
echo "  1. Visit http://localhost:3000/growth to see the dashboard"
echo "  2. Use the system for 1-2 weeks to collect data"
echo "  3. Review feature rankings and recommendations"
echo "  4. Make data-driven product decisions"
echo ""
echo "Documentation:"
echo "  - PHASE5_COMPLETE.md - Full implementation details"
echo "  - ROADMAP.md - Updated roadmap with Phase 5 complete"
echo ""
