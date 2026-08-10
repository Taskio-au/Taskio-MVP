# Tradie Quote Eligibility Testing Checklist

> **Historical manual QA checklist — not evidence of a deployed backend or current launch approval.**
>
> Use this document for local manual regression of quote eligibility. Instructions that mention localhost:8000 / localhost:3000 describe a local test setup only; they do not mean the Express API or frontend is hosted in production.
>
> Product wording today is **Client / Expert**. This checklist retains legacy **tradie / homeowner** identifiers where they match historical APIs, roles, and Firestore fields. Current automated tests and the Taskio tracker take precedence over this guide as a status document.
## Overview
This document provides comprehensive manual testing scenarios for the Tradie Quote Eligibility system (historical snapshot).

---

## Test Environment Setup

### Prerequisites
1. Backend server running on `localhost:8000`
2. Frontend dev server running on `localhost:3000`
3. Firebase Auth, Firestore, and Storage properly configured
4. At least 2 test accounts:
   - **Homeowner account** (email verified)
   - **Tradie account** (can be incomplete for testing)

### Test Data Requirements
- At least 1 posted job with status `OPEN` or `QUOTED`
- The tradie must be invited to the job (`invitedTradieUids` array in job doc)

---

## 1. Profile Completion Score Tests

### 1.1 Complete Profile (100% score)
**Setup:**
- Tradie profile with all required fields:
  - `displayName` or `fullName` or `name`
  - `profilePhotoURL` or `photoURL`
  - `bio` with ≥ 20 characters
  - `phoneNumber` or `phone`
  - `abn`
  - `emailVerified: true` (in Auth or in doc)
  - `role: "tradie"`
  - `status: "active"` (or undefined)
  - `canQuote: true` (or undefined)

**Expected:**
- ✅ Eligibility panel should NOT appear
- ✅ Quote form should be enabled
- ✅ "Generate Quote Draft" AI button should be enabled
- ✅ Quote submission should succeed

---

### 1.2 Missing Email Verification (80% score)
**Setup:**
- Complete profile EXCEPT `emailVerified` is false

**Expected:**
- ❌ Eligibility panel appears
- ❌ Progress bar shows 80%
- ❌ "Verified email address" shows ✗ (red cross)
- ❌ Quote form inputs disabled
- ❌ Submit button disabled with tooltip "Complete your profile to submit quotes"
- ❌ AI button disabled with tooltip "Complete your profile to use AI assistant"
- ✅ "Complete Profile" button links to `/profile`

---

### 1.3 Missing Display Name (80% score)
**Setup:**
- Complete profile EXCEPT no `displayName`, `name`, or `fullName`

**Expected:**
- ❌ Eligibility panel appears
- ❌ Progress bar shows 80%
- ❌ "Full name" shows ✗ (red cross)
- ❌ Quote submission disabled

---

### 1.4 Missing Profile Photo (80% score)
**Setup:**
- Complete profile EXCEPT no `profilePhotoURL` or `photoURL`

**Expected:**
- ❌ Eligibility panel appears
- ❌ "Profile photo" shows ✗
- ❌ Quote submission disabled

---

### 1.5 Missing or Short Bio (80% score)
**Setup:**
- Complete profile EXCEPT:
  - `bio` is missing, OR
  - `bio` exists but < 20 characters

**Expected:**
- ❌ Eligibility panel appears
- ❌ "Bio (min. 20 characters)" shows ✗
- ❌ Quote submission disabled

---

### 1.6 Missing Phone (80% score)
**Setup:**
- Complete profile EXCEPT no `phoneNumber` or `phone`

**Expected:**
- ❌ Eligibility panel appears
- ❌ "Phone number" shows ✗
- ❌ Quote submission disabled

---

### 1.7 Missing ABN (80% score)
**Setup:**
- Complete profile EXCEPT no `abn`

**Expected:**
- ❌ Eligibility panel appears
- ❌ "ABN" shows ✗
- ❌ Quote submission disabled

---

### 1.8 Multiple Missing Fields (0-80% score)
**Setup:**
- Tradie account with only `role: "tradie"` and `emailVerified: true`
- Missing: name, photo, bio, phone, abn

**Expected:**
- ❌ Eligibility panel appears
- ❌ Progress bar shows 20% (only email verified)
- ❌ All 6 checklist items show ✗ except email (✓)
- ❌ Quote form fully disabled

---

## 2. Account Status Tests

### 2.1 Suspended Account
**Setup:**
- Complete profile BUT `status: "suspended"`

**Expected:**
- ❌ Backend `/api/tradie/eligibility` returns `eligible: false, reason: "account_suspended"`
- ❌ Eligibility panel appears with message about account suspension
- ❌ Quote submission blocked at API level with 403 error
- ❌ Error message: "Your account is suspended. Please contact support."

---

### 2.2 Quote Permission Revoked
**Setup:**
- Complete profile BUT `canQuote: false`

**Expected:**
- ❌ Backend returns `eligible: false, reason: "quote_permission_revoked"`
- ❌ Eligibility panel appears
- ❌ Quote submission blocked at API level with 403 error
- ❌ Error message: "Quote permission revoked. Please contact support."

---

### 2.3 Not a Tradie Role
**Setup:**
- Complete profile BUT `role: "homeowner"` or `role` missing

**Expected:**
- ❌ Backend returns `eligible: false, reason: "not_tradie"`
- ❌ Error message: "Only tradies can submit quotes."

---

## 3. Quote Submission Rules Tests

### 3.1 First Quote (No Existing Quote)
**Setup:**
- Eligible tradie
- Job status `OPEN` or `QUOTED`
- No existing quote from this tradie

**Expected:**
- ✅ Quote form enabled
- ✅ Quote submission succeeds (201)
- ✅ Backend creates quote with `status: "submitted"`, `version: 1`
- ✅ Job status transitions from `OPEN` → `QUOTED` if first quote

**API Request:**
```http
POST /api/jobs/:jobId/quotes
Authorization: Bearer <tradie-token>
Content-Type: application/json

{
  "amount": 450,
  "message": "I can complete this job..."
}
```

**Expected Response:**
```json
{
  "message": "Quote submitted successfully",
  "quoteId": "...",
  "flagged": false
}
```

---

### 3.2 Duplicate Quote (Already Submitted)
**Setup:**
- Eligible tradie
- Tradie already has an ACTIVE quote with `status: "submitted"`

**Expected:**
- ✅ Frontend shows "Quote submitted" banner with amount and message
- ✅ "Withdraw quote" button visible
- ✅ Quote form hidden (no re-submission UI)
- ❌ Attempting to submit another quote via API returns 409
- ❌ Error message: "You have already submitted a quote for this job."

---

### 3.3 Withdraw Quote
**Setup:**
- Tradie has an active submitted quote

**Action:**
1. Click "Withdraw quote" button

**Expected:**
- ✅ Button shows "Withdrawing…" during request
- ✅ API `POST /api/quotes/:quoteId/withdraw` succeeds (200)
- ✅ Quote status updated to `"withdrawn"`, `withdrawnAt` set
- ✅ Success message: "Quote withdrawn. You can submit a new quote for this job."
- ✅ Quote form reappears, allowing new quote submission
- ✅ Job remains `QUOTED` status

---

### 3.4 Homeowner Requests Revision
**Setup:**
- Homeowner logged in
- Viewing job with tradie's submitted quote
- Job status `OPEN` or `QUOTED` (not yet accepted)

**Action (Homeowner):**
1. Click "Request Revision" button on quote card
2. Enter optional message in prompt dialog
3. Submit request

**Expected:**
- ✅ API `POST /api/jobs/:jobId/quotes/:tradieId/request-revision` succeeds (200)
- ✅ Firestore: `jobs/{jobId}/quote_revision_requests/{tradieUid}` doc created:
  ```javascript
  {
    status: 'open',
    message: '...',
    requestedAt: serverTimestamp(),
    requestedBy: homeownerUid,
    updatedAt: serverTimestamp()
  }
  ```
- ✅ Homeowner sees "Revision requested" pill on quote card
- ✅ Tradie sees orange revision banner: "Homeowner requested a revised quote"
- ✅ Tradie quote form re-enabled with title "Submit a revised quote"

---

### 3.5 Tradie Submits Revised Quote
**Setup:**
- Tradie has an active quote
- Homeowner has requested revision (open revision request exists)

**Action (Tradie):**
1. Modify amount and/or message
2. Click "Submit Revised Quote"

**Expected:**
- ✅ API `POST /api/jobs/:jobId/quotes` succeeds (201)
- ✅ Backend transaction:
  - Previous quote status → `"superseded"`
  - Revision request status → `"fulfilled"`, `fulfilledAt` set
  - New quote created: `version: 2` (or prev version + 1), `status: "submitted"`, `revisedFromQuoteId` set
- ✅ Tradie sees success message
- ✅ Tradie's quote form hidden again (shows new active quote)
- ✅ Homeowner sees updated quote amount/message

---

## 4. PII Detection & Flagging Tests

### 4.1 Quote with Email Address
**Setup:**
- Eligible tradie submitting quote

**Action:**
Submit quote with message:
```
"Contact me at john@example.com for faster response."
```

**Expected:**
- ⚠️ Backend detects email pattern
- ⚠️ Quote created with `flagged: true`, `flagReasons: ["email"]`
- ✅ API response includes `flagged: true`
- ✅ Quote is still submitted (not rejected)
- ✅ Homeowner can see the quote
- ⚠️ Admin monitoring should flag this quote

---

### 4.2 Quote with Phone Number
**Setup:**
- Eligible tradie submitting quote

**Action:**
Submit quote with message:
```
"Call me on 0412 345 678 to discuss."
```

**Expected:**
- ⚠️ Backend detects phone pattern (AU mobile)
- ⚠️ Quote created with `flagged: true`, `flagReasons: ["phone"]`

---

### 4.3 Quote with Off-Platform Keywords
**Setup:**
- Eligible tradie submitting quote

**Test Cases:**
- "Let's chat on WhatsApp"
- "Text me directly"
- "We can do this cash job"
- "Bank transfer available"

**Expected:**
- ⚠️ Backend detects off-platform hint
- ⚠️ Quote created with `flagged: true`, `flagReasons: ["off_platform_hint"]`

---

### 4.4 Quote with Multiple PII Patterns
**Setup:**
- Eligible tradie submitting quote

**Action:**
Submit quote with message:
```
"Email me at john@test.com or call 0412345678. Cash payment OK."
```

**Expected:**
- ⚠️ Backend detects multiple patterns
- ⚠️ Quote created with `flagged: true`, `flagReasons: ["email", "phone", "off_platform_hint"]`

---

### 4.5 Clean Quote (No PII)
**Setup:**
- Eligible tradie submitting quote

**Action:**
Submit quote with clean message:
```
"I can complete this work within 2 weeks. All materials included. Happy to discuss details through Taskio chat."
```

**Expected:**
- ✅ Backend detects no PII
- ✅ Quote created with `flagged: false`, `flagReasons: []`

---

## 5. Stripe Onboarding Integration Tests

### 5.1 Stripe Enabled + Onboarding Incomplete
**Setup:**
- Backend `STRIPE_ENABLED=true`
- Eligible tradie profile
- `stripeOnboardingStatus !== "completed"` in tradie user doc

**Expected:**
- ⚠️ Blue "Stripe onboarding required" banner appears above AI box
- ❌ AI button disabled
- ❌ Quote form disabled
- ❌ "Complete Stripe onboarding" button visible
- ❌ Quote submission blocked at API level with 403
- ❌ Error message: "Stripe onboarding required. Please complete your Stripe onboarding before submitting quotes."

---

### 5.2 Stripe Enabled + Onboarding Complete
**Setup:**
- Backend `STRIPE_ENABLED=true`
- Eligible tradie profile
- `stripeOnboardingStatus: "completed"` in tradie user doc

**Expected:**
- ✅ No Stripe warning banner
- ✅ Quote form fully enabled
- ✅ Quote submission succeeds

---

### 5.3 Stripe Disabled
**Setup:**
- Backend `STRIPE_ENABLED=false` or not set

**Expected:**
- ✅ No Stripe checks performed
- ✅ Quote submission succeeds without Stripe onboarding

---

## 6. Edge Cases & Error Handling

### 6.1 Eligibility Endpoint Failure
**Setup:**
- Backend `/api/tradie/eligibility` returns 500 error

**Expected:**
- ✅ Frontend catches error gracefully
- ✅ Defaults to `eligible: true` to avoid blocking if endpoint fails
- ⚠️ Console logs error for debugging

---

### 6.2 Invalid Job Status
**Setup:**
- Job status is `ASSIGNED`, `FUNDED`, `COMPLETED`, etc. (not `OPEN` or `QUOTED`)

**Expected:**
- ❌ Quote submission blocked at API level with 400
- ❌ Error message: "Cannot submit quote for job with status: ASSIGNED"

---

### 6.3 Not Invited to Job
**Setup:**
- Tradie is NOT in `job.invitedTradieUids` array

**Expected:**
- ❌ Tradie cannot access job detail page (403 from `/api/tradie/jobs/:jobId`)
- ❌ Quote submission blocked with 403
- ❌ Error message: "Forbidden: You are not invited to quote on this job."

---

### 6.4 Invalid Quote Amount
**Test Cases:**
- Amount = 0
- Amount = negative
- Amount > $50,000,000 (amountCents > 5,000,000,000)
- Amount = NaN or non-numeric

**Expected:**
- ❌ Backend validation rejects with 400
- ❌ Error message: "Invalid quote amount."

---

### 6.5 Empty or Too Long Quote Message
**Test Cases:**
- Message = empty string
- Message > 2000 characters

**Expected:**
- ❌ Backend validation rejects with 400
- ❌ Error message: "Invalid quote data. Please provide a positive amount and a message."

---

## 7. UI/UX Tests

### 7.1 Profile Completion CTA Navigation
**Setup:**
- Ineligible tradie viewing job detail

**Action:**
1. Click "Complete Profile" button in eligibility panel

**Expected:**
- ✅ Navigates to `/profile` page
- ✅ Profile page loads
- ✅ Tradie can edit missing fields

---

### 7.2 Progress Bar Visual Accuracy
**Test Cases:**
- 0% (all missing) → progress bar empty
- 20% (email only) → progress bar 1/5 filled
- 40% → progress bar 2/5 filled
- 60% → progress bar 3/5 filled
- 80% → progress bar 4/5 filled
- 100% → no eligibility panel shown

**Expected:**
- ✅ Progress bar fill width matches score percentage
- ✅ Color: teal (#14C5C5)

---

### 7.3 Checklist Item Visual States
**Setup:**
- Partially complete profile

**Expected:**
- ✅ Completed items: green ✓, grey text with strikethrough
- ❌ Missing items: red ✗, black bold text

---

### 7.4 Button Disabled States & Tooltips
**Setup:**
- Ineligible tradie

**Expected:**
- ✅ AI button: `opacity: 0.5`, `cursor: not-allowed`
- ✅ AI button tooltip: "Complete your profile to use AI assistant"
- ✅ Submit button: `opacity: 0.5`, `cursor: not-allowed`
- ✅ Submit button tooltip: "Complete your profile to submit quotes"
- ✅ Amount and message inputs: `disabled` attribute set

---

### 7.5 Eligibility Panel Responsiveness
**Test Viewports:**
- Desktop (1920x1080)
- Laptop (1366x768)
- Tablet (768x1024)
- Mobile (375x667)

**Expected:**
- ✅ Panel fits within quote card
- ✅ "Complete Profile" button doesn't overflow
- ✅ Checklist items stack vertically
- ✅ Text remains readable

---

## 8. Backend API Security Tests

### 8.1 Bypass Attempt: Unauthenticated Request
**Action:**
```http
POST /api/jobs/:jobId/quotes
Content-Type: application/json

{
  "amount": 100,
  "message": "Test"
}
```

**Expected:**
- ❌ 401 Unauthorized
- ❌ Error message: "Unauthorized" or "Authentication required."

---

### 8.2 Bypass Attempt: Homeowner Tries to Quote
**Setup:**
- Authenticated as homeowner (not tradie)

**Action:**
```http
POST /api/jobs/:jobId/quotes
Authorization: Bearer <homeowner-token>
Content-Type: application/json

{
  "amount": 100,
  "message": "Test"
}
```

**Expected:**
- ❌ 403 Forbidden (blocked by `requireRole('tradie')` middleware)
- ❌ Error message: "Forbidden: Tradie role required."

---

### 8.3 Bypass Attempt: Incomplete Profile
**Setup:**
- Authenticated as tradie with incomplete profile

**Action:**
Submit quote via API

**Expected:**
- ❌ 403 Forbidden
- ❌ Error message: "Please complete your profile before quoting. Missing: [list]"
- ❌ Response includes `reason: "profile_incomplete"`, `missing: [...]`, `score: X`

---

### 8.4 Bypass Attempt: Direct Firestore Write
**Action:**
Try to write directly to `quotes` collection via Firebase SDK from frontend

**Expected:**
- ❌ Firestore rules block with "Missing or insufficient permissions"
- ❌ Rules enforce: `allow create, update, delete: if false;`

---

## 9. End-to-End Scenario Tests

### 9.1 Full Quote Lifecycle (Happy Path)
**Steps:**
1. Tradie registers, completes profile (100%)
2. Homeowner posts job, invites tradie
3. Tradie views job, sees quote form enabled
4. Tradie submits quote (clean, no PII)
5. Homeowner views quote, requests revision
6. Tradie sees revision request, submits revised quote
7. Homeowner accepts revised quote
8. Escrow funded, job proceeds

**Expected:**
- ✅ All steps succeed without errors
- ✅ Quote version increments correctly
- ✅ Status transitions follow rules

---

### 9.2 Blocked → Unblocked Flow
**Steps:**
1. Tradie with incomplete profile views job
2. Sees eligibility panel, clicks "Complete Profile"
3. Navigates to profile page
4. Adds missing fields (photo, bio, phone, ABN)
5. Returns to job detail page
6. Eligibility panel disappears, quote form enabled
7. Submits quote successfully

**Expected:**
- ✅ Eligibility re-checked on page load
- ✅ UI updates to reflect new eligibility status
- ✅ Quote submission succeeds

---

### 9.3 PII Detection → Admin Review
**Steps:**
1. Tradie submits quote with phone number
2. Backend flags quote
3. Admin views flagged quotes in monitoring dashboard
4. Admin reviews and takes action (if needed)

**Expected:**
- ✅ Quote appears in admin flagged list
- ✅ Flag reasons visible to admin

---

## 10. Performance & Load Tests

### 10.1 Eligibility Check Performance
**Setup:**
- 100 concurrent tradie users loading job detail page

**Expected:**
- ✅ `/api/tradie/eligibility` responds in < 200ms
- ✅ No rate limiting or throttling issues

---

### 10.2 Quote Submission Under Load
**Setup:**
- 50 tradies submit quotes simultaneously to different jobs

**Expected:**
- ✅ All quotes created successfully
- ✅ No duplicate quotes due to race conditions
- ✅ Transaction logic prevents conflicts

---

## Summary Checklist

- [ ] All profile completion score tests pass
- [ ] All account status tests pass
- [ ] All quote submission rules tests pass
- [ ] All PII detection tests pass
- [ ] All Stripe integration tests pass
- [ ] All edge case tests pass
- [ ] All UI/UX tests pass
- [ ] All security bypass attempts blocked
- [ ] All end-to-end scenarios complete
- [ ] Performance tests pass

---

## Known Limitations & Future Enhancements

### Current Limitations:
1. **Email verification**: Only checked at registration time, not re-checked if user's email verification status changes in Auth
2. **Profile sync**: Changes to profile don't auto-refresh eligibility on job detail page (requires page reload)
3. **PII detection**: Uses regex patterns only, may have false positives/negatives

### Future Enhancements:
1. Real-time eligibility updates (WebSocket or polling)
2. More sophisticated NLP-based PII detection
3. Progressive profile completion nudges across the app
4. Email verification reminder in eligibility panel
5. Profile completion badge/score visible in tradie dashboard

---

## Contact & Support
For issues or questions:
- Backend logs: Check server console for detailed error messages
- Frontend logs: Check browser console for client-side errors
- Firebase: Check Firestore/Auth console for data verification
