# Digital Platform Factory - Implementation Proof

---

# STEP 3: Paid Gate for Go-Live - Acceptance Proof

## Payment Model

| Plan | Price | Live Apps | Features |
|------|-------|-----------|----------|
| Free | $0/mo | 0 | Unlimited Build & Preview, Cost Estimates |
| Pro | $39/mo | 1 | Full Platform Access, Email Support |
| Business | $99/mo | 5 | Priority Support, Custom Branding, API Access |

## Pages/Routes Added

| Route | Description |
|-------|-------------|
| `/dashboard/deploy` (updated) | Deploy Wizard with Paywall modal |
| `/api/billing/plans` | GET - Returns available plans (PUBLIC) |
| `/api/billing/status` | GET - Returns subscription status |
| `/api/billing/checkout` | POST - Creates Stripe checkout session |
| `/api/billing/simulate-payment` | POST - Simulates payment for testing |
| `/api/billing/webhook` | POST - Handles Stripe webhooks |

## Database Schema Added

```prisma
model Subscription {
  id                   String    @id @default(uuid())
  tenantId             String    @unique @map("tenant_id")
  stripeCustomerId     String?   @unique @map("stripe_customer_id")
  stripeSubscriptionId String?   @unique @map("stripe_subscription_id")
  plan                 String    @default("free") // free|pro|business
  status               String    @default("inactive") // inactive|active|past_due|canceled
  liveAppsLimit        Int       @default(0) @map("live_apps_limit")
  liveAppsUsed         Int       @default(0) @map("live_apps_used")
  currentPeriodStart   DateTime? @map("current_period_start")
  currentPeriodEnd     DateTime? @map("current_period_end")
  canceledAt           DateTime? @map("canceled_at")
  // ... timestamps
}
```

## APIs Triggered During Test

1. **GET /api/billing/plans** (PUBLIC)
   - Output: `{"plans":[{"key":"free","name":"Free","priceMonthly":0,...},{"key":"pro","name":"Pro","priceMonthly":39,"liveAppsLimit":1,...},{"key":"business","name":"Business","priceMonthly":99,"liveAppsLimit":5,...}]}`

2. **GET /api/billing/status** (before payment)
   - Output: `{"plan":"free","status":"inactive","canGoLive":false,"liveAppsLimit":0,"liveAppsUsed":0,"message":"Subscribe to unlock Go-Live"}`

3. **POST /api/deploy/go-live** (without subscription)
   - Returns 402: `{"error":"Subscription required","code":"SUBSCRIPTION_REQUIRED","message":"Go Live requires an active subscription. Subscribe to Pro ($39/mo) or Business ($99/mo) to unlock.","guidance":"Please subscribe to a paid plan to go live with your platform."}`

4. **POST /api/billing/simulate-payment**
   - Input: `{"planId":"pro"}`
   - Output: `{"ok":true,"plan":"pro","status":"active","liveAppsLimit":1,"message":"Subscription activated! You can now go live with 1 app(s)."}`

5. **GET /api/billing/status** (after payment)
   - Output: `{"plan":"pro","status":"active","canGoLive":true,"liveAppsLimit":1,"liveAppsUsed":0,"currentPeriodEnd":"2026-03-01T...","message":"Ready to Go Live"}`

## Gating Logic

1. User completes Deploy Wizard steps 1-5 (config, verification)
2. User clicks "Go Live" button
3. Backend checks subscription status:
   - If `status !== 'active'` → Returns 402 with SUBSCRIPTION_REQUIRED
   - If `liveAppsUsed >= liveAppsLimit` → Returns 402 with LIMIT_REACHED
   - If valid → Proceeds with Go Live
4. Frontend catches 402 error and displays Paywall modal
5. User selects plan and subscribes
6. On success, subscription becomes active
7. User can now click "Go Live" successfully

## Paywall UI Features

- Modal overlay with plan comparison
- Pro ($39/mo) and Business ($99/mo) options
- Feature list for each plan
- "Subscribe & Go Live" button
- Clear messaging: "Build and preview for free, subscribe to go live"

## RBAC Enforcement

- **owner/admin**: Can view billing status, create checkout, subscribe
- **staff/viewer**: Can view billing status only (see "Ask admin to go live")

## Audit Logging

- `CHECKOUT_INITIATED` - When checkout session is created
- `SUBSCRIPTION_STARTED` - When subscription becomes active
- `SUBSCRIPTION_CANCELED` - When subscription is canceled
- `GO_LIVE_UNLOCKED` - When Go Live is successful after payment

## Webhook Events Handled

- `checkout.session.completed` - Activates subscription
- `customer.subscription.updated` - Updates subscription status
- `customer.subscription.deleted` - Marks subscription as canceled

## Security

- Stripe API key stored as secret (STRIPE_SECRET_KEY)
- Webhook signature verification required (STRIPE_WEBHOOK_SECRET)
- Idempotent webhook handling
- No Stripe keys exposed to frontend

## Test Results

✅ Plans endpoint returns 3 pricing tiers
✅ Billing status shows free/inactive by default
✅ Go-Live returns 402 without active subscription
✅ Simulate payment activates subscription
✅ Billing status shows active after payment
✅ Deploy Wizard page loads with Step navigation
✅ Paywall modal integrated in frontend

---
**Status: STEP 3 CLOSED**

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
   - Output: `{"ok":true,"previewUrl":"/preview/{token}","token":"...","role":"admin","expiresAt":"..."}`

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
