# Public API exposure preflight

This document is **repository preparation only**. It does **not** authorize Cloud Run public IAM, a staging/production deploy, signup enablement, Hosting restore, DNS change, or LIVE Stripe.

Proposed later architecture (browser → Cloud Run with Firebase ID tokens) remains **awaiting explicit deployment approval**. It is not deployed and is not finally owner-approved.

## Current boundary (this batch)

- Cloud Run IAM-public exposure of the main API has **not** happened in this batch.
- Express + Firebase ID-token authorization remains the application authority once a request reaches the process.
- CORS must remain an **exact origin allowlist**. Do not use `*`.
- Stripe platform/Connect webhooks stay on the **webhook-only** Cloud Run service.
- `POST /internal/stripe/verified-event` stays private-API, Google OIDC, not a browser route.
- `TASKIO_PUBLIC_SIGNUP_ENABLED` must stay unset or `false` in production/pre-launch until explicit owner launch approval. Exact `true` is required to enroll new public accounts.
- `GET /health/metrics` is admin-only (this batch). `/health/live` and `/health/ready` remain infrastructure probes.
- No production GCP/Firebase/Stripe/Secret Manager change is made by this repository batch.

## Browser contract (when later approved)

Browsers send `Authorization: Bearer <Firebase ID token>`. Cloud Run IAM-public is a **separate** later decision. Opening IAM without this hardening would still leave signup and metrics exposed at the application layer.

## Signup kill switch

| Environment | Flag | Result |
|---|---|---|
| `NODE_ENV=production` | missing / blank / `false` / any value other than `true` | HTTP 503 `signup_disabled` **before** Auth `createUser` / enrollment claims / Firestore bootstrap |
| `NODE_ENV=production` | exact `true` | enrollment handlers run |
| non-production | missing | current local/test enrollment remains available |
| non-production | `false` or malformed | disabled |
| non-production | `true` | enabled |

Gated enrollment routes:

- `POST /api/users/register` (anonymous Firebase Admin `createUser`, **expert `tradie` role only**)
- `POST /api/users/register/expert-google` (authenticated Google expert bootstrap)
- `POST /api/me/homeowner/activate-quote-access` (phone-verified homeowner enrolment / quote-access grant; already-verified homeowners remain idempotent when signup is off)

Not gated: login, `POST /api/auth/resolve-email`, profile edits, admin, Stripe ingest.

### Homeowner registration is not available on this route

`POST /api/users/register` rejects `role: 'homeowner'` with HTTP 400 before Auth `createUser` or any Firestore write. Homeowner accounts are created only by the phone-verified posting flow. `quoteAccessVerified` is granted only by `POST /api/me/homeowner/activate-quote-access` (phone-verified token, while public signup is enabled). `POST /api/me/homeowner/complete-account` completes payment identity for an already quote-verified homeowner and never newly grants quote access. Job posting and quote viewing require `profile.quoteAccessVerified === true` with no email-based inference. Clients cannot create `users/{uid}` or change `role` / `quoteAccessVerified`.

## Anonymous endpoint inventory

Classification: **A** intentionally public · **B** public but rate-limited · **C** should require auth · **D** internal / network-protected · **E** disabled by feature gate.

| Route | Class | Why this exposure is acceptable |
|---|---|---|
| `GET /` | A | Liveness banner only. No secrets. |
| `GET /health`, `/health/live`, `/health/ready` | A | Infrastructure probes. Readiness reports booleans, not secret values. |
| `GET /health/metrics` | C → now auth | Process RSS/heap/uptime. **Admin `requireAuth` + `requireAdmin` as of this batch.** Anonymous 401; non-admin 403. |
| `POST /api/users/register` | B + E | Rate-limited. **Signup flag** fails closed in production. Expert `tradie` role only; `homeowner` rejected with 400 before any Auth/Firestore write. |
| `POST /api/users/register/expert-google` | B + authenticated + E | Requires Firebase session **and** signup flag. |
| `POST /api/auth/resolve-email` | B | Sign-in strategy hint; rate-limited; does not create accounts. |
| `GET /api/suburb-search` | B | Melbourne launch suburb labels only; covered by general limiter. |
| `POST /api/generate-description` | B | See AI section. Rate-limited. **Not** auth-gated in this batch (pre-signup job-post UX). |
| `GET /api/tradies/:tradieUid/reviews` | B | Public review read; dedicated read limiter. |
| `GET /api/me/deletion/confirm` | A | Email confirmation link with hashed one-time token. Not a login bypass. |
| `POST /api/stripe/webhook` (main API HMAC path) | D / E | Stripe-Signature HMAC. 404 when `STRIPE_ENABLED` is not `true`. Intended compatibility path; **public production webhook is the separate webhook-only service**. |
| `POST /api/stripe/webhook` and `/api/stripe/connect-webhook` (webhook app) | D | HMAC on the webhook-only service. Not the main API surface. |
| `POST /internal/stripe/verified-event` | D | Google OIDC service identity. Not a Firebase-user route. |

No additional HIGH-risk anonymous product-semantics change was made. `POST /api/generate-description` remains anonymous by frontend contract (see below).

## AI description route (`POST /api/generate-description`)

Frontend `/post-job` (`JobPostingForm`) is a **public** route. Description tidy is used **before login**. Requiring auth in this batch would break intended pre-signup UX.

Current guards: `aiLimiter` (30 / 15 min on the route) plus the app general limiter; clarify-mode only; Gemini key absence falls back to local tidy (no model call).

Abuse/cost if the API is later public: unauthenticated callers can spend Gemini quota. **Recommended later guard (not this batch):** require auth after job-post is moved behind login, and/or App Check / Cloud Armor — each needs its own approval.

## Manual financial authorization (this batch)

`requireAuth` + `requireAdmin` + `requireSuperAdmin`:

- `POST /api/admin/jobs/:jobId/refund`
- `POST /api/admin/jobs/:jobId/manual-release`

Already super_admin (unchanged):

- `POST /api/admin/jobs/:jobId/resolve-dispute`
- `POST /api/admin/jobs/:jobId/retry-payment`

Ordinary admin still operates jobs, invites, monitoring, users, workflow. `POST /mark-refunded` remains admin-only: it does **not** call Stripe (REFUND_PENDING → REFUNDED fallback).

## Rollback

Revert this commit on `develop` if the kill switch or metrics auth must be undone. That revert still must **not** be used as approval to open Cloud Run IAM. Runtime env `TASKIO_PUBLIC_SIGNUP_ENABLED` is unchanged by this batch; production stays fail-closed while the flag is missing.

## Next separate approvals (do not start here)

1. Cloud Run public invoker / IAM for the **main API** (if Option A is chosen)
2. Staging deploy of this revision
3. Browser acceptance against a public API
4. Explicit `TASKIO_PUBLIC_SIGNUP_ENABLED=true` for launch
5. Production webhook / LIVE Stripe / public Hosting
