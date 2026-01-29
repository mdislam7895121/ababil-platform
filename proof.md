# Digital Platform Factory - Implementation Proof

---

# STEP 2: Live Preview with Shareable Demo Links - Acceptance Proof

## Pages/Routes Added

| Route | Description |
|-------|-------------|
| `/dashboard/preview` | Preview management page (create, list, revoke sessions) |
| `/preview/[token]` | Public preview page (no auth required) |
| `/api/preview/create` | POST - Create preview session (auth required, owner/admin) |
| `/api/preview/validate` | GET - Validate token (PUBLIC, no auth) |
| `/api/preview/demo-data` | GET - Get demo data (PUBLIC, no auth) |
| `/api/preview/sessions` | GET - List sessions (auth required) |
| `/api/preview/revoke/:id` | POST - Revoke session (auth required) |

## APIs Triggered During Test

1. **POST /api/preview/create**
   - Input: `{"role":"admin"}`
   - Output: `{"ok":true,"previewUrl":"/preview?token=...","token":"...","role":"admin","expiresAt":"..."}`

2. **GET /api/preview/validate?token=X** (PUBLIC)
   - Output: `{"valid":true,"role":"admin","tenantId":"...","tenantName":"Preview Org","expiresAt":"...","hoursRemaining":24,"isDemo":true,"restrictions":{...}}`

3. **GET /api/preview/demo-data?token=X** (PUBLIC)
   - Output: `{"data":{"users":[...],"stats":{...},"recentActivity":[...]},"isDemo":true,"role":"admin"}`

4. **GET /api/preview/sessions**
   - Output: `{"sessions":[{"id":"...","status":"active","hoursRemaining":24,...}],"total":2,"active":1}`

5. **POST /api/preview/revoke/:id**
   - Output: `{"ok":true}`

6. **GET /api/preview/validate (after revoke)**
   - Output: `{"error":"Preview session has been revoked","code":"REVOKED"}`

## Preview Security Rules

- **Token-based access**: 64-character hex token required
- **24-hour expiry**: Sessions automatically expire
- **Revocable**: Admins can revoke at any time
- **Read-only mode**: All write operations blocked
- **No external actions**: Email, SMS, payments disabled
- **Demo data only**: All data clearly marked as "Demo"
- **RBAC enforced**: Only owner/admin can create/revoke previews

## Expiry + Revocation Behavior

| Status | Condition | Behavior |
|--------|-----------|----------|
| Active | Valid token, not expired, not revoked | Preview accessible |
| Expired | Token valid but past expiresAt | Returns 410 with code "EXPIRED" |
| Revoked | Token valid but revoked=true | Returns 410 with code "REVOKED" |

## Audit Logging

- `PREVIEW_SESSION_CREATED` - When preview is created
- `PREVIEW_VIEWED` - When public preview is accessed
- `PREVIEW_REVOKED` - When preview is revoked

## E2E Test Results

✅ Create preview session (owner/admin only)
✅ Public preview page with DEMO banner
✅ Expiry countdown visible
✅ Demo data displayed with "Sample Data" badges
✅ Session list with active/expired/revoked status
✅ Revoke functionality working
✅ Revoked previews show proper error message

---
**Status: STEP 2 CLOSED**

---

# STEP 1: Question-Based Onboarding - Acceptance Proof

## Pages/Routes Added

| Route | Description |
|-------|-------------|
| `/dashboard/onboarding` | 7-step mobile-first onboarding wizard |
| `/api/onboarding/business-types` | GET - Returns available business types (salon, clinic, courier) |
| `/api/onboarding/draft` | POST - Converts answers to internal prompt, creates builder draft |

## APIs Triggered During Test

1. **GET /api/onboarding/business-types**
   - Returns: `[{"key":"salon","label":"Hair Salon / Beauty",...}, {"key":"clinic",...}, {"key":"courier",...}]`

2. **POST /api/onboarding/draft**
   - Input: `{"businessType":"salon","businessName":"Style Studio","city":"New York","staffCount":"2-5","needsPayment":true,"notifications":["email","sms"],"workingHours":"10-8"}`
   - Output: `{"builderRequestId":"...","blueprintId":"...","blueprint":{...},"summary":"Template: Booking Business\nModules to enable: booking, analytics\nRecommended connectors: email, push, stripe"}`

3. **POST /api/builder/approve**
   - Input: `{"builderRequestId":"..."}`
   - Output: `{"ok":true}`

4. **POST /api/builder/run**
   - Input: `{"builderRequestId":"..."}`
   - Output: `{"buildRunId":"...","status":"done","output":{"success":true,"templateKey":"booking_business","enabledModules":["booking","analytics"],...}}`

## Raw Prompt NOT Exposed to Users

**Confirmed**: The internal prompt is generated server-side in `apps/api/src/routes/onboarding.ts`:

```typescript
// Internal prompt generation - never sent to client
const internalPrompt = `
  Business Type: ${businessType}
  Business Name: ${sanitize(businessName)}
  City: ${sanitize(city)}
  Staff Count: ${staffCount}
  Needs Payment: ${needsPayment ? 'Yes' : 'No'}
  Notifications: ${notifications.join(', ')}
  Working Hours: ${workingHours}
`.trim();
```

The frontend only sees:
- Simple question forms (radio buttons, checkboxes, text inputs)
- Blueprint summary (template name, modules list, connectors)
- No prompt text is visible in the UI

## RBAC Enforcement

- **owner/admin**: Can see "Approve & Build" button, can execute build
- **staff/viewer**: See message "Contact admin to build" - cannot execute build

## Test Results

✅ Business types endpoint returns 3 options  
✅ Draft endpoint creates blueprint from answers  
✅ Approve endpoint marks draft as approved  
✅ Run endpoint executes build successfully  
✅ No raw prompt visible to users  
✅ RBAC properly restricts build actions  

---
**Status: STEP 1 CLOSED**
