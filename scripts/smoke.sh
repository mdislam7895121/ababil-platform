#!/bin/bash
# Fast smoke test - checks only essential endpoints

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

API_PORT=${API_PORT:-5000}
WEB_PORT=${WEB_PORT:-3000}

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  SMOKE TEST - Quick Health Check${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

FAILED=0

check() {
    local name="$1"
    local url="$2"
    local expected="${3:-200}"
    
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 5 2>/dev/null || echo "000")
    
    if [ "$status" = "$expected" ]; then
        echo -e "${GREEN}✓${NC} $name (HTTP $status)"
    else
        echo -e "${RED}✗${NC} $name - Expected $expected, got $status"
        ((FAILED++))
    fi
}

echo "Checking API (port $API_PORT)..."
check "API Health" "http://localhost:${API_PORT}/api/health"
check "API Ready" "http://localhost:${API_PORT}/api/ready"

echo ""
echo "Checking Web (port $WEB_PORT)..."
check "Web Homepage" "http://localhost:${WEB_PORT}/"
check "Web Login" "http://localhost:${WEB_PORT}/login"

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ SMOKE TEST PASSED${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  ✗ SMOKE TEST FAILED - $FAILED checks failed${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    exit 1
fi
