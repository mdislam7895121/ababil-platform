# STEP 12: Backups + Tenant Data Export + Safe Delete - PROOF REPORT

**Date:** 2026-01-29
**Status:** ✅ COMPLETE

---

## A) Export Proof

### 1) Start Export
```json
{
  "message": "Export started",
  "exportJobId": "e35a0ac5-540f-47a3-a945-f54edb47abf4",
  "status": "pending",
  "estimatedTime": "1-2 minutes"
}
```

### 2) Poll Status (Ready)
```json
{
  "id": "e35a0ac5-540f-47a3-a945-f54edb47abf4",
  "status": "ready",
  "format": "zip",
  "fileSize": 4743,
  "expiresAt": "2026-01-30T21:33:36.906Z",
  "errorMessage": null,
  "createdAt": "2026-01-29T21:33:36.878Z"
}
```

### 3) Download Headers (HTTP 200)
```
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="export_f83ce7ac-a46f-4c46-ab88-5f4eac566915_1769722416897.zip"
Content-Length: 4743
```

### 4) ZIP Contents
```
Archive:  /tmp/tenant-export.zip
  Length      Date    Time    Name
---------  ---------- -----   ----
      350  01-29-2026 21:33   tenant.json
      567  01-29-2026 21:33   users.json
      536  01-29-2026 21:33   memberships.json
        2  01-29-2026 21:33   modules.json
        2  01-29-2026 21:33   connectors.json
     1380  01-29-2026 21:33   billing.json
    15866  01-29-2026 21:33   audit_logs.json
---------                     -------
    18703                     7 files
```

**✅ All required files present:** tenant.json, users.json, memberships.json, modules.json, connectors.json, billing.json, audit_logs.json

---

## B) Backup Snapshot Proof

### 1) Create Snapshot
```json
{
  "message": "Backup snapshot created",
  "snapshot": {
    "id": "3f6d3f42-3dc9-463b-9c4b-54d2b333ba7f",
    "type": "manual",
    "counts": {
      "users": 3,
      "apiKeys": 0,
      "invoices": 1,
      "auditLogs": 37,
      "blueprints": 20,
      "memberships": 3,
      "moduleFlags": 0,
      "manualPayments": 1,
      "builderRequests": 20,
      "previewSessions": 0,
      "connectorConfigs": 0
    },
    "createdAt": "2026-01-29T21:33:50.733Z"
  }
}
```

### 2) List Snapshots
```json
{
  "snapshots": [
    {
      "id": "3f6d3f42-3dc9-463b-9c4b-54d2b333ba7f",
      "type": "manual",
      "counts": { "users": 3, "blueprints": 20, "auditLogs": 37, ... },
      "metadata": { "tenantName": "Demo Workspace", "tenantPlan": "pro" },
      "createdAt": "2026-01-29T21:33:50.733Z"
    }
  ]
}
```

---

## C) Safe Delete + Restore Proof

### 1) Request Delete
```json
{
  "message": "Delete request initiated. Use the confirmation token to confirm deletion.",
  "confirmationToken": "f74fefb7f57436fb0a1ee4f2f77860406ba6d7edba4e1fb9b8be5e5864604e16",
  "expiresAt": "2026-01-29T22:04:22.944Z",
  "warning": "This will soft-delete your workspace. Data will be retained for 30 days before permanent deletion."
}
```

### 2) Confirm Delete
```json
{
  "message": "Workspace deleted successfully",
  "deletedAt": "2026-01-29T21:34:23.107Z",
  "retentionDays": 30,
  "restoreDeadline": "2026-02-28T21:34:23.107Z"
}
```

### 3) Status Shows Deleted
```json
{
  "status": "deleted",
  "deletedAt": "2026-01-29T21:34:23.083Z",
  "restoreDeadline": "2026-02-28T21:34:23.083Z",
  "retentionDays": 30
}
```

### 4) Restore
```json
{
  "message": "Workspace restored successfully",
  "restoredAt": "2026-01-29T21:34:34.893Z",
  "note": "API keys and preview sessions were revoked during deletion and may need to be regenerated."
}
```

### 5) Status Shows Active
```json
{
  "status": "active",
  "deletedAt": null,
  "restoreDeadline": null
}
```

---

## D) RBAC Proof

### Unauthenticated (401)
```
{"error":"No authorization header"}
HTTP Status: 401
```

### Invalid Token (401)
```
{"error":"Invalid token"}
HTTP Status: 401
```

### Owner Access (200)
```
HTTP Status: 200
```

---

## E) Regression Proof

### verify.sh
✅ API TypeScript check: warnings only (non-blocking)

### smoke.sh
```
✓ API Health (HTTP 200)
✓ API Ready (HTTP 200)
✓ Web Homepage (HTTP 200)
✓ Web Login (HTTP 200)
✓ SMOKE TEST PASSED
```

---

## F) Artifacts

### Changed Files
- apps/api/prisma/schema.prisma (ExportJob, BackupSnapshot models + Tenant deletedAt)
- apps/api/src/routes/exports.ts (NEW)
- apps/api/src/routes/backups.ts (NEW)
- apps/api/src/routes/tenants.ts (delete/restore endpoints)
- apps/api/src/jobs/cleanupExports.ts (NEW)
- apps/api/src/jobs/scheduler.ts (updated with cleanup job)
- apps/web/src/app/dashboard/data/page.tsx (NEW - UI page)
- replit.md (documentation updated)

