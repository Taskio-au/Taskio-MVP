# Taskio P05 App Check

Staging and production frontend App Check use registered reCAPTCHA Enterprise providers. **Firestore and Storage enforcement are ON and proven in both environments.** Authentication remains **OFF / MONITORING** (out of approved MVP scope). The temporary production proof surface was removed after proof. **P05 is PRODUCTION PASS.**

## Classification

| Gate | State |
|---|---|
| P05 application code | **COMPLETE** |
| P05 local / CI | **PASS** (`6945c0a`, CI [34020406444](https://github.com/Taskio-au/Taskio-MVP/actions/runs/34020406444)) |
| P05 debug build safety | **PASS** |
| P05 rollback safety | **PASS** |
| P05 staging provider | **PASS** — reCAPTCHA Enterprise |
| P05 staging frontend activation | **PASS** |
| P05 Firestore enforcement | **PASS** (`ENFORCED`) |
| P05 Storage pre-enforcement traffic | **PASS** |
| P05 Storage enforcement | **PASS** (`ENFORCED`) |
| P05 Auth enforcement | **OFF — OUT OF APPROVED MVP SCOPE** |
| P05 production provider registration | **COMPLETE** — reCAPTCHA Enterprise |
| P05G2 proof artifact | **REMOVED after proof** |
| P05G3 hosted token proof | **PASS** — token only |
| P05G3B proof-page CSP | **REMOVED with the proof surface** |
| P05G4 production Firestore | **PASS** — Firestore `ENFORCED`; missing/invalid App Check `403` |
| P05G5 production Storage | **PASS** — Storage `ENFORCED`; valid upload/read succeeded; missing/invalid App Check `401`; proof object deleted |
| P05G6 proof-surface removal | **PASS** — Hosting `c42a0cac1cc5b789`; maintenance-only |
| P05 overall | **PRODUCTION PASS** |

## Staging frontend activation (2026-09-06)

- Project `taskio-v2-staging`. App **Taskio Staging Web** (`1:1077378545256:web:155ab7347adbf1dbec2ddd`). Provider **reCAPTCHA Enterprise**, owner-confirmed **REGISTERED**.
- Public Enterprise site key used at build time (not committed to source): `6LdDVqwtAAAAAAmUZHnS17MhiudyoyEMuaa_wjC7`.
- Build env (existing names only): `REACT_APP_APPCHECK_ENABLED=true`, `REACT_APP_APPCHECK_PROVIDER=recaptcha-enterprise`, `REACT_APP_APPCHECK_SITE_KEY=<public Enterprise key>`, `REACT_APP_APPCHECK_DEBUG_TOKEN` / `FIREBASE_APPCHECK_DEBUG_TOKEN` absent (staging child env blanks them), `REACT_APP_FIREBASE_EXPECTED_PROJECT_ID=taskio-v2-staging`. P04 analytics preserved: `REACT_APP_ANALYTICS_ENABLED=true`, `REACT_APP_GA_MEASUREMENT_ID=G-SZ7RZDKTJY`.
- Staging build **PASS**. Bundle `main.70b28def.js`. Scan `npm --prefix frontend run scan:staging` **PASS** (57 files). Hosted build guards **11/11**. Frontend verify **PASS** (maintainability; Jest **74/74** **516/516**; stagingHosting **26/26**).
- Bundle contains `taskio-v2-staging`, `G-SZ7RZDKTJY`, the Enterprise site key, and App Check enabled / `recaptcha-enterprise`. Bundle does **not** contain a nonempty debug-token assignment, production Hosting origins, bare `taskio-v2`, production sender `848916998874`, localhost API, or `pk_live_`.
- Hosting-only deploy via wrapper `--project taskio-v2-staging --config firebase.staging.hosting.json --execute`. Live version **`211fb288dcaff973`** (`2026-09-06T08:41:15.796Z`). Previous **`c2b8f742e73fed84`** remains FINALIZED (rollback while enforcement is OFF). Headers: `X-Robots-Tag: noindex, nofollow, noarchive`; `Cache-Control: no-store`.
- **HOSTED TOKEN / REQUEST PROOF: PASS.** `https://www.google.com/recaptcha/enterprise.js` **200**. Enterprise requests used the staging site key. Token exchange **200**: `content-firebaseappcheck.googleapis.com/v1/projects/taskio-v2-staging/apps/1:1077378545256:web:155ab7347adbf1dbec2ddd:exchangeRecaptchaEnterpriseToken`. No debug provider, no debug token, no App Check initialization error, no user-visible challenge. Token values were not stored.
- Functional matrix (existing synthetic accounts only; no new users, jobs, quotes, Stripe objects, or email):
  - A anonymous landing: invite-only page loads.
  - B homeowner: `/dashboard`; Firestore traffic observed (10); `GET /api/me` **200**; `GET /api/homeowner/jobs` **200**.
  - C expert: `/tradie/dashboard`; Firestore traffic observed (12); `GET /api/me` **200**; `GET /api/tradie/jobs` **200**.
  - D admin: `/admin/dashboard`; Firestore traffic observed (15); admin GET reads **200**.
  - E Storage: later proven separately (profile photo upload; see Storage pre-enforcement section).
  - F Cloud Run: `/health/live` **200**; `/api/me` without ID token **401**; authenticated `/api/me` **200**. No App Check requirement on Cloud Run.
- App Check Console metrics: **NOT INDEPENDENTLY RETRIEVED**. Owner confirmation steps: Firebase Console → `taskio-v2-staging` → App Check → APIs → expand Cloud Firestore and Cloud Storage → confirm Verified traffic after this Hosting release, and confirm enforcement remains Unenforced. Authentication should remain Unenforced.
- Independent service read after deploy: `firestore.googleapis.com`, `firebasestorage.googleapis.com`, and `identitytoolkit.googleapis.com` are all `UNENFORCED`.
- Production Hosting still **`cffca9d87ce03901`**. `taskio.com.au` still “Taskio is almost ready”; no gtag; no staging bundle. Production App Check remains OFF. gcloud default remains `taskio-v2`.

Do **not** roll Hosting back while Firestore or Storage remains ENFORCED. Disable the affected enforcement first, verify OFF, then restore Hosting.

## Firestore enforcement validation (2026-09-06)

- Owner enabled Cloud Firestore App Check enforcement on `taskio-v2-staging` only. No Hosting deploy, Functions change, Storage/Auth enforcement, or production mutation in this batch.
- Pre-enforcement owner metrics: **49 / 49 verified (100%)**; 0 outdated client; 0 unknown origin; 0 invalid.
- API read after owner change: `firestore.googleapis.com` **`ENFORCED`** (`updateTime=2026-09-06T08:54:10.998Z`). Storage and Authentication remain **`UNENFORCED`**. Live Hosting still **`211fb288dcaff973`**.
- Propagation: enforcement mode was already `ENFORCED` at validation start; valid hosted Firestore traffic succeeded, so propagation is treated as complete.
- Valid hosted app (existing synthetic accounts only):
  - Homeowner: `/dashboard`; App Check exchange **200**; Firestore **10/10** ok; `GET /api/me` **200**; `GET /api/homeowner/jobs` **200**.
  - Expert: `/tradie/dashboard`; exchange **200**; Firestore **12/12** ok; `GET /api/me` **200**; `GET /api/tradie/jobs` **200**.
  - Admin: `/admin/dashboard`; exchange **200**; Firestore **15/15** ok; admin GET reads **200**.
  - No debug provider/token, no App Check errors, no user-visible challenge, no new users/jobs/Stripe/email.
- Invalid-client proof **PASS** (same synthetic homeowner, same `users/{uid}` REST read; tokens not stored):
  - Valid ID token + valid App Check token → **200** (document fields present).
  - Same ID token, no App Check header → **403** `PERMISSION_DENIED`.
  - Same ID token + invalid App Check header → **403** `PERMISSION_DENIED`.
  - Firebase error text is generic (`PERMISSION_DENIED`); the controlled with/without comparison is the App Check proof, not a rules change.
- Post-test Firestore request-count metrics were **not** independently retrieved (App Check service API returns enforcement mode only).

## Storage pre-enforcement traffic (2026-09-06)

- Storage remained **`UNENFORCED`**. No Hosting deploy. Firestore remained **`ENFORCED`**. Auth remained **`UNENFORCED`**. Production untouched.
- Actual browser Storage usage: `uploadBytesResumable` + `getDownloadURL` only. No `deleteObject` in the frontend. Paths: `profilePhotos/{uid}/{timestamp}.{ext}` (homeowner/expert profile UI), `job-posting-attachments/{jobId}/…` (job create), `job-attachments/{jobId}/{messageId}/…` (chat), `job-attachments/{jobId}/variation-…` (variations), `support-tickets/{uid}/{ticketId}/…` (support ticket create). Legacy unused-by-current-UI rules also exist for `profile-photos/` and `profile-images/`.
- Existing synthetic homeowner had **no** Firebase Storage profile object. Img-src download-token reads are not App Check proof.
- Chosen product flow: existing synthetic homeowner, hosted `/profile` **Upload photo**, tiny 1×1 PNG, path `profilePhotos/{uid}/{timestamp}.png`. No job/Stripe/email.
- Proof **PASS**: App Check exchange **200**; Storage POST upload **200** and GET download-URL **200**; both carried `authorization` and `x-firebase-appcheck`. No debug provider/token. No visible challenge. No App Check console error.
- Rules obeyed: owner-only `profilePhotos/{uid}` JPEG/PNG/WebP ≤2MB. Auth was the signed-in homeowner. Browser SDK path, not Admin SDK.
- Object `profilePhotos/9HxC2jETKuha7Y3n5SQGNjrOQkr1/1788687541562.png` on `taskio-v2-staging.firebasestorage.app`. Client REST delete is blocked by the write rule’s content-type check. Operator deleted **only** that object (`gcloud storage rm`); follow-up `ls` matched no object. Stale `photoURL` / `profilePhotoPath` were later cleared via `PUT /api/me/profile` during Storage enforcement validation.
- Firestore regression **PASS**: after the upload, `/dashboard` loaded; Firestore 12/12 ok, 0 fail; App Check still exchanging.
- Owner later confirmed Storage pre-enforcement metrics **3 / 3 verified (100%)**; 0 outdated / unknown / invalid.

## Storage enforcement validation (2026-09-06)

- Owner enabled Cloud Storage App Check enforcement on `taskio-v2-staging` only. No Hosting deploy. Firestore remained **`ENFORCED`**. Auth remained **`UNENFORCED`**. Production untouched. Live Hosting still **`211fb288dcaff973`**.
- Pre-enforcement owner metrics: **3 / 3 verified (100%)**; 0 outdated client; 0 unknown origin; 0 invalid.
- API read: `firebasestorage.googleapis.com` **`ENFORCED`** (`updateTime=2026-09-06T09:52:42.501Z`). Firestore still **`ENFORCED`**. Auth still **`UNENFORCED`**.
- Stale metadata from the earlier deleted object was present (`profilePhotos/…/1788687541562.png`). Cleared with the supported `PUT /api/me/profile` `{ photoURL: '', profilePhotoPath: '' }` (**200**).
- Valid product flow **PASS**: existing synthetic homeowner, `/profile` **Upload photo**, tiny 1×1 PNG. Path `profilePhotos/9HxC2jETKuha7Y3n5SQGNjrOQkr1/1788689202588.png`. App Check exchange **200**. Storage POST upload **200** and GET `getDownloadURL` **200**. Both had `authorization` and `x-firebase-appcheck`. No debug provider/token. No visible challenge. No App Check console error.
- Invalid-client proof **PASS** (same object metadata GET; tokens not stored):
  - Valid Auth + valid App Check → **200** (object present).
  - Same Auth, missing App Check → **401** (App Check).
  - Same Auth, invalid App Check → **401** (App Check).
- Rules still applied: owner-only `profilePhotos/{uid}` JPEG/PNG/WebP ≤2MB. Browser SDK path. Rules not changed.
- Firestore regression **PASS**: `/dashboard` loaded; Firestore 12/12 ok; App Check still exchanging.
- Cleanup: exact new object deleted (`gcloud storage rm`; gone). New `photoURL` / `profilePhotoPath` cleared via `PUT /api/me/profile` (**200**). Final `GET /api/me` has empty photo fields.
- Storage request-count metrics after enforcement were **not** independently retrieved. Owner: Firebase Console → `taskio-v2-staging` → App Check → APIs → Storage. Expect continued verified traffic plus rejected missing/invalid samples. Confirm Auth remains Unenforced.

## Preflight record (GREEN, 6 September 2026)
GREEN work complete before this Hosting activation. Production remains frozen.

## A. Repo and tracker reconciliation
- Checkout: D:\Taskio\Cursor\251220\Taskio-MVP; branch develop.
- Starting HEAD, local origin/develop and GitHub develop: 0847a69a05dc21f8bb06b3b5b215c6185c3afcc9, "docs: record P04 staging analytics proof". Starting ahead/behind: 0/0.
- CI 34015484745: frontend, backend, functions, security-rules, api-image, webhook-image and browser-smoke all succeeded for that SHA. These results do not cover the new unpushed commit.
- Known untracked frontend/landing-final-review/ preserved and excluded.
- Tracker/status match P01 bank payout unproven, P02 normal refund complete, P03/P04 staging pass and production pending, P05 next, P06 required.
- Local .firebaserc default and gcloud default both verified taskio-v2; neither changed.
- The GREEN follow-up is local and unpushed; inspect git log and ahead/behind before the next action.

## B. App Check implementation
Runtime files:
- frontend/src/firebase.js
- frontend/src/config/appCheckConfig.js and appCheckConfig.test.js
- frontend/src/config/appCheckInit.js and appCheckInit.test.js
- frontend/src/config/runtimeEnv.js
- frontend/src/config/firebaseConfig.js

Build and deployment safeguards:
- frontend/scripts/hostedBuildGuard.cjs, build-hosted.cjs, hostedBuildGuard.test.cjs
- frontend/scripts/build-staging.js, stagingHostingLib.cjs, stagingHosting.test.cjs
- frontend/scripts/deploy-staging-hosting.js, scan-staging-bundle.js
- frontend/package.json and frontend/e2e/build-frontend.js

Order: initializeApp -> resolve App Check configuration -> initializeTaskioAppCheck -> getAuth -> getFirestore -> getStorage. Initialization is once-only and sets isTokenAutoRefreshEnabled=true. Disabled configuration creates no provider. Configuration errors throw; synchronous initialization failures are rethrown in production builds, while development catches them. Asynchronous token acquisition is handled by Firebase SDKs, not awaited by the initializer.

## C. Exact configuration
These are build-time values; changing them requires rebuilding Hosting. The staging Hosting activation used the registered public Enterprise site key via build-time injection (not committed to source).

| Variable | Staging Hosting activation value |
|---|---|
| REACT_APP_APPCHECK_ENABLED | true (exact string; otherwise disabled) |
| REACT_APP_APPCHECK_PROVIDER | recaptcha-enterprise |
| REACT_APP_APPCHECK_SITE_KEY | Public staging Enterprise site key `6LdDVqwtAAAAAAmUZHnS17MhiudyoyEMuaa_wjC7`; not the full projects/... resource name |
| REACT_APP_APPCHECK_DEBUG_TOKEN | Absent; staging child environment explicitly blanks it |
| FIREBASE_APPCHECK_DEBUG_TOKEN | Absent; build/deploy guards reject nonempty configuration |
| REACT_APP_FIREBASE_EXPECTED_PROJECT_ID | taskio-v2-staging |
| REACT_APP_FIREBASE_PROJECT_ID | taskio-v2-staging |
| REACT_APP_FIREBASE_AUTH_DOMAIN | taskio-v2-staging.firebaseapp.com |
| REACT_APP_FIREBASE_STORAGE_BUCKET | Confirm registered staging bucket; existing template is taskio-v2-staging.firebasestorage.app |
| REACT_APP_FIREBASE_API_KEY | Existing public staging Web SDK configuration value; do not invent |
| REACT_APP_FIREBASE_MESSAGING_SENDER_ID | Existing public staging Web SDK configuration value |
| REACT_APP_FIREBASE_APP_ID | 1:1077378545256:web:155ab7347adbf1dbec2ddd (observed in current hosted bundle; confirm Console match) |
| REACT_APP_API_BASE_URL | https://taskio-api-staging-d6mdcsrwea-ts.a.run.app |
| REACT_APP_ANALYTICS_ENABLED | true, preserving approved P04 staging configuration |
| REACT_APP_GA_MEASUREMENT_ID | G-SZ7RZDKTJY |
| REACT_APP_DISABLE_PHONE_RECAPTCHA / REACT_APP_E2E_AUTH_BYPASS | false |

The site key is public/non-secret. Enterprise uses the key ID with ReCaptchaEnterpriseProvider. v3 would use its matching public v3 site key; its secret belongs only in provider registration, never frontend configuration. Do not substitute Firebase API keys for reCAPTCHA site keys.

## D. Provider support
Both ReCaptchaEnterpriseProvider and ReCaptchaV3Provider are already imported and wired. Accepted selectors are recaptcha-enterprise and recaptcha-v3; selection is trimmed/lowercased, with v3 the default. Unknown providers throw. Enabled-without-site-key throws; the staging builder also rejects that before compilation. Key validity and domain registration are only provable with the real provider.

## E. Debug-token safety
Fixed:
1. Standard production build now loads CRA's environment files and rejects debug configuration before compilation; runtime rejection remains.
2. Staging uses the shared guard, rejects process debug input, blanks debug in its child environment, and pins disabled/default App Check values so local dotenv cannot silently activate it.
3. Staging deploy rejects debug input before CLI execution and blanks both debug variables in the child process.
4. Debug requires NODE_ENV=development, an exact loopback hostname and an explicit separate developer Firebase project. taskio-v2, taskio-v2-staging and implicit production fallback cannot be debug targets.
5. An unsolicited pre-existing SDK debug global is rejected. Hosted initialization cannot activate the debug provider through the supported paths.
6. E2E compilation uses the same guard and keeps App Check disabled.

Focused tests use synthetic markers only, including real CRA loading of .env.production.local, .env.local, .env.production and .env. Rejection produces no new build artifact and does not disclose the marker. Current tracked App Check configuration has placeholders/test fixtures, not registered debug credentials. No real debug token was needed or printed.

The local staging-mode artifact passed scanning, contained no synthetic debug marker, and had no source maps. Current hosted main.9647f8fc.js contained empty debug-variable assignments, with no nonempty assignment found by the targeted scan. Production bundles were not fetched or changed. This is not an assertion that all historical artifacts or Console debug-token registrations have been audited.

Keep developer debug private and use only an isolated developer project. Do not register any debug token in staging/production. Existing Console debug registrations remain an owner inspection item; do not export token values.

## F. Actual browser Firebase surfaces
| Product | Repo evidence / use |
|---|---|
| Auth | Direct SDK sign-in, sign-out, reauthentication, profile/account and existing phone-auth code |
| Firestore | Direct reads, listeners and writes: profiles, notifications, chat, jobs, support and admin views |
| Storage | Direct uploadBytesResumable/getDownloadURL: task photos, profile photos, chat/support/variation attachments |
| App Check | Explicit optional initialization before service access |
| Callable / HTTPS Functions | No browser SDK calls or direct Functions URLs found |
| Realtime Database | No browser usage found |
| Messaging | No SDK use found; messagingSenderId is merely Firebase configuration |
| Remote Config / Performance | No browser usage found |
| Firebase Analytics SDK | Not imported; approved GA4 implementation uses gtag |
| Other Firebase client products | No further client product usage found in frontend source/public files |

Functions exports are Firestore-created/updated triggers for chat flagging and notifications/email. They do not expose browser callables.

## G. Protection scope
Firestore YES, then Storage YES. Preserve security rules.
Auth: Firebase currently supports App Check for Authentication in Preview. It is applicable, but Auth enforcement is outside this initial gate; leave it unchanged and test sign-in compatibility. Phone Auth reCAPTCHA is a separate mechanism.
Functions: NO for these event-driven triggers.
Unused products: NO.

Source: [Firebase App Check supported services](https://firebase.google.com/docs/app-check).

## H. Cloud Run recommendation
NO App Check middleware for this initial MVP.

frontend/src/api/createApiClient.js and other callers send Firebase ID tokens in Authorization: Bearer. backend/src/middleware/auth.js verifies them with admin.auth().verifyIdToken. Admin/super_admin use custom claims; ordinary role checking includes the existing legacy profile fallback. Enrollment checks and job invitation checks remain in the API. Public enrollment is controlled by the existing signup flag; no signup configuration changed.

No X-Firebase-AppCheck attachment or backend App Check validation was found. Adding it would require token attachment across callers, verification middleware, CORS/header review, tests and an operator/server-client strategy. Health endpoints and Stripe webhooks require their existing separate treatment.

A stolen ID token does not automatically include an App Check token; the old documentation implied otherwise and is corrected. App Check would add protection, but this gate does not need the added API integration work. CORS is not a substitute for authentication.

## I. Provider recommendation
Use reCAPTCHA Enterprise. Both constructors already exist, so this needs configuration rather than new architecture. Use one staging score-based Web key restricted to the two staging domains. Keep the default one-hour TTL and default risk threshold initially. Inspect existing project billing/quota before creation; this is not a promise of zero cost. Retain v3 only as fallback if actual Console setup exposes a material Enterprise obstacle; no obstacle was established from repo evidence.

[Enterprise setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) and [v3 setup](https://firebase.google.com/docs/app-check/web/recaptcha-provider).

## J. Exact owner Console steps
Read-only inspection first:
1. Open Firebase Console and select taskio-v2-staging; verify the project ID, not just its display name.
2. Project settings -> General -> Your apps: match Web app ID 1:1077378545256:web:155ab7347adbf1dbec2ddd and its public SDK configuration.
3. Security -> App Check -> Apps: inspect that app's registration/provider, key reference and TTL. Inspect Manage debug tokens for unexpected registrations without copying token values.
4. App Check -> APIs: expand Cloud Firestore and Cloud Storage; record enforcement state and available verified/missing/invalid metrics. Also record Auth state without changing it.
5. Hosting -> Release history: confirm c2b8f742e73fed84 is current and available as the pre-P05 rollback anchor.

Only after approval for provider configuration:
6. In Google Cloud Console select taskio-v2-staging -> reCAPTCHA / Fraud Defense. Inspect existing billing/quota and keys to avoid duplicates. If needed, enable reCAPTCHA Enterprise API within the approved package.
7. Create one Web, score-based key. Leave checkbox challenge off and domain verification enabled. Domains: taskio-v2-staging.web.app and taskio-v2-staging.firebaseapp.com. Do not add localhost, production domains or a broad parent-domain allowance.
8. Firebase -> App Check -> Apps -> matched Web app -> register reCAPTCHA Enterprise with that key ID. Keep initial TTL one hour and threshold 0.5.
9. Save registration only. Confirm Firestore/Storage enforcement remains OFF. Do not add debug tokens, change Auth, deploy or touch production.

The [official Enterprise instructions](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) describe this registration flow.

## K. Current staging state
| Item | Evidence |
|---|---|
| Existing Firebase Web app | Taskio Staging Web `1:1077378545256:web:155ab7347adbf1dbec2ddd` |
| App Check provider | reCAPTCHA Enterprise REGISTERED (owner Console + hosted exchange) |
| Firestore enforcement | **PASS** / `ENFORCED` (API read + valid/invalid proof) |
| Storage pre-enforcement traffic | **PASS** (owner 3/3 verified) |
| Storage enforcement | **PASS** / `ENFORCED` (API read + valid/invalid proof) |
| Auth enforcement | OFF / `UNENFORCED` |
| Functions enforcement | Not applicable to observed trigger-only architecture |
| App Check metrics | Console charts not independently retrieved; owner steps above |
| Frontend activation | **PASS** on Hosting **`211fb288dcaff973`**, bundle `main.70b28def.js` |
| Production | OFF/frozen; Hosting still `cffca9d87ce03901`; analytics OFF |

## L. Safest rollout and failure modes
1. Confirm live states and rollback anchor, then configure the staging provider under approval.
2. Obtain approval to push the reviewed local commit; require green CI for the candidate.
3. Build with actual staging public configuration and the real Enterprise key; preserve P04 analytics and invite-only settings. Scan that exact artifact; this task's synthetic build must not be deployed.
4. Under separate Hosting approval, deploy only staging Hosting, with Firestore/Storage enforcement still OFF.
5. Hosted token exchange and Firestore enforcement are proven. Storage enforcement remains a separate AMBER step.
6. Refresh all synthetic operator tabs; retain one old client only for the controlled negative test.
7. After separate approval, enable Firestore enforcement. Wait for propagation, prove valid reads/writes succeed and authorized requests without valid App Check fail.
8. After that passes and separate approval, enable Storage enforcement. Repeat valid/invalid proof and browser checks.
9. Production remains OFF. No Auth enforcement changes.

| Condition | Expected behavior / risk |
|---|---|
| Frontend enabled, enforcement OFF | SDK attempts attestation; otherwise-authorized data traffic is not rejected by App Check enforcement. Provider failures may still cause delays/errors; investigate before enforcing. |
| Frontend enabled, Firestore enforcement ON | Server reads/writes/listeners require valid App Check plus normal rules/auth. Cache displays alone prove nothing. |
| Frontend enabled, Storage enforcement ON | Protected SDK requests require valid App Check plus normal rules/auth. Test upload and authenticated metadata/read. |
| Unknown provider or missing enabled key | Configuration throws; production app can fail to initialize. Staging missing-key guard rejects earlier. |
| Wrong nonempty key/domain registration | Build may succeed; real token exchange fails or is rejected. Not a locally provable provider success. |
| Token acquisition failure | SDK reports errors/retries/throttling; enforced services reject requests without valid tokens. Token refresh can expose delayed failures. |
| Stale old tab after enforcement | Requests lacking valid App Check fail; cached UI may initially look healthy. Refresh to the approved version. |
| Hosting rollback while enforcement ON | Old non-App-Check frontend can lose data access. Forbidden rollback sequence. |
| Enforcement OFF verified before rollback | Previous non-App-Check frontend can use otherwise-authorized services again; verify normal flows. |

Enforcement can take up to 15 minutes to take effect; confirm observable state and behavior instead of relying on a fixed sleep. [Firebase enforcement](https://firebase.google.com/docs/app-check/enable-enforcement).

## M. Minimal hosted test matrix — executed 2026-09-06 (enforcement OFF)
Use existing synthetic homeowner/expert/admin accounts only. Approval must cover normal login/session effects and user-profile updatedAt writes, plus one small synthetic profile-image upload. No new users, jobs, quotes, payments, emails, Stripe objects or destructive cleanup are required.

| Test | Evidence required |
|---|---|
| Anonymous landing on both domains | Same invite-only page, login CTA, no user-visible regression, no unexpected console errors; real provider exchange when initialization obtains a token |
| Homeowner login/dashboard | Auth succeeds, server-backed own profile read and existing dashboard data, automatic users/{uid}.updatedAt write acknowledged |
| Expert login/dashboard | Existing enrolled expert succeeds; existing job data and notifications/listeners still work |
| Admin read | Existing synthetic admin reads an existing synthetic user/job through intended routes; no edits |
| Storage | Upload one small synthetic PNG via the actual profile flow, which uses profilePhotos/{uid}/{timestamp}.png; confirm authenticated metadata/read and UI result |
| Cloud Run | GET /api/me with normal Firebase ID token succeeds; missing-ID-token control returns 401; health remains reachable |
| Token refresh | After a refresh interval or controlled fresh-session retest, new provider exchange and verified traffic still work |
| Regression | No debug-provider activation, no App Check errors, normal page navigation, same P04 privacy behavior |

Do not create a chat/quote solely for testing because it can trigger email. The existing automatic profile timestamp write covers a relevant Firestore write. Retain the synthetic upload as evidence; deletion needs its own agreed scope.

## N. Enforcement proof
Run separately for Firestore and Storage, before and after each approved enforcement change:
- Use the same existing synthetic identity, same permitted resource and same operation. First establish that the no-App-Check request succeeds while enforcement is OFF.
- Firestore: use a server read of the identity's own users/{uid} document; avoid cache-only reads.
- Storage: use an authenticated metadata/read of the approved synthetic object. Do not use a public download-token URL as enforcement proof.
- Positive: real Taskio provider token plus normal Firebase Auth succeeds. Correlate time with verified metrics.
- Negative: same authorized resource/request without App Check, and optionally a deliberately invalid synthetic App Check header, is rejected after propagation. Keep other authorization unchanged.
- Use client/Firebase ID-token requests, not Admin SDK or Google OAuth credentials, which would test a different access path.
- Record redacted status/error category, project, resource alias, bundle, service state and timestamps; never save bearer/App Check token values or unredacted HAR files.
- Verify legitimate UI again after each service. Do not weaken rules or infer success from a generic 403 that could be a rules failure.

[Firebase request metrics](https://firebase.google.com/docs/app-check/monitor-metrics).

## O. Hosting ride-along
The recorded c2b8f742e73fed84 release was built from 9d1119be08f8fa3178a7d4bf9ddcf051c4841b87. The hosted bundle name matches that record. Git comparison from that source to the starting HEAD showed no changes to frontend, shared or firebase.staging.hosting.json; the checkpoint commit was documentation-only.

Future P05 frontend changes are limited to this task's App Check runtime guards, guarded build entry, explicit staging App Check defaults, deployment debug rejection, tests and env examples/E2E guard wiring. Actual provider-enabled configuration will also change the bundle and introduce provider network activity. No landing redesign, fees, signup, API, Functions, rules or dependencies change. Preserve G-SZ7RZDKTJY and approved P04 flags. The historical shelves hero is already live, not a new ride-along.

Hosting metadata 403 prevents independently attesting the release-to-source mapping beyond the owner/tracker record and matching public bundle. Confirm release history before deploying.

## P. Rollback
1. Disable the affected STAGING Firestore/Storage App Check enforcement FIRST.
2. Verify Console shows OFF and a rules-authorized request without App Check works after propagation.
3. Only then restore Hosting to the confirmed pre-activation anchor **`c2b8f742e73fed84`**, or deploy an App Check-disabled frontend. Live App Check frontend is **`211fb288dcaff973`**.
4. Verify normal Auth, Firestore reads/writes, Storage access/upload and API behavior.
5. Investigate provider/frontend configuration before reactivation.
6. Keep production untouched and security rules unchanged.

When only one enforced service fails, disabling just that service may be sufficient while retaining the working frontend. A whole-frontend rollback to a version without App Check requires BOTH enforced services OFF first. Do not remove provider registration while any enforced service still depends on it. Cloud rollback requires AMBER approval.

548438126950e209 is the older pre-P04 anchor; do not select it by habit for P05 because that would also roll back approved P04 analytics.

## Q. Risks and remaining gates
- Live provider/enforcement/metrics and debug-registration inventory still require Console verification because API reads returned 403.
- A real provider key/domain/token round trip cannot be proven by synthetic builds. Do not enforce until hosted proof passes.
- Old tabs, blocked reCAPTCHA requests, risk scoring and token refresh can cause failures after enforcement; test them deliberately.
- Provider assessments have quota/billing implications; review before resource creation.
- This local build is synthetic and is not a deployment candidate. A fresh approved build with actual public staging values and CI is still required.
- Build/deploy safety applies to the supported guarded entry points; manually bypassing them is not an approved release procedure.
- Existing maintainability inline-style warnings, outdated Browserslist data and tool deprecation/color warnings were non-fatal; no dependency upgrades were made.
- P01 bank payout remains unproven; P06 legal review and historical production credential rotation/revocation remain pre-launch items. No production credential state was inferred.

## R. P05 classification
Staging Firestore and Storage enforcement are **PASS**. Auth enforcement stays **OFF**. **P05 production App Check / SPA readiness plan: COMPLETE (25 September 2026). P05G2 provider registration: COMPLETE.** Production Firestore and Storage enforcement remain **OFF**; hosted proof is pending.

## S. Production App Check and SPA plan (25 September 2026)

This section records the G1 planning baseline. P05G2 later completed the provider registration and local artifact work described in section U. No Hosting deploy or enforcement change has occurred.

**Provider.** Current code uses Firebase JS `initializeAppCheck` with `ReCaptchaV3Provider` or `ReCaptchaEnterpriseProvider` (`firebase` ^12). Staging proof used **reCAPTCHA Enterprise**. Production must use the same provider on `taskio-v2`, not the staging site key. `isTokenAutoRefreshEnabled` is true. Initialization runs in `frontend/src/firebase.js` after `initializeApp` and before `getAuth`, `getFirestore`, and `getStorage`. Disabled config creates no provider. A missing site key while enabled throws, and production rethrows that error.

**P05G1A first-token readiness: RESOLVED BY VERIFICATION (25 September 2026).** No source change. Locked SDK: `firebase` 12.0.0, `@firebase/app-check` 0.11.0, `@firebase/firestore` 4.9.0, `@firebase/storage` 0.14.0. `initializeAppCheck` registers App Check synchronously on the Firebase component container, including `app-check-internal`, before `getFirestore` and `getStorage`. With auto-refresh on, that call also starts token acquisition through an internal listener. Firestore’s client constructor then registers that already-initialized provider synchronously (`Provider.onInit` invokes immediately when the instance exists). Firestore listen/RPC paths and Storage upload/download paths `await` `appCheck.getToken()` before the protected request is sent. Concurrent callers share one in-flight exchange. A failed exchange resolves to a dummy token, which enforcement rejects; that is SDK failure handling, not a request that leaves before acquisition. Creating the Firestore or Storage client is not itself a network request. No module-scope Firestore or Storage call runs during import. An explicit startup `getToken(appCheck, false)` is not required: it would join the same in-flight exchange and would block startup on reCAPTCHA latency without changing correctness. Staging enforcement already proved this flow: hosted Firestore reads and the Storage upload succeeded with App Check headers, and missing or invalid tokens were denied. No deterministic race was reproduced.

**Coverage.** Firestore **YES**. Storage **YES**. Auth **UNENFORCED / out of MVP scope**. Browser Functions **not used**. Cloud Run stays on Firebase ID tokens and IAM.

**Production browser/API architecture blocker.** Still **OPEN** for full SPA restoration. It does **not** block P05. See section T. A production SPA still needs `REACT_APP_API_BASE_URL`. The production Cloud Run API stays IAM-private. Browser App Check does not authenticate Cloud Run IAM. Do not change IAM. Do not assume the browser can call the production API.

**Config names.** Public build-time: `REACT_APP_APPCHECK_ENABLED`, `REACT_APP_APPCHECK_PROVIDER`, `REACT_APP_APPCHECK_SITE_KEY`, `REACT_APP_FIREBASE_*`, `REACT_APP_API_BASE_URL`. Debug names `REACT_APP_APPCHECK_DEBUG_TOKEN` and `FIREBASE_APPCHECK_DEBUG_TOKEN` are forbidden in production builds. GA4 stays off unless `REACT_APP_ANALYTICS_ENABLED=true`. Production Enterprise site key and Firebase App Check registration are **COMPLETE** under P05G2; the public key is wired only into the temporary proof artifact. No production `.env` was created. The full SPA remains out of scope and still requires the separate P10 API decision.

**Order.** Do not enforce before a proven client. Do not treat “full SPA deploy, then enforcement” as the approved sequence. **P05G1A** is resolved by verification. **P05G1B** chooses a narrow proof surface and leaves the API blocker on **P10**. RED enforcement is not approved by this plan. Auth signup stays **disabled**. GA4 stays **off**.

**Safety.** Replacing the maintenance page with the full SPA is not approved. The P05 proof surface is a separate static path. Signup disabled, `pilotSettings` absent, the private API, and Stripe disabled stay in force.

**Proof.** P05 production PASS needs the staging shape on the narrow surface: valid App Check token, one controlled operator Storage upload plus denial without a token, and an authenticated Firestore read that fails without App Check. Delete the proof object afterward. Broader money-loop proof stays P10.

**Sequence complete.** **P05G1A–G2 COMPLETE. P05G3–G6 PASS.** Production Firestore and Storage are enforced and proven; the temporary proof surface is removed. P07’s App Check blocker is closed, but P07 itself stays open. `/` stays maintenance. `pilotSettings` stays absent. Stripe stays disabled. Production stays **FROZEN**.

**NO-GO.** Wrong Firebase project, localhost or staging API, debug provider, missing production site key, CSP blocking Enterprise or App Check, enforcement before the proof surface has a valid token, GA4 turned on, or no Hosting rollback release.

## T. P05G1B proof surface and API architecture (25 September 2026)

Planning only. No Hosting deploy, IAM change, App Check registration, enforcement, Auth change, or cloud query.

**API blocks P05: NO.** Firestore and Storage App Check are client-SDK proofs. The proof page must not call Cloud Run.

**API blocks full SPA restoration: YES.** That blocker moves to **P10**. It is not closed.

**P05 path: PATH 1.** Keep `/` as the current maintenance page. Add only a static operator page at `/appcheck-proof/` inside a future `firebase.maintenance.json` release. Hosting serves exact static files before rewrites ([Hosting priority](https://firebase.google.com/docs/hosting/full-config)), so the existing `**` → `/index.html` rewrite does not replace `/`. A Hosting release replaces the whole site, so that release must contain the current `maintenance/` root plus the proof path. Rollback release remains **`cffca9d87ce03901`**.

**Proof page.** Initialize the production web app, App Check with a new production reCAPTCHA Enterprise key, and sign in an existing `admin=true` operator. Show a sanitized ready/failed result. One Firestore get of missing doc `adminDailyChecklist/appcheck-proof` (admin read; no create). One Storage create of a tiny PNG at `profilePhotos/{operatorUid}/appcheck-proof.png`, then operator delete of that exact object. Current rules allow owner create and do not allow client delete. No marketplace UI, jobs, quotes, payments, signup, API, GA4, or launch copy. Page assets may be public. Data operations stay behind admin claims and rules. Obscurity is not the control. Remove the path in P05G6 after proof. P06/P09 do not block this page.

**Domains.** Prove on `https://taskio.com.au`. Register that host, plus `www.taskio.com.au`, `taskio-v2.web.app`, and `taskio-v2.firebaseapp.com`, on the new Enterprise key. Do not reuse the staging key. Do not add preview channels. CSP applies only to `/appcheck-proof/**`: staging CSP minus GA4 hosts and minus the staging API host. No `*`.

**Denial proof.** After enforcement, repeat the same admin Firestore read and Storage metadata read over REST with the App Check header omitted, then with an invalid header. No production debug token and no client bypass.

**Maintenance vs enforcement.** `maintenance/index.html` has no Firebase, Firestore, or Storage. Enforcement does not break `/`. Before enforcement, RED preflight must confirm no other live Firestore/Storage client. This repo shows no mobile app. The default Hosting site serves the maintenance release on the custom domain and the Firebase default hosts.

**Rollback.** Turn Firestore/Storage enforcement **OFF** before restoring any Hosting release that serves an App Check-less SPA. Restoring maintenance-only Hosting is safe while enforcement stays ON, because that page does not call those products. Leave the Enterprise key registered; stop using it rather than deleting it in a rollback.

**RED boundaries, each separate and not approved here:**

- **P05G2: COMPLETE (25 September 2026).** Production Enterprise key created and registered; proof artifact prepared locally. No deploy. No enforcement.
- **P05G3: PASS (26 September 2026), token only.** The first proof release failed because the proof-page CSP blocked `https://apis.google.com/js/api.js` and was rolled back to `cffca9d87ce03901`. After **P05G3B** added that host to proof-page `script-src`, the retry release `6e7650bff70d9d48` acquired one production App Check token. Admin session verified. Firestore and Storage proofs were not run. Enforcement stayed OFF. The operator signed out. `https://accounts.google.com` was not added.
- **P05G4: PASS (26 September 2026).** Firestore App Check `ENFORCED` at `2026-09-26T07:34:22.237215Z`. Valid admin read of missing `adminDailyChecklist/appcheck-proof` returned MISSING. Missing App Check **403**. Invalid App Check **403**. No document was created. Storage and Auth stayed `UNENFORCED`. Storage proof was not run. The operator signed out.
- **P05G5: PASS (26 September 2026).** Storage `ENFORCED`; one controlled upload and valid metadata read succeeded; missing and invalid App Check were denied with `401`; the exact synthetic object was deleted and verified absent.
- **P05G6: PASS (26 September 2026).** The proof assets and path-specific CSP were removed. Hosting release `c42a0cac1cc5b789` is maintenance-only. Firestore and Storage remain `ENFORCED`; Auth remains `UNENFORCED` / Monitoring.

**Future SPA API.** Protected routes use `Authorization: Bearer` and `admin.auth().verifyIdToken`. Admin routes add `admin` or `super_admin`. Role and ownership use the token uid, not a body uid. `verifyIdToken` is called without `checkRevoked`. Intentional public routes stay application-gated: signup returns 503 unless `TASKIO_PUBLIC_SIGNUP_ENABLED=true`; AI stays off unless `AI_DESCRIPTION_ENABLED=true`; main-API Stripe webhook returns 404 while Stripe is disabled; `/health/metrics` is admin-only. Public invocation of `taskio-api` is **not** a NO-GO for those protected routes. It is still not approved.

**Hosting rewrite.** Official Hosting Cloud Run setup tells the deployer to allow unauthenticated invocations ([Firebase Hosting and Cloud Run](https://firebase.google.com/docs/hosting/cloud-run), 2026-09-24). `australia-southeast1` is a supported rewrite region. That guide does not document Hosting as an IAM-preserving proxy. **Classification B:** a `/api/**` rewrite requires public Cloud Run invocation. It is not an IAM-preserving proxy. Whether that rewrite forwards `Authorization: Bearer` to Express is **NEEDS CONTROLLED STAGING/PRODUCTION PROOF**.

**Recommendation for P10, not for P05: OPTION B**, browser → `https://taskio.com.au/api/**` → public-invokable `taskio-api`, with the existing Firebase application auth. Put `/api/**` before the SPA `**` rewrite. Do not rewrite `/internal/**`. Keep Stripe webhooks on the separate webhook service. **OPTION A** (direct `run.app`, as staging already does) is the fallback if the Authorization-header proof fails. **OPTION C** is not recommended: the repo has no gateway, and a private proxy would be extra machinery after application auth is the boundary. CORS today is an exact `CORS_ORIGINS` allowlist; production evidence records `https://taskio.com.au`. Same-origin `/api/**` avoids browser CORS. Direct `run.app` still needs it. CORS is not authentication.


## Local verification evidence
- Full frontend verify: 74 suites / 516 tests passed; maintainability passed with existing inline-style warnings.
- Build/deploy wrapper tests: 26 passed.
- Hosted build guard tests: 11 passed, including actual CRA dotenv loading and compiler-not-called assertions.
- Final focused App Check tests: 2 suites / 17 passed.
- Local staging-mode optimized build with Enterprise selected: PASS using synthetic public settings.
- Staging bundle scanner: PASS, 57 files; no source maps or synthetic debug marker.
- Local E2E browser smoke: 4 passed; non-loopback browser network blocked.
- Whitespace/diff checks: PASS.
- No backend/Functions/rules code changed; their baseline CI passed. No hosted synthetic flows were executed.

## U. P05G2 production provider registration and local proof artifact (25 September 2026)

**Result: COMPLETE.** Explicit RED approval covered only production preflight, one production reCAPTCHA Enterprise Web key, one Firebase App Check registration, and local proof-artifact preparation.

- Project `taskio-v2` (project number `848916998874`); existing active Web app **Taskio Web** matched the repo app ID exactly. No Web app was created.
- Pre-state: Enterprise site key absent; token TTL `3600s`; minimum valid score `0.5`; Firestore, Storage, and Authentication all `UNENFORCED`; Enterprise-key inventory empty. The reCAPTCHA Enterprise API was already enabled, so no API mutation was needed.
- Created exactly one **WEB / SCORE** key named **Taskio Production App Check**. Domain verification is enabled; allow-all-domains is false. Allowed domains are only `taskio.com.au`, `www.taskio.com.au`, `taskio-v2.web.app`, and `taskio-v2.firebaseapp.com`. No localhost, staging, preview, wildcard, checkbox, or challenge configuration was added.
- Registered that key only on the matched production Web app. Read-back: reCAPTCHA Enterprise configured, TTL `3600s`, minimum valid score `0.5`. Firestore, Storage, and Authentication remained `UNENFORCED`.
- Local-only artifact: `maintenance/appcheck-proof/`. Pinned Firebase 12 browser modules; Google sign-in with in-memory persistence; fresh ID-token checks for `aud=taskio-v2`, Google provider, and `admin=true`; manual Enterprise token control with auto-refresh enabled. Token contents are never displayed or stored.
- Firestore is wired only for `getDoc(adminDailyChecklist/appcheck-proof)`. Storage is wired only for a tiny synthetic PNG at `profilePhotos/{signedInUid}/appcheck-proof.png`; no client delete workaround. Both data controls are hard-disabled for G2 and nothing runs on page load.
- `firebase.maintenance.json` adds only a path-specific `/appcheck-proof/**` CSP based on the staging-proven policy with GA4 and Cloud Run hosts removed. Maintenance root files are byte-identical. The artifact was not deployed and no localhost token attempt was made.
- Local validation: JavaScript syntax PASS; focused proof-artifact tests **4/4 PASS**; existing Hosting-header tests **2/2 PASS**; security scan PASS; `git diff --check` PASS. No credential, token value, debug provider/token, staging key/domain, GA measurement ID, Cloud Run URL, customer data, Firestore write, or Storage write is present.

P05 remains **STAGING PASS / PRODUCTION PENDING**.

## V. First P05G3 attempt: rollback (26 September 2026)

**Historical result of the first attempt: FAILED SAFELY / ROLLED BACK.** Section W is the current result.

- A Hosting-only proof release served `/appcheck-proof/` while `/` stayed maintenance. Continue with Google called `signInWithPopup` directly and returned `auth/internal-error`. The browser blocked `https://apis.google.com/js/api.js` under `script-src-elem`. No popup, no account chooser, and no request to `accounts.google.com`.
- Firestore and Storage proofs were not run. Firestore, Storage, and Auth enforcement stayed `UNENFORCED`.
- Hosting was rolled back to maintenance-only version `cffca9d87ce03901` (release `1790403428645000`, type `ROLLBACK`, `2026-09-26T06:17:08.645Z`). Live `/` and `/appcheck-proof/` both serve “Taskio is almost ready” with no proof-page CSP.
- **P05G3B** adds only `https://apis.google.com` to the proof-page `script-src`. Root maintenance headers are unchanged. The staging-proven CSP does not include `https://accounts.google.com`, so production policy was not expanded for that host. The fix is local only and is not deployed.

That rollback was the state before the retry in section W.

## W. P05G3 production token proof (26 September 2026)

**P05G3: PASS for token acquisition only. Not a P05 production PASS.**

- Source commit `048ef1a` (`fix(app-check): allow Google auth script in proof CSP`). CI [36225482223](https://github.com/Taskio-au/Taskio-MVP/actions/runs/36225482223) **SUCCESS**. One Hosting deploy of `firebase.maintenance.json` to `taskio-v2`. Live version **`6e7650bff70d9d48`**, release `1790406359037000`, `2026-09-26T07:05:59.037Z`. Eight maintenance files. No other cloud change.
- `https://taskio.com.au/` stayed the maintenance page, title “Taskio is almost ready”, with no proof-page CSP. `https://taskio.com.au/appcheck-proof/` served the proof page. Its `script-src` includes `https://apis.google.com`.
- The existing production admin signed in with Google. The page verified a fresh token for project `taskio-v2`, provider `google.com`, and `admin=true`, then showed **Admin YES**. Token contents were not displayed or stored.
- **Acquire / Verify App Check Token** completed. The page showed **App Check READY** and “App Check is ready. Data proof controls remain disabled for P05G2.” That status is set only when a token is returned. The token value was not recorded.
- Firestore proof **NOT RUN**. Storage proof **NOT RUN**. Those controls stayed disabled.
- After the operator signed out, Firestore, Storage, and Auth enforcement were re-read as **`UNENFORCED`**.
- `/appcheck-proof/` remains deployed. P05 remains **STAGING PASS / PRODUCTION PENDING**.

## X. P05G4 production Firestore enforcement (26 September 2026)

**P05G4: PASS. Not a P05 production PASS.**

- Project `taskio-v2`. Firestore App Check was set to `ENFORCED` at `2026-09-26T07:34:22.237215Z`. Storage and Auth stayed `UNENFORCED`. Hosting stayed `6e7650bff70d9d48`. `/` stayed the maintenance page. No rules, Auth, IAM, API, Storage, Stripe, or GA4 change.
- The existing admin signed in with Google on `https://taskio.com.au/appcheck-proof/`, verified **Admin YES**, and acquired an App Check token (**READY**). Token values were not recorded.
- The valid read of absent `adminDailyChecklist/appcheck-proof` returned **MISSING**. The same read with the App Check header omitted returned **403**. The same read with an invalid App Check header returned **403**. No document was created.
- Storage proof was **NOT RUN**. The operator signed out.
- Firestore remains `ENFORCED`. Storage and Auth remain `UNENFORCED`. Next boundary: separately approved **P05G5**. Not started.

## Y. P05G5 production Storage enforcement proof (26 September 2026)

**P05G5: PASS. Not yet a P05 production PASS at this checkpoint.**

- Project `taskio-v2`. Storage App Check was already `ENFORCED` at `2026-09-26T08:13:51.422063Z`. Firestore remained `ENFORCED`; Auth remained `UNENFORCED` / Monitoring. Hosting stayed `6e7650bff70d9d48`; `/` stayed maintenance.
- The existing Google/Firebase admin signed in on the live proof page. Fresh-token checks confirmed project `taskio-v2`, provider `google.com`, and `admin=true`. App Check reported **READY**. No token value was displayed or persisted externally.
- The exact object path did not exist before the proof. Exactly one 68-byte synthetic PNG was uploaded through the Firebase Storage SDK to `profilePhotos/4wX3ROz5O4RVtAK59puGGxrqS813/appcheck-proof.png` with content type `image/png`.
- Valid App Check metadata read: **SUCCESS**; path, content type, and size matched.
- The same authenticated metadata request without `X-Firebase-AppCheck` returned **401**. With `X-Firebase-AppCheck: invalid`, it returned **401**.
- Operator cleanup used the existing authorised `admin@taskio.com.au` gcloud context to delete exactly that synthetic object. Exact-path verification returned **404 / not found**. No bucket listing or other object operation occurred.
- The browser operator signed out. No Firestore write, customer/business-data interaction, rules change, Auth change, IAM/API/Functions change, Stripe/GA4 change, or rollback occurred.
- Post-proof Console state: Firestore and Storage **Enforced**; Authentication **Monitoring**.

## Z. P05G6 production proof-surface removal and P05 finalisation (26 September 2026)

**P05G6: PASS. P05: PRODUCTION PASS.**

- Removed only `maintenance/appcheck-proof/{index.html,styles.css,app.js}` and the `/appcheck-proof/**` CSP block from `firebase.maintenance.json`. Added a permanent focused test that rejects any restored proof directory, route/header reference, proof controls, or Firebase runtime in the maintenance artifact.
- Root maintenance assets were byte-identical before and after the edit. The release contained exactly five files. No `appcheck-proof`, Firebase JS, App Check, Firestore, or Storage runtime reference remained in the deploy artifact.
- Local verification: proof-removal tests **4/4 PASS**; launch-status derivation tests **12/12 PASS**; Hosting JSON parsed; `git diff --check` passed.
- One Hosting-only deploy targeted the default `taskio-v2` site with `firebase.maintenance.json`. Version **`c42a0cac1cc5b789`**; release **`1790412206562000`**; release time **`2026-09-26T08:43:26.562Z`**. Five maintenance files; no other Firebase/GCP resource deployed.
- Live verification on `taskio.com.au`, `taskio-v2.web.app`, and `taskio-v2.firebaseapp.com`: `/appcheck-proof/` and `/appcheck-proof/app.js` now return the same maintenance HTML and ETag as `/`; no proof text, Firebase runtime, or proof-specific CSP remains.
- Final Console state: Cloud Firestore **Enforced**; Storage **Enforced**; Authentication **Monitoring** / `UNENFORCED`. The Enterprise provider remains registered. The synthetic proof object remains absent.
- P07’s production App Check blocker is **CLOSED** by P05 production PASS. P07 itself remains **OPEN / REMEDIATION IN PROGRESS** for other blockers. P10 browser/API work remains separate. Production remains **FROZEN / NOT OPEN**.
