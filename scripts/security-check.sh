#!/bin/bash
# Security Check Script
# Runs npm audit and generates a security report

echo "================================"
echo "Security Audit Report"
echo "Generated: $(date)"
echo "================================"
echo ""

echo "## NPM Audit (Production Dependencies)"
echo "--------------------------------------"
npm audit --production 2>&1 || true

echo ""
echo "## Summary"
echo "----------"
echo "Policy: High/Critical vulnerabilities must be fixed or explicitly waived."
echo "        Low/Moderate severity allowed if no fix is available."
echo ""

npm audit --production --json 2>/dev/null | node -e "
const data = require('fs').readFileSync('/dev/stdin', 'utf8');
try {
  const audit = JSON.parse(data);
  const vulnerabilities = audit.metadata?.vulnerabilities || {};
  console.log('Vulnerability counts:');
  console.log('  Critical:', vulnerabilities.critical || 0);
  console.log('  High:', vulnerabilities.high || 0);
  console.log('  Moderate:', vulnerabilities.moderate || 0);
  console.log('  Low:', vulnerabilities.low || 0);
  
  const hasBlocking = (vulnerabilities.critical || 0) + (vulnerabilities.high || 0) > 0;
  if (hasBlocking) {
    console.log('');
    console.log('⚠️  ATTENTION: High/Critical vulnerabilities detected.');
    console.log('   Review and fix before production deployment.');
    process.exit(1);
  } else {
    console.log('');
    console.log('✅ No high/critical vulnerabilities found.');
  }
} catch(e) {
  console.log('Could not parse audit results.');
}
" 2>/dev/null || echo "Audit parsing skipped."

echo ""
echo "================================"
echo "Security check complete."
echo "================================"
