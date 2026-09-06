# Taskio product analytics (P04)

Privacy-conscious product analytics for the private Melbourne MVP. Staging Hosting now loads the staging-only GA4 stream and the owner has confirmed Realtime receipt. Production analytics remain off.

## Classification

| Gate | State |
|---|---|
| P04 application code | **COMPLETE** |
| P04 local / CI | **PASS** |
| P04 URL privacy hardening | **COMPLETE** |
| P04 environment origin isolation | **COMPLETE** |
| P04 staging configuration | **COMPLETE** |
| P04 hosted network delivery | **PASS** |
| P04 GA4 console receipt | **PASS — OWNER CONFIRMED** |
| P04 production | **OFF** |
| P04 overall | **STAGING PASS / PRODUCTION PENDING** |

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

Advertising identifiers, Google Signals, and ad personalization are off when `gtag('config')` runs (`anonymize_ip`, `send_page_view=false`, Signals off, ad personalization off).

GA4 `page_location` is the **current build environment’s** canonical origin plus a canonical pathname. Staging uses `https://taskio-v2-staging.web.app` only. Production would use `https://taskio.com.au` only. The staging bundle must not contain production Hosting origin fingerprints. Dynamic IDs become route shapes (`/job/:id`, `/payment/:id/:id`, `/admin/user/:id`). Query strings and hashes are removed. Loopback origins are never sent; local/dev URLs remap to the environment origin, or to a path-only value.

GA4 `page_referrer` is privacy-sanitised: same-origin Taskio referrers use the same canonical path; external referrers keep **origin only** (no path or query). Callers cannot supply `page_location` / `page_referrer` through `trackEvent`.

Automatic GA4 Enhanced Measurement remains **OFF** in the staging property (owner Admin setting). Hosted network proof and owner-confirmed Realtime receipt are below.

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

Never send: email, name, phone, street/task address, job description, chat, filenames, Stripe IDs, Firebase UID, tokens, payment method, DOB, ABN, free-text payloads, job IDs (IDs may be used only as **local** once-keys in `sessionStorage`, never in the event payload). Do not send raw `page_location` / `page_referrer` with IDs, query strings, or hashes.

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

## Staging Hosting activation (2026-09-06)

- Property: **Taskio Staging**. Web stream: **Taskio staging web**. Measurement ID: `G-SZ7RZDKTJY` (public).
- Owner privacy settings already applied: Enhanced Measurement OFF; Signals OFF; user-provided data OFF; granular location/device OFF; ads personalization disabled in all 307 regions; event/user retention 2 months; reset on new activity OFF; Google products/services, modeling, technical-support, and recommendations sharing OFF.
- Build: `npm --prefix frontend run build:staging` with `REACT_APP_ANALYTICS_ENABLED=true` and `REACT_APP_GA_MEASUREMENT_ID=G-SZ7RZDKTJY` plus the existing approved staging Firebase/API env. Measurement ID is **not** in source.
- Scan: `npm --prefix frontend run scan:staging` **PASS**. Bundle `main.9647f8fc.js` contains `taskio-v2-staging` and `G-SZ7RZDKTJY` only. No `taskio-v2.web.app`, `taskio-v2.firebaseapp.com`, bare production project ID, production sender ID, localhost API, or `pk_live_`.
- Hosting-only deploy to `taskio-v2-staging` via wrapper `--project taskio-v2-staging --config firebase.staging.hosting.json --execute`. Version **`c2b8f742e73fed84`** (`2026-09-06T05:28:59.900Z`). Previous **`548438126950e209`** remains FINALIZED.
- Ride-along: floating-shelves hero from `38c89d6`, URL privacy from `3f7456f`, origin isolation from `9d1119b`.
- Hosted acceptance **PASS**: invite-only homepage, no broken images, no console errors, no localhost, shelves hero live.
- **HOSTED NETWORK PROOF: PASS.** `gtag.js` loaded only as `https://www.googletagmanager.com/gtag/js?id=G-SZ7RZDKTJY`. Config: `send_page_view=false`, `allow_google_signals=false`, `allow_ad_personalization_signals=false`, `anonymize_ip=true`. No second Measurement ID, no `AW-`, no unexpected vendor.
- Events observed on the wire: exactly one `landing_viewed` (`surface=landing`) then one `login_cta_clicked` (`surface=hero`). Same-tab homepage reload did **not** emit a second `landing_viewed`.
- Privacy: payloads limited to `surface`, `environment`, `page_location`, `page_referrer`. No email, phone, name, address, Firebase UID, job/quote/Stripe IDs, description, chat, DOB, ABN, or exact amounts.
- `page_location` = `https://taskio-v2-staging.web.app/`. Same-origin job referrer canonicalised to `/job/:id`. External Outlook referrer origin-only (`https://outlook.live.com`).
- **GA4 CONSOLE RECEIPT: PASS — OWNER CONFIRMED.** Taskio Staging Realtime showed 1 active user, `landing_viewed` = 1, `login_cta_clicked` = 1, and no automatic `page_view`. Normal GA4 automatic `first_visit` and `session_start` were present; they are not Taskio catalogue events and are not a failure.
- Production analytics **OFF**. Production Hosting still maintenance (`taskio.com.au` title “Taskio is almost ready”; no gtag). No Cloud Run, Functions, Auth, App Check, Stripe, or secret mutation.

**Staging App Check rollback prerequisite:** In `taskio-v2-staging`, disable affected Firestore/Storage enforcement FIRST and verify OFF plus rules-authorized access without App Check. Only then restore Hosting or disable frontend App Check; verify normal Auth/Firestore/Storage browser flows afterwards. A frontend restore without App Check requires BOTH services verified OFF. Keep security rules unchanged and production untouched. See `docs/APP_CHECK.md`. All cloud steps remain AMBER.

## Rollback

To undo the Hosting activation after a fresh approval, clone the previous version: `taskio-v2-staging@548438126950e209` → `taskio-v2-staging:live`. Or rebuild with `REACT_APP_ANALYTICS_ENABLED` unset and redeploy Hosting. Production is unchanged.
