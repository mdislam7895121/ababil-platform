#!/bin/bash
# Safe Recovery Commands for Digital Platform Factory

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

show_menu() {
    print_header "RECOVERY OPTIONS"
    echo ""
    echo "  1) Restart services (kill ports 3000/5000, restart dev)"
    echo "  2) Regenerate Prisma client"
    echo "  3) Re-run preflight check"
    echo "  4) Run smoke test"
    echo "  5) Run full verification"
    echo "  6) Check environment variables"
    echo "  7) View recent logs"
    echo "  8) Exit"
    echo ""
    read -p "Select option [1-8]: " choice
    
    case $choice in
        1) restart_services ;;
        2) regenerate_prisma ;;
        3) run_preflight ;;
        4) run_smoke ;;
        5) run_verify ;;
        6) check_env ;;
        7) view_logs ;;
        8) exit 0 ;;
        *) echo "Invalid option"; show_menu ;;
    esac
}

restart_services() {
    print_header "Restarting Services"
    
    echo -e "${YELLOW}► Stopping processes on ports 3000 and 5000...${NC}"
    
    # Kill processes on ports
    fuser -k 3000/tcp 2>/dev/null || true
    fuser -k 5000/tcp 2>/dev/null || true
    
    # Alternative using lsof if fuser not available
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    
    sleep 2
    
    echo -e "${GREEN}✓ Ports cleared${NC}"
    echo ""
    echo -e "${YELLOW}To start services, run:${NC}"
    echo "  ./scripts/dev-all.sh"
    echo ""
    echo "Or start individually:"
    echo "  npm run dev                    # API on port 5000"
    echo "  npm run dev --prefix apps/web  # Web on port 3000"
    
    show_menu
}

regenerate_prisma() {
    print_header "Regenerating Prisma Client"
    
    echo -e "${YELLOW}► Running prisma generate...${NC}"
    cd apps/api && npx prisma generate
    
    echo -e "${GREEN}✓ Prisma client regenerated${NC}"
    
    show_menu
}

run_preflight() {
    print_header "Pre-flight Check"
    
    echo -e "${YELLOW}► Checking deployment readiness...${NC}"
    
    API_PORT=${API_PORT:-5000}
    response=$(curl -s "http://localhost:${API_PORT}/api/deploy/preflight" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer test" 2>/dev/null || echo '{"error": "API not reachable"}')
    
    echo "$response" | jq . 2>/dev/null || echo "$response"
    
    show_menu
}

run_smoke() {
    print_header "Running Smoke Test"
    ./scripts/smoke.sh
    show_menu
}

run_verify() {
    print_header "Running Full Verification"
    ./scripts/verify.sh
    show_menu
}

check_env() {
    print_header "Environment Variables Check"
    
    echo -e "${YELLOW}Required Variables:${NC}"
    
    vars=("DATABASE_URL" "SESSION_SECRET" "ENCRYPTION_KEY")
    for var in "${vars[@]}"; do
        if [ -n "${!var}" ]; then
            echo -e "${GREEN}✓${NC} $var is set"
        else
            echo -e "${RED}✗${NC} $var is NOT set"
        fi
    done
    
    echo ""
    echo -e "${YELLOW}Optional Variables:${NC}"
    
    optional=("OPENAI_API_KEY" "STRIPE_SECRET_KEY" "NEXT_PUBLIC_API_URL")
    for var in "${optional[@]}"; do
        if [ -n "${!var}" ]; then
            echo -e "${GREEN}✓${NC} $var is set"
        else
            echo -e "${YELLOW}○${NC} $var is not set (optional)"
        fi
    done
    
    show_menu
}

view_logs() {
    print_header "Recent Logs"
    
    echo "Select log source:"
    echo "  1) API logs (if available)"
    echo "  2) System logs"
    echo "  3) Back to menu"
    
    read -p "Select [1-3]: " log_choice
    
    case $log_choice in
        1) 
            if [ -f "/tmp/logs/api.log" ]; then
                tail -50 /tmp/logs/api.log
            else
                echo "No API log file found. Check workflow output."
            fi
            ;;
        2)
            dmesg | tail -20 2>/dev/null || echo "System logs not accessible"
            ;;
        3) ;;
    esac
    
    show_menu
}

# Main execution
if [ "$1" = "--quick" ]; then
    # Quick mode - just restart services
    restart_services
    exit 0
fi

show_menu
