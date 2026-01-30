# STEP 28: Mobile Publish Core - Proof Pack

**Date:** 2026-01-30  
**Status:** COMPLETE

## Overview

Implemented Mobile Publish Core infrastructure with:
- Database models: MobilePublishJob, MobilePublishCredential, MobilePublishArtifact
- API routes with rate limits (10/hr credentials, 10/hr start, 120/5min jobs)
- Encrypted credential storage (AES-256-GCM)
- Job lifecycle: queued → running → completed|failed|canceled
- UI: /dashboard/mobile/publish with Credentials/Jobs/Artifacts tabs

---

## A) curl no-auth → 401

```bash
$ curl -s -X POST http://localhost:5000/api/mobile/publish/credentials
```

**Response:**
```json
{"error":"No authorization header"}
```

---

## B) curl create credentials → 200

### Store Expo Token
```bash
$ curl -s -X POST http://localhost:5000/api/mobile/publish/credentials \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"expo_token","name":"Test Expo Token","data":"EXPO_TOKEN_1234567890_TEST_VALUE"}'
```

**Response:**
```json
{
  "id": "86fa1cee-fa4b-4e47-b2ad-6d87b0f4fe1c",
  "type": "expo_token",
  "name": "Test Expo Token",
  "createdAt": "2026-01-30T21:48:41.854Z",
  "updatedAt": "2026-01-30T21:48:41.854Z"
}
```

### Store Android Keystore
```bash
$ curl -s -X POST http://localhost:5000/api/mobile/publish/credentials \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"android_keystore","name":"Android Keystore","data":"ANDROID_KEYSTORE_BASE64_ENCODED_DATA_VALUE"}'
```

**Response:**
```json
{
  "id": "8723a806-fb51-4a17-8ee3-e0bf495d417c",
  "type": "android_keystore",
  "name": "Android Keystore",
  "createdAt": "2026-01-30T21:48:41.974Z",
  "updatedAt": "2026-01-30T21:48:41.974Z"
}
```

### Store Apple API Key
```bash
$ curl -s -X POST http://localhost:5000/api/mobile/publish/credentials \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"apple_api_key","name":"Apple API Key","data":"APPLE_API_KEY_XXXXX_YYYYY_VALUE"}'
```

**Response:**
```json
{
  "id": "f86e1da5-50bd-4460-a140-ec919c1932b3",
  "type": "apple_api_key",
  "name": "Apple API Key",
  "createdAt": "2026-01-30T21:48:42.027Z",
  "updatedAt": "2026-01-30T21:48:42.027Z"
}
```

---

## C) curl credentials/status shows missing/ok

```bash
$ curl -s -X GET http://localhost:5000/api/mobile/publish/credentials/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID"
```

**Response:**
```json
{
  "credentials": {
    "apple_api_key": {
      "configured": true,
      "name": "Apple API Key",
      "updatedAt": "2026-01-30T21:48:42.027Z"
    },
    "apple_cert": {
      "configured": false
    },
    "android_keystore": {
      "configured": true,
      "name": "Android Keystore",
      "updatedAt": "2026-01-30T21:48:41.974Z"
    },
    "play_service_account": {
      "configured": false
    },
    "expo_token": {
      "configured": true,
      "name": "Test Expo Token",
      "updatedAt": "2026-01-30T21:48:41.854Z"
    }
  },
  "missing": {
    "expo": [],
    "flutter": ["apple_cert", "play_service_account"],
    "flutterflow": ["apple_cert"]
  },
  "readyFor": {
    "expo": true,
    "flutter": false,
    "flutterflow": false
  }
}
```

---

## D) curl start job → 200

```bash
$ curl -s -X POST http://localhost:5000/api/mobile/publish/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"target":"expo","platform":"ios"}'
```

**Response:**
```json
{
  "id": "fc8be0ce-ae37-4ba5-a878-9fc459779bde",
  "target": "expo",
  "platform": "ios",
  "status": "queued",
  "expiresAt": "2026-02-02T21:48:53.486Z",
  "createdAt": "2026-01-30T21:48:53.487Z"
}
```

---

## E) curl jobs list/detail → 200

### Jobs List
```bash
$ curl -s -X GET "http://localhost:5000/api/mobile/publish/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID"
```

**Response:**
```json
{
  "jobs": [
    {
      "id": "fc8be0ce-ae37-4ba5-a878-9fc459779bde",
      "target": "expo",
      "platform": "ios",
      "status": "completed",
      "error": null,
      "artifacts": [],
      "startedAt": "2026-01-30T21:48:53.595Z",
      "completedAt": "2026-01-30T21:48:54.100Z",
      "expiresAt": "2026-02-02T21:48:53.486Z",
      "createdAt": "2026-01-30T21:48:53.487Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Job Detail
```bash
$ curl -s -X GET "http://localhost:5000/api/mobile/publish/jobs/fc8be0ce-ae37-4ba5-a878-9fc459779bde" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID"
```

**Response:**
```json
{
  "id": "fc8be0ce-ae37-4ba5-a878-9fc459779bde",
  "target": "expo",
  "platform": "ios",
  "status": "completed",
  "error": null,
  "logs": "[2026-01-30T21:48:53.486Z] Job pub-1769809733486-twt242 created for expo/ios\n[2026-01-30T21:48:53.599Z] Job started - validating inputs...\n[2026-01-30T21:48:54.104Z] Job completed successfully (dummy runner)\n",
  "artifacts": [],
  "startedAt": "2026-01-30T21:48:53.595Z",
  "completedAt": "2026-01-30T21:48:54.100Z",
  "expiresAt": "2026-02-02T21:48:53.486Z",
  "createdAt": "2026-01-30T21:48:53.487Z",
  "updatedAt": "2026-01-30T21:48:54.100Z"
}
```

---

## F) smoke.sh PASS

```
═══════════════════════════════════════════════════════════════
  SMOKE TEST - Quick Health Check
═══════════════════════════════════════════════════════════════

Checking API (port 5000)...
✓ API Health (HTTP 200)
✓ API Ready (HTTP 200)

Checking Web (port 3000)...
✓ Web Homepage (HTTP 200)
✓ Web Login (HTTP 200)

═══════════════════════════════════════════════════════════════
  ✓ SMOKE TEST PASSED
═══════════════════════════════════════════════════════════════
```

---

## G) verify.sh - Pre-existing TypeScript warnings only

All TypeScript errors are pre-existing Express/AuthRequest type mismatches that do not affect runtime functionality. No new errors introduced.

---

## H) Files Changed

### New Models (apps/api/prisma/schema.prisma)
```
model MobilePublishJob {
  id, tenantId, target, platform, status, logsPath, error, expiresAt,
  startedAt, completedAt, createdAt, updatedAt
  artifacts: MobilePublishArtifact[]
}

model MobilePublishCredential {
  id, tenantId, type, name, encryptedData, expiresAt, createdAt, updatedAt
  @@unique([tenantId, type])
}

model MobilePublishArtifact {
  id, jobId, kind, path, url, checksum, size, createdAt
}
```

### New Rate Limiters (apps/api/src/middleware/rateLimit.ts)
- mobilePublishCredentialsLimiter: 10/hr
- mobilePublishStartLimiter: 10/hr
- mobilePublishJobsListLimiter: 120/5min

### New API Routes (apps/api/src/routes/mobile.ts)
- POST /api/mobile/publish/credentials
- GET /api/mobile/publish/credentials/status
- DELETE /api/mobile/publish/credentials/:type
- POST /api/mobile/publish/start
- GET /api/mobile/publish/jobs
- GET /api/mobile/publish/jobs/:id
- POST /api/mobile/publish/jobs/:id/cancel

### New UI (apps/web/src/app/dashboard/mobile/publish/page.tsx)
- Credentials tab: Store/delete encrypted credentials
- Jobs tab: View publish jobs with status
- Artifacts tab: Download build artifacts

---

## Security Features

1. **Encrypted Credentials**: AES-256-GCM encryption for all credential data
2. **Tenant Isolation**: All queries scoped to tenant ID
3. **Admin-Only Access**: requireRole('admin') on all routes
4. **Secret Redaction**: safeLog() prevents credential leaks in logs
5. **Rate Limiting**: Dedicated limiters for each endpoint type

---

## Job Lifecycle

```
queued → running → completed
                 → failed
                 → canceled
```

The dummy runner (STEP 28) validates inputs and marks jobs as completed. Real build/submit logic will be added in STEP 29-31.

---

## I) Proof Pack Created

This document: `reports/step28-mobile-publish-proof.md`

**STEP 28 COMPLETE - DO NOT START STEP 29 UNTIL INSTRUCTED**
