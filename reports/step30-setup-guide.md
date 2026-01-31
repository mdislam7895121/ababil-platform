# STEP 30 — CI Setup Guide (Owner Actions Required)

## Overview
This guide provides the exact steps to configure real CI builds for mobile app publishing.

---

## DELIVERABLE 1: Exact Setup Instructions

### A) GitHub Repository Secrets (Settings → Secrets and variables → Actions → Secrets)

Navigate to: `https://github.com/<owner>/<repo>/settings/secrets/actions`

Add these repository secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `EXPO_TOKEN` | Your Expo access token | Get from: https://expo.dev/accounts/[username]/settings/access-tokens |
| `API_BASE_URL` | `https://your-repl-name.your-username.repl.co` | Your Replit deployment URL |
| `CI_CALLBACK_TOKEN` | Random 32+ character string | Must match server env var (see below) |

### B) Server/Backend Environment Variables (Replit Secrets Tab)

Open Replit → Tools → Secrets, add:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `GITHUB_TOKEN` | Your GitHub PAT | Personal Access Token (see scope requirements below) |
| `GITHUB_REPO` | `owner/repo` | Format: `your-github-username/your-repo-name` |
| `CI_CALLBACK_TOKEN` | Same value as GitHub secret | Must match exactly |

### C) GitHub Personal Access Token (PAT) Requirements

Create a PAT at: https://github.com/settings/tokens

**Minimum Required Scopes:**
- `repo` - Full control of private repositories
- `workflow` - Update GitHub Action workflows

**Steps:**
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Name: "Replit Mobile CI"
4. Select scopes: `repo` (all), `workflow`
5. Generate token and copy immediately
6. Add to Replit Secrets as `GITHUB_TOKEN`

---

## DELIVERABLE 2: Generate CI_CALLBACK_TOKEN Safely

**Do NOT share the generated token publicly. Generate your own unique value.**

### Linux/Mac:
```bash
openssl rand -hex 32
```

### PowerShell (Windows):
```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

### Node.js:
```javascript
require('crypto').randomBytes(32).toString('hex')
```

Copy the output and use it for **both**:
1. GitHub Actions secret: `CI_CALLBACK_TOKEN`
2. Replit environment variable: `CI_CALLBACK_TOKEN`

---

## DELIVERABLE 3: Run Real CI Build and Collect Proof

After secrets are configured, run these commands:

### 1) Verify Capabilities Endpoint (CI should show configured)

```bash
TENANT_ID="<YOUR_TENANT_ID>"
TOKEN="<YOUR_ADMIN_JWT_TOKEN>"

curl -s "https://<API_BASE_URL>/api/mobile/publish/capabilities" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" | jq '.ciEnvironment'
```

**Expected output when configured:**
```json
{
  "configured": true,
  "provider": "github_actions",
  "missingEnvVars": [],
  "callbackConfigured": true,
  "callbackMissingVars": []
}
```

### 2) Create a Publish Job and Trigger CI

```bash
# Create a new job
JOB=$(curl -s -X POST "https://<API_BASE_URL>/api/mobile/publish/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"target":"expo","platform":"android","stage":"build","channel":"preview"}')
echo "$JOB" | jq .
JOB_ID=$(echo "$JOB" | jq -r '.id')

# Trigger CI for the job
curl -s -X POST "https://<API_BASE_URL>/api/mobile/publish/jobs/$JOB_ID/trigger-ci" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" | jq .
```

### 3) Poll CI Status

```bash
curl -s "https://<API_BASE_URL>/api/mobile/publish/jobs/$JOB_ID/ci" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" | jq .
```

### 4) Attach Artifacts (if from GitHub)

```bash
curl -s -X POST "https://<API_BASE_URL>/api/mobile/publish/jobs/$JOB_ID/artifacts/attach" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "eas_build_url",
    "url": "https://expo.dev/accounts/YOUR_ACCOUNT/projects/YOUR_PROJECT/builds/BUILD_ID",
    "metadata": {"note": "real EAS build"}
  }' | jq .
```

---

## Proof Requirements Checklist

After running CI, collect:

- [ ] GitHub Actions run URL (e.g., `https://github.com/owner/repo/actions/runs/12345678`)
- [ ] Workflow log excerpt showing real build command:
  - Expo: `eas build --platform android --non-interactive`
  - Flutter: `flutter build appbundle`
- [ ] API job status showing `status: "completed"` with `simulated: false` artifacts
- [ ] EAS build URL or GitHub artifact download URL

---

## Current Blockers

If CI cannot run, check:

1. **GITHUB_TOKEN** - Does the PAT have `repo` + `workflow` scopes?
2. **GITHUB_REPO** - Is format correct (`owner/repo`)?
3. **CI_CALLBACK_TOKEN** - Do both values match exactly?
4. **Workflow file** - Is `.github/workflows/mobile-publish.yml` pushed to the repo?
5. **Expo credentials** - Is `expo_token` stored in the platform?

---

## Next Steps

Once proof is collected:
1. Update `reports/step30-proof.md` with raw outputs
2. Run `./scripts/smoke.sh` and include output
3. Run `./scripts/verify.sh | tail -40` and include output
4. Record git commit hash
