# STEP 10: Background Jobs + Queue - PROOF PACK

**Date:** 2026-01-29T20:38:00Z  
**Status:** COMPLETE

---

## A) SCHEDULER START LOGS

```
[Jobs] Jobs scheduler enabled
[Jobs] Scheduled jobs:
  - cleanupPreviewSessions: every 6 hours (0 */6 * * *)
  - cleanupI18nCache: daily at 3am (0 3 * * *)
```

**Verified:** Two jobs registered with correct cron expressions.

---

## B) API PROOF

### B1) GET /api/jobs/status (admin token)
```json
{
  "running": true,
  "enabled": true,
  "jobs": [
    {
      "name": "cleanupPreviewSessions",
      "schedule": "0 */6 * * *",
      "description": "Cleanup expired preview sessions"
    },
    {
      "name": "cleanupI18nCache",
      "schedule": "0 3 * * *",
      "description": "Cleanup old i18n cache entries"
    }
  ]
}
```

### B2) POST /api/jobs/run/cleanupPreviewSessions (manual trigger)
```json
{
  "job": "cleanupPreviewSessions",
  "result": {
    "success": true,
    "details": {
      "expiredCount": 2,
      "revokedCount": 0
    }
  }
}
```

### B3) GET /api/jobs/runs (job history)
```json
{
  "runs": [
    {
      "id": "0b5c704e-da37-4094-b330-9e0ca6b19bf4",
      "name": "cleanupPreviewSessions",
      "status": "success",
      "startedAt": "2026-01-29T20:35:55.377Z",
      "endedAt": "2026-01-29T20:35:55.417Z",
      "details": {"expiredCount": 0, "revokedCount": 0},
      "createdAt": "2026-01-29T20:35:55.447Z"
    },
    ...
  ]
}
```

---

## C) FUNCTIONAL PROOF: Preview Session Cleanup

### C1) Created expired preview session
```json
{"id":"b8068027-60c6-4e72-b9e5-73de195aec04","token":"test-expired-cb22e2bb2d41f2a1","expiresAt":"2026-01-28T20:36:54.705Z"}
```

### C2) Validate BEFORE cleanup
```json
{"error":"Preview session expired","code":"EXPIRED"}
```

### C3) Run cleanup job
```json
{
  "job": "cleanupPreviewSessions",
  "result": {
    "success": true,
    "details": {"expiredCount": 2, "revokedCount": 0}
  }
}
```

### C4) Validate AFTER cleanup (session deleted)
```json
{"error":"Preview session not found","code":"NOT_FOUND"}
```

**Verified:** Expired sessions are properly deleted by cleanup job.

---

## D) FUNCTIONAL PROOF: i18n Cache Cleanup

### D1) Created expired aiCache entry
```json
{"id":"7e8ae506-b0f4-4a58-8c02-e91f54ee8f98","promptHash":"test-cleanup-1769719084412","expiresAt":"2026-01-29T19:38:04.412Z"}
```
Count before: 1

### D2) Run cleanup job
```json
{
  "job": "cleanupI18nCache",
  "result": {
    "success": true,
    "details": {"cleanedCount": 1}
  }
}
```

### D3) Verify after cleanup
```
aiCache count after cleanup: 0
```

**Verified:** Expired cache entries are properly deleted.

---

## E) SECURITY PROOF (RBAC)

### E1) Created staff user with "staff" role

### E2) GET /api/jobs/runs with STAFF token
```
{"error":"Insufficient permissions"}
HTTP Status: 403
```

### E3) POST /api/jobs/run/cleanupPreviewSessions with STAFF token
```
{"error":"Insufficient permissions"}
HTTP Status: 403
```

**Verified:** Staff users (non-admin) are blocked with 403 Forbidden.

---

## F) ARTIFACTS

### Changed Files
- `apps/api/prisma/schema.prisma` - Added JobRun model
- `apps/api/src/jobs/index.ts` - Job exports
- `apps/api/src/jobs/scheduler.ts` - Main scheduler
- `apps/api/src/jobs/cleanupPreviewSessions.ts` - Preview cleanup job
- `apps/api/src/jobs/cleanupI18nCache.ts` - Cache cleanup job
- `apps/api/src/routes/jobs.ts` - Admin API endpoints
- `apps/api/src/index.ts` - Scheduler startup wiring
- `replit.md` - Documentation updated
- `scripts/fixtures/step10_jobs_proof.json` - Proof fixture

### Configuration
- `JOBS_ENABLED` env var (defaults to true, set to false to disable)

---

## SUMMARY

| Test | Result |
|------|--------|
| Scheduler starts | ✅ PASS |
| 2 jobs registered | ✅ PASS |
| GET /api/jobs/status | ✅ PASS |
| Manual job trigger | ✅ PASS |
| Job history recorded | ✅ PASS |
| Preview cleanup works | ✅ PASS |
| i18n cache cleanup works | ✅ PASS |
| Staff user blocked (403) | ✅ PASS |

**STEP 10: COMPLETE**
