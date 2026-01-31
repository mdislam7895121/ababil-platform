#!/bin/bash
# Unified development startup script for the monorepo
# Runs both API server (port 5000) and Next.js web dashboard (port 3000)

echo "Starting Digital Platform Factory..."
echo "=================================="
echo "API Server:    http://localhost:5000"
echo "Web Dashboard: http://localhost:3000"
echo "=================================="

# Run both services concurrently with prefixed logs
npx concurrently \
  -n "api,web" \
  -c "blue,green" \
  --kill-others-on-fail \
  "NODE_ENV=development tsx server/index.ts" \
  "npm run dev --prefix apps/web"
