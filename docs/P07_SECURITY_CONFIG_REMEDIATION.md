# P07A production security / configuration readiness audit

**Date:** 14 September 2026  
**Repo HEAD:** `7bb27886464b67f51fce740bfd17930efea91309` (`develop` = `origin/develop`)  
**Status:** **P07A AUDIT COMPLETE / REMEDIATION PENDING** — not P07 PASS. READY TO OPEN remains impossible.

This is a **read-only** audit plus approval planning. It does **not** rotate credentials, enable Auth signup, change IAM, enable production App Check/GA4/email/Stripe live, create `system/pilotSettings`, deploy, or push.

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
| P07 position | A04 is **documented complete**. P07 still requires **independent read-only confirmation** that production user-managed keys remain **0** and that the runtime is ADC-only. Do **not** recreate a JSON key. |

`backend/setAdmin.js` still `require("./serviceAccountKey.json")` but is **gitignored** and non-functional without that file. Do not commit it.

### Secret inventory (names only)

| SYSTEM | STAGING | PRODUCTION | HOW LOADED | WHERE REFERENCED | CURRENT KNOWN STATUS | ROTATION NEEDED? | OWNER ACTION? | P07 BLOCKER? |
|---|---|---|---|---|---|---|---|---|
| Firebase Admin / GCP SA | ADC or local GAC | ADC `taskio-api-runtime@…` | Env path / ADC | `backend/src/firebaseAdmin.js`, `validateEnv.js` | Prod A04 deleted JSON key; P07 confirm remaining | Confirm 0 user-managed keys | Read-only IAM/key list | **Yes** (independent confirm) |
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

**Current documented cloud fact:** Identity Toolkit `disabledUserSignup=true` on staging and production. Brand-new Firebase users cannot be created. **Not changed here.**

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

**Hosting:** production `firebase.json` has **no** CSP/HSTS/frame-ancestors/referrer-policy. Staging Hosting sets noindex + no-store. Tracker notes CDN HSTS on live placeholder — **cloud confirm**.

---

## 8. Firestore / Storage rules

**Client deny (intended):** `system/**`, `pilotWaitlist`, `expertWaitlist`, `phone_verifications`, `deletion_tokens`; `users` create false; quote/payment writes API-only. Tests: `rules-tests/security.rules.test.js`.

**Storage:** job photos (homeowner, image, 10MB); chat attachments (participants, 10MB, chat gates); profile images (owner, type/size); support attachments (owner path).

**Gaps (not deployed here):** job-posting object overwrite (no `resource == null`); legacy `profile-photos/` 5MB vs canonical 2MB.

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

Missing/disabled `GEMINI_API_KEY` returns local **fallback** (does not crash core product). Release plan: do not mount Gemini on first production Cloud Run. Quote assistant requires Expert auth; **description tidy does not**. Keep AI off at launch.

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

---

## 16. Dependency / package security (local, no upgrades)

Run 14 September 2026 (no lockfile changes):

| Tree | Command | Result |
|---|---|---|
| backend production | `npm --prefix backend audit --omit=dev` | **0 high / 0 critical** (1 low, 9 moderate; firebase-admin / uuid / storage tree) |
| functions production | `npm --prefix functions audit --omit=dev` | **5 high / 3 critical** (incl. `websocket-driver`) — Functions lockfile **behind** backend A03 overrides |
| frontend production | `npm --prefix frontend audit --omit=dev` | **Noisy CRA/webpack tree** (reported 34 high / 3 critical) — do **not** auto-upgrade |

**P07B:** classify frontend findings as build-time vs runtime; consider Functions scoped overrides **GREEN** later. Do not churn dependencies in this audit.

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
| Gemini | Unmounted → fallback |
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

Do **not** run `firebase use` or `gcloud config set project`. Prefer `--project=taskio-v2` / `--project=taskio-v2-staging` on a later approved session. Current task **did not execute** these.

| ID | COMMAND (future) | PROJECT | READ-ONLY? | PROVES | RISK |
|---|---|---|---|---|---|
| C1 | `gcloud iam service-accounts keys list --iam-account=<firebase-adminsdk-SA> --project=taskio-v2` | taskio-v2 | Yes | User-managed key count (expect 0) | Lists key IDs, not private material |
| C2 | `gcloud run services describe taskio-api --project=taskio-v2 --region=australia-southeast1 --format=json` (redact env) | taskio-v2 | Yes | Runtime SA, invokers, `STRIPE_ENABLED`, secret mounts | Metadata only if redacted |
| C3 | `gcloud run services get-iam-policy taskio-api --project=taskio-v2 --region=australia-southeast1` | taskio-v2 | Yes | allUsers / invoker | None if read-only |
| C4 | Identity Toolkit / Auth settings inspection (Console or `gcloud identity` equivalent) | taskio-v2 | Yes | `disabledUserSignup` | Do not toggle |
| C5 | Firebase App Check Console enforcement flags | taskio-v2 | Yes | Firestore/Storage/Auth enforcement OFF | Do not enable |
| C6 | Secret Manager versions list (names/versions only) | taskio-v2 | Yes | OTP_SALT exists; Stripe/SMTP **not** mounted prematurely | Do not print values |
| C7 | Hosting release / GA4 property status | taskio-v2 | Yes | Analytics off; maintenance Hosting | None |
| C8 | Repeat C2–C3 for staging | taskio-v2-staging | Yes | Staging isolation | Use staging project flag |

---

## 21. Remediation matrix

| ID | AREA | CURRENT STATE | EVIDENCE | RISK | REQUIRED ACTION | LOCAL / STAGING / PRODUCTION | GREEN / AMBER / RED | BLOCKS P07? | VALIDATION REQUIRED | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| P07-01 | Historical prod SA JSON | A04 deleted key `3cac`; 0 keys documented | Tracker A04; gitignore | CRITICAL if key still valid | Independent key-list confirm; never recreate JSON | PRODUCTION | **RED** (read-only first) | **Yes** | C1 | PENDING CONFIRM |
| P07-02 | Staging SA JSON `f04d` | Outside A04 | Tracker | HIGH if laptop/copy persists | Owner review/rotate staging key if still used as JSON | STAGING | **AMBER** | No (prod P07) | Owner | OPEN |
| P07-03 | Auth `disabledUserSignup=true` | Blocks all new Firebase users | Docs / known cloud fact | Blocks intended OPEN | Approved Identity Toolkit change for homeowner path only | PRODUCTION (+ staging when testing) | **RED** | **Yes** | C4 + P10 | NOT STARTED |
| P07-04 | IAM / Cloud Run invoker | Documented private API | Tracker; not re-verified now | CRITICAL if allUsers on API | Read-only IAM describe | PRODUCTION | **RED** (verify) | **Yes** | C2 C3 | PENDING CONFIRM |
| P07-05 | Runtime secrets | OTP_SALT documented; Stripe live off; Gemini unmounted | Release plan | HIGH if wrong mounts | Confirm mounts; do not add Gemini/live Stripe yet | PRODUCTION | **RED** | **Yes** | C6 | PENDING CONFIRM |
| P07-06 | Production App Check | OFF | APP_CHECK.md | HIGH bots/abuse at public launch | P05 production sequence | PRODUCTION | **RED** | **Yes** (with P05) | Token + enforcement proofs | NOT STARTED |
| P07-07 | Production email | Not configured | P03 tracker | HIGH ops | P03 production config + proof | PRODUCTION | **RED** | Coupled P03 | Authentic send | NOT STARTED |
| P07-08 | Production GA4 | OFF | P04 / analyticsConfig | MEDIUM (privacy) | Enable only after P06 disclosure | PRODUCTION | **RED** | Coupled P04/P06 | Console receipt | NOT STARTED |
| P07-09 | Production Stripe live | Disabled | validateEnv / tracker | CRITICAL money | Separate live Stripe batch | PRODUCTION | **RED** | Before live money | Webhook + TEST-to-LIVE checklist | NOT STARTED |
| P07-10 | CORS / TRUST_PROXY | Code fail-closed | validateEnv, app.js | HIGH if mis-set | Confirm prod env allowlist = Taskio origin only | PRODUCTION | **RED** (verify) | **Yes** | C2 redact | PENDING CONFIRM |
| P07-11 | Unauth `/api/generate-description` | No Firebase auth | `backend/src/routes/ai.js` | MEDIUM cost if API public | Auth or keep API private + AI off | LOCAL then deploy | **GREEN** code / **RED** deploy | No if API private + no Gemini | Tests | REPORTED not fixed |
| P07-12 | `/health/ready` metadata | Booleans | health.js | MEDIUM recon | Keep Cloud Run private | PRODUCTION | **RED** (verify IAM) | If public | C3 | PENDING CONFIRM |
| P07-13 | Hosting security headers | Missing in `firebase.json` | firebase.json | MEDIUM XSS/clickjack | Add headers in repo then Hosting deploy | LOCAL then PRODUCTION | **GREEN** then **RED** | No for P07 PASS if CDN HSTS proven | Header scan | OPEN |
| P07-14 | Functions npm audit | 5 high / 3 critical | local audit | HIGH supply-chain | Scoped overrides like backend A03 | LOCAL | **GREEN** | No (classify) | Re-audit | OPEN |
| P07-15 | Frontend CRA audit noise | 34 high / 3 critical reported | local audit | LOW–HIGH unknown | Classify runtime vs toolchain; no auto `audit fix` | LOCAL | **GREEN** | No until classified | Manual review | OPEN |
| P07-16 | Storage overwrite gap | job-posting write | storage.rules | LOW | Optional `resource==null` | LOCAL | **GREEN** | No | Rules tests | OPEN |
| P07-17 | Legacy Expert data | Mixed requested/approved | product model | HIGH wrong supply | Read-only pre-OPEN review | PRODUCTION (read) | **RED** (access) | Pre-activation | Checklist §19 | NOT STARTED |
| P07-18 | `setAdmin` local script | Gitignored; broken without JSON | setAdmin.js | MEDIUM if revived | Keep ignored; do not restore JSON | LOCAL | **GREEN** | No | gitignore | OK |
| P07-19 | CI deploy guard | Push does not deploy | ci.yml | LOW | Keep | LOCAL | **GREEN** | No | CI | OK |
| P07-20 | Pilot settings cloud doc | Must not exist yet | cockpit docs | HIGH if created early | Do not create until approved | PRODUCTION | **RED** (must not) | Process | Confirm absence | OK if absent |

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
- **Env:** `taskio-v2`.  
- **Command:** C1.  
- **Effect:** evidence only.  
- **Rollback:** N/A.  
- **Verify:** count = 0.  
- **Risk:** none if list-only.  
- **Deps:** owner GCP access.

### RED-B — Confirm Cloud Run IAM / runtime

- **Action:** describe service + IAM policy; redact env.  
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
- **Rollback:** `STRIPE_ENABLED=false`.  
- **Deps:** P07 IAM; P10.  
- **Risk:** real charges.

### AMBER-A — Staging JSON key `f04d`

- Review whether still required for local/staging; prefer ADC; rotate if copies exist.

### GREEN-A (optional code, not this commit)

- Auth-gate `/api/generate-description`; Hosting headers; Functions audit overrides; storage overwrite guard.

---

## 24. Launch-manifest status

- P07 **PASS:** **no**  
- P07A: **AUDIT COMPLETE / REMEDIATION PENDING**  
- P03/P04/P05 production: **unchanged** (pending)  
- P06: **OPEN** (unchanged)  
- P09: **BLOCKED BY P06** (unchanged)  
- READY TO OPEN: **impossible**
