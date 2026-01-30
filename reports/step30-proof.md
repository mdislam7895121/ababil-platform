# STEP 30 — Real Store Publish Enablement (CI Runner + Credential Gating)

**Date**: 2026-01-30
**Status**: ⚠️ COMPLETE (Implementation) - BLOCKED (CI secrets not configured for real proof)

---

## Summary

Step 30 adds CI-based mobile build capabilities with:
- **Capabilities endpoint** for credential gating
- **CI trigger endpoint** for GitHub Actions dispatch
- **CI status endpoint** for tracking build progress
- **Artifact attach endpoint** for manual artifact attachment
- **CI callback endpoint** for receiving build status updates from GitHub Actions
- **GitHub Actions workflow** with callback notifications

---

## 1) GET /api/mobile/publish/capabilities

Shows publish capabilities per target with credential requirements and CI configuration status.

```json
{
  "capabilities": {
    "expo": {
      "name": "Expo (EAS Build)",
      "localSupported": true,
      "ciSupported": true,
      "requiredCredentials": {
        "android": ["expo_token"],
        "ios": ["expo_token", "apple_api_key"],
        "both": ["expo_token", "apple_api_key"]
      },
      "ciRequiredSecrets": ["EXPO_TOKEN"]
    },
    "flutter": {
      "name": "Flutter (Native Build)",
      "localSupported": false,
      "ciSupported": true,
      "requiredCredentials": {
        "android": ["android_keystore"],
        "ios": ["apple_cert", "apple_api_key"]
      },
      "ciRequiredSecrets": ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]
    },
    "flutterflow": {
      "name": "FlutterFlow",
      "localSupported": true,
      "ciSupported": true,
      "readyFor": { "android": true, "ios": true, "both": true },
      "note": "Mode A generates publish instructions. Mode B requires Flutter SDK in CI."
    }
  },
  "ciEnvironment": {
    "configured": false,
    "provider": "github_actions",
    "missingEnvVars": ["GITHUB_TOKEN", "GITHUB_REPO"],
    "callbackConfigured": false,
    "callbackMissingVars": ["CI_CALLBACK_TOKEN"],
    "requiredGitHubSecrets": ["API_BASE_URL", "CI_CALLBACK_TOKEN"],
    "workflowPath": ".github/workflows/mobile-publish.yml"
  }
}
```

---

## 2) POST /api/mobile/publish/jobs/:id/trigger-ci

Triggers GitHub Actions workflow for a job. Returns setup instructions when not configured.

### Response (CI not configured):
```json
{
  "error": "CI not configured",
  "missingEnvVars": ["GITHUB_TOKEN", "GITHUB_REPO"],
  "requiredGitHubSecrets": ["EXPO_TOKEN"],
  "setupInstructions": {
    "step1": "Create a GitHub Personal Access Token with repo and workflow permissions",
    "step2": "Set GITHUB_TOKEN environment variable in Replit Secrets",
    "step3": "Set GITHUB_REPO to your repo in format \"owner/repo\"",
    "step4": "Add required secrets to GitHub repo settings: EXPO_TOKEN",
    "step5": "Ensure .github/workflows/mobile-publish.yml exists in your repo"
  }
}
```

---

## 3) GET /api/mobile/publish/jobs/:id/ci

Returns CI status for a job.

```json
{
  "jobId": "46944aba-2eae-4fcd-b251-0ce7b2751b30",
  "ciStatus": "not_configured",
  "runMode": "local",
  "message": "This job is running in local mode. Use /trigger-ci to switch to CI mode."
}
```

---

## 4) POST /api/mobile/publish/jobs/:id/artifacts/attach

Attaches artifact to job with `simulated: false` for real artifacts.

```json
{
  "artifactId": "6c23cfa4-e2f9-498c-bb48-7f920e68d16a",
  "jobId": "46944aba-2eae-4fcd-b251-0ce7b2751b30",
  "kind": "eas_build_url",
  "url": "https://expo.dev/accounts/test/projects/app/builds/real-build-id",
  "simulated": false,
  "createdAt": "2026-01-30T22:46:15.185Z"
}
```

---

## 5) POST /api/mobile/publish/jobs/:id/ci/callback (NEW)

Receives build status updates from GitHub Actions. Uses token-based auth instead of user auth.

### Request (from GitHub Actions):
```json
{
  "status": "completed",
  "runId": "12345678",
  "runUrl": "https://github.com/owner/repo/actions/runs/12345678",
  "artifactsUrl": "https://github.com/owner/repo/actions/runs/12345678/artifacts"
}
```

### Response (success):
```json
{
  "success": true,
  "jobId": "46944aba-2eae-4fcd-b251-0ce7b2751b30",
  "status": "completed",
  "message": "Job status updated from CI"
}
```

### Response (CI_CALLBACK_TOKEN not configured):
```json
{
  "error": "CI callback not configured (missing CI_CALLBACK_TOKEN)"
}
```

---

## 6) GitHub Actions Workflow

### File: `.github/workflows/mobile-publish.yml`

Features:
- Expo EAS Build support (Android/iOS)
- Flutter native build support (Android AAB/APK)
- Artifact upload to GitHub
- **Callback notifications** to API on success/failure

### Callback Steps (per job):
```yaml
- name: Notify API - Build Success
  if: success()
  run: |
    curl -X POST "${{ secrets.API_BASE_URL }}/api/mobile/publish/jobs/$JOB_ID/ci/callback" \
      -H "Content-Type: application/json" \
      -H "X-CI-Token: ${{ secrets.CI_CALLBACK_TOKEN }}" \
      -d '{
        "status": "completed",
        "runId": "${{ github.run_id }}",
        "runUrl": "https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"
      }'

- name: Notify API - Build Failed
  if: failure()
  run: |
    curl -X POST "${{ secrets.API_BASE_URL }}/api/mobile/publish/jobs/$JOB_ID/ci/callback" \
      -H "Content-Type: application/json" \
      -H "X-CI-Token: ${{ secrets.CI_CALLBACK_TOKEN }}" \
      -d '{
        "status": "failed",
        "error": "Build failed - check GitHub Actions logs"
      }'
```

---

## 7) Security Verification

All authenticated endpoints have proper security:

| Endpoint | Rate Limiter | RBAC | Audit Log |
|----------|--------------|------|-----------|
| `/capabilities` | mobilePublishJobsListLimiter (120/5min) | requireRole('admin') | N/A (read-only) |
| `/trigger-ci` | mobilePublishStartLimiter (10/hr) | requireRole('admin') | ✅ MOBILE_PUBLISH_CI_TRIGGERED |
| `/ci` | mobilePublishJobsListLimiter (120/5min) | requireRole('admin') | N/A (read-only) |
| `/artifacts/attach` | mobilePublishStartLimiter (10/hr) | requireRole('admin') | ✅ MOBILE_PUBLISH_ARTIFACT_ATTACHED |
| `/ci/callback` | apiLimiter (global) | X-CI-Token validation | ✅ MOBILE_PUBLISH_CI_CALLBACK |

---

## 8) Regression Tests

### smoke.sh
```
✓ API Health (HTTP 200)
✓ API Ready (HTTP 200)
✓ Web Homepage (HTTP 200)
✓ Web Login (HTTP 200)
✓ SMOKE TEST PASSED
```

---

## 9) MISSING SECRETS CHECKLIST

To enable REAL CI builds, configure:

### Replit Secrets (Environment Variables)
| Variable | Purpose | Status |
|----------|---------|--------|
| `GITHUB_TOKEN` | GitHub PAT with `repo` and `workflow` scopes | ❌ Missing |
| `GITHUB_REPO` | Repository in format `owner/repo` | ❌ Missing |
| `CI_CALLBACK_TOKEN` | Shared secret for callback authentication | ❌ Missing |

### GitHub Repository Secrets
| Secret | Purpose | Status |
|--------|---------|--------|
| `EXPO_TOKEN` | Expo EAS access token | ❌ Not verified |
| `API_BASE_URL` | This Repl's deployment URL | ❌ Not verified |
| `CI_CALLBACK_TOKEN` | Same token as Replit secret | ❌ Not verified |
| `ANDROID_KEYSTORE_BASE64` | Keystore for Flutter Android | ❌ Not verified |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password | ❌ Not verified |
| `ANDROID_KEY_ALIAS` | Key alias | ❌ Not verified |
| `ANDROID_KEY_PASSWORD` | Key password | ❌ Not verified |

---

## 10) Files Modified in Step 30

1. `apps/api/prisma/schema.prisma` - CI tracking fields
2. `apps/api/src/routes/mobile.ts` - 5 new endpoints
3. `apps/api/src/index.ts` - CI callback route (bypasses auth)
4. `.github/workflows/mobile-publish.yml` - GitHub Actions workflow with callbacks
5. `apps/web/src/app/dashboard/mobile/publish/page.tsx` - UI updates

---

## CONCLUSION

Step 30 implementation is **COMPLETE**:

- ✅ Capabilities endpoint with credential gating
- ✅ CI trigger endpoint with setup instructions
- ✅ CI status endpoint
- ✅ Artifact attach endpoint
- ✅ CI callback endpoint (token-authenticated)
- ✅ GitHub Actions workflow with callback notifications
- ✅ All endpoints have proper RBAC/rate limiting/audit logging
- ✅ UI updates for capabilities and CI mode

**BLOCKED for real proof:**
- ❌ Missing `GITHUB_TOKEN`, `GITHUB_REPO`, `CI_CALLBACK_TOKEN` secrets
- ❌ Workflow not pushed to a real GitHub repository

When secrets are configured, the full CI workflow will:
1. User triggers CI build via UI
2. API dispatches GitHub Actions workflow
3. GitHub Actions builds the app
4. GitHub Actions calls back to API with status
5. Job status and artifacts are updated automatically
