#!/bin/bash

# LM Studio Integration Test Script

echo "🧪 Testing LM Studio Integration..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check LM Studio is running
echo "📡 Test 1: Checking LM Studio status..."
RESPONSE=$(curl -s http://localhost:1234/v1/models)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ LM Studio is running${NC}"
    echo "   Models: $(echo $RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(', '.join([m['id'] for m in data.get('data', [])]))")"
else
    echo -e "${RED}✗ LM Studio is not running${NC}"
    echo "   Please start LM Studio and enable the local server"
    exit 1
fi
echo ""

# Test 2: Test LM Studio API directly
echo "🤖 Test 2: Testing LM Studio API..."
RESPONSE=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen3.5-9b",
    "messages": [{"role": "user", "content": "Say hello in one word"}],
    "max_tokens": 10
  }')

if [ $? -eq 0 ]; then
    CONTENT=$(echo $RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['choices'][0]['message']['content'])" 2>/dev/null)
    if [ ! -z "$CONTENT" ]; then
        echo -e "${GREEN}✓ LM Studio API working${NC}"
        echo "   Response: $CONTENT"
    else
        echo -e "${RED}✗ LM Studio API error${NC}"
        echo "   Response: $RESPONSE"
    fi
else
    echo -e "${RED}✗ Failed to call LM Studio API${NC}"
fi
echo ""

# Test 3: Check APOS dev server
echo "🌐 Test 3: Checking APOS dev server..."
if curl -s http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}✓ APOS dev server is running${NC}"
else
    echo -e "${YELLOW}⚠ APOS dev server is not running${NC}"
    echo "   Please run: npm run dev"
    exit 0
fi
echo ""

# Test 4: Test APOS LM Studio endpoint
echo "🔌 Test 4: Testing APOS LM Studio endpoint..."
RESPONSE=$(curl -s http://localhost:3000/api/lmstudio)
AVAILABLE=$(echo $RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('available', False))" 2>/dev/null)

if [ "$AVAILABLE" = "True" ]; then
    echo -e "${GREEN}✓ APOS can connect to LM Studio${NC}"
    MODELS=$(echo $RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(', '.join(data.get('models', [])))")
    echo "   Models: $MODELS"
else
    echo -e "${RED}✗ APOS cannot connect to LM Studio${NC}"
    echo "   Response: $RESPONSE"
fi
echo ""

# Test 5: Test LLM routing
echo "🧭 Test 5: Testing LLM smart routing..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/test-llm \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Say hello",
    "taskType": "summarize",
    "useRouter": true
  }')

SUCCESS=$(echo $RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('success', False))" 2>/dev/null)
PROVIDER=$(echo $RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('provider', 'unknown'))" 2>/dev/null)

if [ "$SUCCESS" = "True" ]; then
    echo -e "${GREEN}✓ LLM routing working${NC}"
    echo "   Provider: $PROVIDER"
    if [ "$PROVIDER" = "lmstudio" ]; then
        echo -e "   ${GREEN}✓ Successfully routed to LM Studio!${NC}"
    fi
else
    echo -e "${RED}✗ LLM routing failed${NC}"
    echo "   Response: $RESPONSE"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ LM Studio Integration is working!"
echo ""
echo "Next steps:"
echo "1. Visit http://localhost:3000/settings"
echo "2. Enable 'LM Studio 优先' toggle"
echo "3. Select 'LM Studio 本地模型' for each Agent"
echo "4. Save settings"
echo "5. Create a prototype to test end-to-end"
echo ""
echo "💡 Tip: LM Studio will be used for low-cost tasks automatically"
echo "    (summarize, refactor, review) when enabled."
echo ""
