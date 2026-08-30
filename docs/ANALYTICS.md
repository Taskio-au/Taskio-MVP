# Taskio product analytics (P04)

Privacy-conscious product analytics for the private Melbourne MVP. GREEN application code only. Staging GA4 delivery and production analytics are later approvals.

## Classification

| Gate | State |
|---|---|
| P04 analytics architecture | DECIDED |
| P04 application code | CODE COMPLETE |
| P04 local / CI testing | **PASS** (`e7ffbf0`; CI `33310943590`) |
| P04 staging GA4 property | **NOT CONFIGURED** |
| P04 staging measurement ID | **NOT CONFIGURED** |
| P04 staging event delivery | **NOT VERIFIED** |
| P04 production analytics | **NOT ENABLED** |
| P04 overall | **PARTIAL / READY FOR CONTROLLED STAGING ACTIVATION** |

Do not mark P04 fully PASS until staging receives real events.

## Purpose

Answer marketplace questions without advertising:

- are invited users activating and logging in?
- are homeowners posting tasks?
- are Experts quoting?
- are quotes accepted and funded?
- are jobs completed, released, or refunded?

This is **product** analytics only. No ad pixels, no session replay, no marketing trackers.

## Provider

**GA4 via `gtag.js`**, loaded only when analytics is enabled with a public measurement ID (`G-…`).

Firebase Analytics SDK is **not** used: it would require a `measurementId` on the Firebase web config and would be easier to enable accidentally. The existing G05 `trackEvent` → `gtag` path is reused.

Advertising identifiers, Google Signals, and ad personalization are off when `gtag('config')` runs.

## Disabled by default

```
REACT_APP_ANALYTICS_ENABLED=true
REACT_APP_GA_MEASUREMENT_ID=G-XXXXXXXX
```

Unset/false → no script, no `gtag` config, `trackEvent` no-ops.

Enabled without a valid `G-` ID → fail closed (treated as disabled). The app still loads.

No production measurement ID is hardcoded.

## Event taxonomy

Existing G05 names are kept. Recommended names map onto them:

| Event | When |
|---|---|
| `landing_viewed` | Public landing, once per browser session |
| `login_cta_clicked` | Landing login CTA |
| `login_started` / `login_succeeded` | After the user starts / completes password, Google, or phone login |
| `account_activation_completed` | Homeowner complete-account API success (`invited_user_activated` is an alias) |
| `job_post_started` | Post-job form, once per session |
| `job_post_step_completed` | User advances a wizard step (`step` = completed step number) |
| `job_created` / `job_post_completed` | `POST /api/jobs` success |
| `expert_invited` | Admin invite API success (`count` of invites) |
| `quote_submitted` | Expert quote API success |
| `quote_received` | Homeowner job detail has ≥1 quote after load (once per job per browser session) |
| `quote_accepted` | Checkout Session created (`POST /api/jobs/:id/checkout` returned a URL) |
| `checkout_started` | Same moment, immediately before hosted Checkout redirect |
| `payment_succeeded` | Reconciled job is funded after Checkout return — **not** the return URL alone |
| `job_marked_complete` | Expert complete API success |
| `payment_released` | Homeowner release API success |
| `payment_refunded` | Job `paymentState` transitions to `refunded` in this session |
| `review_submitted` | Review API success |

`job_in_progress` remains defined but is not emitted in this batch (no distinct mutation beyond complete/release).

## Property whitelist

`surface`, `role`, `status`, `source`, `count`, `step`, `result`, `category`, `suburb` (launch suburbs only), `amount_bucket`, `fee_plan`, `payment_state`, `environment`.

`environment` is attached only when analytics is enabled (`local` / `staging` / `production` from the expected Firebase project ID).

**Amount buckets** (cents): `under_100`, `100_249`, `250_499`, `500_plus`. Exact dollar values are not sent.

## Prohibited

Never send: email, name, phone, street/task address, job description, chat, filenames, Stripe IDs, Firebase UID, tokens, payment method, DOB, ABN, free-text payloads, job IDs (IDs may be used only as **local** once-keys in `sessionStorage`, never in the event payload).

Unknown keys, nested objects, and arrays are dropped. Development may warn with the **key name only**.

## Duplicate control

- Session `trackEventOnce` for landing, job-post start, quote received, checkout, and payment succeeded
- Mutation events only after successful `await` (failed API → no event)
- Payment refunded: previous-state guard so opening an already-refunded job does not fire

## Metrics coverage

| Metric | How | Limitation |
|---|---|---|
| Invited-user activation | `login_succeeded` + `account_activation_completed` vs landing/login | Repeat visits need GA4 user counts, not a Taskio user ID |
| Job-post completion | `job_post_started` → `job_created` | Guest OTP path is invite-only off |
| Jobs with ≥1 quote | `job_created` vs `quote_received` / `quote_submitted` | Client-only; no join key |
| Time to first quote | GA4 timestamp between `job_created` and first quote event | **No job ID** → cannot compute per-job latency in GA4 without a later backend aggregation |
| Quote acceptance | `quote_submitted` vs `quote_accepted` | Same |
| Funded conversion | `checkout_started` vs `payment_succeeded` | Checkout return still requires webhook/reconcile |
| Completion / release / refund | corresponding events | |
| Amount distribution | `amount_bucket` on quote submit | Not exact GMV |
| Platform fee revenue | **Not from these events** — needs backend/Stripe | `taskio_fee_revenue` remains a documented metric, not a client event |
| Repeat homeowner / Expert utilisation | **Needs backend aggregation** (no persistent user id in analytics) | |

## Staging AMBER package (do not execute)

1. Create/select a **staging-only** GA4 property / Firebase Analytics web stream.
2. Set staging Hosting env `REACT_APP_ANALYTICS_ENABLED=true` and `REACT_APP_GA_MEASUREMENT_ID=G-…` (staging ID only).
3. Hosting-only staging deploy. No Cloud Run, Functions, Auth, App Check, production.
4. Scanner: no production measurement ID, no ad pixels.
5. Synthetic invite-only clicks: landing, login, one job/quote if appropriate.
6. Confirm events in the staging GA4 debug/realtime view.
7. Confirm payloads have no PII.
8. Rollback: `REACT_APP_ANALYTICS_ENABLED=false` and rebuild Hosting.
9. Production untouched.

## Local testing (2026-08-30)

- `npm --prefix frontend run verify` **PASS** (maintainability; Jest **74/74** suites **492/492**; stagingHosting **24/24**).
- `npm --prefix frontend run e2e` **4/4**.
- `git diff --check` **PASS**.
- Backend / Functions tests not re-run (those trees were not changed).

Analytics remain disabled in e2e (`REACT_APP_ANALYTICS_ENABLED=false`). Staging GA4 was not configured. Production was not touched.

## Rollback

Disable the flag and rebuild. No provider remains in the bundle as an active config when the flag is false (gtag.js is not injected).
