# STEP 30 — Real Store Publish Enablement (CI Runner + Credential Gating)

**Date**: 2026-01-31
**Status**: ⚠️ BLOCKED - Workflow file not pushed to GitHub repository

---

## Summary

Step 30 implementation is **COMPLETE** but real CI proof is **BLOCKED** because the GitHub Actions workflow file must be pushed to the user's GitHub repository.

---

## BLOCKER: Workflow File Not in GitHub Repository

**Error from trigger-ci:**
```json
{
  "error": "Failed to trigger CI",
  "details": "GitHub API error: 422 - {\"message\":\"Unexpected inputs provided: [\\\"platform\\\", \\\"tenantId\\\", \\\"stage\\\", \\\"channel\\\"]\"}",
  "jobId": "b0f9ea42-c825-4ddb-91d4-554e999c25ec"
}
```

**Root Cause:** The workflow file `.github/workflows/mobile-publish.yml` exists in Replit but has not been pushed to the GitHub repository. GitHub cannot find the workflow with the required inputs.

**Fix Required:**
1. Copy `.github/workflows/mobile-publish.yml` to the GitHub repository
2. Commit and push to `main` branch
3. Add GitHub Actions secrets: `API_BASE_URL`, `CI_CALLBACK_TOKEN`, `EXPO_TOKEN`

---

## 1) GET /api/mobile/publish/capabilities (CI NOW CONFIGURED)

```json
{
  "configured": true,
  "provider": "github_actions",
  "missingEnvVars": [],
  "callbackConfigured": true,
  "callbackMissingVars": [],
  "requiredGitHubSecrets": [
    "API_BASE_URL",
    "CI_CALLBACK_TOKEN"
  ],
  "workflowPath": ".github/workflows/mobile-publish.yml",
  "documentation": "https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions"
}
```

**PROOF: CI environment is now fully configured on the API side.**

---

## 2) POST /api/mobile/publish/start (Job Created Successfully)

```json
{
  "id": "b0f9ea42-c825-4ddb-91d4-554e999c25ec",
  "target": "expo",
  "platform": "android",
  "stage": "build",
  "provider": "eas",
  "channel": "preview",
  "status": "queued",
  "expiresAt": "2026-02-03T00:13:44.809Z",
  "createdAt": "2026-01-31T00:13:44.811Z"
}
```

---

## 3) POST /api/mobile/publish/jobs/:id/trigger-ci (BLOCKED)

```json
{
  "error": "Failed to trigger CI",
  "details": "GitHub API error: 422 - {\"message\":\"Unexpected inputs provided: [\\\"platform\\\", \\\"tenantId\\\", \\\"stage\\\", \\\"channel\\\"]\",\"documentation_url\":\"https://docs.github.com/rest/actions/workflows#create-a-workflow-dispatch-event\",\"status\":\"422\"}",
  "jobId": "b0f9ea42-c825-4ddb-91d4-554e999c25ec"
}
```

**Interpretation:** GitHub API can contact the repo but the workflow file doesn't have the expected inputs defined, meaning the workflow file hasn't been pushed to the repo.

---

## Secrets Status

### Replit Environment Variables (CONFIGURED)
| Variable | Status |
|----------|--------|
| `GITHUB_TOKEN` | ✅ Set |
| `GITHUB_REPO` | ✅ Set |
| `CI_CALLBACK_TOKEN` | ✅ Set |

### GitHub Repository Secrets (REQUIRED - User Action)
| Secret | Status |
|--------|--------|
| `EXPO_TOKEN` | ❓ User must add |
| `API_BASE_URL` | ❓ User must add (deployment URL) |
| `CI_CALLBACK_TOKEN` | ❓ User must add (same value as Replit secret) |

---

## Files Implemented

1. `apps/api/src/routes/mobile.ts` - 5 new endpoints:
   - GET `/publish/capabilities` (requireRole('admin'), rate limited)
   - POST `/publish/jobs/:id/trigger-ci` (requireRole('admin'), rate limited, audit logged)
   - GET `/publish/jobs/:id/ci` (requireRole('admin'), rate limited)
   - POST `/publish/jobs/:id/artifacts/attach` (requireRole('admin'), rate limited, audit logged)
   
2. `apps/api/src/index.ts` - CI callback endpoint (token-authenticated, bypasses user auth)
   - POST `/api/mobile/publish/jobs/:id/ci/callback`

3. `.github/workflows/mobile-publish.yml` - GitHub Actions workflow with:
   - Expo EAS Build support
   - Flutter native build support
   - Callback notifications on success/failure

4. `apps/api/prisma/schema.prisma` - CI tracking fields:
   - `runMode`, `ciStatus`, `ciRunUrl`, `ciRunId`, `ciTriggeredAt`

5. `apps/web/src/app/dashboard/mobile/publish/page.tsx` - UI updates for capabilities and CI mode

---

## Smoke Test

```
═══════════════════════════════════════════════════════════════
  SMOKE TEST - Quick Health Check
═══════════════════════════════════════════════════════════════

✓ API Health (HTTP 200)
✓ API Ready (HTTP 200)
✓ Web Homepage (HTTP 200)
✓ Web Login (HTTP 200)

═══════════════════════════════════════════════════════════════
  ✓ SMOKE TEST PASSED
═══════════════════════════════════════════════════════════════
```

---

## MINIMAL FIX TO UNBLOCK

The user must perform these actions to enable real CI builds:

### Step 1: Push Workflow File to GitHub

Copy `.github/workflows/mobile-publish.yml` from this Replit to the GitHub repository and push to `main`.

### Step 2: Add GitHub Actions Secrets

In GitHub repo settings → Secrets and variables → Actions → Secrets:
- `API_BASE_URL` = The Replit deployment URL (e.g., `https://workspace.username.repl.co`)
- `CI_CALLBACK_TOKEN` = Same value as the Replit secret
- `EXPO_TOKEN` = Expo access token from https://expo.dev/settings/access-tokens

### Step 3: Retry CI Trigger

After completing steps 1-2, create a new job and trigger CI again.

---

## STOP CONDITION

Cannot proceed to Step 31 until:
1. Workflow file is pushed to GitHub repository
2. GitHub Actions secrets are configured
3. Real CI build completes and proof is captured

---

## Git Status

```
Commit: ef4e124c70c6788062f1b694595d0c7c4a434d4b
Files modified:
- apps/api/src/routes/mobile.ts
- apps/api/src/index.ts
- apps/api/prisma/schema.prisma
- .github/workflows/mobile-publish.yml
- apps/web/src/app/dashboard/mobile/publish/page.tsx
- reports/step30-proof.md
- reports/step30-setup-guide.md
- replit.md
```
