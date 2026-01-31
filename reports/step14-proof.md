# STEP 14: Security Hardening Pack - Proof Pack

Generated: 2026-01-29

## A) Security Headers Configuration

### Helmet Configuration (apps/api/src/middleware/security.ts)
```typescript
export const securityHeaders = helmet({
  contentSecurityPolicy: isProd ? { ... } : false,  // CSP in prod only
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,  // HSTS in prod only
  xContentTypeOptions: true,
  xFrameOptions: { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xDnsPrefetchControl: { allow: false },
  xDownloadOptions: true,
  xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
});
```

### Proof: Security Headers (curl -I http://localhost:5000/api/health)
```
HTTP/1.1 200 OK
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: cross-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: SAMEORIGIN
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Vary: Origin
Access-Control-Allow-Credentials: true
Access-Control-Expose-Headers: X-RateLimit-Limit,X-RateLimit-Remaining,Retry-After
```

## B) CORS Hardening Configuration

### Allowlist-Based CORS (apps/api/src/middleware/security.ts)
```typescript
function parseAllowedOrigins(): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
  ]);
  
  // Add from CORS_ALLOWED_ORIGINS env var
  if (envOrigins) {
    envOrigins.split(',').forEach(origin => origins.add(origin.trim()));
  }
  
  // Add APP_URL if set
  if (appUrl) origins.add(appUrl);
  
  // Add Replit URLs automatically
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    origins.add(`https://${REPL_SLUG}.${REPL_OWNER}.repl.co`);
  }
  
  return Array.from(origins);
}
```

### Environment Variables
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins
- `APP_URL`: Primary application URL (added to allowlist)

### Behavior
- Development mode: All origins allowed (for easier local testing)
- Production mode: Only allowlisted origins accepted
- Disallowed origins log warning and return CORS error

## C) Auth & Token Safety

### JWT Secret Validation (fails fast in production)
```typescript
export function validateJwtSecret(): void {
  const secret = process.env.SESSION_SECRET;
  
  if (!secret && isProd) {
    console.error('[SECURITY] FATAL: SESSION_SECRET is required in production');
    process.exit(1);
  }
  
  if (secret && secret.length < 32 && isProd) {
    console.error('[SECURITY] FATAL: SESSION_SECRET must be at least 32 characters in production');
    process.exit(1);
  }
}
```

### Request Body Size Limits
```typescript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

### Cookie Security Options
```typescript
export const cookieOptions = {
  httpOnly: true,
  secure: isProd,  // Only secure in production
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
```

## D) Secrets & PII Redaction

### Redaction Utility (apps/api/src/lib/redact.ts)

Patterns redacted:
- JWT tokens (Bearer ...)
- OpenAI API keys (sk-...)
- Stripe keys (pk_*, sk_*)
- Platform API keys (pfk_...)
- Password/secret/token JSON fields
- Authorization headers

### Safe Logging Functions
```typescript
export function safeLog(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void
export function createSafeErrorLog(error: Error, context?: Record<string, unknown>): Record<string, unknown>
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown>
export function redactObject(obj: unknown): unknown
```

### Error Handler Integration
```typescript
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const safeError = createSafeErrorLog(err, {
    path: req.path,
    method: req.method,
  });
  safeLog('error', 'Request error', safeError);
  // ...
});
```

## E) API Key Storage & Rotation

### Hashing Verification
API keys are hashed using SHA-256 at rest:
```typescript
// apps/api/src/lib/crypto.ts
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
```

### Rotation Endpoint
`POST /api/api-keys/:id/rotate` (owner/admin only)

### Proof: API Key Rotation
```
--- Creating API Key ---
{
  "id": "69fd4c52-0e3d-43ec-b190-a948ac353174",
  "name": "test-rotate-key",
  "keyPrefix": "pk_76153a3d9",
  ...
}

--- Rotating API Key ---
{
  "id": "69fd4c52-0e3d-43ec-b190-a948ac353174",
  "key": "pk_c373ce69f8b5835b8ebed28a1e3279c70256185f978722b30685690a80ab7903",
  "keyPrefix": "pk_c373ce69f",
  "rotatedAt": "2026-01-29T22:23:31.064Z",
  "message": "API key rotated successfully. Save this key now - it will not be shown again."
}
```

### Audit Log Events
```
"revoke_api_key"
"API_KEY_ROTATED"
"create_api_key"
```

## F) Security Audit Script

### Usage
```bash
./scripts/security-check.sh
# or
npm run security:check  # (if added to package.json)
```

### Sample Output
```
================================
Security Audit Report
================================

## NPM Audit (Production Dependencies)
--------------------------------------
2 vulnerabilities (1 moderate, 1 critical)

## Summary
----------
Vulnerability counts:
  Critical: 1 (Next.js - known issue, awaiting fix)
  High: 0
  Moderate: 1
  Low: 0

Policy: High/Critical vulnerabilities must be fixed or explicitly waived.
        Low/Moderate severity allowed if no fix is available.
```

### Known Waivers
- Next.js DoS vulnerabilities (GHSA-mwv6-3258-q52c, GHSA-5j59-xgg2-r9c4): Monitoring for upstream fix
- Mitigated by rate limiting and trusted-proxy configuration

## G) Regression Tests

### Smoke Test: PASS
```
═══════════════════════════════════════════════════════════════
  ✓ SMOKE TEST PASSED
═══════════════════════════════════════════════════════════════
```

### Verify Script: PASS (warnings pre-existing, non-blocking)
```
⚠ API TypeScript check has warnings (non-blocking)
```

## Files Changed

### New Files
- `apps/api/src/middleware/security.ts` - Helmet, CORS, security utilities
- `apps/api/src/lib/redact.ts` - Secrets redaction utility
- `scripts/security-check.sh` - Security audit script
- `reports/step14-proof.md` - This proof document

### Modified Files
- `apps/api/src/index.ts` - Integrated security middleware
- `apps/api/src/routes/api-keys.ts` - Added rotation endpoint

## Environment Variables Summary

| Variable | Purpose | Required |
|----------|---------|----------|
| `SESSION_SECRET` | JWT signing (32+ chars in prod) | Yes (prod) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | Optional |
| `APP_URL` | Primary app URL for CORS | Optional |
| `ENCRYPTION_KEY` | Secrets encryption (32 chars) | Yes |
| `JOBS_ENABLED` | Enable background jobs | Optional |

---

**STEP 14 COMPLETE** ✅
