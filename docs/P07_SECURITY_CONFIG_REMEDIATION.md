# P07A production security / configuration readiness audit

**Date:** 20 September 2026 (P07E2B **AMBER-E2B COMPLETE** — staging API current HEAD)
**P07A audit date:** 14 September 2026
**P07B local hardening:** 19 September 2026 (`10a8f5b` / `11919fa`)
**Status:** **P07 OPEN / REMEDIATION IN PROGRESS** — **AMBER-E2A + E2B COMPLETE**. Staging rules and API are current HEAD. Hosting still `e97a303dcf995e37` / `main.70b28def.js`. **E2C Hosting pending.** **Not P07 PASS.** READY TO OPEN remains impossible. Production still **FROZEN**.

This document is an audit plus approved staging-rules execution record. It does **not** rotate credentials, enable Auth signup, change IAM, enable production App Check/GA4/email/Stripe live, create `system/pilotSettings`, or push.

**Companion:** `docs/LAUNCH_READINESS.md` (P07 gate), `docs/SECRETS_AND_KEY_ROTATION.md`, `docs/TASKIO_RELEASE_PLAN.md` (A04 / production commands **NOT EXECUTED**), `docs/APP_CHECK.md`, `docs/ANALYTICS.md`, `docs/TRANSACTIONAL_EMAIL.md`.

**Do not print:** private keys, API keys, tokens, passwords, SMTP credentials, service-account JSON. Identifiers below use **type / path / last-4 fingerprint only** where already documented.

---

## 1. Credential / secret findings

### Git / repo hygiene

| Item | Finding |
|---|---|
| Tracked secret files | **None.** No `serviceAccountKey.json`, `credentials.json`, `*.pem`, live `.env` in `git ls-files`. |
| Git history of those filenames | **Empty** (`git log --all --full-history -- "**/serviceAccountKey.json"`). |
| `.gitignore` | Ignores `.env`, `.env.*` (keeps `.env.example`), `**/serviceAccountKey.json`, `scripts/bootstrapAdmin.js`, `/backend/setAdmin.js`, `/backend/debug.js`. |
| CI image guards | API/webhook images must not contain `.env` or `serviceAccountKey.json`; webhook image greps `private_key` in JSON under `/app/backend/src`. |
| Local worktree (presence only) | Gitignored `backend/.env`, `frontend/.env`, `frontend/.env.local` may exist. **Contents not inspected.** Production JSON filenames `serviceAccountKey.json` / `backend/serviceAccountKey.json` **absent**. |

### Historical production service-account exposure

| Field | Record |
|---|---|
| Type | Firebase Admin SDK **user-managed JSON key** (production `taskio-v2`) |
| Path (historical, local/ignored) | `serviceAccountKey.json`, `backend/serviceAccountKey.json` |
| Tracked? | No (gitignore + never committed) |
| Documented fingerprint | last-4 **`3cac`** (`docs/TASKIO_TRACKER.md` A04) |
| Documented A04 outcome | Key **permanently deleted**; **0** user-managed keys on Firebase Admin SDK account; Cloud Run must use ADC on `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com` |
| Staging key | last-4 **`f04d`** — **outside A04**; separate review |
| P07 position | A04 is **documented complete**. **P07C independently confirmed** production Admin SDK and `taskio-api-runtime` have **0** user-managed keys; historical last-4 `3cac` is absent. Do **not** recreate a JSON key. |

`backend/setAdmin.js` still `require("./serviceAccountKey.json")` but is **gitignored** and non-functional without that file. Do not commit it.

### Secret inventory (names only)

| SYSTEM | STAGING | PRODUCTION | HOW LOADED | WHERE REFERENCED | CURRENT KNOWN STATUS | ROTATION NEEDED? | OWNER ACTION? | P07 BLOCKER? |
|---|---|---|---|---|---|---|---|---|
| Firebase Admin / GCP SA | ADC or local GAC | ADC `taskio-api-runtime@…` | Env path / ADC | `backend/src/firebaseAdmin.js`, `validateEnv.js` | **P07C:** 0 user-managed keys; `3cac` absent | None now | Never recreate JSON | No (verified) |
| Stripe TEST secret | Secret Manager / env | N/A | Env | `STRIPE_SECRET_KEY` + `validateEnv` prefix `sk_test_` | Staging TEST configured | Quarterly / on exposure | None now | No |
| Stripe LIVE secret | Forbidden | When `STRIPE_ENABLED=true` | Secret Manager | `validateEnv.js` requires `sk_live_` in production deployment env | Prod Stripe **off** (`STRIPE_ENABLED=false` documented) | Before live enable | RED mount live key | **Yes** before live money |
| Stripe webhook HMAC | Webhook runtime | Webhook runtime | Env on webhook **only** | `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Staging configured; main API must not hold HMAC | After exposure | Verify split | **Yes** (prod audit) |
| Postmark / SMTP | Functions `defineSecret` | **Not configured** | Firebase Secret Manager | `functions/email/smtpSecrets.js` | P03 staging PASS; prod pending | Before prod email | RED prod SMTP | **Yes** (P03 prod + P07) |
| OTP_SALT | Secret Manager | Secret Manager (prod first-deploy minimum) | `--set-secrets` | `validateEnv.js` production required | Documented mounted on prod Cloud Run | Quarterly | Confirm version exists | **Yes** (confirm) |
| Gemini | Optional | Optional; **do not mount** at launch | `GEMINI_API_KEY` | `backend/src/routes/ai.js` | Missing key → fallback, no crash | If later enabled | Keep unmounted | No at launch if unmounted |
| GA4 measurement ID | Build env | Build env | `REACT_APP_GA_MEASUREMENT_ID` | `analyticsConfig.js` | Staging ON; prod **OFF** | N/A | RED after P06 disclosure | **Yes** for P04 prod |
| App Check site key | Build env | Build env | `REACT_APP_APPCHECK_*` | `appCheckConfig.js` | Staging ON; prod **OFF** | On rotation | RED register prod key | **Yes** for P05 prod |
| Firebase **web** config | Build env | Build-time / source fallback | `REACT_APP_FIREBASE_*` | `firebaseConfig.js` | Public client config (not a secret) | N/A | Keep staging/prod fingerprints distinct | Partial |
| ABN lookup GUID | Optional | Not mounted | Env | ABN verify 501 without it | Optional | On exposure | Optional | No |
| ALERT_WEBHOOK_URL | Optional | Secret resource, **no version** (release plan) | Env | `validateEnv` warn-only | Unset = no-op | When approved | Do not mount empty secret | No |
| GitHub Actions secrets | — | — | **None** (`${{ secrets.* }}` unused) | `ci.yml` inline **public** Firebase web config for compile | CI does not deploy | N/A | Optional move to GH secrets | Low |

---

## 2. Production / staging separation

| Expected | ID |
|---|---|
| Production | `taskio-v2` |
| Staging | `taskio-v2-staging` |

**Guards in repo:** `backend/src/config/deploymentEnvironment.js` rejects project/env mismatch. Staging Hosting wrapper allowlists `--project taskio-v2-staging` and scans bundles for production fingerprints, loopback API, `pk_live_`, App Check debug. Production Stripe must be `sk_live_` when enabled; staging must be `sk_test_`. Frontend production builds forbid loopback API URLs.

**Residual risk:** operator CLI default project may still be `taskio-v2`. Staging commands must pass `--project=taskio-v2-staging` explicitly. CI frontend job **builds** with production web config for compile verification only — **does not deploy**.

Do not change config in this task.

---

## 3. Firebase Auth (intended vs cloud)

**Current verified cloud fact (P07C):** Identity Toolkit `client.permissions.disabledUserSignup=true` on production `taskio-v2`. Brand-new Firebase users cannot be created. Email/password and phone providers are enabled. MFA is DISABLED. **Not changed here.** Staging Auth signup was not re-toggled; do not infer staging from production.

**Intended launch (code):**

| Actor | Control |
|---|---|
| Homeowner posting | `system/pilotSettings.state` CLOSED / OPEN / PAUSED (`POST /api/jobs`) |
| Homeowner account | Phone-verified `POST /api/me/homeowner/activate-quote-access` — **not** gated by `TASKIO_PUBLIC_SIGNUP_ENABLED` |
| Expert apply | `expertOnboardingMode` OPEN **and** `TASKIO_PUBLIC_SIGNUP_ENABLED=true` |
| Expert marketplace | Admin `verified=true` + `expertiseApproved` + eligibility |

**Exact future production Auth change (do not execute):** allow the **approved homeowner** signup/auth path in Identity Toolkit (and Expert path only when Expert OPEN is intended). Enabling Auth user creation must **not** approve Experts.

P07 cannot PASS until this is approved, applied, and evidenced. P10 must prove a brand-new homeowner can authenticate and post.

---

## 4. Expert signup safety

Verified in code: enabling Firebase Auth signup **does not** by itself enable marketplace Expert participation.

New Expert register (`POST /api/users/register`) requires kill switch + OPEN mode; writes `verified=false`, `expertiseApproved=[]`. Quotes require invite + V11 eligibility (`verified`, approved expertise, Stripe, etc.). Client Firestore `users` create is denied.

**Residual:** opening Auth **does** allow new **homeowners** via `activate-quote-access` when posting is OPEN. Coordinate Auth enablement with operational state. No local bypass defect requiring emergency repair.

---

## 5. Admin / API protection

All discovered `/api/admin/*` routes use `requireAuth`. Admin reads/mutations use `requireAdmin` (Firebase custom claim `admin === true`). Destructive payment routes add `requireSuperAdmin`. `resolve-dispute` / `retry-payment` are super-admin-only (by design).

`POST /api/admin/set-admin/:uid` is **404** unless `ENABLE_SET_ADMIN_ENDPOINT=true`. Founding-expert test reset blocked in production unless test mode env is set.

**No unprotected Admin endpoint found.** Do not broaden remediation in this audit.

**P07B confirm (read-only cloud):** production `ENABLE_SET_ADMIN_ENDPOINT` is false; custom claims inventory for `admin` / `super_admin`.

---

## 6. Public endpoints

| Endpoint | AUTH | RATE LIMIT | WRITE | DATA DISCLOSED | ABUSE | P07 ACTION |
|---|---|---|---|---|---|---|
| `GET /api/pilot-status` | None | 200/15m | No | Booleans only; no counts/blockers/secrets | Low | Keep; contract-tested |
| `POST /api/pilot-waitlist` | None | 30/15m | Yes | Generic success | Spam | OK; consent + deny rules |
| `POST /api/expert-waitlist` | None | 30/15m | Yes | Generic success | Spam | Same |
| `POST /api/auth/resolve-email` | None | 40/15m | No | Strategy; admin emails `unknown` | Partial enum | Monitor |
| `POST /api/users/register` | None | 30/15m | Yes | UID | Spam if flags on | Keep kill switch off |
| `POST /api/generate-description` | **None** | 30/15m + AI limiter | Gemini cost | Tidied text | **Cost** if API public | Report; consider auth before public IAM |
| `GET /api/tradies/:uid/reviews` | None | Dedicated read | No | Reviews, no reviewer PII | Scraping | OK |
| `GET /health/live` | None | General | No | liveness | Low | OK |
| `GET /health/ready` | None at app | General | No | Firestore/Stripe/env **booleans** | Recon | Rely on Cloud Run IAM; confirm still private |
| Stripe webhooks | HMAC | Excluded | Yes | N/A | Forged events blocked | Webhook-only runtime |
| Internal Stripe ingest | Google OIDC SA | Own | Yes | N/A | SA identity | Private |

Public status must not (and contract tests assert it does not) expose launch blockers, Expert counts, admin identities, audit, or secret config.

---

## 7. CORS / rate limit / headers

**CORS:** `CORS_ORIGINS` exact-match allowlist; production requires non-empty list (`validateEnv`); empty list in production fail-closes; no `*`; credentials true; no-Origin allowed (server-to-server). Dev defaults localhost only when not production.

**Rate limits:** global 500/15m; dedicated for register, resolve-email, waitlists, pilot-status, AI, reviews, ABN. Jobs/quotes/payments/admin share the global limiter only.

**TRUST_PROXY:** required in production (`true`) so rate-limit IP is correct behind Cloud Run.

**Helmet:** default `helmet()` on main API and webhook app; `x-powered-by` disabled.

**Hosting:** `firebase.json` now has a conservative baseline (nosniff, referrer-policy, `X-Frame-Options: DENY`, Permissions-Policy, HSTS). Staging Hosting keeps noindex + no-store and the same baseline. **CSP is deferred (AMBER)** — Firebase Auth, Stripe hosted checkout, reCAPTCHA/App Check, Google Fonts, and future GA4 need live/staging browser validation before enforcement. Hosted header enforcement is **not proven** until a Hosting deploy is tested.

---

## 8. Firestore / Storage rules

**Client deny (intended):** `system/**`, `pilotWaitlist`, `expertWaitlist`, `phone_verifications`, `deletion_tokens`; `users` create false; quote/payment writes API-only. Tests: `rules-tests/security.rules.test.js`.

**Storage:** job photos (homeowner, image, 10MB); chat attachments (participants, 10MB, chat gates); profile images (owner, type/size); support attachments (owner path).

**P07B local rule fix (not deployed):** job-posting photos are **create-only** (`resource == null`); timestamped profile paths are create-only; leftover `profile-photos/` and `profile-images/` share the canonical **2MB** bound. Deterministic `profile-images/{uid}.{ext}` still allows explicit owner replacement.

No production rule deploy in this task.

---

## 9. App Check

| Env | Frontend | Firestore | Storage | Auth |
|---|---|---|---|---|
| Staging | ON | ENFORCED | ENFORCED | OFF (out of MVP) |
| Production | **OFF** | OFF | OFF | OFF |

**API:** no App Check middleware (intentional MVP).

**Future production sequence (do not run now):** register prod Web app + Enterprise key → Hosting with App Check ON → prove tokens → enforce Firestore → prove → enforce Storage → prove. **Rollback:** disable enforcement **before** rolling Hosting to a bundle without App Check. Auth enforcement remains a separate decision.

P05 remains **STAGING PASS / PRODUCTION PENDING**.

---

## 10. IAM / Cloud Run / Functions

**From repo/docs (not live-verified in this task):**

- Intended API identity: `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com` (not default Compute, not `firebase-adminsdk-fbsvc`).
- Production API: **private** Cloud Run (unauthenticated `/health/ready` **403** per tracker — ops recon mitigated).
- Webhook: public HTTP with Stripe HMAC; may invoke private API via OIDC.
- Functions: transactional email; SMTP secrets via `defineSecret`.

**CLOUD READ-ONLY VERIFICATION REQUIRED** for current invokers, allUsers bindings, and Functions revisions. Do not guess live IAM.

---

## 11. Stripe production security (code expectations)

- Enablement fail-closed: `STRIPE_ENABLED === "true"` only.
- TEST vs LIVE prefix + `STRIPE_EXPECTED_LIVEMODE` enforced when enabled.
- Webhook `constructEvent` HMAC; connect webhook separate secret.
- Checkout amounts derived from stored quote / fee snapshot, not client-authoritative release amounts.
- Release/refund require homeowner or super-admin paths and payment-state checks.
- Frontend publishable key only; staging Hosting rejects `pk_live_`.
- Production live Stripe **off / frozen**. Do not use live Stripe in P07A.

Remaining evidence: live keys in Secret Manager, webhook endpoints on live mode, P10 money-loop — all **RED later**.

---

## 12. Postmark / email

P03 **STAGING PASS / PRODUCTION PENDING**. `EMAIL_ENABLED` defaults off. Staging authentic E01 verified. Production SMTP **NOT CONFIGURED**. Templates are sparse; E02 “funds are held” is a P06 wording item, not a P07 secret issue.

**P03 production PASS still needs:** production Postmark server/sender, domain auth, secret binding, authentic send proof, no staging URLs in templates. Do not send production email now.

---

## 13. GA4 / analytics

P04 **STAGING PASS / PRODUCTION PENDING**. Production analytics **OFF** (`REACT_APP_ANALYTICS_ENABLED !== 'true'`). Code denylists PII / raw IDs / exact amounts. P06 disclosure remains a prerequisite for production enablement. Do not enable.

---

## 14. AI / Gemini

**P07B:** Provider use is fail-closed. `AI_DESCRIPTION_ENABLED` must be exact `true` **and** a Gemini key must be present before any network call. A key alone cannot trigger Gemini. Missing/disabled config returns local **fallback**. Production default remains OFF. Do not mount Gemini at launch.

`POST /api/generate-description` stays **unauthenticated** because `/post-job` uses tidy **before** phone OTP / Firebase session. Guest use is retained with: dedicated 30/15m limiter, strict body schema, 5000-char description bound, unknown-field reject, no prompt-injection fields, generic errors, and the kill switch. Quote assistant remains Expert-auth and is gated by the same switch. App Check is **not** involved. P06 remains OPEN — this is not an AI privacy review.

---

## 15. Logging / PII

Winston logger redacts authorization, password, tokens, Stripe signature/secret keys, rawBody/payload keys, plus email/phone regex in string values (`backend/src/observability/logger.js`). Request child logs uid + path, not Bearer tokens.

| Pattern | Class |
|---|---|
| Logging `Authorization` / Stripe secrets | **ACCEPTABLE WITH REDACTION** (key-name redaction present) |
| `/health/ready` Stripe enabled/livemode booleans | **ACCEPTABLE** if Cloud Run private; **HIGH** if publicly reachable |
| `console.error` of generic error.message | **NORMAL OPERATIONAL** — watch for Stripe objects |
| Request bodies in default logs | **HIGH** if added later without redaction |

No secret values printed during this audit.

**P07B focused leak search:** request logs record method/path/status/uid, not Authorization, ID tokens, OTP, passwords, Stripe client secrets, payment-method details, service-account JSON, or raw bodies. Winston already redacts auth/token/Stripe/email/phone keys. `generate-description` / quote-assistant no longer `console.error` provider `details`. **No additional local logging repair required.**

---

## 16. Dependency / package security (local, no upgrades)

Run 14 September 2026 (no lockfile changes):

| Tree | Command | Result |
|---|---|---|
| backend production | `npm --prefix backend audit --omit=dev` | **0 high / 0 critical** (1 low, 9 moderate; firebase-admin / uuid / storage tree) |
| functions production | `npm --prefix functions audit --omit=dev` | **5 high / 3 critical** (incl. `websocket-driver`) — Functions lockfile **behind** backend A03 overrides |
| frontend production | `npm --prefix frontend audit --omit=dev` | **Noisy CRA/webpack tree** (reported 34 high / 3 critical) — do **not** auto-upgrade |

**P07B Functions:** applied safe lockfile overrides (`websocket-driver@0.7.5`, `protobufjs@7.6.5`, `@grpc/grpc-js@1.14.4`, `form-data@2.5.6`, `path-to-regexp@0.1.13`, `fast-xml-parser@4.5.5`). Post-override `npm audit --omit=dev`: **2 high / 0 critical** (was 5 high / 3 critical). **Remaining blocker:** direct `nodemailer@8.0.5` high advisories require **major** `10.x` — not applied. `node-forge` 1.3.3 high remains (1.4.0 not forced). `firebase-admin` 14.x major also not applied. `fast-xml-parser` 5.7 moderate remains.

**P07B frontend:** CRA `--omit=dev` remains noisy (34 high / 3 critical). Criticals (`protobufjs`, `shell-quote`, `websocket-driver`) sit in CRA/webpack/Firebase Admin-adjacent **toolchain** trees, not as first-party product modules. `axios` and `react-router` high findings are real dependencies but have no safe targeted production-only patch without CRA/router churn. **No frontend package change.** No CRA migration.

---

## 17. CI security guards

`.github/workflows/ci.yml`: `permissions: contents: read`; jobs for rules, frontend, backend, functions, browser-smoke, api-image, webhook-image. **No production deploy on push.** No `${{ secrets.* }}`. Actions `checkout@v5` / `setup-node@v5` / `setup-java@v5` (not fully SHA-pinned — **LOW**). PR has same jobs; no production credentials injected.

Webhook smoke asserts logs do not contain `Bearer `, `whsec_`, `sk_live_`, `sk_test_`.

---

## 18. Kill-switch inventory

| Control | Fail-closed default |
|---|---|
| Homeowner state | Missing settings → **CLOSED** |
| Expert onboarding | Missing/invalid → **WAITLIST** |
| `TASKIO_PUBLIC_SIGNUP_ENABLED` | Production missing → **disabled** |
| Identity Toolkit `disabledUserSignup` | **true** (cloud; blocks new users) |
| `STRIPE_ENABLED` | Only `"true"` enables |
| Gemini | `AI_DESCRIPTION_ENABLED` not `true` → fallback (key alone is insufficient) |
| Analytics | Production off unless explicit enable |
| App Check | Production off |
| Email | `EMAIL_ENABLED` default false |
| `TASKIO_SHOW_DEV_OTP` | Forbidden in production env validation |
| E2E auth bypass | Forbidden in production builds |

Operator action required to OPEN posting, OPEN Expert apply, enable Auth signup, enable Stripe, mount Gemini, enable GA4/App Check/email.

---

## 19. Legacy Expert pre-activation checklist (no mutation)

Before real-user OPEN, operators must **read-only** review existing verified Experts:

- `expertise` vs `expertiseApproved`
- `verified`, `status`
- `serviceAreas[]`, `acceptingJobs`
- Stripe Connect onboarding
- ABN where required
- derived launch-ready

Do **not** mutate users in P07A. P07/P10 pre-activation item.

---

## 20. Read-only cloud verification plan

Do **not** run `firebase use` or `gcloud config set project`. Every command used explicit `--project=taskio-v2` or `--project=taskio-v2-staging`. P07C executed the list/get/describe commands below. **No mutation.**

| ID | COMMAND USED | PROJECT | READ-ONLY? | PROVES | RISK / ADJUSTMENT |
|---|---|---|---|---|---|
| C1 | `gcloud iam service-accounts keys list --iam-account=firebase-adminsdk-fbsvc@taskio-v2.iam.gserviceaccount.com --project=taskio-v2` (also runtime/compute/appspot) | taskio-v2 | Yes | User-managed key count | Placeholder SA resolved to `firebase-adminsdk-fbsvc`. Last-4 only recorded. |
| C2 | `gcloud run services describe taskio-api --project=taskio-v2 --region=australia-southeast1` (env values redacted except known flags) | taskio-v2 | Yes | Runtime SA, `STRIPE_ENABLED`, secret **names** | Did not print secret values. |
| C3 | `gcloud run services get-iam-policy taskio-api --project=taskio-v2 --region=australia-southeast1` | taskio-v2 | Yes | allUsers / invoker | Empty bindings = IAM-private. |
| C4 | `GET https://identitytoolkit.googleapis.com/admin/v2/projects/taskio-v2/config` with `x-goog-user-project: taskio-v2` | taskio-v2 | Yes | `disabledUserSignup` | `gcloud alpha identity` not used (would install components). Hash/test-OTP material **not recorded**. |
| C5 | `GET https://firebaseappcheck.googleapis.com/v1/projects/taskio-v2/services` with user-project header | taskio-v2 | Yes | Firestore/Storage/Auth enforcement | Console not required. |
| C6 | `gcloud secrets list --project=taskio-v2` + `gcloud secrets versions list` (names/state only) | taskio-v2 | Yes | OTP_SALT exists; Stripe/SMTP absent | No payload access. |
| C7 | `firebase hosting:channel:list --project taskio-v2 --json` + public HEAD of custom domains | taskio-v2 | Yes | Maintenance Hosting; analytics off | Version `cffca9d87ce03901`. |
| C8 | Repeat C2–C3 for `taskio-api-staging` / `taskio-stripe-webhook-staging` with `--project=taskio-v2-staging` | taskio-v2-staging | Yes | Staging isolation | Staging API invoker = webhook runtime only; webhook `allUsers` intentional. |

---

## 21. Remediation matrix

| ID | AREA | CURRENT STATE | EVIDENCE | RISK | REQUIRED ACTION | LOCAL / STAGING / PRODUCTION | GREEN / AMBER / RED | BLOCKS P07? | VALIDATION REQUIRED | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| P07-01 | Historical prod SA JSON | **P07C:** 0 user-managed keys on Admin SDK + runtime; `3cac` absent | C1 19 Sep 2026 | None now (deleted) | Never recreate JSON | PRODUCTION | **GREEN** verified | No | C1 | **VERIFIED** |
| P07-02 | Staging SA JSON `f04d` | **P07D2B:** USER_MANAGED key last-4 `f04d` **deleted**. 0 USER_MANAGED keys remain on staging Admin SDK (1 SYSTEM_MANAGED). Local JSON deleted after validation. Operator uses ADC. Historical cloud use **UNKNOWN**. | P07D2B | Residual copies if any exist elsewhere | None now on this SA | STAGING | **AMBER COMPLETE** | No (prod P07) | Key list + ADC + `/health/ready` | **DELETED / REVOKED FROM STAGING** |
| P07-03 | Auth `disabledUserSignup=true` | **P07C confirmed** on production | C4 | Blocks intended OPEN | Approved Identity Toolkit change for homeowner path only | PRODUCTION (+ staging when testing) | **RED** | **Yes** | C4 + P10 | **VERIFIED; enable NOT STARTED** |
| P07-04 | IAM / Cloud Run invoker | **P07C:** main API invoker policy empty (no allUsers). Runtime SA matches. | C2 C3 | None for public invoke | Keep private until a named public-HTTP decision | PRODUCTION | **GREEN** verified | No | C2 C3 | **VERIFIED** |
| P07-05 | Runtime secrets | **P07C:** `OTP_SALT:1` + `ABN_LOOKUP_GUID:1` mounted; no Stripe/Gemini/SMTP; `STRIPE_ENABLED=false` | C2 C6 | LOW (ABN optional) | Do not add Gemini/live Stripe yet | PRODUCTION | **GREEN** verified | No | C6 | **VERIFIED** |
| P07-06 | Production App Check | **P07C:** Firestore/Storage/Auth `UNENFORCED` | C5 | HIGH bots/abuse at public launch | P05 production sequence | PRODUCTION | **RED** | **Yes** (with P05) | Token + enforcement proofs | **VERIFIED OFF; enable NOT STARTED** |
| P07-07 | Production email | **P07C:** no SMTP/Postmark secrets in prod SM; Functions still April 2026 (no P03 bind) | C6 + Functions list | HIGH ops | P03 production config + proof | PRODUCTION | **RED** | Coupled P03 | Authentic send | **VERIFIED ABSENT; config NOT STARTED** |
| P07-08 | Production GA4 | **P07C:** maintenance HTML; no gtag / measurement ID | C7 + public GET | MEDIUM (privacy) | Enable only after P06 disclosure | PRODUCTION | **RED** | Coupled P04/P06 | Console receipt | **VERIFIED OFF; enable NOT STARTED** |
| P07-09 | Production Stripe live | **P07C:** `STRIPE_ENABLED=false`; no Stripe secret names in prod SM; no prod webhook service | C2 C6 | CRITICAL money | Separate live Stripe batch | PRODUCTION | **RED** | Before live money | Webhook + TEST-to-LIVE checklist | **VERIFIED OFF; live NOT STARTED** |
| P07-10 | CORS / TRUST_PROXY | **P07C:** `CORS_ORIGINS=https://taskio.com.au`; `TRUST_PROXY=true` | C2 | None observed | Keep allowlist = Taskio origin only | PRODUCTION | **GREEN** verified | No | C2 redact | **VERIFIED** |
| P07-11 | Unauth `/api/generate-description` | Guest pre-auth tidy is required; kill switch + schema + limiter | `backend/src/routes/ai.js`, `aiEnabled.js` | MEDIUM cost if API public **and** AI enabled | Keep guest + fail-closed AI; do not requireAuth | LOCAL HARDENING COMPLETE; cloud/provider enablement still OFF | **GREEN** code / **RED** enable | No while AI off + API private | AI route tests | LOCAL HARDENING COMPLETE |
| P07-12 | `/health/ready` metadata | **P07C:** API invoker policy empty; ingress all + IAM-private | C3 | LOW while frozen/maintenance | Keep private now. P10 must prove the real browser/API path before public acceptance. Do **not** add `allUsers` by assumption. | PRODUCTION | **GREEN** verified (current freeze) | No | C3 + later P10 | **VERIFIED; P10 PATH NOT PROVEN** |
| P07-13 | Hosting security headers | **P07C:** live `cffca9d87ce03901` has noindex/no-store only. P07B headers **not** deployed. Custom-domain HSTS `max-age=31556926` without includeSubDomains/preload. | C7 + HEAD | MEDIUM XSS/clickjack | Hosting deploy + browser scan later | LOCAL CONFIG COMPLETE; hosted verification pending | **GREEN** local / **AMBER** CSP / **RED** deploy | No for P07 PASS if CDN HSTS proven | Header unit test; later hosted scan | **LIVE OLDER THAN P07B** |
| P07-14 | Functions npm audit | Safe overrides applied; nodemailer major remains | functions/package.json | HIGH supply-chain | nodemailer major separately; do not force | LOCAL | **GREEN** partial / **AMBER** nodemailer | No (classify) | Re-audit after lockfile | SAFE REMEDIATION COMPLETE (partial); nodemailer REMAINING BLOCKER |
| P07-15 | Frontend CRA audit noise | Classified; no package change | frontend audit 19 Sep 2026 | Toolchain noise; axios/router residual | No CRA migration in this slice | LOCAL | **GREEN** classified | No | Manual review | CLASSIFIED; no frontend package change |
| P07-16 | Storage overwrite / profile size | **P07C:** prod Storage ruleset `932c4f1b…` (2025-12-24) has `allow write`, no `job-posting-attachments` create-only. **PRODUCTION OLDER.** | C7-equivalent rules GET | MEDIUM overwrite until deploy | Deploy Storage rules later | LOCAL RULE/CODE FIX COMPLETE; production deploy pending | **GREEN** local / **RED** deploy | No | Rules emulator tests | **PRODUCTION OLDER** |
| P07-17 | Legacy Expert data | **P07C:** 18 `role=tradie` users; 38 `users` total. No PII dumped. Detailed readiness review **not** started. | Count aggregation | HIGH wrong supply | Read-only pre-OPEN review | PRODUCTION (read) | **RED** (review) | Pre-activation | Checklist §19 | **COUNTS ONLY; REVIEW NOT STARTED** |
| P07-18 | `setAdmin` local script | Gitignored; broken without JSON | setAdmin.js | MEDIUM if revived | Keep ignored; do not restore JSON | LOCAL | **GREEN** | No | gitignore | OK |
| P07-19 | CI deploy guard | Push does not deploy | ci.yml | LOW | Keep | LOCAL | **GREEN** | No | CI | OK |
| P07-20 | Pilot settings cloud doc | **P07C:** `system/pilotSettings` GET **404** | Firestore GET | None if absent | Do not create until approved | PRODUCTION | **GREEN** verified absent | Process | Confirm absence | **ABSENT** |
| P07-21 | Leftover `helloTaskio` | ACTIVE GEN_2 HTTP; Cloud Run `allUsers` invoker; not in current repo. Finding: **QUESTIONABLE / REVIEW REQUIRED**. | Functions describe | LOW recon | Owner must first prove nothing depends on it. Any delete / disable / redeploy / invoker change is a **production mutation** | PRODUCTION | **RED** (if changed) | No | Function list + dependency review | **CONFIRMED; cleanup NOT STARTED** |
| P07-22 | Personal Gmail `roles/editor` | One `gmail.com` user has production Editor. Identity not recorded. Finding: **QUESTIONABLE / REVIEW REQUIRED**. | Project IAM | MEDIUM if unexpected | Owner must identify purpose and required least-privilege role. Do **not** assume removal. Any IAM binding change is a **production mutation** | PRODUCTION | **RED** (if changed) | No | Owner identity review | **CONFIRMED; IAM CHANGE NOT STARTED** |
| P07-23 | Staging CSP Report-Only | **P07D2 / AMBER-D2 COMPLETE.** Live Hosting `e97a303dcf995e37` preserves SPA `main.70b28def.js` (same hashes as `211fb288dcaff973`). Report-Only only; no enforced CSP. P07B headers live. One header iteration added `manifest-src 'self'`. | Hosting files API + Chrome CDP | LOW while Report-Only | Separate decision to enforce; first prove authenticated Firestore/Storage/Auth iframe + guest tidy if posting reopens | STAGING | **AMBER COMPLETE** (Report-Only) | No | Hosted browser matrix | **REPORT-ONLY LIVE; ENFORCE NOT STARTED** |
| P07-24 | Current-stack staging promotion | **E2A+E2B COMPLETE.** Rules HEAD; API `00070-dur` 100%. Hosting still old SPA. See §32–§34. | E2B 0%→smoke→shift | Remaining SPA drift until E2C | AMBER-E2C Hosting. Do not OPEN or enable Auth signup | STAGING | **AMBER** | No for P07 PASS | Hosted matrix after E2C | **RULES COMPLETE / API CURRENT / HOSTING PENDING** |

---

## 22. Recommended P07B execution order

1. **Read-only confirm** historical prod SA keys = 0; runtime ADC; Cloud Run IAM private (C1–C3).
2. **Staging key `f04d`** owner decision (rotate/stop JSON use).
3. Confirm production runtime env: CORS, TRUST_PROXY, OTP_SALT, `STRIPE_ENABLED=false`, no Gemini mount, `TASKIO_PUBLIC_SIGNUP_ENABLED` not true.
4. **Do not** enable Auth signup until homeowner OPEN is actually intended and P10 is scheduled; when enabling, keep Expert kill switch + WAITLIST/OPEN independent.
5. Production App Check (P05) — Hosting first, then Firestore, then Storage; Auth off.
6. Production email (P03) — after sender/domain ready.
7. Production analytics (P04) — **after P06 disclosure approval**.
8. Live Stripe — separate RED; not required to “start” P07 audit close but required before real money.
9. Optional GREEN: Functions audit overrides, Hosting headers, AI route auth, storage overwrite guard.
10. Security scans + evidence.
11. Legacy Expert read-only review.
12. Update `shared/launchReadinessManifest.js` to **P07 PASS** **only after proof**.

---

## 23. AMBER / RED approval packages (do not execute)

### RED-A — Confirm production Admin SDK user-managed keys

- **Action:** list keys on Firebase Admin SDK SA; expect **0**.
- **Status:** **DONE (P07C).** 0 user-managed keys. Historical `3cac` absent.
- **Env:** `taskio-v2`.
- **Command:** C1.
- **Effect:** evidence only.
- **Rollback:** N/A.
- **Verify:** count = 0.
- **Risk:** none if list-only.
- **Deps:** owner GCP access.

### RED-B — Confirm Cloud Run IAM / runtime

- **Action:** describe service + IAM policy; redact env.
- **Status:** **DONE (P07C).** Invoker policy empty; SA `taskio-api-runtime`; `STRIPE_ENABLED=false`.
- **Env:** `taskio-v2` `australia-southeast1`.
- **Command:** C2, C3.
- **Effect:** evidence.
- **Rollback:** N/A.
- **Verify:** no allUsers on main API; runtime SA = `taskio-api-runtime`; Stripe disabled.
- **Risk:** metadata exposure if pasted unredacted — redact.
- **Deps:** none.

### RED-C — Identity Toolkit allow homeowner signup

- **Action:** set `disabledUserSignup` to permit approved path.
- **Env:** staging first, then production.
- **Change:** Auth console / Identity Toolkit.
- **Effect:** brand-new Firebase users can be created.
- **Rollback:** set `disabledUserSignup=true` again.
- **Verify:** new homeowner OTP/signup works; Expert still `verified=false` without Admin Verify; `TASKIO_PUBLIC_SIGNUP_ENABLED` still controls Expert register.
- **Risk:** HIGH — opens account creation.
- **Deps:** P07 IAM confirm; do **not** OPEN posting until P10 plan exists.

### RED-D — Production App Check

- **Action:** register key, Hosting with App Check, then enforce Firestore then Storage.
- **Rollback:** disable enforcement **before** Hosting rollback (`docs/APP_CHECK.md`).
- **Deps:** P05 production batch; frontend site key.
- **Risk:** locking out old bundles.

### RED-E — Production Postmark

- **Action:** production SMTP secrets + Functions bind + authentic E01.
- **Rollback:** `EMAIL_ENABLED=false` / unbind.
- **Deps:** domain auth.
- **Risk:** mail to real users if mis-aimed — use production sender only after freeze lift.

### RED-F — Production GA4

- **Action:** production measurement ID + privacy settings; Hosting rebuild.
- **Rollback:** `REACT_APP_ANALYTICS_ENABLED` not true.
- **Deps:** **P06 disclosure**.
- **Risk:** unlawful/undisclosed tracking.

### RED-G — Live Stripe

- **Action:** mount `sk_live_`, live webhook secrets, `STRIPE_ENABLED=true`, `STRIPE_EXPECTED_LIVEMODE=true`.
- **Why:** real money requires live keys and webhooks.
- **Current verified state:** `STRIPE_ENABLED=false`; no Stripe secret names in `taskio-v2` Secret Manager; no production webhook Cloud Run service.
- **Env:** `taskio-v2`.
- **Proposed change:** named later batch only.
- **Expected effect:** live charges possible.
- **Rollback:** `STRIPE_ENABLED=false`.
- **Validation:** webhook signature + livemode guards.
- **Deps:** P07 IAM; P10.
- **Risk:** real charges.

### RED-H — Deploy P07B Storage rules

- **Action:** deploy current `storage.rules` (create-only posting photos; 2MB profile bound) to `taskio-v2`.
- **Why:** live ruleset `932c4f1b…` (2025-12-24) still uses `allow write` and has no P07B posting-attachment path.
- **Current verified state:** **PRODUCTION OLDER**.
- **Env:** `taskio-v2` Storage.
- **Proposed command:** later named `firebase deploy --project taskio-v2 --only storage` (do not run now).
- **Expected effect:** homeowners cannot overwrite existing posting objects.
- **Rollback:** restore ruleset `932c4f1b-cb8d-46b3-bf14-b53a971bb4f4`.
- **Validation:** emulator tests already PASS; then a named hosted upload proof.
- **Risk:** MEDIUM if a leftover client still expects overwrite.

### RED-I — Deploy P07B Hosting headers

- **Action:** deploy Hosting with conservative headers from `firebase.json`.
- **Why:** live version `cffca9d87ce03901` only has noindex/no-store. P07B nosniff / referrer / frame / Permissions-Policy / HSTS `max-age=31536000` are repo-only.
- **Current verified state:** custom domain HSTS `max-age=31556926` without includeSubDomains/preload; no P07B headers.
- **Env:** `taskio-v2` site `taskio-v2` / `taskio.com.au`.
- **Proposed command:** later named Hosting-only deploy. Do **not** add `includeSubDomains` or `preload`. Do **not** add CSP.
- **Expected effect:** browsers receive the P07B baseline on the custom domain.
- **Rollback:** `taskio-v2@cffca9d87ce03901`.
- **Validation:** HEAD `https://taskio.com.au` after deploy.
- **Risk:** MEDIUM if a future embed requires framing (none today).

### RED-J — Production Gmail Editor IAM (only if a change is required)

- **Finding (unchanged):** one personal `gmail.com` principal has `roles/editor` on `taskio-v2`. Identity was not recorded. **QUESTIONABLE / REVIEW REQUIRED.**
- **Do not assume** the role should be removed.
- **Owner decision first:** identify whether this is an expected Taskio operator/admin identity; determine the required least-privilege role.
- **Action if an IAM change is later approved:** remove, replace, or narrow the binding under an explicit RED package.
- **Why RED:** any production IAM mutation.
- **Env:** `taskio-v2`.
- **Proposed command:** none now. Later named `gcloud projects remove-iam-policy-binding` / equivalent only after owner identification.
- **Expected effect:** only if approved — least-privilege alignment.
- **Rollback:** restore the prior binding.
- **Validation:** project IAM get after any future change.
- **Risk:** locking out a still-needed operator if removed blindly.
- **No IAM mutation now.**

### RED-K — Production `helloTaskio` (only if removal is confirmed safe)

- **Finding (unchanged):** ACTIVE HTTP Function with `allUsers` invoker; not in current repo. **QUESTIONABLE / REVIEW REQUIRED.**
- **Do not delete or modify it now.** First establish whether anything still depends on it.
- **Action if later confirmed unused:** dedicated RED package to delete, disable, or change invokers, with rollback/evidence.
- **Why RED:** any production Function / Cloud Run / invoker mutation.
- **Env:** `taskio-v2` `australia-southeast1`.
- **Proposed command:** none now. Later named Functions/Cloud Run change only after dependency review.
- **Expected effect:** only if approved — leftover endpoint removed or locked down.
- **Rollback:** restore the prior Function revision/IAM.
- **Validation:** Functions list + invoker policy + a named smoke that intended email/Firestore functions still fire.
- **Risk:** breaking an undocumented caller.
- **Not a P07 PASS blocker by itself.**

### AMBER-A — Staging JSON key `f04d` (superseded by AMBER-D1)

- **P07C/P07D1:** still present. Local GAC still uses last-4 `f04d`. See **AMBER-D1**. Do not revoke in this task.

### GREEN-A (P07B local, this commit)

- Fail-closed `AI_DESCRIPTION_ENABLED` (guest tidy retained; no `requireAuth`).
- Hosting conservative headers; CSP deferred.
- Functions scoped overrides (nodemailer major not forced).
- Storage create-only posting photos + 2MB profile bound.

---

## 24. Launch-manifest status

- P07 **PASS:** **no**
- P07: **OPEN / REMEDIATION IN PROGRESS**
- P07A: **AUDIT COMPLETE**
- P07B: **LOCAL HARDENING COMPLETE**
- P07C: **READ-ONLY PRODUCTION VERIFICATION COMPLETE**
- P07D1: **STAGING CLEANUP PREPARED** (this document). AMBER-D1/D2 not executed.
- P03/P04/P05 production: **unchanged** (pending)
- P06: **OPEN** (unchanged)
- P09: **BLOCKED BY P06** (unchanged)
- READY TO OPEN: **impossible**

---

## 25. P07B local hardening record (19 September 2026)

### AI description — pre-change behaviour

`POST /api/generate-description` was unauthenticated. `JobPostingForm` on public `/post-job` calls it during step 1, **before** phone OTP and before a Firebase ID token exists. Adding `requireAuth` would break the supported guest posting UX.

It called Gemini whenever `GEMINI_API_KEY` was set. Body check was `mode === 'clarify'` only. Extra fields (`prompt`, `systemInstruction`, unused `jobType`) were ignored, not rejected. Route limiter 30/15m. App JSON limit 1mb. No App Check. Missing key or provider error → local tidy fallback. Quote assistant already required Expert auth but used the same “key present ⇒ call Gemini” rule.

Request body is `description` + `jobTypeLabel` (and unused `jobType`). It can contain **homeowner-typed** phone/email if the user puts it in the draft (the form warns). It does **not** send address, account phone/email fields, or photo bytes. P06 remains OPEN. This is not an AI privacy review.

### AI — final protection

Guest access retained. `AI_DESCRIPTION_ENABLED=true` **and** a non-empty Gemini key are both required before any provider call. Production default OFF. Strict allowlist (`mode`, `description`, `jobTypeLabel`, discarded `jobType`). Description ≤ 5000 chars (same as job create). Unknown/injection fields 400. Generic errors. No provider/secret details in responses. Same kill switch on quote assistant.

### Storage overwrite — root cause

`job-posting-attachments/{jobId}/{fileName}` used `allow write` (create+update+delete). The homeowner who owns the job could replace an existing object at a known path (silent overwrite / bait-and-switch after quotes). Client path was unique-ish (`Date.now()` + photo id) but still client-chosen and overwriteable. Chat/support already used `resource == null`. Photo replacement after post is **not** a product feature.

### Storage fix

Create-only posting photos. Client now uses `crypto.randomUUID()` object names under the job prefix (original filename stays in job metadata only). Timestamped `profilePhotos/` and leftover `profile-photos/` are create-only. Deterministic `profile-images/{uid}.jpg|.png` overwrite remains **explicit owner avatar replacement**.

### Profile size

Current UI (`ProfilePage`, `useHomeownerAccountState`) uses **2MB** on `profilePhotos/`. Leftover `profile-photos/` was 5MB and `profile-images/` was 3MB. Canonical bound is now **2MB** on all three. This closes a leftover permissiveness gap; it does not raise any limit.

### Hosting headers

Added: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/microphone/geolocation/payment/usb), `Strict-Transport-Security: max-age=31536000` without `includeSubDomains` or `preload`. `includeSubDomains` is deferred until a complete custom-domain inventory proves every browser-served subdomain is HTTPS-capable.

**Deferred (AMBER):** Content-Security-Policy. Current app depends on Firebase Auth + phone reCAPTCHA, Google Fonts, Firebase/Storage, API `fetch`/XHR, Stripe **hosted** checkout (redirect, not Elements), optional App Check reCAPTCHA, future GA4. An enforcing CSP needs hosted browser validation.

`payment=()` is acceptable: Taskio does not use Payment Request, Express Checkout, or Apple/Google Pay browser wallets. Checkout is a full-page redirect to `checkout.stripe.com`.

`includeSubDomains` is **not** set. Repo evidence shows HTTPS on `taskio.com.au`, `www`, and `app.taskio.com.au`, plus Microsoft 365 / autodiscover / mail DNS that was never inventoried as browser-HTTPS. Current live maintenance already sent HSTS without `includeSubDomains`. Staging cache guards now inspect `Cache-Control` only so HSTS `max-age` is not mistaken for a long-cache asset header.

Unit test asserts `firebase.json` / staging Hosting contain the baseline. Hosted enforcement is **not** proven.

### Functions advisories (high/critical, `--omit=dev`, 19 Sep 2026)

| Package | Direct? | Installed | Advisory (examples) | Runtime? | Fix | Action |
|---|---|---|---|---|---|---|
| `websocket-driver` | transitive | 0.7.4 | GHSA-mp7j-qc5w-4988 / GHSA-xv26-6w52-cph6 critical | faye-websocket / firebase tooling, not email send path | 0.7.5 patch | **Applied** |
| `protobufjs` | transitive | 7.5.4 | GHSA-xq3m-2v4x-88gg critical ACE | firebase-admin / grpc optional | 7.6.5 | **Applied** |
| `@grpc/grpc-js` | transitive optional | 1.14.3 | GHSA-5375-pq7m-f5r2 / GHSA-99f4-grh7-6pcq high crash | optional gRPC | 1.14.4 patch | **Applied** |
| `form-data` | transitive optional | 2.5.5 | GHSA-hmw2-7cc7-3qxx high CRLF | request/gaxios optional | 2.5.6 patch | **Applied** |
| `path-to-regexp` | transitive | 0.1.12 | GHSA-37ch-88jc-xwx2 high ReDoS | express (functions) | 0.1.13 patch | **Applied** |
| `fast-xml-parser` | transitive optional | 4.5.3 | GHSA-m7jm-9gc2-mpf2 critical XXE-class | `@google-cloud/storage` optional | 4.5.5 patch; 5.7 major left | **4.5.5 applied** |
| `nodemailer` | **direct** | 8.0.5 | several high/moderate; fix `10.0.10` major | **yes** — SMTP send | major | **REMAINING BLOCKER** |
| `node-forge` | transitive | 1.3.3 | several high (cert/signature) | firebase-admin JWT | 1.4.0 minor, not forced | remaining |
| `firebase-admin` | direct | 13.x | moderate via firestore; fix 14.4.0 major | yes | major | **not applied** |

Functions do not use websocket clients in product email code. Nodemailer is used; recipients/subjects are sanitised; raw/jsonTransport options are not exposed. Major nodemailer upgrade is a later approved slice.

### Frontend CRA

`--omit=dev` still reports 34 high / 3 critical. Criticals are CRA/webpack toolchain (`shell-quote`, `protobufjs`, `websocket-driver`). Production browser bundle is CRA-built React + Firebase + axios + react-router. No safe targeted critical remediation without CRA churn. **No frontend package change.**

### Logging

No concrete Authorization / ID-token / OTP / password / Stripe client-secret / payment-method / service-account / raw-body leak found on sensitive routes. AI provider `details` no longer dumped to console. No new logging framework.

---

## 26. P07C read-only production verification (19 September 2026)

**Operator:** `admin@taskio.com.au` (gcloud + Firebase CLI).
**gcloud:** 580.0.0. **Firebase CLI:** 15.1.0.
**Configured default gcloud project:** `taskio-v2` (recorded only; **not** changed).
**Commands:** explicit `--project=taskio-v2` / `--project=taskio-v2-staging`. No `firebase use`, no `gcloud config set project`, no deploy/update/create/delete/enable/disable/rotate.

### Repo vs live

| AREA | REPO EXPECTATION | LIVE OBSERVED | MATCH? | RISK | ACTION NEEDED |
|---|---|---|---|---|---|
| Project | `taskio-v2` | `taskio-v2` | YES | — | None |
| Runtime identity | `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com` | Same on `taskio-api` | YES | — | None |
| API revision | Documented later ABN-hardened image | `taskio-api-00006-puf` 100% (`abn-hardened`); image `…/taskio-api@sha256:f2de76fd…671c4bf6`; ingress all; maxScale 20; concurrency 80 | INFO | — | None now |
| IAM keys | 0 user-managed on Admin SDK / runtime | Admin SDK 0 USER_MANAGED (2 SYSTEM); runtime 0 USER_MANAGED; `3cac` absent | YES | — | Never recreate JSON |
| Staging key `f04d` | Outside A04; review | USER_MANAGED last-4 `f04d` still on staging Admin SDK (2026-08-15) | YES present | HIGH if copies | AMBER owner review |
| Project IAM | Owner = Taskio operator; runtime least privilege | Owner = Taskio operator; runtime has datastore + custom Auth role + secret accessor (resource). Default Compute/App Engine/Cloud Services have `roles/editor` (Google default). One personal Gmail has `roles/editor`. | QUESTIONABLE / REVIEW REQUIRED | MEDIUM | Owner identify first; any IAM change is RED-J |
| API invoker | Private / controlled | Empty Cloud Run IAM (no `allUsers`) | YES for current freeze | — | Keep private now. P10 must prove the real browser/API path. Do **not** add `allUsers` by assumption. |
| Functions | Email + Firestore triggers | GEN_2 ACTIVE `australia-southeast1` / nodejs24 / default Compute SA: `notifyHomeownerOnQuoteSubmitted`, `notifyTradieOnEscrowFunded`, `flagRiskyJobMessages` (Firestore). `helloTaskio` HTTP `allUsers`. Missing prod `notifyHomeownerOnQuoteSubmittedUpdate`. Last update **2026-04-11**. | PARTIAL | LOW leftover hello; email not P03-bound | Dependency review then RED-K if unused; P03 RED-E |
| Functions exposure | Event functions private; webhooks may be public | Event function Cloud Run IAM empty. `helloTaskio` PUBLIC. No prod Stripe webhook service. | MATCH for events; leftover hello QUESTIONABLE | LOW | RED-K if a production change is approved |
| Secret Manager | OTP_SALT; Stripe/SMTP not mounted | Names: `OTP_SALT` v1 enabled; `ABN_LOOKUP_GUID` v1 enabled; `ALERT_WEBHOOK_URL` **no versions**. No Stripe/SMTP/Gemini/OTP extras. | YES (ABN extra is optional) | LOW | Do not mount live Stripe/Gemini |
| Auth signup | `disabledUserSignup=true` | **true** | YES | Blocks OPEN | RED-C later + P10 |
| Auth providers | Phone + email as product | Email/password enabled; phone enabled; MFA DISABLED; authorised domains include `taskio.com.au` / `www` / `app` / Firebase hosts / localhost | YES | — | Do not toggle |
| App Check | Production enforcement OFF | Firestore, Storage, Auth `UNENFORCED` | YES | HIGH at public launch | RED-D / P05 |
| Storage rules | P07B create-only in repo | Live ruleset `932c4f1b…` **2025-12-24**; `allow write`; no posting create-only | **PRODUCTION OLDER** | MEDIUM overwrite | RED-H |
| Firestore rules | Not changed in P07B | Live ruleset `7d46b484…` last update **2026-04-26** | INFO / possibly older than later local Firestore work | LOW for this slice | Separate if needed |
| Hosting | P07B headers in repo | Live `cffca9d87ce03901` 2026-08-19; 7 files; title “Taskio is almost ready”; headers noindex + no-store only | **PRODUCTION OLDER** | MEDIUM | RED-I |
| Email | Production pending | No SMTP/Postmark secret names in prod SM; Functions not rebound since April 2026 | YES pending | HIGH ops | RED-E / P03 |
| Analytics | Production OFF | Maintenance HTML; no gtag / `G-` | YES | — | RED-F after P06 |
| Stripe | Production off | `STRIPE_ENABLED=false`; no Stripe secret names; no prod webhook service | YES | — | RED-G later |
| AI | Fail-closed OFF | `AI_DESCRIPTION_ENABLED` **absent** (not `true`). `GEMINI_MODEL` set; **no** Gemini secret. Provider **not** eligible. | YES | — | Do not enable |
| Public Expert signup flag | Fail-closed in production if unset | `TASKIO_PUBLIC_SIGNUP_ENABLED` **absent** + `NODE_ENV=production` ⇒ disabled | YES | — | Keep |
| CORS | Taskio origin only | `CORS_ORIGINS=https://taskio.com.au`; `TRUST_PROXY=true` | YES | — | Keep |
| Pilot settings | Must not exist | `system/pilotSettings` **404** ⇒ Homeowner CLOSED / Expert WAITLIST | YES | — | Do not create |
| Legacy Experts | Review before OPEN | Count-only: **18** `role=tradie`; **38** users. No PII exported. | INFO | HIGH if opened blindly | P07-17 review later |

### Classification

| Finding | Class |
|---|---|
| 0 prod user-managed JSON keys; runtime ADC | GREEN LOCAL / verified |
| API IAM-private; Stripe off; AI off; analytics off; pilotSettings absent | GREEN LOCAL / verified |
| Staging `f04d` | **DELETED / REVOKED FROM STAGING** (P07D2B / AMBER-D1B COMPLETE). Historical cloud use **UNKNOWN**. |
| Staging CSP / hosted browser validation | **AMBER-D2 COMPLETE** (Report-Only live on `e97a303dcf995e37`). Enforcement not started. |
| Personal Gmail Editor finding | QUESTIONABLE / REVIEW REQUIRED; **any IAM change is RED** |
| `helloTaskio` leftover finding | QUESTIONABLE / REVIEW REQUIRED; **any Function/IAM change is RED** |
| Auth signup enablement | RED |
| App Check / email / GA4 / live Stripe enablement | RED |
| Production Storage rules deploy | RED |
| Production Hosting deploy | RED |
| Production IAM / Function removal or invoker change | RED |

IAM-private `taskio-api` (no public invoker) is acceptable while production is frozen/maintenance-only. Before public production acceptance, **P10** must prove the actual supported browser/API path end to end. Do not change Cloud Run IAM now. Do not assume `allUsers` must be added.

**Production mutation in P07C:** none.

---

## 27. P07D1 staging security cleanup preparation (19 September 2026)

Read-only. Explicit `--project=taskio-v2-staging`. No `firebase use`. No `gcloud config set project`. No revoke/deploy/IAM/Auth/App Check/secret change. Production `taskio-v2` not mutated.

**Operator:** `admin@taskio.com.au`. Default gcloud project remains `taskio-v2` (unchanged).

### f04d metadata

| Field | Value |
|---|---|
| Service account | `firebase-adminsdk-fbsvc@taskio-v2-staging.iam.gserviceaccount.com` |
| Key type | USER_MANAGED (plus 1 SYSTEM_MANAGED) |
| Created | 2026-08-15T12:02:07Z |
| Last-4 | `f04d` |
| Disabled | no |
| Private material | not retrieved |

### Repo / local dependency

Tracked code never ships this JSON. CI image tests forbid `serviceAccountKey.json`. Cloud Run must use ADC (`K_SERVICE`). Staging Hosting wrapper strips `GOOGLE_APPLICATION_CREDENTIALS` from child env.

**Local operator still depends on it:** gitignored `backend/.env` sets `GOOGLE_APPLICATION_CREDENTIALS` to an out-of-repo file whose `private_key_id` last-4 is `f04d` and `client_email` is the staging Admin SDK SA. Filename basename only: `taskio-v2-staging-admin.json`. Production JSON filenames remain absent. Ignored `setAdmin.js` / `debug.js` / `bootstrapAdmin.js` exist as files and are not required by CI.

### Cloud-use evidence

Admin SDK key-name audit query for last-4 `f04d` over 90 days returned **no rows**. A follow-up IAM Create/Delete key log query did not finish in time. Data-access logs that would attribute each API call to a user-managed key ID are **not proven enabled**. Therefore cloud key-use attribution is **UNKNOWN**. Empty logs do not prove unused.

### Staging runtime identities (attached SA, not downloaded JSON)

| Workload | Identity |
|---|---|
| `taskio-api-staging` (`taskio-api-staging-54aed8b`) | `taskio-api-staging-runtime@taskio-v2-staging.iam.gserviceaccount.com` |
| `taskio-stripe-webhook-staging` | `taskio-webhook-staging-runtime@taskio-v2-staging.iam.gserviceaccount.com` |
| Functions `notifyHomeownerOnQuoteSubmitted` / `Update` | default Compute `1077378545256-compute@developer.gserviceaccount.com` |

These do not need `f04d`.

### f04d classification

**B. LIKELY REQUIRED** — required today for the operator local backend GAC path. Not required for deployed staging Cloud Run/Functions. **Not C.** Do not revoke while that GAC still points at the JSON.

### Staging Hosting baseline

| Field | Value |
|---|---|
| Site | `taskio-v2-staging` |
| URL | `https://taskio-v2-staging.web.app` |
| Version | `211fb288dcaff973` (2026-09-06) |
| Files | 87 / ~87.8 MB (full SPA, not maintenance) |
| Deployed headers | `Cache-Control: no-store, max-age=0, must-revalidate`; `X-Robots-Tag: noindex, nofollow, noarchive` |
| Repo P07B headers | **not** on this live release (nosniff / referrer / DENY / Permissions-Policy / HSTS `max-age=31536000`) |
| Browser HSTS on `*.web.app` | Firebase default `max-age=31556926; includeSubDomains; preload` (not our `firebase.json`) |
| Title | Taskio \| Trusted Home Service Marketplace |
| Bundle | `/static/js/main.70b28def.js`, `/static/css/main.5e46c8ad.css` |

### Browser / network inventory (GET only)

Safe GET of `/`, `/login`, `/post-job` (SPA shell only). No OTP, no user create, no job submit, no Stripe charge.

Documented HTML origins: `'self'`, `fonts.googleapis.com`, `fonts.gstatic.com`.

Hosted JS host literals (ignore comment/string false positives such as github.com / react.dev / instagram): API `taskio-api-staging-d6mdcsrwea-ts.a.run.app`; `www.googletagmanager.com` + measurement `G-SZ7RZDKTJY`; `content-firebaseappcheck.googleapis.com`; `www.google.com`; `apis.google.com`; `securetoken.google.com`; identitytoolkit / firestore / firebasestorage / recaptcha strings present. `checkout.stripe.com` / `js.stripe.com` **not** in the bundle (Checkout URL comes from the API at runtime).

### CSP origin inventory

| Directive | Origins | Why | Feature | Staging/prod | Self-only? | Remove? | Evidence |
|---|---|---|---|---|---|---|---|
| default-src | `'none'` | fail closed | baseline | both | n/a | no | policy design |
| script-src | `'self'` `https://www.google.com` `https://www.gstatic.com` `https://www.recaptcha.net` `https://www.googletagmanager.com` `https://www.google.com/recaptcha/` | Auth phone reCAPTCHA + App Check + GA4 | Auth, P05, P04 | staging now; prod later | no | no | HTML/JS + code |
| style-src | `'self'` `'unsafe-inline'` `https://fonts.googleapis.com` | Google Fonts + many React inline styles | UI | both | no | unsafe-inline not removable without a style rewrite | `index.html`; component style props |
| font-src | `'self'` `https://fonts.gstatic.com` | Inter/Poppins | UI | both | no | fonts could later be self-hosted | `index.html` |
| img-src | `'self'` `blob:` `https://www.gstatic.com` `https://www.google.com` `https://firebasestorage.googleapis.com` `https://taskio-v2-staging.firebasestorage.app` | favicons, recaptcha assets, Storage photos, job preview `createObjectURL` | posting/profile | staging bucket now | no | `blob:` required for preview | JobPostingForm; Storage |
| connect-src | `'self'` `https://taskio-api-staging-d6mdcsrwea-ts.a.run.app` `https://identitytoolkit.googleapis.com` `https://securetoken.googleapis.com` `https://firestore.googleapis.com` `https://firebasestorage.googleapis.com` `https://firebaseinstallations.googleapis.com` `https://content-firebaseappcheck.googleapis.com` `https://www.googleapis.com` `https://www.google.com` `https://www.gstatic.com` `https://www.recaptcha.net` `https://www.google-analytics.com` `https://analytics.google.com` `https://www.googletagmanager.com` | API, Auth, Firestore, Storage, App Check, recaptcha, GA4 | core | staging hosts | no | drop GA4 only if analytics rebuilt off | JS + P04/P05 |
| frame-src | `https://www.google.com` `https://www.recaptcha.net` | invisible reCAPTCHA iframe | phone Auth / App Check | both | no | no | Firebase Auth |
| frame-ancestors | `'none'` | no product embed | clickjack | both | yes | no | X-Frame-Options DENY intent |
| form-action | `'self'` | no third-party forms | UX | both | yes | Stripe is top-level navigation, not a form post | PaymentPage redirect |
| base-uri | `'self'` | lock base | XSS | both | yes | no | baseline |
| object-src | `'none'` | no plugins | XSS | both | n/a | no | baseline |

Do **not** allow `*`, `https:`, github.com, react.dev, instagram, localhost, or `taskio.invalid` (bundle string false positives). Avoid `data:` unless a later Report-Only violation proves a real image/font data URI. No `upgrade-insecure-requests` (HTTPS already; mixed-content not a staging goal). No `unsafe-eval` unless Report-Only proves it.

### Firebase / App Check CSP

Staging App Check: Firestore **ENFORCED**, Storage **ENFORCED**, Auth **UNENFORCED** (unchanged). A CSP that blocks `www.google.com` / `www.gstatic.com` / `www.recaptcha.net` / `content-firebaseappcheck.googleapis.com` will break token minting and then Storage/Firestore. That is the main interaction risk.

Phone Auth `RecaptchaVerifier` also needs those script/frame/connect origins. Do not send OTP during the future validation; rendering the verifier is enough for CSP smoke.

### Stripe CSP

Current live path is **full-page HTTPS navigation** to `checkout.stripe.com` `/pay` only (`stripeHostedCheckoutUrl.js`). Expert dashboard/onboarding may navigate to `connect.stripe.com`. Neither requires `js.stripe.com` / Elements / Payment Request in the current bundle. Do **not** widen script-src for unused Elements. Future P10 embedded checkout would need a new CSP review.

### Proposed strategy

**B. Content-Security-Policy-Report-Only first** on staging, observe console/report violations during the matrix, then enforce. CRA inline styles + Firebase reCAPTCHA + App Check + GA4 are too many moving parts for a first enforcing deploy. No third-party report-uri required for MVP; browser console during controlled tests is enough.

### Proposed Report-Only policy (staging draft — not deployed)

```
default-src 'none';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.googletagmanager.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' blob: https://www.gstatic.com https://www.google.com https://firebasestorage.googleapis.com https://taskio-v2-staging.firebasestorage.app;
connect-src 'self' https://taskio-api-staging-d6mdcsrwea-ts.a.run.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://firebaseinstallations.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com;
frame-src https://www.google.com https://www.recaptcha.net;
```

`'unsafe-inline'` on **style-src** is evidenced by current React inline styles. Do not add `'unsafe-inline'` or `'unsafe-eval'` to script-src unless Report-Only proves it. Do not add this header to production in AMBER-D2.

### Staging browser validation matrix (future AMBER-D2)

| Surface | Action | PASS | FAIL |
|---|---|---|---|
| Landing | GET `/` desktop + 390px | shell + fonts; no CSP block | blank/font fail; script blocked |
| Login | open `/login`; recaptcha container mounts; **do not send OTP** | UI + no console CSP error | recaptcha/script blocked |
| `/post-job` | guest step 1; tidy with AI off | fallback description; no CSP error | generate-description blocked |
| Phone UI | recaptcha node present; **no OTP** | verifier constructs | recaptcha-container / script fail |
| Expert/Admin | login UI only if existing synthetic session; else stop at login | no new users | creating accounts |
| Images | existing public/self assets + preview blob | images load | Storage/App Check 401 from CSP |
| API | authenticated or public status GET only | connect-src allows API | API blocked |
| App Check | Storage/Firestore still work for an already-authorised synthetic if available | no token/CSP errors | enforcement errors after CSP |
| Stripe | inspect Payment page code path; **do not create Checkout Session** | no need for js.stripe.com | charge created (stop) |
| Console | zero unexpected Report-Only violations on required origins | PASS | unknown blocked origin |
| Mobile | 390 viewport landing + login | same as desktop | layout/CSP only on mobile |

Stop if any mutation would be required (OTP, job create, Stripe charge, new user).

### AMBER-D1 — staging f04d remediation (do not execute)

- **ACTION:** (1) Point local operator backend off this JSON (ADC / `gcloud auth application-default login` scoped to staging, or a new dedicated local identity). Prove `npm` backend against staging still works **without** `GOOGLE_APPLICATION_CREDENTIALS`. (2) Only then delete USER_MANAGED key last-4 `f04d`.
- **ENVIRONMENT:** `taskio-v2-staging` + operator laptop. Not production.
- **CURRENT STATE:** **COMPLETE.** Step 1 proven in P07D2A. Step 2 executed in P07D2B: USER_MANAGED last-4 `f04d` deleted; local JSON deleted after validation.
- **WHY:** shrink stolen-JSON risk after the local path no longer needs it.
- **EXACT CHANGE (step 2 only, after step 1 PASS):** `gcloud iam service-accounts keys delete <FULL_KEY_ID> --iam-account=firebase-adminsdk-fbsvc@taskio-v2-staging.iam.gserviceaccount.com --project=taskio-v2-staging` where `<FULL_KEY_ID>` is resolved at execution time from last-4 `f04d`.
- **EXPECTED EFFECT:** that private key stops working. Local GAC file becomes useless.
- **ROLLBACK:** the same private key **cannot** be restored. Recovery is a **new** USER_MANAGED key only if a JSON path is still genuinely required (prefer not).
- **VALIDATION:** key list shows 0 USER_MANAGED; staging API revision unchanged; Functions ACTIVE; local backend without GAC uses ADC.
- **RISK:** HIGH if step 2 runs while GAC still set — local Admin SDK fails immediately.
- **STOP CONDITIONS:** any production project flag; Cloud Run still showing a JSON env; operator has not completed step 1.

### AMBER-D2 — staging CSP Report-Only + browser validation

- **ACTION:** Hosting-only staging deploy adding `Content-Security-Policy-Report-Only` plus already-local P07B headers. Observe console. Do **not** enforce.
- **ENVIRONMENT:** `taskio-v2-staging` site `taskio-v2-staging` only.
- **CURRENT STATE:** **COMPLETE.** Final Hosting `e97a303dcf995e37` (2026-09-19T14:29:17Z). Pre-D2 `211fb288dcaff973` file hashes unchanged. SPA still `main.70b28def.js`. See §31.
- **WHY:** learn real violations before enforcement; protect App Check/Auth.
- **EXACT CHANGE:** wrapper `node frontend/scripts/deploy-staging-hosting.js --project taskio-v2-staging --config firebase.staging.hosting.json --execute` with a hash-verified snapshot of `211fb288dcaff973` in `frontend/build` (owner local build restored after each deploy).
- **EXPECTED EFFECT:** browsers report violations; app still functions.
- **ROLLBACK:** revert only `firebase.staging.hosting.json` headers/CSP and redeploy the **same** hash-verified SPA. Do **not** Hosting-rollback to `211fb288dcaff973` while Firestore/Storage App Check remain ENFORCED.
- **VALIDATION:** matrix in §31; Firestore/Storage App Check still ENFORCED; no OTP/Stripe mutation.
- **RISK:** MEDIUM if an origin was missed — Report-Only should not break the app.
- **STOP CONDITIONS:** production project; enforcing CSP in this slice; adding `js.stripe.com` without a product change; disabling App Check to “make CSP pass”.

P07 remains **OPEN / REMEDIATION IN PROGRESS**. Not PASS. READY TO OPEN remains impossible.

---

## 28. P07D2A local ADC migration — STOPPED pending owner login (19 September 2026)

No staging mutation. No production mutation. f04d **not** deleted, disabled, revoked, or rotated. No product-code change. Local `.env` remains untracked.

**Operator:** `admin@taskio.com.au`. Default gcloud project remains `taskio-v2` (unchanged). Firebase CLI logged in as `admin@taskio.com.au`. gcloud `580.0.0`.

### Old local credential model

Tracked `backend/src/firebaseAdmin.js` does **not** call `applicationDefault()` by name. Order:

1. If `GOOGLE_APPLICATION_CREDENTIALS` is set: Taskio **manually** `require()`s that JSON and calls `admin.credential.cert(...)` with `projectId` from the file `project_id`. Google’s ADC chain is **not** used on this path.
2. Else if `FIREBASE_SERVICE_ACCOUNT_JSON` is set: parse + `cert()` + file `project_id`.
3. Else: `admin.initializeApp()` with no options → firebase-admin loads ADC and (if `FIREBASE_CONFIG` is unset) leaves `projectId` unset so later `GoogleAuth.getProjectId()` decides the project.

No tracked `serviceAccountKey.json` path. Local `backend/.env` still has an active GAC line whose basename is `taskio-v2-staging-admin.json` and whose `private_key_id` last-4 is `f04d` (staging project class). `FIREBASE_SERVICE_ACCOUNT_JSON` is unset.

### Explicit staging project guard

Canonical Taskio variable is existing `GOOGLE_CLOUD_PROJECT` (`backend/env.staging.example`, `deploymentEnvironment.js`). Companion `TASKIO_DEPLOYMENT_ENV=staging` is required if that project id is ever validated.

Local `.env` previously had **neither**. google-auth-library `getProjectId()` precedence is:

1. `GCLOUD_PROJECT` then `GOOGLE_CLOUD_PROJECT`
2. GAC JSON `project_id` if GAC is set
3. `gcloud config config-helper` (local default is production `taskio-v2`)

Dry-run (no Firestore, no tokens printed):

| Condition | Resolved project class |
|---|---|
| No GAC, no explicit project env | **PRODUCTION** (`taskio-v2` via gcloud default) |
| No GAC, `GOOGLE_CLOUD_PROJECT=taskio-v2-staging` | **STAGING** |
| No GAC, both `GOOGLE_CLOUD_PROJECT=taskio-v2-staging` and `GCLOUD_PROJECT=taskio-v2` | **PRODUCTION** (`GCLOUD_PROJECT` wins) |

Therefore ADC migration **must not** rely on the gcloud default. Local untracked `.env` now sets `GOOGLE_CLOUD_PROJECT=taskio-v2-staging` and `TASKIO_DEPLOYMENT_ENV=staging`. `GCLOUD_PROJECT` remains unset. GAC line was **not** commented.

This proves the intended Admin/ADC project after GAC removal, **if** dotenv loads `backend/.env` (start from `backend/`). It does **not** prove ADC credentials exist.

### ADC state

**ADC ABSENT.** Well-known `application_default_credentials.json` is not present. `GoogleAuth.getClient()` without GAC: `Could not load the default credentials`. No ADC file was created or overwritten. Interactive `gcloud auth application-default login` was **not** run.

### Required owner action (local ADC store only)

Run, signed in as `admin@taskio.com.au`:

```
gcloud auth application-default login admin@taskio.com.au --project=taskio-v2-staging
```

`--project` applies to **this invocation only** so the quota project written into ADC is `taskio-v2-staging`. It must **not** be replaced with `gcloud config set project`. Default gcloud project must stay `taskio-v2`.

This command changes the **local ADC credential store only**. It does **not** create a service-account key, change IAM, change the stored gcloud project, or change Firebase settings. Do not use production as the ADC quota project merely because it is the CLI default.

If login writes the wrong quota project, follow with:

```
gcloud auth application-default set-quota-project taskio-v2-staging
```

Then resume P07D2A. Do not comment GAC, do not query Firestore on ADC, and do not delete f04d until that resume proves ADC.

### Remaining JSON-key references

| Finding | Class |
|---|---|
| Local `backend/.env` GAC → `taskio-v2-staging-admin.json` / f04d | **REQUIRED** (current operator backend) |
| `backend/src/firebaseAdmin.js` GAC/`cert()` branch | **REQUIRED** while GAC is set; ADC fallback already exists |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | unused locally |
| `backend/setAdmin.js` `require("./serviceAccountKey.json")` | **IGNORED LOCAL FILE** / LEGACY; production JSON **absent** |
| `backend/debug.js` inspects `serviceAccountKey.json` | **IGNORED LOCAL FILE** |
| `scripts/bootstrapAdmin.js` `initializeApp()` | **IGNORED LOCAL FILE**; would use GAC or ADC |
| `backend/env.example` GAC comments | **DOC ONLY** |
| `frontend/scripts/stagingHostingLib.cjs` strips GAC from child env | **TEST / defensive** |
| `frontend/scripts/stagingHosting.test.cjs` | **TEST FIXTURE** |
| CI image `serviceAccountKey.json` absence checks | **TEST FIXTURE** |

### Secret / git hygiene

`backend/.env` is gitignored and untracked. `**/serviceAccountKey.json` ignored. Production JSON filenames absent. No ADC file inside the repo. No credential committed. f04d JSON file left untouched.

### f04d classification

Remains **B LIKELY REQUIRED** for the current local operator GAC workflow. Cloud Run/Functions still use attached identities. Cloud historical use remains **UNKNOWN**. AMBER-D1B deletion package is **not eligible**.

P07 remains **OPEN / REMEDIATION IN PROGRESS**. Not PASS. READY TO OPEN remains impossible.

---

## 29. P07D2A local ADC migration — PROVEN (19 September 2026)

No staging mutation. No production mutation. f04d **not** deleted, disabled, revoked, or rotated. Local f04d JSON file **not** deleted. No product-code change. Local `.env` remains untracked.

**Operator:** `admin@taskio.com.au`. Default gcloud project remains `taskio-v2` (unchanged). ADC quota project class **STAGING**. ADC type `authorized_user`.

### ADC model now in use

Owner completed `gcloud auth application-default login admin@taskio.com.au --project=taskio-v2-staging`. Well-known ADC file exists outside the repo. Identity check (userinfo, no token printed) returned `admin@taskio.com.au`.

Local untracked `backend/.env`:

- `GOOGLE_CLOUD_PROJECT=taskio-v2-staging`
- `TASKIO_DEPLOYMENT_ENV=staging`
- `GOOGLE_APPLICATION_CREDENTIALS` **commented** (`# P07D2A ADC:`)
- `FIREBASE_SERVICE_ACCOUNT_JSON` unset
- `GCLOUD_PROJECT` unset

`backend/src/firebaseAdmin.js` therefore takes the no-options `initializeApp()` path and loads `ApplicationDefaultCredential`. The GAC/`cert()` branch is no longer used by the local operator workflow.

### Explicit project guard / production fail-fast

Before any Firestore/Admin data access:

- GAC absent
- `GOOGLE_CLOUD_PROJECT` exactly `taskio-v2-staging`
- `GCLOUD_PROJECT` unset
- `GoogleAuth.getProjectId()` exactly `taskio-v2-staging`

Mismatch would abort before reads. Result: **STAGING**. gcloud default `taskio-v2` was not used.

### Read-only proof

| Check | Result |
|---|---|
| Admin credential class | `ApplicationDefaultCredential` (not `ServiceAccountCredential`) |
| Resolved project after init | `taskio-v2-staging` |
| `system/pilotSettings` GET | succeeded; document **absent**; no write |
| `validateEnv()` | passed (expected warn: no explicit GAC) |
| `GET /health/live` | 200 |
| `GET /health/ready` | 200; Firestore check ok (`_health` read-only) |

No jobs, users, OTP, email, Stripe, Gemini, or pilot-settings writes.

### Remaining JSON-key references

| Finding | Class |
|---|---|
| Local `backend/.env` GAC line | **LEGACY** (commented; not active) |
| Out-of-repo `taskio-v2-staging-admin.json` / f04d | **LEGACY** file retained; not loaded |
| Cloud USER_MANAGED key last-4 `f04d` | **PRESENT**; no active Taskio workflow uses it |
| `backend/src/firebaseAdmin.js` GAC/`cert()` branch | **LEGACY** fallback; unused while GAC is unset |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | unused locally |
| `backend/setAdmin.js` `require("./serviceAccountKey.json")` | **IGNORED LOCAL FILE** / LEGACY; production JSON **absent** |
| `backend/debug.js` inspects `serviceAccountKey.json` | **IGNORED LOCAL FILE** |
| `scripts/bootstrapAdmin.js` `initializeApp()` | **IGNORED LOCAL FILE**; now ADC if run |
| `backend/env.example` GAC comments | **DOC ONLY** |
| `frontend/scripts/stagingHostingLib.cjs` strips GAC | **TEST / defensive** |
| `frontend/scripts/stagingHosting.test.cjs` | **TEST FIXTURE** |
| CI image `serviceAccountKey.json` absence checks | **TEST FIXTURE** |
| `validateEnv.js` missing-GAC warning | **LEGACY** warning only |

Current Taskio workflows no longer require f04d based on repo, runtime and local ADC validation. Cloud historical use remains **UNKNOWN**. Empty earlier key-name audit rows do not prove unused.

### Secret / git hygiene

`backend/.env` gitignored and untracked. ADC file is outside the repo. Production JSON filenames absent. f04d JSON file left on disk. No credential staged or committed.

### f04d classification

**NO ACTIVE DEPENDENCY FOUND — READY FOR SEPARATE AMBER REVOCATION**

This does **not** mean deleted. This does **not** mean cloud historical use is proven absent.

### AMBER-D1B — delete USER_MANAGED staging key f04d (**COMPLETE**)

- **ACTION:** delete the USER_MANAGED staging key ending `f04d`
- **PROJECT:** `taskio-v2-staging`
- **SERVICE ACCOUNT:** `firebase-adminsdk-fbsvc@taskio-v2-staging.iam.gserviceaccount.com`
- **PRECONDITIONS:** ADC proof passed; local GAC dependency removed; deployed runtimes use attached identities; key ID verified immediately before deletion
- **EXPECTED EFFECT:** long-lived downloaded staging credential becomes invalid
- **ROLLBACK:** the same private key cannot be restored; if genuinely necessary, create a **NEW** credential only after diagnosis and explicit approval
- **VALIDATION:** local ADC read proof; backend local init; staging deployed services remain healthy; no unexpected auth failures
- **STOP CONDITIONS:** ADC failure; project mismatch; unidentified key dependency; unexpected staging service identity
- **EXECUTED:** 19 September 2026 in P07D2B. Last-4 `f04d` only recorded. Full key ID not copied here.

P07 remains **OPEN / REMEDIATION IN PROGRESS**. Not PASS. READY TO OPEN remains impossible.

---

## 30. P07D2B AMBER-D1B execution (19 September 2026)

Staging credential mutation only. No production mutation. No replacement key. No IAM/Auth/App Check/Hosting/rules/secret/deploy change. Default gcloud project remains `taskio-v2`.

**Operator:** `admin@taskio.com.au`. ADC `authorized_user`, quota project **STAGING**. Local `.env`: `GOOGLE_CLOUD_PROJECT=taskio-v2-staging`, `TASKIO_DEPLOYMENT_ENV=staging`, GAC absent.

### Pre-deletion

Fresh process: fail-fast resolved project `taskio-v2-staging`; Admin `ApplicationDefaultCredential`; `system/pilotSettings` GET succeeded (absent, no write); `/health/live` 200; `/health/ready` 200.

Key identification (read-only list):

| Field | Value |
|---|---|
| Project | `taskio-v2-staging` |
| Service account | `firebase-adminsdk-fbsvc@taskio-v2-staging.iam.gserviceaccount.com` |
| Type | USER_MANAGED |
| Created | 2026-08-15T12:02:07Z |
| Last-4 | `f04d` |
| Unique match | yes (1 USER_MANAGED, 1 SYSTEM_MANAGED) |

### Deletion

Approved `gcloud iam service-accounts keys delete` ran once against that exact key. Exit 0.

### Post-deletion cloud list

0 USER_MANAGED. 1 SYSTEM_MANAGED remains. last-4 `f04d` absent. No other USER_MANAGED key was present to delete.

Historical / cloud key-use remains **UNKNOWN**.

### Post-deletion proofs

Fresh ADC process: same fail-fast + `ApplicationDefaultCredential` + `system/pilotSettings` absent GET + `/health/live` 200 + `/health/ready` 200.

Deployed staging (read-only):

| Workload | Result |
|---|---|
| `taskio-api-staging` | Ready=True; 100% `taskio-api-staging-54aed8b`; SA `taskio-api-staging-runtime@…` |
| `taskio-stripe-webhook-staging` | Ready=True; 100% `…-00007-8tx`; SA `taskio-webhook-staging-runtime@…` |
| Functions `notifyHomeownerOnQuoteSubmitted` / `…SubmittedUpdate` | ACTIVE |
| Authorized GET API `/health/live` and `/health/ready` | 200 / 200 |

Identities unchanged. No redeploy.

### Local JSON

`taskio-v2-staging-admin.json` verified as staging `service_account` last-4 `f04d`, not the ADC file, then deleted from the filesystem. ADC file left in place. This is filesystem delete only, not forensic erasure.

Commented GAC line removed from untracked `backend/.env`. Project guard vars kept.

### Remaining references

| Finding | Class |
|---|---|
| This document / tracker / status | **DOC** |
| `backend/env.example` GAC comment | **DOC** |
| `firebaseAdmin.js` GAC/`cert()` fallback | **LEGACY CODE** (unused while GAC unset) |
| `validateEnv.js` missing-GAC warning | **LEGACY CODE** |
| stagingHosting strip + CI image checks | **TEST** |
| Ignored `setAdmin.js` / `debug.js` | **LEGACY CODE** / ignored |

No ACTIVE Taskio dependency on the revoked JSON credential.

### Classification

- **AMBER-D1B = COMPLETE**
- f04d: **DELETED / REVOKED FROM STAGING**
- local JSON: **DELETED AFTER VALIDATION**
- local authentication: **ADC**
- project guard: `GOOGLE_CLOUD_PROJECT=taskio-v2-staging`
- historical/cloud key-use: **UNKNOWN**
- deployed runtime identities: **unchanged**

P07 remains **OPEN / REMEDIATION IN PROGRESS**. Not PASS. Remaining: CSP **enforcement** (separate decision after authenticated-path proof), production Auth/App Check/email/analytics/Stripe/Storage rules/Hosting, Functions remaining highs, legacy Expert review, other documented RED/AMBER items. P06 OPEN. P09 BLOCKED BY P06. READY TO OPEN remains impossible.

---

## 31. P07D2 AMBER-D2 staging CSP Report-Only (20 September 2026 AEST)

Staging Hosting mutation only. No product SPA rebuild. No production mutation. No App Check / Auth / rules / IAM / secret change. No OTP, job, Stripe, Gemini, or email send.

**Operator:** `admin@taskio.com.au`. Default gcloud project remains `taskio-v2` (unchanged). Firebase CLI `admin@taskio.com.au`.

### Content-preserving deploy proof

Local `frontend/build` at execute time was a **different** SPA (`main.e5458aef.js`). Current HEAD rebuild would have uploaded new product code and was **not** used.

Official Hosting files API for pre-D2 version `211fb288dcaff973`: 85 user files (plus Firebase `/__/` injects). Each file was downloaded from `https://taskio-v2-staging.web.app` and matched official gzip SHA-256 (level 9). Snapshot used as the deploy public directory. Wrapper reported **85 files**. After both deploys, Hosting file hashes were **identical** to `211fb288dcaff973` (`changedCount=0`). Live index still references `/static/js/main.70b28def.js` and `/static/css/main.5e46c8ad.css`.

### Releases

| Stage | Version | Time (UTC) |
|---|---|---|
| Pre-D2 | `211fb288dcaff973` | 2026-09-06T08:41:21Z |
| D2 initial Report-Only + P07B headers | `aba6556e0164b46a` | 2026-09-19T14:23:57Z |
| D2 iteration 1 (`manifest-src 'self'`) | `e97a303dcf995e37` | 2026-09-19T14:29:17Z |

### Final Report-Only policy (live)

```
default-src 'none'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; script-src 'self' https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: https://www.gstatic.com https://www.google.com https://firebasestorage.googleapis.com https://taskio-v2-staging.firebasestorage.app; connect-src 'self' https://taskio-api-staging-d6mdcsrwea-ts.a.run.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://firebaseinstallations.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseappcheck.googleapis.com https://www.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://apis.google.com https://taskio-v2-staging.firebaseapp.com; frame-src https://www.google.com https://www.recaptcha.net https://taskio-v2-staging.firebaseapp.com
```

Reconciled from §27 draft before first deploy using hosted bundle literals: `firebaseappcheck.googleapis.com`, `apis.google.com`, `taskio-v2-staging.firebaseapp.com`. Iteration 1 added `manifest-src 'self'` after Chrome `securitypolicyviolation` on `/manifest.json` (`default-src 'none'` fallback). No `*`. No `unsafe-eval`. No `js.stripe.com`. No enforced `Content-Security-Policy`.

Live P07B headers: nosniff, referrer-policy, `X-Frame-Options: DENY`, Permissions-Policy, no-store, noindex. Taskio HSTS config remains `max-age=31536000` without includeSubDomains/preload. Observed response HSTS is Firebase platform `max-age=31556926; includeSubDomains; preload` (same class as pre-D2).

### Browser matrix (Chrome headless CDP against hosted staging)

| Surface | Result |
|---|---|
| Landing 1440 / 390 | PASS — fonts, images, GA4 collect 204, App Check exchange 200, recaptcha enterprise script/iframe 200 |
| Login 1440 / 390 | PASS — UI; `#taskio-login-recaptcha` present; enterprise recaptcha iframe; **no OTP** |
| `/post-job` 1440 / 390 | PASS as hosted — invite-only gate (“Log in to post a task”; guest signup closed). **Not** a CSP failure |
| Guest tidy / photo preview | **NOT EXECUTED** — hosted SPA has no guest form |
| Phone RecaptchaVerifier send | **NOT EXECUTED** — would send OTP |
| Synthetic homeowner/Expert/admin | **NOT EXECUTED** — no safe session tooling used |
| Authenticated Firestore/Storage reads | **NOT EXECUTED** — public paths only |
| Stripe | Code + network: no `js.stripe.com`. Hosted Checkout remains top-level redirect |
| GA4 `G-SZ7RZDKTJY` | OPTIONAL — `www.google-analytics.com/g/collect` 204; no Report-Only violation after final policy |

After iteration 1: **zero** required Report-Only violations on landing and login. App Check console errors: none. Page errors: none. Failed required network: none.

### CSP violations

| Directive | Blocked origin | Page | Feature | Required? | Action |
|---|---|---|---|---|---|
| manifest-src (via default-src) | `https://taskio-v2-staging.web.app/manifest.json` | all public pages | PWA manifest | YES | Iteration 1: `manifest-src 'self'` |

No browser-extension origins were allowlisted.

### App Check

Staging remains Firestore **ENFORCED**, Storage **ENFORCED**, Auth **UNENFORCED**. Landing minted App Check via `content-firebaseappcheck.googleapis.com` **200**. No CSP-related App Check failure.

### Iterations

1 of 2 allowed header-only redeploys used.

### Enforcement recommendation

**Do not enforce CSP yet.** Public Report-Only is clean after `manifest-src`. Authenticated Auth iframe (`taskio-v2-staging.firebaseapp.com`), Firestore, Storage, phone `RecaptchaVerifier`, and guest tidy/photo were not exercised on this hosted invite-only SPA. Enforcement is a separate owner decision after those paths are proven.

P07 remains **OPEN / REMEDIATION IN PROGRESS**. Not PASS.

---

## 32. P07E1 current develop → staging promotion audit (20 September 2026)

Read-only. No Hosting/API/Functions/rules/Auth/App Check/IAM/secret/Stripe/Gemini mutation. No `pilotSettings` create. No push. Production `taskio-v2` not queried or mutated.

**Anchor:** `develop` / `3f4bbab53638aca616c84e0650c5083b6aad4ce3` = `origin/develop` (0/0). CI `35477480003` SUCCESS.

**Operator leftovers preserved:** unstaged `frontend/src/shared/jobPostingSemantics.generated.js`; untracked `frontend/landing-final-review/`.

### Deployed staging baseline

| Surface | Live state |
|---|---|
| Hosting site | `taskio-v2-staging` / `https://taskio-v2-staging.web.app` |
| Hosting version | `e97a303dcf995e37` (2026-09-19T14:29:17Z) |
| SPA | `main.70b28def.js` / `main.5e46c8ad.css` (P05-era content; headers-only refresh) |
| Headers | no-store, noindex, nosniff, Referrer-Policy, `X-Frame-Options: DENY`, Permissions-Policy |
| CSP | Report-Only only (`manifest-src 'self'`). No enforced CSP |
| Observed HSTS | Firebase platform `max-age=31556926; includeSubDomains; preload` |
| API | `taskio-api-staging` 100% `taskio-api-staging-54aed8b`; image `taskio-api@sha256:3d207e01…`; SA `taskio-api-staging-runtime@…` |
| API env (safe) | `NODE_ENV=production`, `TASKIO_DEPLOYMENT_ENV=staging`, `GOOGLE_CLOUD_PROJECT=taskio-v2-staging`, `STRIPE_ENABLED=true`, `STRIPE_EXPECTED_LIVEMODE=false`, `TRUST_PROXY=true`, `TASKIO_PUBLIC_SIGNUP_ENABLED=false`, `ENABLE_SET_ADMIN_ENDPOINT=false`, `TASKIO_SHOW_DEV_OTP=false`, `FRONTEND_URL=https://taskio-v2-staging.web.app`, CORS includes staging Hosting + localhost:3000. `AI_DESCRIPTION_ENABLED` **absent**. Secrets: `OTP_SALT`, `STRIPE_SECRET_KEY` (refs only) |
| Webhook | `taskio-stripe-webhook-staging-00007-8tx` 100%; SA `taskio-webhook-staging-runtime@…`; invoker `allUsers` |
| Functions | **Only** `notifyHomeownerOnQuoteSubmitted` + `notifyHomeownerOnQuoteSubmittedUpdate` ACTIVE GEN_2 nodejs24 (updated 2026-09-04). Compute default SA. **Not deployed:** `notifyTradieOnEscrowFunded`, `flagRiskyJobMessages` |
| Firestore rules | Release `b8b8e7f2-50fb-4e79-a5ce-e947178158c6` (2026-08-28). **No** `pilotWaitlist` / `expertWaitlist` / `system/**` deny |
| Storage rules | Release `64c5b44b-a20a-4118-8b03-ffba6ac7f5c1` (2026-08-15). Posting + `profile-photos` still **`allow write`** (overwrite; posting 10MB; profile-photos 5MB) |
| App Check | Firestore **ENFORCED**, Storage **ENFORCED**, Auth **UNENFORCED** |
| Auth | `disabledUserSignup=true`; email/password + phone enabled |
| `system/pilotSettings` | Expected **absent** (not created in this audit) |

### Clean HEAD frontend build (not deployed)

Temporary worktree at `3f4bbab`. `npm ci` → `npm run verify` (Jest 598/598; stagingHosting 26; hostedBuildGuard 11; hostingSecurityHeaders 2) → `npm run build:staging` using public config extracted from the live staging bundle (values not copied here).

| Result | Value |
|---|---|
| Bundle | `main.068025df.js` |
| CSS | `main.5e46c8ad.css` |
| Files | 88 (0 source maps) |
| Target | `taskio-v2-staging` + `taskio-api-staging-d6mdcsrwea-ts.a.run.app` |
| App Check | enabled / recaptcha-enterprise / public site key present / debug empty |
| GA4 | `G-SZ7RZDKTJY` |
| Safety | No `api.taskio.com.au`, no `taskio-v2.firebaseapp.com` / `.firebasestorage.app`, no `pk_live_` / `sk_live_`, no service-account JSON |
| `localhost` | Firebase Auth SDK `continueUri` placeholder only — **EXPECTED PUBLIC CONFIG** |
| New surface strings | `/api/pilot-status`, waitlists, `generate-description`, `job-posting-attachments` |

### Frontend delta (live SPA vs HEAD)

| Area | Class |
|---|---|
| Landing / `/post-job` driven by `GET /api/pilot-status` | **EXPECTED CURRENT PRODUCT** / live is **STALE STAGING BEHAVIOUR** (invite-only gate, no hook) |
| Homeowner CLOSED / OPEN / PAUSED + waitlist | **EXPECTED CURRENT PRODUCT** + **LEGAL-COPY SENSITIVE** |
| Expert OPEN / WAITLIST + expert waitlist | **EXPECTED CURRENT PRODUCT** + **LEGAL-COPY SENSITIVE** |
| `expertise` vs `expertiseApproved` | **EXPECTED CURRENT PRODUCT** |
| Admin Pilot Operations / attention / marketplace / launch readiness | **EXPECTED CURRENT PRODUCT** |
| AI tidy fail-closed UX | **SECURITY FIX** + product |
| Storage UUID create-only paths | **SECURITY FIX** |
| Hosting headers + Report-Only | **SECURITY FIX** already **LIVE** on current version |
| Enabling Auth signup or auto-OPEN | **NOT YET READY FOR STAGING** in E2 |

### API / env / rules / functions / webhook

HEAD API since `54aed8b` adds pilot-status, waitlists, posting gate, expert onboarding mode, expertise approval, admin pilot endpoints, and AI fail-closed `generate-description`. **API deploy required** for a representative SPA. No data migration required. `TASKIO_PUBLIC_SIGNUP_ENABLED` stays **false**. Do not add `AI_DESCRIPTION_ENABLED=true`.

Webhook source unchanged `54aed8b..HEAD` — **do not redeploy** for this package.

Functions HEAD has four exports; staging has two. Redeploy is **optional product/email parity**, not required for waitlist/admin/pilot UI.

Firestore HEAD deny-all on waitlist + `system/**` is **defense-in-depth** (Admin SDK writes). Deploy **before** exposing those collections.

Storage HEAD create-only + 2MB profile bound is **required before** the new UUID frontend. Deploying HEAD frontend onto current overwrite rules would work but re-opens silent replace. Deploying HEAD Storage first is compatible with unique-timestamp old uploads.

### Auth / settings interaction

Keep `disabledUserSignup=true`. Existing synthetic login remains the only account path. New phone/email signup cannot complete. After API+frontend with `pilotSettings` absent: Homeowner **CLOSED**, Expert **WAITLIST**, no auto-create, no auto-OPEN. Waitlist POSTs work (API). OPEN posting, new Expert apply, and brand-new Auth users stay **untestable** until later explicit approvals.

### Compatibility

Frontend-only promotion is **not safe** for the intended product: `/api/pilot-status` 404 fail-closes; waitlist POST 404; admin cockpit 404.

Minimum unit: **Firestore rules + Storage rules + API + Hosting**.

### P07B live / not live

| Change | Staging |
|---|---|
| Hosting conservative headers + CSP Report-Only | **LIVE** |
| AI fail-closed + generate-description hardening | **NOT LIVE** (API old; AI env absent anyway) |
| Storage create-only + 2MB profile bound | **NOT LIVE** |
| Functions dependency patches / extra triggers | **NOT LIVE** / **PARTIAL** (two quote-email functions only) |

### CSP impact of new SPA

Same Google Fonts / recaptcha enterprise / GTM / App Check / staging API hosts. No `js.stripe.com`. After promotion, re-validate authenticated `taskio-v2-staging.firebaseapp.com` iframe, Firestore, Storage, phone verifier, and guest tidy. **Do not enforce CSP** in E2.

### AMBER packages (not executed)

**AMBER-E2A — rules.** `firebase deploy --project=taskio-v2-staging --only firestore,storage`. Precondition: record current ruleset IDs above. Expected: waitlist/`system` deny; posting/`profile-photos` create-only. Rollback: previous rulesets only if the new SPA is not yet live. Stop: any `taskio-v2` project flag.

**AMBER-E2B — API.** Build root `Dockerfile`; deploy `taskio-api-staging` in `australia-southeast1` as a **new** revision; keep `54aed8b` at 0% until smoke. Preserve current env names/booleans; do not enable signup or Gemini. Rollback: route 100% to `taskio-api-staging-54aed8b` if the new SPA is not live, or keep API+SPA coupled.

**AMBER-E2C — frontend.** `npm --prefix frontend run build:staging` then `node frontend/scripts/deploy-staging-hosting.js --project taskio-v2-staging --config firebase.staging.hosting.json --execute`. Keep Report-Only. Do not Hosting-rollback to `e97a303dcf995e37` while new Storage create-only + new API are live and App Check remains ENFORCED — prefer header-preserving redeploy of a known-good matching SPA.

**AMBER-E2D — Functions (optional).** Only if escrow/chat email + `flagRiskyJobMessages` parity is required. Would **add** two currently missing functions. Separate approval.

**Webhook:** out of E2.

**Auth enablement / `pilotSettings` create / OPEN:** later separate AMBER/RED packages. Not E2.

### Rollback coupling

App Check Firestore+Storage stay **ENFORCED**. Do not roll Hosting to a pre-App-Check SPA. Do not roll Storage back to overwrite rules after the UUID client is live. API rollback to `54aed8b` after the new SPA is live breaks pilot-status/waitlist/admin.

### Synthetic accounts

Existing staging homeowner / Expert / admin identities are documented from B4/P05. **No in-repo credential tooling.** Post-promotion login is **owner/manual**. Do not create users.

P07 remains **OPEN / REMEDIATION IN PROGRESS**. P07E1 = **AUDIT COMPLETE / PROMOTION PENDING**. CSP enforcement still **NOT APPROVED**. P03/P04/P05 production pending unchanged. P06 OPEN. P09 BLOCKED BY P06. READY TO OPEN remains impossible.

---

## 33. P07E2A AMBER-E2A staging Firestore + Storage rules (20 September 2026)

Approved staging-only mutation. No Hosting/API/Functions/webhook/Auth/App Check/IAM/secret/Stripe/Gemini/`pilotSettings` change. Production `taskio-v2` not mutated. Default gcloud project left `taskio-v2`.

**Anchor:** `develop` / `0b0c5ddbff885929840b10e21e715feae94d9beb` = `origin/develop` (0/0). CI `35481295427` SUCCESS.

### Local sources (HEAD)

| File | Git blob | SHA-256 |
|---|---|---|
| `firestore.rules` | `bdc6e2bd9dfb0e53bb23d22f49e4d48ac4995894` | `306E05BF06CFA79BEFBBBF296304F24600D8E9C40F61570F6327672301A7C150` |
| `storage.rules` | `fddbc66fc46a86eaf481a7e4ff6f4b049e2b6509` | `2BED0B0B6B69FEEBE7A0A089246203F155FAEE2D6C28F0F83486301EFF6DCD5B` |

Pre-deploy `npm run test:rules`: **26 / 26 PASS**.

### E2A-FIRESTORE: COMPLETE

| Field | Value |
|---|---|
| Command | `firebase deploy --project=taskio-v2-staging --only firestore:rules --non-interactive` |
| Previous ruleset | `b8b8e7f2-50fb-4e79-a5ce-e947178158c6` (update 2026-08-28T11:00:48Z) — no `pilotWaitlist` / `expertWaitlist` / `system/**` deny |
| New ruleset | `28c69372-2f82-4171-a7ad-379b0335b5a5` |
| Release | `projects/taskio-v2-staging/releases/cloud.firestore` |
| Active update | 2026-09-20T01:40:34.632889Z |
| Source vs HEAD | UTF-8 normalized match |
| Rollback | Restore previous ruleset `b8b8e7f2-50fb-4e79-a5ce-e947178158c6` only for a genuine availability/security incident. **Not used.** |

Validation: emulator suite already denies client `system/**`, `pilotWaitlist`, `expertWaitlist` including admin claims. Unauthenticated Firestore REST GETs to those paths returned **403**. ADC/IAM GET of `system/pilotSettings` returned **404** (document still absent; Admin/IAM path still works). App Check Firestore remained **ENFORCED**. Auth `disabledUserSignup=true`. Storage still old at this step.

Public smoke after Firestore: `/`, `/login`, `/post-job` 200; SPA still `main.70b28def.js`; CSP Report-Only only; Chrome CDP no App Check/Firestore console errors or page exceptions.

### E2A-STORAGE: COMPLETE

| Field | Value |
|---|---|
| Command | `firebase deploy --project=taskio-v2-staging --only storage --non-interactive` |
| Previous ruleset | `64c5b44b-a20a-4118-8b03-ffba6ac7f5c1` (update 2026-08-15T11:24:59Z) — posting + `profile-photos` `allow write` |
| New ruleset | `a0736ecb-e3bb-4573-8608-c1bced82fab8` |
| Release | `projects/taskio-v2-staging/releases/firebase.storage/taskio-v2-staging.firebasestorage.app` |
| Active update | 2026-09-20T01:43:58.283784Z |
| Source vs HEAD | UTF-8 normalized match |
| Rollback | Restore previous ruleset `64c5b44b-a20a-4118-8b03-ffba6ac7f5c1` only for a genuine incident. Do **not** roll back to overwrite rules merely because the old SPA cannot exercise UUID uploads. **Not used.** |

Write semantics proven by emulator tests (create-only posting, unique second upload, 2MB profile bound, timestamped profile no-overwrite, deterministic `profile-images/{uid}.jpg|.png` replacement). No staging file uploaded.

Public smoke after Storage: same three routes 200; JS/CSS assets 200; Report-Only CSP; no enforced CSP; Chrome CDP no App Check/Storage console errors.

### Compatibility limitation

The hosted SPA remains invite-only `main.70b28def.js`. It does **not** exercise HEAD waitlists, UUID posting uploads, or the Pilot Operations Cockpit. E2A does not include those business-write tests. Treat staging as controlled until E2B + E2C.

### Unchanged after E2A

Hosting `e97a303dcf995e37` / `main.70b28def.js`. API 100% `taskio-api-staging-54aed8b`. Webhook 100% `taskio-stripe-webhook-staging-00007-8tx`. Functions: quote-email pair only (2026-09-04). App Check Firestore+Storage **ENFORCED** / Auth **UNENFORCED**. Auth signup disabled. `system/pilotSettings` absent.

**AMBER-E2A = COMPLETE.** Remaining: **E2B API** then **E2C Hosting**. Functions/webhook optional/out. No Auth enablement, no `pilotSettings`, no OPEN, no AI enablement.

P07 remains **OPEN / REMEDIATION IN PROGRESS**. Not PASS.

---

## 34. P07E2B AMBER-E2B staging API promotion (20 September 2026)

Approved staging API only. No Hosting/Functions/webhook/Auth/App Check/rules/IAM/secret/`pilotSettings`/OPEN/AI/Stripe object mutation. Production `taskio-v2` not mutated. Default gcloud project left `taskio-v2`.

**Source commit:** `04951a4f3f98819a2ff3d3d97a2d328d043a5b3a`

### Previous baseline retained for rollback

| Field | Value |
|---|---|
| Revision | `taskio-api-staging-54aed8b` (tag `checkout-url`) |
| Traffic before | 100% |
| Image | `…/taskio-api@sha256:3d207e01da5209f8a01903b006ed05b9c6d1a5c290e96f065e1dc0f77b42396d` |
| SA | `taskio-api-staging-runtime@taskio-v2-staging.iam.gserviceaccount.com` |
| Invoker IAM | disabled (public Express) |
| Secrets | `OTP_SALT:1`, `taskio-staging-stripe-secret-key:3` |
| Safe env | `NODE_ENV=production`, `TASKIO_DEPLOYMENT_ENV=staging`, `GOOGLE_CLOUD_PROJECT=taskio-v2-staging`, `STRIPE_ENABLED=true`, `STRIPE_EXPECTED_LIVEMODE=false`, `TASKIO_PUBLIC_SIGNUP_ENABLED=false`, `ENABLE_SET_ADMIN_ENDPOINT=false`, `TASKIO_SHOW_DEV_OTP=false`, `AI_DESCRIPTION_ENABLED` absent |

### Image

| Field | Value |
|---|---|
| Command | `gcloud builds submit . --project=taskio-v2-staging --region=australia-southeast1 --tag=…/taskio-api:04951a4 --timeout=1200s` |
| Build ID | `617d9d4c-0ecc-4ed3-93f9-604d18bf10c0` |
| Digest | `sha256:6c29aea98bc7e14aa8d3981646d22ad2776a1684d946372756cb5bf304f3f1ab` |
| Registry | `australia-southeast1-docker.pkg.dev/taskio-v2-staging/taskio-staging/taskio-api` |

Pre-build: backend `node --check` + Jest **92 suites / 1018 tests PASS**.

### 0% revision then traffic

| Field | Value |
|---|---|
| Deploy | `gcloud run deploy taskio-api-staging --image=…@sha256:6c29aea9… --no-traffic --tag=e2b-04951a4 --project=taskio-v2-staging --region=australia-southeast1` |
| New revision | `taskio-api-staging-00070-dur` |
| Tagged URL | `https://e2b-04951a4---taskio-api-staging-d6mdcsrwea-ts.a.run.app` |
| After deploy | `00070-dur` Ready, **0%**; `54aed8b` still **100%** |
| Config | SA/env/secret names/CORS/signup/AI/Stripe TEST preserved; no Gemini vars |
| Traffic shift | `gcloud run services update-traffic taskio-api-staging --to-revisions=taskio-api-staging-00070-dur=100 --project=taskio-v2-staging --region=australia-southeast1` |
| After shift | `00070-dur` **100%**; `54aed8b` **0%** retained (`checkout-url`) |

### Direct + post-shift smoke (same results on tagged URL then normal URL)

| Check | Result |
|---|---|
| `/health/live` | 200 |
| `/health/ready` | 200; Firestore ok; Stripe enabled `livemode=false` |
| `/api/pilot-status` | 200 `homeownerPosting=CLOSED` `canPost=false` `expertOnboarding=WAITLIST` `canExpertApply=false` waitlists advertised |
| `POST /api/jobs` no auth | 401 |
| waitlist POSTs invalid/no-consent | 400; no persist |
| `POST /api/users/register` | 503 `signup_disabled` |
| `POST /api/generate-description` | 200 `{ fallback: true }`; no Gemini |
| Admin GETs | 401 |
| CORS staging origin | allowed; `evil.example` 403 / no ACAO |
| `system/pilotSettings` | still 404 |
| Old SPA `/` `/login` `/post-job` | 200; `main.70b28def.js`; Report-Only CSP; no App Check/API console errors |

No jobs, users, waitlist docs, OTP, or Stripe objects created. **Rollback not used.** Keep `54aed8b` until E2C Hosting is proven.

**AMBER-E2B = COMPLETE.** Remaining: **E2C Hosting**. Auth signup stays disabled. Homeowner CLOSED / Expert WAITLIST. P07 **OPEN / REMEDIATION IN PROGRESS**. Not PASS.
