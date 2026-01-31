# STEP 24: API Key Auth + Scopes + Service Access - Proof of Completion

## Summary
Implemented comprehensive API key authentication with scope-based access control, allowing programmatic API access using either `Authorization: ApiKey <key>` or `x-api-key: <key>` headers while maintaining full backward compatibility with Bearer JWT tokens.

## Features Implemented

### 1. API Key Storage & Security
- Store only hashed API keys in DB (never store raw key)
- Return raw key ONLY once at creation and rotation
- Keep keyPrefix (for display) and lastUsedAt, lastUsedIp
- scopes array with default: ["read"]
- status: active/revoked + revokedAt

### 2. Auth Middleware
- Unified middleware accepts both Bearer JWT and API key auth
- API key validation: hash check, status active, tenant binding, scope enforcement
- Updates lastUsedAt + lastUsedIp on each API key use
- Bearer JWT behavior unchanged

### 3. Scope Enforcement
Defined scopes:
- `read` - Read access to most endpoints
- `builder:write` - Write access to builder/draft operations  
- `billing:write` - Access to billing and payment operations
- `marketplace:install` - Install apps from marketplace
- `support:write` - Create and manage support tickets
- `admin:write` - Administrative operations including security settings

### 4. Route to Scope Mapping
| Route | Required Scopes |
|-------|----------------|
| GET /api/audit-logs | read |
| GET /api/dashboard | read |
| GET /api/modules | read |
| GET /api/connectors | read |
| GET /api/api-keys | read |
| GET /api/users | read |
| GET /api/builder/draft | read |
| POST /api/builder/draft | builder:write |
| POST /api/billing/checkout | billing:write |
| POST /api/marketplace/install | marketplace:install |
| POST /api/support/tickets | support:write |
| POST /api/security-center/settings | admin:write |

### 5. Frontend UI (`/dashboard/api-keys`)
- List all API keys with status, scopes, lastUsedAt, lastUsedIp
- Create key with scope selection
- Rotate key button
- Revoke key with confirmation dialog
- Available scopes documentation

### 6. Audit Logging
- API_KEY_CREATED
- API_KEY_ROTATED
- API_KEY_REVOKED
- API_KEY_SCOPES_UPDATED
- API_KEY_SCOPE_DENIED

## Database Changes

```prisma
model ApiKey {
  id           String    @id @default(uuid())
  tenantId     String    @map("tenant_id")
  name         String
  keyHash      String    @map("key_hash")
  keyPrefix    String    @map("key_prefix")
  scopes       String[]  @default(["read"])
  status       String    @default("active") // active, revoked
  lastUsedAt   DateTime? @map("last_used_at")
  lastUsedIp   String?   @map("last_used_ip")
  revokedAt    DateTime? @map("revoked_at")
  expiresAt    DateTime? @map("expires_at")
  createdAt    DateTime  @default(now()) @map("created_at")
}
```

## API Endpoints

### API Keys Management
- `GET /api/api-keys` - List all API keys
- `GET /api/api-keys/scopes` - List available scopes
- `POST /api/api-keys` - Create new API key with scopes
- `PATCH /api/api-keys/:id/scopes` - Update scopes
- `POST /api/api-keys/:id/rotate` - Rotate key (invalidate old, issue new)
- `POST /api/api-keys/:id/revoke` - Revoke key (soft delete)
- `DELETE /api/api-keys/:id` - Delete key (hard delete)

## Proof Pack Results

### 1. Create key with scopes
```json
{
  "id": "9b195f68-ede3-418f-9a4f-8bf41540dddb",
  "name": "final-proof-key",
  "scopes": ["read", "billing:write"],
  "status": "active"
}
```

### 2. API key auth works (HTTP 200)
```
Authorization: ApiKey pk_e11211d15...
HTTP/1.1 200 OK
```

### 3. billing:write scope test (POST /api/billing/checkout)
```json
{"error":"Invalid plan","details":...}  // 200 OK - scope check passed, route logic runs
```

### 4. builder:write DENIED (key only has read + billing:write)
```json
{
  "error": "Insufficient scope",
  "required": ["builder:write"],
  "provided": ["read", "billing:write"]
}
```

### 5. admin:write DENIED (key only has read + billing:write)
```json
{
  "error": "Insufficient scope",
  "required": ["admin:write"],
  "provided": ["read", "billing:write"],
  "note": "Unmapped write endpoint requires admin:write scope"
}
```

### 4. Bearer token regression (HTTP 200)
```
Authorization: Bearer <JWT>
HTTP/1.1 200 OK
```

### 5. Rotate key
- Old key: `{"error":"Invalid or revoked API key"}`
- New key: HTTP 200 OK

### 6. Revoke key
```json
{
  "success": true,
  "message": "API key revoked",
  "id": "e5ffada0-579c-4e01-a517-50344ad7cd88",
  "keyPrefix": "pk_ec0e526c1",
  "revokedAt": "2026-01-30T19:28:42.325Z"
}
```
Revoked key request: `{"error":"Invalid or revoked API key"}`

### 7. lastUsedAt/ip proof
```json
{
  "id": "f4cf9364-22a8-4eab-8b55-3d38fe6dc79c",
  "name": "step24-rotate-test",
  "lastUsedAt": "2026-01-30T19:28:36.521Z",
  "lastUsedIp": "127.0.0.1",
  "status": "active"
}
```

### 8. Default-Deny Policy Test
```bash
# Key with read scope only:
POST on unmapped route: {"error":"Insufficient scope","required":["admin:write"],"provided":["read"],"note":"Unmapped write endpoint requires admin:write scope"}

# Key with admin:write scope:
POST on unmapped route: Passes scope check (404 from route not existing is expected)
```

### 9. Regression Tests
- smoke.sh: PASSED
- verify.sh: TypeScript warnings only (non-blocking)

## Changed Files
- apps/api/prisma/schema.prisma (ApiKey model update)
- apps/api/src/middleware/auth.ts (unified auth with scope enforcement)
- apps/api/src/routes/api-keys.ts (CRUD with scopes, rotate, revoke)
- apps/api/src/index.ts (scopeMiddleware added to routes)
- apps/web/src/app/dashboard/api-keys/page.tsx (new UI)
- reports/step24-proof.md (this file)
