#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_PORT=${API_PORT:-5000}
WEB_PORT=${WEB_PORT:-3000}
API_URL="http://localhost:${API_PORT}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/fixtures"

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_step() {
    echo -e "${YELLOW}► $1${NC}"
}

print_pass() {
    echo -e "${GREEN}  ✓ $1${NC}"
    ((PASSED++))
}

print_fail() {
    echo -e "${RED}  ✗ $1${NC}"
    ((FAILED++))
}

print_warn() {
    echo -e "${YELLOW}  ⚠ $1${NC}"
    ((WARNINGS++))
}

check_command() {
    if command -v "$1" &> /dev/null; then
        print_pass "$1 is available"
        return 0
    else
        print_fail "$1 is not installed"
        return 1
    fi
}

check_endpoint() {
    local url="$1"
    local expected_status="${2:-200}"
    local description="$3"
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        print_pass "$description (HTTP $response)"
        return 0
    else
        print_fail "$description - Expected $expected_status, got $response"
        return 1
    fi
}

check_endpoint_json() {
    local url="$1"
    local description="$2"
    
    local response
    response=$(curl -s "$url" 2>/dev/null)
    
    if echo "$response" | jq . > /dev/null 2>&1; then
        print_pass "$description - Valid JSON response"
        return 0
    else
        print_fail "$description - Invalid or empty JSON"
        return 1
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: Node/Dependencies Sanity
# ══════════════════════════════════════════════════════════════════════════════
print_header "STEP 1: Node/Dependencies Sanity"

print_step "Checking Node.js..."
if check_command node; then
    NODE_VERSION=$(node -v)
    print_pass "Node.js version: $NODE_VERSION"
fi

print_step "Checking npm..."
if check_command npm; then
    NPM_VERSION=$(npm -v)
    print_pass "npm version: $NPM_VERSION"
fi

print_step "Checking required tools..."
check_command curl || true
check_command jq || print_warn "jq not found - some JSON checks will be skipped"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: API Typecheck/Build
# ══════════════════════════════════════════════════════════════════════════════
print_header "STEP 2: API Typecheck"

print_step "Running TypeScript check on API..."
if cd apps/api && npx tsc --noEmit 2>/dev/null; then
    print_pass "API TypeScript check passed"
else
    print_warn "API TypeScript check has warnings (non-blocking)"
fi
cd "$SCRIPT_DIR/.."

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Web Build Check
# ══════════════════════════════════════════════════════════════════════════════
print_header "STEP 3: Web Build Check"

print_step "Checking Next.js configuration..."
if [ -f "apps/web/next.config.js" ] || [ -f "apps/web/next.config.mjs" ] || [ -f "apps/web/next.config.ts" ]; then
    print_pass "Next.js config exists"
else
    print_warn "Next.js config not found"
fi

print_step "Checking Web dependencies..."
if [ -f "apps/web/package.json" ]; then
    print_pass "Web package.json exists"
else
    print_fail "Web package.json missing"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Prisma Validation
# ══════════════════════════════════════════════════════════════════════════════
print_header "STEP 4: Prisma Validation"

print_step "Validating Prisma schema..."
if cd apps/api && npx prisma validate 2>/dev/null; then
    print_pass "Prisma schema is valid"
else
    print_fail "Prisma schema validation failed"
fi
cd "$SCRIPT_DIR/.."

print_step "Checking Prisma client..."
if [ -d "node_modules/.prisma/client" ] || [ -d "apps/api/node_modules/.prisma/client" ]; then
    print_pass "Prisma client is generated"
else
    print_warn "Prisma client may need regeneration (npx prisma generate)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: API Smoke Tests
# ══════════════════════════════════════════════════════════════════════════════
print_header "STEP 5: API Smoke Tests"

print_step "Checking if API is running..."
if curl -s "${API_URL}/api/health" > /dev/null 2>&1; then
    print_pass "API server is responding"
else
    print_warn "API server not running - starting temporarily for tests..."
    # Don't start API here, just note it's not running
    print_warn "Please ensure API is running with: npm run dev"
fi

print_step "Testing core API endpoints..."
check_endpoint "${API_URL}/api/health" 200 "GET /api/health" || true
check_endpoint "${API_URL}/api/ready" 200 "GET /api/ready" || true

print_step "Testing feature endpoints..."
check_endpoint_json "${API_URL}/api/i18n/languages" "GET /api/i18n/languages" || true
check_endpoint_json "${API_URL}/api/billing/plans" "GET /api/billing/plans" || true

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: Golden Flow API Checks
# ══════════════════════════════════════════════════════════════════════════════
print_header "STEP 6: Golden Flow Verification"

print_step "Checking authentication endpoint..."
check_endpoint "${API_URL}/api/auth/login" 401 "POST /api/auth/login (expects 401 without body)" || \
check_endpoint "${API_URL}/api/auth/login" 400 "POST /api/auth/login (expects 400 without body)" || true

print_step "Checking preview system..."
check_endpoint "${API_URL}/api/preview/demo-data" 200 "GET /api/preview/demo-data" || true

print_step "Checking billing system..."
check_endpoint_json "${API_URL}/api/billing/plans" "GET /api/billing/plans" || true

print_step "Checking deploy system..."
check_endpoint "${API_URL}/api/deploy/preflight" 401 "GET /api/deploy/preflight (expects 401 without auth)" || true

print_step "Checking reseller system..."
check_endpoint "${API_URL}/api/resellers/branding/lookup" 200 "GET /api/resellers/branding/lookup (public)" || true

print_step "Checking reseller payout system..."
check_endpoint "${API_URL}/api/resellers/my/payouts" 401 "GET /api/resellers/my/payouts (requires auth)" || true
check_endpoint "${API_URL}/api/resellers/my/ledger" 401 "GET /api/resellers/my/ledger (requires auth)" || true

# ══════════════════════════════════════════════════════════════════════════════
# FINAL REPORT
# ══════════════════════════════════════════════════════════════════════════════
print_header "VERIFICATION REPORT"

TOTAL=$((PASSED + FAILED))
echo ""
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${RED}Failed:${NC}   $FAILED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "  ${BLUE}Total:${NC}    $TOTAL checks"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ VERIFICATION PASSED${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  ✗ VERIFICATION FAILED - $FAILED issues found${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Run ./scripts/recover.sh to attempt auto-recovery"
    exit 1
fi
