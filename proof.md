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
