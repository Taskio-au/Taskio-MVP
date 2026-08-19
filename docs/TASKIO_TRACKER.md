# Taskio Codex Execution Tracker

> Repository handover generated from `Taskio_Development_Tracker_Updated.xlsx`. This Markdown file is the working tracker for Codex. The spreadsheet remains the historical source snapshot.

## Current checkpoint (supersedes the spreadsheet snapshot)

> Owner authorization revised 2026-08-16: `taskio-v2-staging` is frozen and excluded. This run is repository-only. Neither Firebase project, Stripe, nor any other live service may be accessed or modified. Production deployment remains a separate approval boundary.

- Repository: `Taskio-MVP`
- Working branch: `develop`
- Starting local/remote commit for this run: `e736581 fix(ci): restore frontend verification`
- Starting working tree: untracked owner-authored `docs/TASKIO_TRACKER.md`; otherwise clean
- GitHub Actions: all five jobs green at `13a22e3` (`security-rules`, `frontend`, `backend`, `functions`, `browser-smoke`)
- Frontend: 59 suites / 410 tests passed; maintainability and production build passed
- Backend: 44 suites / 421 tests passed; syntax checks passed
- Firebase rules: 18/18 demo-project emulator tests passed
- Functions: 4/4 demo-project emulator tests plus syntax/lint passed
- Playwright: 4/4 Chromium tests passed against the compiled demo-only/local harness
- Historical staging actions below pre-date the revised authorization. Staging is now frozen and must not be accessed.
- Production project `taskio-v2`: pre-launch and contains no real users or real transactions; do not modify it without explicit permission
- Gemini repository configuration now targets stable `gemini-3.6-flash` over the existing REST `v1` integration; local mocks verify the request and no live Gemini call was made.

## 2026-08-19 branded maintenance refresh (freeze held)

**PRE-LAUNCH FREEZE remains in force.** Live Hosting was refreshed with a full-screen branded maintenance page using the real Taskio logo. Cloud Run stayed private. Firebase sign-up stayed disabled. No preview SPA, no `frontend/build` restore, no DNS/Stripe/ABN/Auth-provider/Functions/Firestore/Storage/staging change.

- Operator `admin@taskio.com.au`; project `taskio-v2`; site `taskio-v2`.
- Deployed with `firebase deploy --project taskio-v2 --only hosting --config firebase.maintenance.json` (not `firebase.json`).
- New live release `1787133495217000`, version `cffca9d87ce03901`. Previous: `1787132706801000` / `d0d88e13fafa18d0`.
- Real logo copied byte-identical from `frontend/public/images/taskio-logo.png` to `maintenance/assets/taskio-logo.png`. Favicons copied from `frontend/public` (`favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png`). `firebase.maintenance.json` unchanged (no-store / noindex).
- Verified `https://taskio.com.au` **200** (logo `assets/taskio-logo.png`, Launching soon); www **301** to apex; `taskio-v2.web.app` and `app.taskio.com.au` **200** same page. Valid TLS. `Cache-Control: no-store, max-age=0`. `X-Robots-Tag: noindex, nofollow`. No SPA JS.
- Freeze checks: unauthenticated API `/health/live` still Cloud Run **403**. `client.permissions.disabledUserSignup=true`.

## 2026-08-19 PRE-LAUNCH FREEZE (taskio-v2)

Taskio is in **PRE-LAUNCH FREEZE**. The only publicly usable content is the professional A50 maintenance page. The SPA is not live. The production API is not publicly invocable. End-user Firebase account creation is disabled. DNS, Stripe, ABN, Functions, Firestore/Storage data, staging, and the maintenance design were not changed.

- Operator `admin@taskio.com.au`; project `taskio-v2`; region `australia-southeast1`; Hosting site `taskio-v2`.

**Cloud Run `taskio-api` private:**

- `--invoker-iam-check` applied. Annotation `run.googleapis.com/invoker-iam-disabled` is no longer `true`. IAM policy has **no** `allUsers` binding.
- Unauthenticated `GET https://taskio-api-gp2whfgz5a-ts.a.run.app/health/live` returns Cloud Run **403 Forbidden** HTML (`Your client does not have permission…`), not Express.
- CORS restored via `--update-env-vars` only: `CORS_ORIGINS=https://taskio.com.au`. Preview origin removed. `FRONTEND_URL` still `https://taskio.com.au`.
- Serving revision **`taskio-api-00003-6zl`** (100%). Same image `sha256:e275078558a06d9a54089a69f74c213abd2a1cac06dc956407d9a41c5fd37143`; same SA `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com`; secret `OTP_SALT:1` only. Other env unchanged (`NODE_ENV`, `TRUST_PROXY`, `STRIPE_ENABLED=false`, Gemini v1 / `gemini-3.6-flash`). Tag `preflight` remains on `taskio-api-preflight-090f1b5` at 0% and is also private.

**Preview SPA deleted:**

- `firebase hosting:channel:delete a03-spa-preflight --project taskio-v2 --force`.
- `https://taskio-v2--a03-spa-preflight-zdb058gu.web.app` → **404** `Site Not Found`. Hosting channels now only `live`. Live channel **not** modified (still release `1787132706801000`, version `d0d88e13fafa18d0`).

**Firebase Auth sign-up disabled:**

- Identity Toolkit Admin `projects/taskio-v2/config`: `client.permissions.disabledUserSignup=true` (`updateMask=client.permissions.disabledUserSignup` only).
- Email/password and phone providers remain enabled so existing accounts (including administrator-created) can still be signed in by an operator later. User deletion by end users was **not** disabled. No users deleted. No admin custom claims modified.

**Public surface verified:**

- `https://taskio.com.au` **200** maintenance (`Taskio is almost ready` / Launching soon). `Cache-Control: no-store, max-age=0`. `X-Robots-Tag: noindex, nofollow`.
- `https://www.taskio.com.au` **301** `Location: https://taskio.com.au/`.
- `https://taskio-v2.web.app` and `https://app.taskio.com.au` **200** same maintenance page. No `static/js/main*.js`.
- No public SPA. Public register/post-task cannot run: Hosting has no SPA, API is Cloud Run 403, Auth rejects end-user sign-up.

Do **not** create another preview channel, make Cloud Run public, restore the SPA, or re-enable registration until an explicit launch approval.

## 2026-08-19 preview CORS + professional A50 refresh (taskio-v2)

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL / verification**. Temporary preview CORS was added on Cloud Run. Live Hosting was refreshed with a professional A50 maintenance page. The production SPA was **not** restored to the live channel. DNS, Stripe, Auth providers, Functions, Firestore/Storage rules, Secret Manager values, and staging were not changed.

- Operator `admin@taskio.com.au`; project `taskio-v2`; region `australia-southeast1`; Hosting site `taskio-v2`.
- Preview SPA (channel `a03-spa-preflight`, expires 2026-09-02): `https://taskio-v2--a03-spa-preflight-zdb058gu.web.app`.
- Canonical origin remains `https://taskio.com.au`. `FRONTEND_URL` unchanged: `https://taskio.com.au`.

**Cloud Run CORS (temporary):**

- Before: revision `taskio-api-preflight-090f1b5`; `CORS_ORIGINS=https://taskio.com.au`; image `sha256:e275078558a06d9a54089a69f74c213abd2a1cac06dc956407d9a41c5fd37143`; SA `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com`; secret `OTP_SALT:1` only.
- After: revision **`taskio-api-00002-8qn`** Ready/Active; **100%** traffic; same image digest; same SA; `OTP_SALT:1` still the only mounted secret; invoker IAM still disabled (public); ingress `all`.
- `CORS_ORIGINS=https://taskio.com.au,https://taskio-v2--a03-spa-preflight-zdb058gu.web.app` via `--update-env-vars` only. Tag `preflight` remains on old revision `taskio-api-preflight-090f1b5` at 0%.
- `/health/live` **200**; `/health/ready` **200** (Firestore ok, Stripe disabled/ok, env ok).
- CORS GET `/health/live`: Origin `https://taskio.com.au` → `Access-Control-Allow-Origin: https://taskio.com.au`. Origin preview URL → allowed. Origin `https://evil.example` → **403** `CORS blocked`, no `Access-Control-Allow-Origin`. OPTIONS `/api/me` from preview → **204** with preview ACAO.

**Professional A50 maintenance (live Hosting):**

- Deployed with `firebase deploy --project taskio-v2 --only hosting --config firebase.maintenance.json` (not `firebase.json` / not SPA).
- New live release `1787132706801000`, version `d0d88e13fafa18d0` (2026-08-19, `maintenance/index.html`). Previous A50: release `1786941217240000`, version `654a7615bfa2b420`.
- Verified `https://taskio.com.au` **200**, `https://www.taskio.com.au` **301** `Location: https://taskio.com.au/`, `https://taskio-v2.web.app` **200**, `https://app.taskio.com.au` **200**. Valid TLS. `Cache-Control: no-store, max-age=0`. `X-Robots-Tag: noindex, nofollow`. Title `Taskio is almost ready`. No `static/js/main*.js` on live.
- `firebase.maintenance.json` unchanged (no-store / noindex rewrites still apply).

Do not restore the SPA to live until separately approved. Next: browser integration tests against the preview origin now that CORS allows it.

## 2026-08-19 production custom domain (taskio-v2) — COMPLETED

Custom-domain cutover for Hosting site `taskio-v2` is **complete**. Canonical production browser origin is `https://taskio.com.au`. Live Hosting still serves A50 maintenance. The production SPA has **not** been restored. This checkpoint did not change DNS, Hosting content, Cloud Run, IAM, Firebase Auth, Stripe, Secret Manager, Functions, Firestore, Storage, or staging.

- Operator `admin@taskio.com.au`; project `taskio-v2`; site `taskio-v2`.
- 2026-08-18: Hosting custom domains created (`taskio.com.au` canonical; `www.taskio.com.au` `redirectTarget` = `taskio.com.au`). `app.taskio.com.au` left attached.
- Owner then applied the Firebase `requiredDnsUpdates` in GoDaddy (A/CNAME plus TXT `hosting-site=taskio-v2`). MX, SPF, `MS=`, DMARC, autodiscover, enterprise enrollment/registration, nameservers, and `app.taskio.com.au` were not modified.
- Cloud Run already has `CORS_ORIGINS=https://taskio.com.au` and `FRONTEND_URL=https://taskio.com.au` (unchanged this checkpoint).

**Verified 2026-08-19 (HTTPS / DNS):**

- `https://taskio.com.au` HTTP **200**, valid TLS (`Strict-Transport-Security: max-age=31556926`). `Cache-Control: no-store, max-age=0`. `X-Robots-Tag: noindex, nofollow`. Body length 1517, `Last-Modified: Mon, 17 Aug 2026 04:33:36 GMT`, etag `14dbea0eeb2f851dfad05d94e87e8004502ac9b169ca09be6c6806a48a76d4ff` — A50 maintenance release, not the SPA.
- `https://www.taskio.com.au` HTTP **301**, valid TLS, `Location: https://taskio.com.au/`.
- Apex A `taskio.com.au` → `199.36.158.100` (Firebase Hosting). www CNAME → `taskio-v2.web.app`.
- Apex TXT now includes `hosting-site=taskio-v2` plus unchanged `firebase=taskio-v2`, SPF (`include:spf.protection.outlook.com include:_spf.firebasemail.com -all`), and `v=verifydomain MS=6820192`.
- `app.taskio.com.au` CNAME still `taskio-v2.web.app`; still serves A50.
- Microsoft 365 intact: MX `taskio-com-au.mail.protection.outlook.com` pref 0; SPF; `MS=6820192`; DMARC; autodiscover / enterpriseenrollment / enterpriseregistration.

Live Hosting channel is still A50: release `1786941217240000`, version `654a7615bfa2b420`.

**A03 remains PENDING FINAL DEPLOYMENT APPROVAL / verification.** Custom domain is done; A03 cannot close because:

- production SPA connection is not complete (A50 still live);
- live browser flows are not yet verified;
- OTP / ABN / admin / Stripe launch dependencies remain.

Do not begin frontend/SPA Hosting restore until separately approved.

## 2026-08-17 A03 Cloud Run checkpoint (taskio-v2)

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL / verification**. Public Cloud Run invocation is enabled. Production custom domain is now complete (`https://taskio.com.au`, 2026-08-19). Hosting SPA restore, frontend connection, and live job/quote/OTP/ABN/admin flow acceptance remain outstanding. This batch did not change Cloud Run configuration, traffic, secrets, Hosting, DNS, Functions, Firestore, Artifact Registry, or staging.

- Operator `admin@taskio.com.au`; project exactly `taskio-v2`; region `australia-southeast1`.
- Service: `taskio-api`. Revision still `taskio-api-preflight-090f1b5` (not recreated).
- Approved image digest: `sha256:e275078558a06d9a54089a69f74c213abd2a1cac06dc956407d9a41c5fd37143` (commit `090f1b5d3a4d9db49ab559a12cb0e5e7a1cc5323`). Do not deploy `sha256:7e4ad257…` or `sha256:f76b413…`.
- Runtime SA: `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com`. No `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Secrets: only `OTP_SALT` version **1**. Not mounted: `ALERT_WEBHOOK_URL`, Gemini, ABN, Stripe, or staging secrets.
- Unrelated config unchanged: ingress `all`, port 8080, concurrency 80, maxScale 20, same env vars, same startup/liveness probes.
- Traffic: **100%** to `taskio-api-preflight-090f1b5` because it is the first/only revision.
- Cloud Run Invoker IAM check is **disabled** (`run.googleapis.com/invoker-iam-disabled: true` via owner `--no-invoker-iam-check`). The Cloud Run endpoint is **publicly invocable**. Do not describe Cloud Run IAM as still enabled/private.
- Unauthenticated `GET /health/live` on `https://taskio-api-gp2whfgz5a-ts.a.run.app` is Express **200**.
- Earlier authenticated `GET /health/ready` was **200** (Firestore/ADC healthy, production env healthy, Stripe disabled/healthy).
- CORS: Origin `https://taskio.com.au` allowed; `https://evil.example` denied with no `Access-Control-Allow-Origin`.
- Application auth-boundary audit passed. Public `GET /api/me` without Firebase token is Express **401** `Unauthorized: No token provided`. Invalid bearer is Express **401** `Unauthorized: Invalid token`.
- Post-test logs: expected 200/401 only; no unexpected 5xx, crashes, Firestore permission, Auth credential, Secret Manager, or unhandled-exception lines.
- Hosting remains A50 maintenance on `https://taskio.com.au`, `https://taskio-v2.web.app`, and `https://app.taskio.com.au` (`Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`). No frontend restore.
- Production custom domain is complete (2026-08-19). Next pickup: Hosting SPA restore remains a separate approval. Do not treat public Cloud Run or the custom-domain cutover as A03 complete.

## 2026-08-17 A03 production dependency patch (repository only)

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL**. This batch is repository-only. No Google Cloud, Artifact Registry tag, Cloud Run, Secret Manager, IAM, Hosting, DNS, Functions, or staging change.

Direct production bumps (caret style preserved, current majors only):

- `axios` `^1.11.0` → `^1.19.0` (lock `1.19.0`)
- `express-rate-limit` `^8.0.1` → `^8.6.2` (lock `8.6.2`)
- `express` `^5.1.0` → `^5.2.1` (lock `5.2.1`)
- `firebase-admin` `^13.6.0` → `^13.10.0` (lock `13.10.0`; not 14.x)

Scoped `overrides` (not applied to directs): `protobufjs@7.6.5`, `websocket-driver@0.7.5`, `@grpc/grpc-js@1.13.5`, `google-auth-library.jws@4.0.1`, `jsonwebtoken.jws@3.2.3`, `@types/request.form-data@2.5.6`, `router.path-to-regexp@8.4.2`.

`npm --prefix backend audit --omit=dev` after overrides: **9 findings (1 low, 8 moderate, 0 high, 0 critical)**. Previous image was 24 (1 / 12 / 8 / 3); after direct bumps 16 (1 / 9 / 4 / 2). Backend tests 47/47 suites, 426/426 passed. `node --check` and `git diff --check` passed.

Remaining production findings, accepted for this A03 patch:

- Moderate `uuid@9.0.1` (`GHSA-w5hq-g745-h8pq`, `<11.1.1`) via the firebase-admin / Google Cloud tree. Unresolved pending a separately planned Firebase/Google dependency upgrade. Do not globally override `uuid`.
- Low `@tootallnate/once@2.0.0` (`GHSA-vpq2-c234-7xj6`). The advisory is fixed in `3.0.1`; resolving it would cross the current 2.x transitive dependency expectation. Do not add an override. Leave as an accepted low residual.

Do not deploy `sha256:7e4ad257…` or stale `sha256:f76b413…`. Next: GitHub CI, then a separately approved Cloud Build of a **new** image from this commit.

## 2026-08-17 A03 Cloud Build from optional-webhook commit

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL**. Cloud Run `taskio-api` was **not** deployed. The `preflight` Artifact Registry tag was **not** moved. Digest `sha256:7e4ad257…` predates the patched lockfile and is **not** approved for Cloud Run.

- Operator-reported Cloud Build `fe608395-6108-4606-96b8-a46e7a28a58c` **SUCCESS** from commit `f5c1783dc4951105a359e4da9fcda7be63374978`.
- New image digest: `sha256:7e4ad2571ac732d16ed00db1fb8593741d0e649e2aaa9abeadd49c29d6d39f9a`.
- Previous `:preflight` digest `sha256:f76b413db39f42825e9a7c6d0ea3c92d880d293e469d958e540691c2b57a213c` remains stale (mandatory `ALERT_WEBHOOK_URL`) and must not be deployed.
- Cloud Build reported 24 production npm audit findings (1 low, 12 moderate, 8 high, 3 critical). Direct-dep bumps then scoped overrides reduced production `--omit=dev` to 9 (1 low / 8 moderate / 0 high / 0 critical). Digests `sha256:7e4ad257…` and `sha256:f76b413…` remain prohibited until a new image is built from the patched commit.
- Install-script warnings for `@firebase/util` and `protobufjs` are expected upstream `postinstall` scripts, not a reason to change ignore-scripts policy in this step.
- Secret Manager, IAM, Hosting, Functions, DNS, and staging were not accessed.

## 2026-08-17 A03 optional ALERT_WEBHOOK_URL (repository only)

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL**. This batch is repository-only: production start no longer hard-requires `ALERT_WEBHOOK_URL`. No Google Cloud, Secret Manager, IAM, Cloud Run, Hosting, or staging change.

- `OTP_SALT` remains mandatory in production `validateEnv()` and `/health/ready`.
- `ALERT_WEBHOOK_URL` is optional observability. Absence must not block API start. `/health/ready` must not fail solely because it is unset. `sendCriticalAlert()` continues to no-op when unset. Startup may warn that critical alert forwarding is not configured (no URL in logs).
- The empty `ALERT_WEBHOOK_URL` Secret Manager resource on `taskio-v2` is retained as future observability configuration. Do **not** add a version or mount it until an approved production webhook exists. Do not copy staging.
- First Cloud Run `--set-secrets` is **only** `OTP_SALT`. Image digest `sha256:7e4ad2571ac732d16ed00db1fb8593741d0e649e2aaa9abeadd49c29d6d39f9a` was built from this commit; the `preflight` tag was not moved. That image and stale `sha256:f76b413…` remain prohibited. Rebuild a new image only after the patched lockfile commit.
- Cloud Run `taskio-api` still does not exist. Secret Manager resources were not recreated or modified in this batch.

## 2026-08-17 A03 Secret Manager

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL**. This batch enabled Secret Manager and created the two named secret resources only. No Cloud Run `taskio-api` service, Hosting, DNS, Functions, Firestore, or staging change.

- Operator `admin@taskio.com.au`; project exactly `taskio-v2`; staging not accessed.
- `secretmanager.googleapis.com` **ENABLED**. No other API was enabled in this batch.
- Secret resources: `ALERT_WEBHOOK_URL`, `OTP_SALT`. Not created: Gemini, ABN, Stripe, `CRON_SECRET`.
- `OTP_SALT` version **1 ENABLED**. Value was generated as a new production-only 32-byte random salt and sent only to Secret Manager. Payload not recorded.
- `ALERT_WEBHOOK_URL` has **no version**. No production webhook URL was identified or copied. The empty resource is optional/future observability configuration; it is not a production hard-start requirement and must not be included in the first Cloud Run `--set-secrets`.
- Resource-level `roles/secretmanager.secretAccessor` on both secrets for `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com` only. No project-wide Secret Manager role. Runtime project roles remain `roles/datastore.user` + custom Auth role. User-managed keys: **0**.
- Cloud Run `taskio-api` still does not exist. Hosting live channel remains the A50 maintenance release. Four Functions still ACTIVE with April 2026 update times.

## 2026-08-17 A03 runtime identity

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL**. This batch created the dedicated Cloud Run runtime identity and minimum runtime IAM only. Secret Manager, secrets, Cloud Run `taskio-api`, Hosting, DNS, Functions, and staging were not changed.

- Operator `admin@taskio.com.au`; project exactly `taskio-v2`; staging not accessed.
- Service account `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com` created, enabled, uniqueId `110789983858921186098`. User-managed keys: **0** (two Google system-managed keys only).
- Project roles on that identity only: `roles/datastore.user` and custom `projects/taskio-v2/roles/taskioApiRuntimeFirebaseAuth`.
- Custom role permissions exactly: `firebaseauth.users.get`, `firebaseauth.users.create`, `firebaseauth.users.update`. No Auth config/delete/email/session permissions.
- `roles/logging.logWriter` was **not** granted. `roles/iam.serviceAccountTokenCreator` was **not** granted.
- Deployer `admin@taskio.com.au` already has `iam.serviceAccounts.actAs` on this SA via existing `roles/owner`; no additional `roles/iam.serviceAccountUser` binding was added.
- Not granted: `roles/editor`, `roles/owner`, `roles/firebaseauth.admin`, `roles/firebaseauth.editor`, project-wide Secret Manager accessor, Artifact Registry writer, Cloud Run admin.
- Default Compute SA bindings unchanged (`roles/editor`, `roles/eventarc.eventReceiver`, `roles/run.invoker`). Four Functions remain ACTIVE on that Compute identity with April 2026 update times. Cloud Run `taskio-api` still does not exist. Secret Manager API remains disabled.
- Named secrets and Cloud Run `--no-traffic --tag preflight` deploy remain outstanding.

## 2026-08-17 A03 Cloud Build / Artifact Registry preflight

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL**. This batch created the production Artifact Registry repository and pushed a Cloud Build preflight image only. No Cloud Run `taskio-api` service, runtime IAM, Secret Manager, Hosting, DNS, or staging change.

- Operator `admin@taskio.com.au`; project exactly `taskio-v2`; staging not accessed.
- GitHub Actions run `32000889708` on `c7c1887` is green, including job `api-image`.
- Artifact Registry Docker repo `taskio-api` exists in `australia-southeast1` (standard mode). `gcf-artifacts` updateTime remains `2026-05-11T07:35:09.183947Z`.
- Cloud Build `dc797823-5b5c-4119-8a4e-62edbe24b746` **SUCCESS** from committed root `Dockerfile` at `c7c1887`. Identity used: `848916998874-compute@developer.gserviceaccount.com` (still has overly broad `roles/editor`; hardening is a later item — not changed here).
- Image: `australia-southeast1-docker.pkg.dev/taskio-v2/taskio-api/taskio-api:preflight` digest `sha256:f76b413db39f42825e9a7c6d0ea3c92d880d293e469d958e540691c2b57a213c`. Repository contains only this `taskio-api` package/tag.
- Cloud Build auto-created regional buckets `taskio-v2_australia-southeast1_cloudbuild` (source) and `848916998874-australia-southeast1-cloudbuild-logs` (logs).
- Cloud Run service `taskio-api` still does not exist. Secret Manager API remains disabled. No `taskio-api-runtime` service account. Four Functions still ACTIVE with April 2026 update times. Hosting live channel last release remains the A50 maintenance release.
- Runtime IAM, named secrets, Cloud Run `--no-traffic --tag preflight` deploy, public invocation, traffic, HTTPS/CORS, and frontend connection remain outstanding.

## 2026-08-17 A03 repository build-context record

A03 remains **PENDING FINAL DEPLOYMENT APPROVAL**. This step is repository changes and local verification only. No Google Cloud, Firebase, IAM, Secret Manager, Cloud Run, DNS, Hosting, or staging mutation.

- Branch / HEAD at start of this edit: `develop` / `210ccf4`. This close-out commits the root Docker/plan files only; nothing is pushed.
- Production image context is the **repository root** (`docker build -t taskio-api:preflight .` / later `gcloud run deploy taskio-api --source .`). `--source backend` is withdrawn.
- Image layout: `/app/backend/**` + `/app/shared/**`, `WORKDIR /app/backend`, `CMD node src/server.js`, Node 24, `USER node`, no JSON credential, ADC on Cloud Run.
- `backend/Dockerfile` removed so an excluded/wrong-layout file cannot be used. Root `.dockerignore` is an allowlist and still denies `.env` and service-account JSON.
- Docker is **not installed** locally. The real container build, image inspection, and `/health/live` in a container remain **outstanding** and must succeed before Cloud Run deployment approval.
- First Cloud Run strategy: `--no-traffic --tag preflight --no-allow-unauthenticated`, then private verify, then public invocation, then traffic, then frontend connection.

## 2026-08-17 A50 current record

A50 is **COMPLETED** for production Firebase Hosting containment on `taskio-v2`. Hosting-only maintenance mode is live on the default site. Functions, rules, indexes, Storage, Cloud Run, IAM, and staging were not deployed or modified.

- Branch / HEAD: `develop` / `33b4629`; tracker edit uncommitted; nothing pushed.
- Pre-deploy rollback identifiers: release `1766716607725000`, version `530f735512a2e5ee` (2025-12-26 frontend bundle, 27 files).
- New live identifiers: release `1786941217240000`, version `654a7615bfa2b420` (2026-08-17, 1 file from `maintenance/`).
- Verified `https://taskio-v2.web.app` and `https://taskio-v2.firebaseapp.com` (root, `/login`, `/admin`, `/post-task`): HTTP 200, title `Taskio is preparing to launch`, `Cache-Control: no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow`, no app UI/scripts/Firebase SDK.
- Canonical `taskio.com.au` / `www.taskio.com.au` are **not attached** to this Hosting site (LiteSpeed placeholder, pre-existing). DNS/domain configuration was not changed.
- Rollback: Firebase Console → Hosting → Release history → previous release `1766716607725000` / version `530f735512a2e5ee`.

## 2026-08-17 A04 current record

A04 is **COMPLETED**. Production user-managed Admin SDK key last-4 `3cac` on `taskio-v2` is permanently deleted. Zero user-managed keys remain on that Firebase Admin SDK account. Both local production credential files have been removed. Deployed Functions remain on their runtime Compute service account / ADC. No replacement production credential was created. Ignore protections remain in place.

- Branch / HEAD: `develop` / `67f97b4`; tracker edit uncommitted; nothing pushed.
- Deleted local files: `serviceAccountKey.json` and `backend/serviceAccountKey.json`. Both were ignored/untracked. `.gitignore` (`**/serviceAccountKey.json`) and `backend/.dockerignore` still protect the filename.
- No remaining worktree JSON copy of production key last-4 `3cac` was found.
- Staging key last-4 `f04d`, `backend/.env`, and obsolete ignored scripts (`backend/setAdmin.js`, `backend/debug.js`) are explicitly outside A04 and should be tracked separately if needed.

## 2026-08-16 repository-only execution ledger

This ledger records current evidence without erasing the historical baseline in each item. “Repository complete” does not imply a cloud deployment. Any source that eventually needs production deployment remains **PENDING FINAL DEPLOYMENT APPROVAL**.

| ID | Current status | Evidence / exact remaining requirement |
|---|---|---|
| A03 | PENDING FINAL DEPLOYMENT APPROVAL | Public Cloud Run `taskio-api` revision `taskio-api-preflight-090f1b5` on digest `sha256:e2750785…`; Invoker IAM check disabled. Unauthenticated `/health/live` 200; `/api/me` Express 401. Hosting remains A50 maintenance. DNS/custom domain and frontend restore remain. |
| A04 | COMPLETED | Production key last-4 `3cac` permanently deleted; 0 user-managed keys remain on the production Admin SDK account; both local production credential files removed; Functions remain on runtime Compute / ADC; no replacement production credential created; ignore protections remain. Staging key `f04d` and obsolete ignored scripts are outside A04. |
| A05 | PENDING FINAL DEPLOYMENT APPROVAL | `firestore.indexes.json` is tracked and referenced. Current queries avoid composite indexes; only an approved production deploy and representative live query verification can close acceptance. |
| A02 | COMPLETED | Firestore message creation requires a valid participant role and open, funded, unfrozen chat; demo-project rules suite passes. |
| A06 | COMPLETED | Production E2E bypass guard and tests added; CI explicitly builds with bypass disabled. |
| A09 | COMPLETED | Risk flags and counters are written by retry-safe server automation; duplicate emulator delivery is idempotent. |
| A11 | COMPLETED | Mocked Stripe operational handlers cover charge disputes, payout failures, and transfer reversals/failures; they flag internal state and create deterministic admin work items. Live webhook registration remains PENDING FINAL DEPLOYMENT APPROVAL. |
| A12 | COMPLETED | Demo-only Firestore/Storage emulator suite passes 17/17, including privilege, chat, attachment, and profile-photo cases. |
| A13 | COMPLETED | Firebase web configuration remains environment-driven and project-ID guarded; focused tests pass. |
| A14 | PENDING FINAL DEPLOYMENT APPROVAL | App Check configuration now rejects production debug tokens and enabled-without-key builds; focused tests and rollout documentation pass. Registration, monitoring and enforcement were not performed. |
| A16 | BLOCKED | Rules now limit profile-photo reads to owner/admin. Existing tokenized download URLs require a repository migration plus later token rotation and rules deployment before acceptance can be claimed. |
| A32 | COMPLETED | Pre-release cancellation refunds the base payment and every funded unreleased variation with stable idempotency keys; partial retries resume exactly once and released funds require the admin dispute flow. |
| A33 | COMPLETED | Storage rules use the same list/map invitation representations as Firestore and permit valid invited-expert chat attachments; emulator coverage passes. |
| A34 | COMPLETED | Registration responses map Firebase/internal failures to safe messages and request IDs; raw errors are logged structurally and regression-tested. |
| A40 | COMPLETED | Functions tests run under a demo Firestore emulator and are wired into CI with Node 24 and Java 21. |
| A20 | BLOCKED | Exact ordered production commands and rollback are documented, but deployment automation needs owner-approved GitHub identity/settings, production credentials and a deployment decision. No deployment workflow that could write externally was activated. |
| A21 | COMPLETED | CI runs production frontend build plus Playwright Chromium smoke tests against a local mock server; no real Firebase project is addressable by the harness. |
| A41 | COMPLETED | `.nvmrc`, package engines, Dockerfile, Functions and all CI jobs align on Node 24. |
| A42 | COMPLETED | Playwright reports/results, Firebase local state, emulator/debug logs, builds and dependencies are ignored. |
| A49 | SUPERSEDED | Staging excluded by owner decision; `taskio-v2-staging` remains frozen and was not accessed or modified. |
| A50 | COMPLETED | Hosting-only maintenance deployed to default site `taskio-v2`. Live version `654a7615bfa2b420`; rollback version `530f735512a2e5ee`. Default Firebase domains serve the no-store/noindex maintenance page on ordinary routes. Functions/rules/indexes/Cloud Run/IAM/staging untouched. Canonical apex is not attached to this Hosting site. |
| A51 | COMPLETED | Production API URL resolver rejects missing, local, HTTP, credentialed, and malformed endpoints; CI/build configuration and tests added. |
| A52 | COMPLETED | Backend and frontend now normalise every case variant of `completed` to `COMPLETED`; `PAID` remains explicit, with release-evidence compatibility for genuine legacy paid records; parity tests pass. |
| A53 | COMPLETED | Per owner decision, stale refresh is an authenticated claims-admin manual action; permissive cron-secret handling was removed. |
| A54 | COMPLETED | Backend test entry points no longer load developer `.env` files when `NODE_ENV=test`; focused suites pass without external calls. |
| A55 | COMPLETED | Backend and rules administrator checks trust Firebase custom claims only; mutable-profile escalation tests pass. |
| A56 | COMPLETED | Message automation uses deterministic transaction markers, exactly-once counters/notifications, retry rethrows, and duplicate-delivery emulator tests. |
| A57 | COMPLETED | Draft-to-submitted quote updates create the same deterministic homeowner notification as submitted-on-create; transition tests pass. |
| A58 | COMPLETED | Chat email HTML escapes all untrusted fields; hostile-markup tests pass and SMTP was not used. |
| A59 | BLOCKED | Scaffold export is removed from source and syntax checks pass. The already-deployed function remains unchanged until a separately approved production Functions deployment/deletion. |
| U01 | COMPLETED | Every primary category now offers a visibly labelled “Something else within this category” item with a required bounded description. Frontend and backend tests pass. |
| U02 | COMPLETED | Job creation accepts one primary category and 1–20 unique `{type, quantity, customDescription}` items with integer quantities 1–99; legacy single-item payloads normalize to one quantity-one item and whole-job quote/payment semantics remain unchanged. |
| U04 | COMPLETED | Both parties can submit one immutable review within 14 days; publication is double-blind or deadline-based. Chat remains writable for 30 days after release, then rules/UI make it read-only; claims-admin support can reopen it through an audited bounded endpoint. |
| U05 | COMPLETED | Mock matrix covers simultaneous tabs, abandoned/open/expired sessions, unavailable Stripe status, failed card, delayed success, duplicate webhook, and already-funded recovery. Stable checkout generations prevent multiple Stripe idempotency families for one attempt. No live Stripe call was made. |

## Final repository reconciliation (2026-08-17)

This table supersedes the intermediate ledger above. `COMPLETED` means the repository acceptance criteria were demonstrated locally and/or in CI. It does not imply deployment. Items needing a real-project write or live/manual verification remain pending or blocked as required by the owner authorization.

| ID | Final status | Evidence / exact remaining requirement |
|---|---|---|
| A01 | COMPLETED | Seven intentional commits through `13a22e3` were reviewed, pushed to `origin/develop`, and GitHub CI run `31955663683` passed all five jobs. |
| A02 | COMPLETED | Participant, sender-role, funded/open-chat, freeze, cancellation, and 30-day release rules are covered by the 18-test demo rules suite. |
| A03 | PENDING FINAL DEPLOYMENT APPROVAL | Public `taskio-api` exists: revision `taskio-api-preflight-090f1b5`, digest `sha256:e2750785…`, runtime SA, `OTP_SALT:1` only, Invoker IAM check disabled. Unauthenticated live 200; protected `/api/me` Express 401. Hosting remains A50 maintenance. DNS/custom domain, frontend restore, and live job/quote/OTP/ABN/admin flows remain later. |
| A04 | COMPLETED | Production key last-4 `3cac` permanently deleted; 0 user-managed keys remain on the production Admin SDK account; both local production credential files removed; Functions remain on runtime Compute `848916998874-compute@…` / ADC; no replacement production credential created; ignore protections remain. Staging key `f04d` and obsolete ignored scripts are outside A04. |
| A05 | PENDING FINAL DEPLOYMENT APPROVAL | `firestore.indexes.json` is tracked and referenced; current queries require no composites. An approved production deploy and representative live-query verification remain. |
| A06 | COMPLETED | Production bypass tests fail closed; the production E2E harness exception requires an explicit flag, demo project ID, and loopback API. Standard production CI builds with bypass disabled. |
| A07 | COMPLETED | Maintainability gate, generated-source parity, `git diff --check`, 410 frontend tests, 421 backend tests, builds, emulators, browser tests, and GitHub CI pass. |
| A08 | COMPLETED | Monitoring review and chat freeze/unfreeze route through audited claims-admin API endpoints; backend contract tests pass. |
| A09 | COMPLETED | Retry-safe Functions persist risk flags and exactly-once counters/notifications; duplicate-delivery emulator test passes. |
| A10 | COMPLETED | Firestore rules deny expert/admin self-bootstrap and allow normal homeowner creation; demo rules tests pass. |
| A11 | PENDING FINAL DEPLOYMENT APPROVAL | Mocked handlers cover disputes, payout failures, and transfer reversals/failures with deterministic admin work items. Production webhook registration and live event verification remain prohibited. |
| A12 | COMPLETED | Demo-only Firestore/Storage emulator suite passes 18/18 without addressing a real Firebase project. |
| A13 | COMPLETED | Firebase web configuration is environment-driven and guarded by the expected project ID; configuration tests pass. |
| A14 | PENDING FINAL DEPLOYMENT APPROVAL | App Check-compatible code rejects production debug tokens and missing enabled keys; tests and rollout instructions pass. Registration, monitoring, and enforcement remain unperformed. |
| A15 | COMPLETED | Homeowner/admin header navigation has responsive collapse rules and tests; shared public headers and the 320px browser overflow check pass. |
| A16 | BLOCKED | New uploads persist an owned storage path, quote APIs no longer return token URLs, and owner/admin storage rules pass. Owner must migrate existing records/rotate tokens and approve rules/API deployment before relationship-safe photos can be accepted. |
| A17 | COMPLETED | Local admin/debug scripts remain ignored and hardcoded identity is absent from tracked bootstrap tooling. |
| A18 | COMPLETED | Native browser prompt/confirm usages are zero; accessible in-app confirm/reason modals preserve the workflows and the maintainability budget is now zero. |
| A19 | COMPLETED | Pre-launch testimonials are not rendered and every sample job is visibly labelled “Illustrative example”; Chromium verifies both conditions. |
| A20 | BLOCKED | Exact deploy order and rollback are documented, but owner-approved GitHub identity/settings, production credentials, and a deployment decision are required. No deployment workflow was activated. |
| A21 | COMPLETED | CI builds the production frontend and runs Playwright Chromium against a compiled demo-only/local harness; GitHub browser-smoke passes. |
| A22 | PENDING FINAL DEPLOYMENT APPROVAL | Public routes have route-specific title, description, canonical, Open Graph metadata, and private noindex behavior; tests pass. Deployed crawler/link-preview verification remains. |
| A23 | PENDING FINAL DEPLOYMENT APPROVAL | `sitemap.xml` and the absolute robots discovery line are tracked. Hosting deployment and Search Console acceptance remain. |
| A24 | COMPLETED | Shared modal traps focus, closes on Escape, and restores trigger focus; interaction tests pass. |
| A25 | COMPLETED | Login/signup error summaries are live alerts and affected fields use `aria-invalid`/`aria-describedby`; frontend suite passes. |
| A26 | COMPLETED | Global skip link and route main-landmark targeting cover public routes; metadata/route tests pass. |
| A27 | COMPLETED | Expert signup uses keyed, adjacent accessible field errors for simultaneous validation failures. |
| A28 | COMPLETED | Admin session, dashboard, detail, monitoring, support, checklist, password, and profile-review loading states use shared accessible components. |
| A29 | COMPLETED | Landing, post-task, login, get-started, and Expert signup share `PublicPageHeader` and one responsive CSS contract. |
| A30 | COMPLETED | Admin task detail renders `AppHeader` above its breadcrumb, retaining global navigation. |
| A31 | COMPLETED | Public header and page breakpoints cover 720/480px layouts; the Chromium 320px no-overflow assertion passes. |
| A32 | COMPLETED | Cancellation refunds the base and every funded unreleased variation exactly once; released funds require dispute workflow; contract tests pass. |
| A33 | COMPLETED | Firestore/Storage invitation representations align and valid invited-expert attachment uploads pass emulator coverage. |
| A34 | COMPLETED | Registration maps internal failures to safe client messages/request IDs and logs structured server detail; tests pass. |
| A35 | COMPLETED | Rules deny ordinary users creating admin-role support tickets; emulator coverage passes. |
| A36 | COMPLETED | Confirmed-unused auth/drawer/action files and unused frontend/backend dependencies were removed; full tests/build pass. |
| A37 | COMPLETED | Unused payment-intent service/export and deprecated `/fund` stub were removed; backend suite and syntax pass. |
| A38 | COMPLETED | Status/security/readme claims now match the repository-only, undeployed state and current verification architecture. |
| A39 | COMPLETED | CRA boilerplate was replaced with Taskio setup, commands, environment safety, generated-source, build, and E2E documentation. |
| A40 | COMPLETED | Functions syntax/lint plus the four-test demo Firestore emulator suite run locally and in green CI. |
| A41 | COMPLETED | `.nvmrc`, package engines, Dockerfile, Functions, all CI jobs, and v5 GitHub actions align with Node 24. |
| A42 | COMPLETED | Playwright output, Firebase local state/logs, builds, dependencies, and local credential artifacts remain ignored. |
| A43 | COMPLETED | Ignored `login-tester.html` was deleted without opening it; no equivalent token-logging page is tracked. |
| A44 | DEFERRED | Owner explicitly deferred the large `jobs.js`/`me.js` router split until after release; security and behavior around both modules were completed now. |
| A45 | COMPLETED | Frontend README identifies the repository `shared/` files as source of truth and the generated copies; parity check passes. |
| A46 | COMPLETED | The one-off mojibake repair script was removed after reference and need checks. |
| A47 | COMPLETED | Express release-audit paths use the structured request logger; Functions errors are structured/rethrown through idempotent handlers without sensitive message data. |
| A48 | COMPLETED | Playwright expanded from two to four tests, covering account payment gating, combined lifecycle/risk flow, launch truth/metadata/responsiveness, and multi-item task briefs; local and CI runs pass. |
| A49 | SUPERSEDED | Staging is excluded by owner decision; no staging access or modification occurred during revised-authority implementation. |
| A50 | COMPLETED | Hosting-only maintenance deployed to default site `taskio-v2`. Live version `654a7615bfa2b420`; rollback version `530f735512a2e5ee`. `taskio-v2.web.app` and `taskio-v2.firebaseapp.com` serve the maintenance page on root and app routes with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. Functions remain ACTIVE unchanged. Canonical `taskio.com.au` is not attached to this Hosting site. |
| A51 | COMPLETED | Production API resolver rejects missing, malformed, credentialed, HTTP, and loopback endpoints; isolated demo harness exception is triple-guarded; tests/build pass. |
| A52 | COMPLETED | All `completed` case variants normalize to `COMPLETED`; `PAID` stays explicit with a release-evidence path for genuine legacy paid records; parity tests pass. |
| A53 | COMPLETED | Stale refresh is claims-admin manual-only and the permissive cron-secret design/secret is removed. |
| A54 | COMPLETED | Backend tests do not load developer `.env` files and the full 421-test suite runs with `NODE_ENV=test` and mocks. |
| A55 | COMPLETED | Backend middleware/routes, frontend admin routing/post-auth, and rules use custom claims only for admin authority; escalation tests pass. |
| A56 | COMPLETED | Function delivery markers, transactions, counters, and notifications are idempotent and retry-safe; duplicate emulator delivery passes. |
| A57 | COMPLETED | Draft-to-submitted and submitted-on-create quotes use the same deterministic homeowner notification; transition tests pass. |
| A58 | COMPLETED | Outbound chat HTML escapes every untrusted field; hostile-markup tests pass and SMTP was not accessed. |
| A59 | BLOCKED | The scaffold export is removed and Functions checks pass. The already-deployed function remains unchanged until an explicitly approved production Functions deletion/deploy. |
| U01 | COMPLETED | Every category offers a bounded custom item with required description; frontend/backend tests pass. |
| U02 | COMPLETED | Jobs support one category plus 1–20 unique items with quantities 1–99, legacy reads, and one whole-job quote; tests/browser flow pass. |
| U03 | BLOCKED | Safe profile enrichment suppresses low-volume rates and private/contact/financial fields, and quote APIs suppress token photo URLs. A16 migration plus approved deployment is required to deliver relationship-safe existing photos. |
| U04 | COMPLETED | Immutable double-blind 14-day reviews, explicit completion/payment states, 30-day chat, and audited claims-admin reopen are implemented and tested. |
| U05 | COMPLETED | Mock matrix covers repeated/interrupted checkout, failed/delayed/duplicate events, and funded recovery with stable idempotency; no Stripe account was accessed. |
| U06 | COMPLETED | Approved current logo and icon assets remain integrated; rejected old branding is absent and frontend build/CI pass. |

The original spreadsheet was last reconciled around commit `88ab54a`. Therefore, statuses below are a historical baseline. Never infer current state from a historical commit title; use the final reconciliation table above and its test evidence.

## Codex operating contract

1. Read `AGENTS.md`, both Taskio status documents if present, this tracker, `.github/workflows/ci.yml`, `firebase.json`, `.firebaserc`, and the relevant package scripts before editing.
2. Inspect the repository and git history first. Then ask Saeed **one consolidated numbered question set** covering every material ambiguity, business decision, permission, credential dependency, deployment choice, and destructive/external action you can foresee.
3. Wait for that single answer set. Afterward, execute continuously without routine check-ins. Use reasonable engineering judgment for implementation details.
4. Work through every unblocked tracker item in dependency order. Reconcile stale statuses from code and tests before starting new implementation.
5. Keep production isolated. Do not deploy to, write data to, change authentication/rules for, or rotate resources in `taskio-v2` unless Saeed explicitly authorizes the exact action.
6. Staging-only cloud changes, git push, PR creation, paid-service changes, secret rotation, and destructive actions require the permissions given in the initial answer set. If permission was not granted, prepare and verify the change locally and record the exact blocker.
7. Never print, commit, paste into tracker notes, or expose `.env` values, service-account JSON, Stripe secrets, Gemini keys, webhook secrets, or private credentials. Keep local environment files and credentials outside git.
8. Preserve unrelated user work. Use small reviewed batches; inspect `git diff`, `git diff --check`, and staged file lists. Do not use broad staging without review.
9. Run the narrowest relevant tests during each item and the full applicable verification before closing a phase. Treat expected negative-test console errors as test output, not failures.
10. Update this file after each completed batch: status, evidence, notes, dependencies, and session log. A task is Done only when its acceptance criteria are demonstrated.
11. Ask a new question only for a genuine blocker that could not reasonably have been included in the initial question set. Otherwise continue.
12. Finish with one final report containing: completed IDs, changed files, commits, tests/builds, staging/cloud actions, deferred or blocked IDs with reasons, security observations, rollback notes, and the recommended next release decision.

## Recommended authority envelope for the initial question round

Codex should ask Saeed to confirm or amend these defaults once, at the beginning:

| Action | Recommended default |
|---|---|
| Inspect and edit repository files | Yes |
| Run local scripts, tests, builds, emulators, and read-only diagnostics | Yes |
| Install/update project dependencies needed by an approved tracker item | Yes, after checking compatibility and lockfile impact |
| Create small local commits on `develop` | Yes, after diff and staged-file review |
| Push `develop` or open a PR | Ask once up front; recommended: push only after all checks pass |
| Change or deploy `taskio-v2-staging` | Ask once up front; allow only changes required by tracker items, with verification and rollback notes |
| Change or deploy production `taskio-v2` | No |
| Enable Stripe or perform payment actions | No real charges; test mode only if explicitly approved |
| Delete data, credentials, projects, branches, or resources | No; require exact separate approval |
| Make paid-plan, billing, domain, DNS, IAM, or irreversible console changes | No; prepare instructions and list as a blocker |

## Decisions already recorded

- Taskio is pre-launch; there are no real users or real transactions.
- `taskio-v2-staging` is the isolated test environment. Existing production test accounts do not automatically exist there.
- Stripe must remain disabled unless a tracker task explicitly requires test-mode payment verification and Saeed authorizes it.
- Expert public profiles may show approved public fields only; never expose direct contact, exact address, financial data, or identity documents.
- After payment release, chat remains writable for 30 days and then becomes read-only; support may reopen it.
- Reviews are single-use, double-blind, and available for 14 days after release.
- Illustrative testimonials and sample jobs must be removed or clearly labelled; they must not be presented as real customer activity.
- The approved existing repository Taskio logo is the source for site and app icons. The rejected horizontal twin must remain excluded.
- Saeed is the solo product owner/developer and prefers one up-front question round followed by autonomous execution.

## Completion rule

The tracker is complete when every ID below is one of: **Done and verified**, **Deferred by an explicit Saeed decision**, or **Blocked by a clearly documented external dependency that Codex cannot safely resolve**. No item may remain Ready, In Progress, Needs Decision, or Needs Verification without a final explanation and next command/action.

## Master tracker (65 items)

### A01 — Safely review, commit and push the untracked and modified work

- **Source:** Cursor Audit
- **Phase:** 0 Preserve
- **Area / feature:** Source control — Whole repository
- **Why / evidence:** All reviewed working-tree intent is preserved in 15 isolated commits and was pushed successfully to origin/develop. Local develop and origin/develop both resolve to 78fc522d2d208d07d72a6ebd7c5e98f72673b76f; staging and the working tree are clean. No deployment was performed.
- **Working priority:** Critical (original: Critical)
- **Baseline status:** Done
- **Effort:** Half day
- **Dependencies:** A42, A17
- **Next action:** No further preservation action. Continue with A49 staging and A03 backend-hosting work; keep production deployment separate and use isolated commits for new work.
- **Acceptance / verification:** Local HEAD and origin/develop equal 78fc522d2d208d07d72a6ebd7c5e98f72673b76f; ahead/behind is 0/0; staging and working tree are clean; all 15 reviewed commits are present remotely; nothing was deployed.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** Repository root; git status
- **Date added / last reviewed:** 2026-08-09 / 2026-08-11
- **Notes:** A01 completed in Phase 2T. The final audit passed backend 38 suites / 391 tests, frontend 52 suites / 384 tests, maintainability verification and the CI production build. git diff --check reported historical whitespace/EOF noise only. git push origin develop:develop advanced the remote from 34db4e2 to 78fc522; post-push verification returned 0/0. The rejected old logo is absent and no deployment occurred.

### A02 — Require job participation, valid sender role and enabled/unfrozen chat before allowing message creation

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Firebase rules — Job chat
- **Why / evidence:** Confirmed in the committed baseline: message creation requires authentication and message shape, but does not call participant, sender-role or chat-state helpers. Any authenticated user who knows a job ID can inject a message, although participant-only reads prevent disclosure.
- **Working priority:** Critical (original: Critical)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A01
- **Next action:** Update the message-create rule to call the existing participant, sender-role and chat-state helpers; keep rules and application changes in separate commits.
- **Acceptance / verification:** Rules emulator denies non-participant, frozen and closed-chat writes; allows valid participant writes.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** firestore.rules:398-434; helpers near 74 and 129-132
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** G1 confirmed validSenderRole and chatEnabled are defined but unused for message creation; chatFrozen/chatClosed therefore do not stop writes. flagRiskyJobMessages now exists in committed Functions code, but it cannot prevent a non-participant write and rules compilation remains unverified. SECURITY_COMPLIANCE_REVIEW.md also omits this known gap.

### A03 — Deploy the Express API and connect the hosted frontend

- **Source:** Cursor Audit
- **Phase:** 3 Deploy
- **Area / feature:** Deployment — Express backend
- **Why / evidence:** Public Cloud Run `taskio-api` revision `taskio-api-preflight-090f1b5` serves digest `sha256:e275078558a06d9a54089a69f74c213abd2a1cac06dc956407d9a41c5fd37143` as `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com` with `OTP_SALT:1` only. Invoker IAM check is disabled. Unauthenticated `/health/live` is 200; `/health/ready` was 200 (Firestore healthy, Stripe disabled). Unauthenticated `/api/me` is Express 401. CORS allows `https://taskio.com.au` and rejects `https://evil.example`. Hosting remains A50 maintenance. DNS/custom domain and frontend restore remain.
- **Working priority:** Critical (original: Critical)
- **Baseline status:** Needs Decision
- **Effort:** 1-2 days
- **Dependencies:** A01, A04, A49
- **Next action:** Separate approvals for DNS/custom-domain mapping and Hosting frontend restore. Do not treat public Cloud Run invocation as A03 complete. Live job/quote/OTP/ABN/admin verification remains after the frontend is connected.
- **Acceptance / verification:** Staging is frozen/excluded. Production acceptance still requires HTTPS health/readiness 200, CORS only on approved origins, NODE_ENV=production, ADC without a JSON key, and job posting/quote/OTP/ABN/admin flows on the deployed API after traffic and frontend connection are separately approved.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** Dockerfile; .dockerignore; .gcloudignore; backend/; docs/TASKIO_RELEASE_PLAN.md
- **Date added / last reviewed:** 2026-08-09 / 2026-08-17
- **Notes:** First Cloud Run create cannot use `--no-traffic`; this revision has 100% service traffic. Public invocation was enabled with `--no-invoker-iam-check` (Invoker IAM check disabled), not an `allUsers` binding. Application Firebase auth still protects authenticated routes. Do not set `GOOGLE_APPLICATION_CREDENTIALS`. Docker HEALTHCHECK was removed in favour of Cloud Run probes (`node:24-alpine` has no `wget`). Default Cloud Build identity `848916998874-compute@developer.gserviceaccount.com` still has `roles/editor`; record as a later hardening item — do not remove it as a side effect of A03.

### A04 — Remove and rotate local service-account keys

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Secrets — Firebase Admin credentials
- **Why / evidence:** Production user-managed Admin SDK key last-4 `3cac` on `taskio-v2` is permanently deleted. Zero user-managed keys remain on that account. Both local production credential files have been removed. Deployed Functions remain on their runtime Compute service account / ADC. No replacement production credential was created. Ignore protections remain in place.
- **Working priority:** Critical (original: Critical)
- **Baseline status:** Done
- **Effort:** 1-3 hours
- **Dependencies:** A01, A03
- **Next action:** None for A04. Staging key last-4 `f04d` and obsolete ignored scripts (`backend/setAdmin.js`, `backend/debug.js`) are outside A04 and should be tracked separately if needed.
- **Acceptance / verification:** Old key ID is disabled; backend starts using ADC or approved environment configuration; no key files exist inside the repo.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** serviceAccountKey.json; backend/serviceAccountKey.json
- **Date added / last reviewed:** 2026-08-09 / 2026-08-17
- **Notes:** Cloud disable/delete, local-file removal, and owner close-out completed 2026-08-17. Staging GAC last-4 `f04d` and ignored obsolete scripts remain out of A04 scope.

### A05 — Create and deploy required Firestore indexes

- **Source:** Cursor Audit
- **Phase:** 2 Stabilise
- **Area / feature:** Firestore — Indexes
- **Why / evidence:** No firestore.indexes.json exists. The audit predicts that admin status/role filters with ordering will require composite indexes, but runtime verification is still needed.
- **Working priority:** High (original: Critical)
- **Baseline status:** Needs Verification
- **Effort:** 1-3 hours
- **Dependencies:** A01
- **Next action:** Run each admin filter against the staging project, capture any Firestore index links, generate firestore.indexes.json and reference it in firebase.json.
- **Acceptance / verification:** All admin filters return results without FAILED_PRECONDITION; indexes are included in deployment.
- **Confidence:** Needs verification
- **Owner:** Cursor
- **File / location:** backend/src/routes/admin/userRoutes.js:324,329; firebase.json
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A06 — Prevent the E2E auth bypass from being enabled in production

- **Source:** Cursor Audit
- **Phase:** 3 Deploy
- **Area / feature:** Security — E2E authentication bypass
- **Why / evidence:** The bypass module is statically bundled and can bypass protected/admin routes if the production build flag is enabled.
- **Working priority:** Critical (original: Critical)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A03
- **Next action:** Add a production build guard that fails when REACT_APP_E2E_AUTH_BYPASS is true; document it as test-only.
- **Acceptance / verification:** Production build fails if bypass is enabled and normal production builds cannot activate it through localStorage.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/src/e2e/authBypass.js; App.js:6,52-68; AdminRoute.js:57-59
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Frontend review confirmed the E2E/debug bypasses are build-time gated and inert in the currently deployed bundle; URL parameters or browser storage cannot activate them. A production build guard and documented REACT_APP_E2E_AUTH_BYPASS policy are still required.

### A07 — Restore an honest green quality gate and clean mechanical repository debt

- **Source:** Cursor Audit
- **Phase:** 2 Stabilise
- **Area / feature:** CI — Maintainability gate
- **Why / evidence:** The original 22-error frontend maintainability blocker has been corrected and npm run verify now passes. Broader A07 work still includes remaining mechanical cleanup, test isolation from developer environment files and generated-source parity checks.
- **Working priority:** High (original: Critical)
- **Baseline status:** In Progress
- **Effort:** Half day
- **Dependencies:** A01
- **Next action:** Keep the current verify/CI baseline green, then separately finish the remaining mechanical cleanup, isolate backend tests from developer .env files and reconfirm generated shared-file parity before closing A07.
- **Acceptance / verification:** npm run verify and CI pass honestly; git diff --check is clean; backend and frontend tests pass without developer .env files; generated shared files match their source; documented flags match source usage.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/scripts/check-maintainability.js and listed source files
- **Date added / last reviewed:** 2026-08-09 / 2026-08-10
- **Notes:** Frontend npm run verify passed again during Phase 2R-B: maintainability plus 52 suites / 384 tests. CI=true npm run build also compiled successfully. README documents the current CI workflow and its known gaps: Playwright, Firebase rules tests, Functions tests and an audit gate are not covered. This does not yet satisfy every A07 acceptance item.

### A08 — Permit approved admin freeze/review fields or route writes through the admin API

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Firebase rules — Admin freeze and monitoring
- **Why / evidence:** Strict changedKeys allowlists reportedly omit freeze and monitoring-review fields, causing shipped admin actions to fail.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A02
- **Next action:** Prefer routing privileged writes through the admin API; otherwise extend the rules allowlist with the exact approved fields.
- **Acceptance / verification:** Admin can freeze/unfreeze chat and mark monitoring reviewed with no permission error.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** firestore.rules:311-325; AdminMonitoring.js; JobDetail.js
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A09 — Ensure risky-message flags persist server-side

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Firebase rules — Chat risk flagging
- **Why / evidence:** The committed flagRiskyJobMessages Admin-SDK trigger persists risk flags, job counters, thread summaries and notifications, but it is untested, undeployed and retry-sensitive. The A02 rules gap still allows non-participants to create messages.
- **Working priority:** High (original: High)
- **Baseline status:** Needs Verification
- **Effort:** 1-3 hours
- **Dependencies:** A02, A40, A56
- **Next action:** Add Functions tests for participant validation, risk keywords and deterministic notification IDs; make retry-sensitive counters idempotent under A56; verify the trigger in staging after A02 is fixed.
- **Acceptance / verification:** A participant risk message is flagged once and appears in admin triage; a non-participant write is denied by rules; retries do not double-count.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** functions/index.js: flagRiskyJobMessages; firestore.rules
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Functions baseline committed in 2e265fc. Server-side persistence now exists, but no Function was deployed or invoked and no Functions test suite exists.

### A10 — Prevent self-assignment of the expert role

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Firebase rules — User profile creation
- **Why / evidence:** The profile create rule reportedly allows any non-admin role even though normal signup creates a homeowner.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A02
- **Next action:** Restrict client-created profiles to homeowner, or omit role on client create and assign it server-side.
- **Acceptance / verification:** Rules emulator denies role=tradie on self-create and normal homeowner signup succeeds.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** firestore.rules:154-157
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A11 — Handle disputes, failed payouts and transfer reversals

- **Source:** Cursor Audit
- **Phase:** 4 Payments
- **Area / feature:** Payments — Stripe operational webhooks
- **Why / evidence:** Webhook handling reportedly covers funding, refunds and account.updated but not charge disputes, payout failures or transfer reversal/failure events.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** 1-2 days
- **Dependencies:** A03
- **Next action:** Add idempotent handlers that update internal state, create admin alerts and write contract tests for relevant Stripe events.
- **Acceptance / verification:** Stripe CLI test events update the job/account state, create alerts and are recorded once.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/routes/stripeWebhook.js:55-274
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Stripe Dashboard webhook endpoint must be checked; without a public backend endpoint, production webhooks and payment completion cannot operate.

### A12 — Add emulator-based security-rules tests

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Testing — Firestore and Storage rules
- **Why / evidence:** No rules test suite was found despite rules being the main protection for direct client access.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** 1-2 days
- **Dependencies:** A02, A08, A09, A10
- **Next action:** Create a @firebase/rules-unit-testing workspace covering chat participation, role escalation, admin allowlists, support tickets and storage access; add it to CI.
- **Acceptance / verification:** Rules tests pass in CI and deliberately reverting A02 causes a failure.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** firestore.rules; storage.rules; CI
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A13 — Make Firebase web configuration environment-driven

- **Source:** Cursor Audit
- **Phase:** 3 Deploy
- **Area / feature:** Configuration — Firebase web configuration
- **Why / evidence:** Hardcoded configuration prevents separate development, staging and production builds without source edits.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A01
- **Next action:** Read the web configuration from documented REACT_APP_* variables and provide frontend/.env.example without real secrets.
- **Acceptance / verification:** A staging build connects only to the staging project and production build connects only to production.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/src/firebase.js:9-18
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Committed frontend/env.example does not yet document REACT_APP_FIREBASE_* variables because firebase.js still hardcodes the web configuration. Coordinate the environment migration with A49 and A51.

### A14 — Enable and safely roll out Firebase App Check

- **Source:** Cursor Audit
- **Phase:** 3 Deploy
- **Area / feature:** Security — Firebase App Check
- **Why / evidence:** App Check is scaffolded but inactive unless environment flags are set.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** A13, A03
- **Next action:** Register the production web app, enable monitor mode first, validate legitimate traffic and then enforce supported services.
- **Acceptance / verification:** Firebase metrics show verified requests and test abuse is rejected after enforcement.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** frontend/src/firebase.js:36-40; Firebase console
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Frontend review confirmed App Check code is scaffolded but inactive because its environment flags are commented out/inert. Do not enforce until staging traffic is validated.

### A15 — Add a mobile layout for homeowner and admin headers

- **Source:** Cursor Audit
- **Phase:** 5 Product UX
- **Area / feature:** Responsive design — Authenticated header
- **Why / evidence:** Responsive rules reportedly cover the expert variant only; homeowner/admin navigation may overflow on narrow screens.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** None
- **Next action:** Add a collapsing mobile pattern matching the expert header and ensure every navigation destination remains reachable.
- **Acceptance / verification:** At 320, 375 and 768 px there is no horizontal overflow and all navigation is usable.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/src/components/AppHeader.js
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A16 — Restrict profile-photo reads to legitimate relationships

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Security — Profile-photo storage
- **Why / evidence:** Storage rules reportedly allow any authenticated user to read any profile photo.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A12
- **Next action:** Consolidate overlapping storage paths and limit reads to self, admin and counterparties on a shared job.
- **Acceptance / verification:** Unrelated authenticated users are denied; job counterparties and admins are allowed.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** storage.rules:103,117,138
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** G1 review confirmed all three profile-photo Storage paths allow any authenticated user to read any user's photo. Storage participant logic also excludes invited experts even though Firestore chat reads allow them, creating an attachment-access mismatch.

### A17 — Ignore local admin/debug scripts and remove hardcoded identity

- **Source:** Cursor Audit
- **Phase:** 0 Preserve
- **Area / feature:** Security — Local admin scripts
- **Why / evidence:** Untracked setAdmin.js and debug.js can grant admin access using local credentials and are one broad git-add away from being committed.
- **Working priority:** High (original: High)
- **Baseline status:** Done
- **Effort:** Under 1 hour
- **Dependencies:** A01
- **Next action:** Completed in repository-hygiene commit 3bc3e41. Retain scripts/bootstrapAdmin.js only as a future hardened ADC-based replacement; separately decide when to delete obsolete local scripts.
- **Acceptance / verification:** git check-ignore identifies both files and git status no longer lists them.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/setAdmin.js; backend/debug.js; .gitignore
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Done and committed in 3bc3e41 with A42. Narrow root-anchored ignore rules protect backend/setAdmin.js and backend/debug.js; neither script nor scripts/bootstrapAdmin.js has ever been committed. No history rewrite was required and no privileged script was executed.

### A18 — Replace browser confirm/prompt dialogs with accessible in-app modals

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** UX — Admin confirmation dialogs
- **Why / evidence:** Several admin workflows use blocking, unstyled browser dialogs that also fail the maintainability check.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** A07, A24
- **Next action:** Use the shared Modal component after accessibility improvements and preserve confirmation semantics.
- **Acceptance / verification:** No window.confirm/window.prompt errors remain and the flows pass interaction tests.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** HomeownerJobDetail.js; TaskDetailsDrawer.jsx; AdminJobOpsExtras.jsx
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A19 — Verify, replace or clearly label testimonials and sample jobs

- **Source:** Cursor Audit
- **Phase:** 5 Product UX
- **Area / feature:** Legal and trust — Landing-page social proof
- **Why / evidence:** The landing page reportedly presents hardcoded examples as genuine testimonials/listings, creating trust and Australian Consumer Law risk if fictional.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** None
- **Next action:** Remove the testimonials and sample jobs, or clearly label them as illustrative examples. Do not present them as real Taskio customer activity.
- **Acceptance / verification:** No testimonial or job is presented as real unless it is genuine, consented and traceable; all pre-launch examples are removed or visibly labelled illustrative.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** frontend/src/components/LandingPage.js:102-152,223-235
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Pre-launch decision: Taskio has no real testimonials or completed customer jobs yet.

### A20 — Automate deployment of frontend, Express API, functions, rules and indexes

- **Source:** Cursor Audit
- **Phase:** 3 Deploy
- **Area / feature:** Deployment — CI/CD
- **Why / evidence:** CI currently runs tests only. Firebase Hosting was manually deployed on 2025-12-26, and no backend deployment exists in repository automation.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** A01, A03, A05, A07, A49, A51
- **Next action:** After staging deployment is proven, add protected deployment workflows for the frontend, Cloud Run API, Firebase Functions, Firestore/Storage rules and indexes using least-privilege credentials.
- **Acceptance / verification:** An approved merge deploys the intended environment only; production requires approval; the workflow records frontend/API/function versions and never builds with localhost configuration.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** .github/workflows/ci.yml
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Every known release was manual from the development machine; add controlled repeatable deployment only after staging is working.

### A21 — Add the production build and Playwright smoke tests to CI

- **Source:** Cursor Audit
- **Phase:** 2 Stabilise
- **Area / feature:** Testing — CI coverage
- **Why / evidence:** CI reportedly does not run the production build or existing two Playwright tests.
- **Working priority:** High (original: High)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A07
- **Next action:** Add frontend build and E2E jobs, caching dependencies without caching secrets or generated state.
- **Acceptance / verification:** CI logs show a successful build and passing smoke tests.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** .github/workflows/ci.yml:11-25
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Documentation review confirmed PR_CHECKLIST.md requires npm run build, while ci.yml does not run a production build, Playwright or rules tests. The workflow remains uncommitted pending A07 corrections.

### A22 — Add route-specific titles, descriptions, canonical and Open Graph metadata

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** SEO — Public pages
- **Why / evidence:** All public routes reportedly share one static index.html metadata set.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** None
- **Next action:** Add route-aware metadata, unique public-page titles/descriptions, canonical URLs and an Open Graph image.
- **Acceptance / verification:** View source or a crawler shows unique metadata for every public route; link preview validates.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/public/index.html; public route components
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A23 — Add sitemap.xml and reference it in robots.txt

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** SEO — Sitemap and robots
- **Why / evidence:** No sitemap was found and robots.txt has no sitemap discovery line.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A22
- **Next action:** Create a public-route sitemap and add its absolute URL to robots.txt.
- **Acceptance / verification:** /sitemap.xml resolves and Search Console accepts it.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/public/robots.txt
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A24 — Add focus trapping, focus restoration and consistent Escape handling

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Accessibility — Modals and drawers
- **Why / evidence:** Shared and login modals reportedly allow keyboard focus to move behind overlays; some drawers lack accessible names.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** None
- **Next action:** Create a shared focus-management hook and apply it to modals/drawers; restore focus to the trigger.
- **Acceptance / verification:** Keyboard Tab stays inside, Escape closes and focus returns to the trigger.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** Modal.jsx; DrawerShell.jsx; Login.js
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A25 — Announce errors and connect them to fields

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Accessibility — Form errors
- **Why / evidence:** Login and signup errors are inconsistently exposed to screen readers.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** None
- **Next action:** Add role=alert to error summaries and aria-invalid/aria-describedby to affected fields, following the job form pattern.
- **Acceptance / verification:** Screen reader announces failed login and identifies invalid fields.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/src/Login.js; ExpertSignUpPage.jsx
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A26 — Add main landmarks and a skip link on all public pages

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Accessibility — Public-page landmarks
- **Why / evidence:** Several public routes reportedly lack a main landmark and the skip link is rendered only through AppHeader.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A29
- **Next action:** Use the shared PageMain pattern and a public-page skip link.
- **Acceptance / verification:** Automated accessibility scan reports no landmark violations and the skip link works on every public route.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** LandingPage.js; PrivacyPolicyPage.jsx; TermsPage.jsx; NotFoundPage.jsx; JobPostingForm.js
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A27 — Show inline field-level validation errors

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Accessibility — Expert signup validation
- **Why / evidence:** Signup reportedly displays one top error banner for many fields, making the failed fields unclear.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A25
- **Next action:** Return a keyed error map and render inline errors using the existing JobPostingForm pattern.
- **Acceptance / verification:** Submitting multiple invalid fields shows an accessible message beside each one.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/src/components/ExpertSignUpPage.jsx
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A28 — Use shared loading/skeleton components across admin pages

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** UX consistency — Admin loading states
- **Why / evidence:** Many admin surfaces reportedly show raw Loading... text instead of shared async-state components.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** None
- **Next action:** Replace ad hoc text with PageLoadingShell or InlineLoadingCard and preserve role=status.
- **Acceptance / verification:** Every admin page shows a consistent accessible loading state.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** AdminSupportTickets.js; AdminMonitoring.js; AdminProfileChangeRequests.js; others
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A29 — Consolidate competing public-page header implementations

- **Source:** Cursor Audit
- **Phase:** 5 Product UX
- **Area / feature:** UX consistency — Public headers
- **Why / evidence:** Landing, post-job, login, get-started and signup pages reportedly use three inconsistent header patterns.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** None
- **Next action:** Extract one PublicPageHeader and shared CSS, then adopt it across public pages.
- **Acceptance / verification:** Public pages have consistent height, spacing, logo and mobile behaviour.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** LandingPage.js; JobPostingForm.js; Login.js; GetStartedPage.jsx; others
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A30 — Keep global admin navigation visible on job detail

- **Source:** Cursor Audit
- **Phase:** 5 Product UX
- **Area / feature:** UX consistency — Admin job detail
- **Why / evidence:** The admin job-detail route reportedly omits AppHeader and leaves only a breadcrumb.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A29
- **Next action:** Render AppHeader above the job-detail breadcrumb.
- **Acceptance / verification:** Navigating from admin dashboard to a job keeps global navigation visible.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/src/JobDetail.js:691-696
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A31 — Add responsive breakpoints to public pages that use inline styles

- **Source:** Cursor Audit
- **Phase:** 5 Product UX
- **Area / feature:** Responsive design — Public pages
- **Why / evidence:** Several public pages reportedly use fixed padding and widths with no media rules.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** A29
- **Next action:** Move page layout objects into shared CSS/modules with 720 px and 480 px breakpoints.
- **Acceptance / verification:** At 320, 375 and 768 px there is no overflow and padding remains comfortable.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** Login.js; GetStartedPage.jsx; PrivacyPolicyPage.jsx; TermsPage.jsx; NotFoundPage.jsx
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A32 — Implement cancellation refunds for funded variations

- **Source:** Cursor Audit
- **Phase:** 4 Payments
- **Area / feature:** Payments — Paid variations
- **Why / evidence:** Base job cancellation reportedly ignores paid variations, leaving their funds in escrow for manual intervention.
- **Working priority:** High (original: Medium)
- **Baseline status:** Ready
- **Effort:** 1-2 days
- **Dependencies:** A11
- **Next action:** Define cancellation behaviour for in-escrow variations and refund each eligible variation idempotently; add contract tests.
- **Acceptance / verification:** A test job with a funded variation is cancelled and both base and variation refunds appear once in Stripe.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** variationPaymentCompletion.js; jobs.js cancellation flow
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A33 — Use one invitation representation and allow valid attachment uploads

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Firebase rules — Invited experts
- **Why / evidence:** Firestore and Storage helpers reportedly use different invitation fields, producing inconsistent read/upload permissions.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A12
- **Next action:** Standardise on invites map or invitedTradieUids and align Firestore and Storage participant helpers.
- **Acceptance / verification:** An invited expert can read the job, chat and upload an attachment; an unrelated expert cannot.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** firestore.rules:40-51,300-303; storage.rules:26-32,65-69
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A34 — Return safe registration errors to clients

- **Source:** Cursor Audit
- **Phase:** 2 Stabilise
- **Area / feature:** Error handling — User registration
- **Why / evidence:** Registration reportedly returns raw Firebase error.message rather than a generic user-safe response.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** None
- **Next action:** Map known errors to safe messages, return a request ID and log technical detail server-side.
- **Acceptance / verification:** Duplicate registration returns no Firebase internals and logs a correlated server error.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/routes/users.js:203,208-210
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A35 — Prevent clients from declaring an admin role on support tickets

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Firebase rules — Support tickets
- **Why / evidence:** Ticket creation reportedly accepts role=admin from an ordinary client, allowing triage metadata spoofing.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A10
- **Next action:** Allow only homeowner or tradie from the client, or derive the role server-side.
- **Acceptance / verification:** Rules emulator denies role=admin for a normal user.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** firestore.rules:515
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A36 — Remove unused components and dependencies

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Code cleanup — Frontend
- **Why / evidence:** The audit found unused auth/drawer components plus unused Stripe React and a React-only package in the backend.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A01
- **Next action:** Confirm zero references, remove the unused files/exports/packages and rebuild.
- **Acceptance / verification:** Frontend build plus frontend/backend test suites pass and bundle size does not increase.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** AuthActionPage.jsx; AuthModal.js; DrawerShell.jsx; package.json files
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A37 — Remove unused payment-intent export and deprecated /fund stub

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Code cleanup — Backend payments
- **Why / evidence:** Checkout is reportedly the only funding method; createPaymentIntent is unused and /fund returns 410.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A01
- **Next action:** Confirm no client calls /fund, then remove the export, import and deprecated route.
- **Acceptance / verification:** Backend tests pass and /fund is absent or intentionally documented.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/services/stripe.js; backend/src/routes/jobs.js
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A38 — Correct stale and contradictory implementation claims

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Documentation — Root documentation
- **Why / evidence:** Documentation review found no Formspree, menu.js, contact-page or alternative-host references. The real cleanup is to label the three root completion/QA guides as historical, remove duplicate content and correct README omissions without overstating readiness.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Done
- **Effort:** 1-3 hours
- **Dependencies:** A07, A21
- **Next action:** Keep documentation aligned when deployment, CI coverage or environment requirements change. No further A38 action is required before push.
- **Acceptance / verification:** No affirmative production-ready/battle-tested/zero-error claims remain; PROFILE checklist has one copy of every unique section; historical/local-test purpose is explicit; README reflects the actual architecture and current checks.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** IMPLEMENTATION_COMPLETE.md; PROFILE_TESTING_CHECKLIST.md; QUOTE_ELIGIBILITY_TESTING.md; README.md
- **Date added / last reviewed:** 2026-08-09 / 2026-08-10
- **Notes:** Completed locally. The historical root guides were corrected without losing unique content, and README was committed as befca871. Phase 2P validated documented paths/scripts, Node 20 for frontend/backend, Node 24 for Functions, environment/Stripe placeholders and CI coverage gaps. Structured manual Markdown review passed; no markdownlint package was installed.

### A39 — Replace stock Create React App documentation

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Documentation — Frontend README
- **Why / evidence:** frontend/README.md reportedly contains only CRA boilerplate.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A38
- **Next action:** Document commands, ports, environment variables, generated shared files, testing and E2E workflow.
- **Acceptance / verification:** A new developer can start and test the frontend from the README alone.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/README.md
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A40 — Add Cloud Functions tests and CI coverage

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Testing — Cloud Functions
- **Why / evidence:** The four Functions are now committed and lint clean, and Dependabot covers /functions. They still have no tests or CI job, have not been deployed or invoked, and include retry/idempotency and notification edge cases tracked separately.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Needs Verification
- **Effort:** 1-2 days
- **Dependencies:** A21
- **Next action:** Add a Node 24 Functions CI job that installs, lints and runs a new firebase-functions-test suite; test the four triggers, retry behaviour and staging deployment. Keep the completed /functions Dependabot block.
- **Acceptance / verification:** Functions lint and tests pass in CI on the deployment runtime; staging deployment state is documented; all intended triggers work with safe retries and no duplicate notification/counter effects.
- **Confidence:** Needs verification
- **Owner:** Cursor
- **File / location:** functions/index.js; functions/package.json; CI
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** 2e265fc committed five Functions files; node --check and ESLint passed with zero findings. b9a5c55 added /functions npm Dependabot coverage. Remaining: tests, CI, staging verification and deployment.

### A41 — Align Node runtime versions across the stack and CI

- **Source:** Cursor Audit
- **Phase:** 3 Deploy
- **Area / feature:** Build configuration — Node versions
- **Why / evidence:** Functions declare Node 24, while the uncommitted CI workflow uses Node 20 and frontend/backend declare no engines. Node 24 is supported for 2nd-gen Run functions, but Firebase deployment compatibility must still be verified safely in staging.
- **Working priority:** Medium (original: Medium)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A40
- **Next action:** Run Functions lint/tests in CI on Node 24; declare deliberate engines for backend/frontend or document their supported versions; add .nvmrc/tooling; verify firebase-tools accepts the Node 24 target in staging.
- **Acceptance / verification:** CI exercises each tier on its declared runtime; local tooling matches; Functions deploy to staging without a runtime warning or silent downgrade.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** functions/package.json; backend/package.json; frontend/package.json; ci.yml
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** All four triggers use firebase-functions/v2 and target australia-southeast1. Local Node was 24.11.0 and firebase-tools 15.1.0; no deployment was attempted.

### A42 — Ignore Playwright and Firebase local artifacts before staging

- **Source:** Cursor Audit
- **Phase:** 0 Preserve
- **Area / feature:** Repository hygiene — Generated test/deploy output
- **Why / evidence:** playwright-report, test-results and .firebase reportedly exist locally and are not ignored.
- **Working priority:** High (original: Medium)
- **Baseline status:** Done
- **Effort:** Under 1 hour
- **Dependencies:** A01
- **Next action:** Completed in repository-hygiene commit 3bc3e41; retain the rules and verify them during future broad staging operations.
- **Acceptance / verification:** git status no longer lists the artifacts and they are not present in staged files.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** .gitignore
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Done and committed in 3bc3e41 with A17. Added playwright-report/, test-results/ and .firebase/; verified all patterns using git check-ignore -v while Firebase and Playwright source/configuration remained visible.

### A43 — Remove the local login-tester page

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Security cleanup — Development login tester
- **Why / evidence:** A gitignored standalone page reportedly contains hardcoded Firebase config and prints live ID tokens to the browser console.
- **Working priority:** Low (original: Low)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A01
- **Next action:** Delete it or move it to a secure non-repository location if still required for diagnosis.
- **Acceptance / verification:** File is absent from the working tree and no equivalent token-logging tool remains.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** login-tester.html
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A44 — Split jobs.js and me.js into feature routers

- **Source:** Cursor Audit
- **Phase:** Backlog
- **Area / feature:** Maintainability — Backend route monoliths
- **Why / evidence:** The two route files are about 2,316 and 1,400 lines and are outside the current frontend-only size guard.
- **Working priority:** Low (original: Low)
- **Baseline status:** Deferred
- **Effort:** More than 2 days
- **Dependencies:** A07, A12
- **Next action:** After stabilisation, split into quotes, payments, variations and lifecycle modules; extend maintainability checks to backend/src.
- **Acceptance / verification:** Backend tests remain unchanged and no route module exceeds the agreed threshold.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/routes/jobs.js; backend/src/routes/me.js
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A45 — Document that frontend/src/shared files are generated

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Documentation — Generated shared files
- **Why / evidence:** The files are regenerated on start/build/test and manual edits would be overwritten.
- **Working priority:** Low (original: Low)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A39
- **Next action:** Add a prominent README note and optionally mark generated files in .gitattributes.
- **Acceptance / verification:** README explains the source of truth and generated files are identifiable in reviews.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/scripts/syncShared.js; frontend/src/shared/
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Three generated files under frontend/src/shared were intentionally included in frontend commit 07346cc because the application imports them and setup/build does not yet guarantee regeneration before use. The frontend pretest regenerated them byte-identically.

### A46 — Remove or document the one-off mojibake repair script

- **Source:** Cursor Audit
- **Phase:** 6 Quality
- **Area / feature:** Maintainability — Encoding repair script
- **Why / evidence:** No active mojibake signatures were reportedly found, so the recovery script may now be obsolete.
- **Working priority:** Low (original: Low)
- **Baseline status:** Needs Decision
- **Effort:** Under 1 hour
- **Dependencies:** A39
- **Next action:** Decide whether to delete it or document why and when it should be used.
- **Acceptance / verification:** Script is removed or its purpose and safe use are clearly documented.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** frontend/scripts/fixMojibake.js
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A47 — Use the structured logger for release audit failures

- **Source:** Cursor Audit
- **Phase:** 2 Stabilise
- **Area / feature:** Observability — Release audit logs
- **Why / evidence:** Backend release errors and all current Cloud Functions catches use raw console.error. Function errors are also swallowed, preventing platform retries and reducing structured severity/correlation.
- **Working priority:** Low (original: Low)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A40, A56
- **Next action:** Use the structured Firebase logger in Functions and the existing Winston logger in Express. Redact identifiers, preserve correlation context and rethrow retryable trigger failures after safe idempotency is implemented.
- **Acceptance / verification:** Backend and Functions errors are structured and severity-aware; retryable Function failures are retried safely; logs contain no message text, email address or payment data.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/routes/jobs.js; functions/index.js
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Functions review found five console.error calls with no PII, but every write path catches and swallows errors. Treat reliability under A56 and logging structure here.

### A48 — Extend Playwright beyond the two current smoke tests

- **Source:** Cursor Audit
- **Phase:** Backlog
- **Area / feature:** Testing — End-to-end journeys
- **Why / evidence:** Signup, posting, quoting, payment redirect and completion are reportedly untested end to end.
- **Working priority:** Low (original: Low)
- **Baseline status:** Deferred
- **Effort:** More than 2 days
- **Dependencies:** A21, A06
- **Next action:** Add homeowner signup-to-payment and expert quote-to-completion journeys after core flows stabilise.
- **Acceptance / verification:** E2E suite covers both primary journeys and runs green in CI.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/e2e/tests/critical-flows.spec.js:17-43
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

### A49 — Create a separate Firebase staging environment

- **Source:** User answer
- **Phase:** 3 Deploy
- **Area / feature:** Environment — Firebase staging
- **Why / evidence:** taskio-v2-staging is on Blaze. Its foundation now includes the Taskio Staging Web app, the (default) Firestore database and default Storage bucket in australia-southeast1, and Authentication initialized without providers. Hosting and Functions remain uninitialized; production is unchanged.
- **Working priority:** High (original: New)
- **Baseline status:** In Progress
- **Effort:** Half day–1 day
- **Dependencies:** A01
- **Next action:** Under separate approval, update TASKIO_STATUS.md and add an explicit staging alias/environment mapping. Keep taskio-v2 protected, do not deploy, and do not enable sign-in providers until the matching app configuration and security work are reviewed.
- **Acceptance / verification:** Signup, job posting, quote and test payment work in staging without reading from or writing to production.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** Firebase Console; frontend environment config; firebase.json
- **Date added / last reviewed:** 2026-08-09 / 2026-08-12
- **Notes:** Phase 2V-B foundation completed 12 August 2026: Blaze confirmed; one Web App registered without Hosting; Firestore (default) and Storage created in Sydney with deny-all production-mode rules; Authentication initialized with no providers; both Hosting and Functions still show Get started. No data, backend, secrets, App Check, Stripe, repository change or deployment; taskio-v2 production unchanged. Rejected navy/orange Horizontal logo not used.

### A50 — Put the publicly hosted pre-launch site into maintenance mode

- **Source:** Cursor follow-up
- **Phase:** 1 Secure
- **Area / feature:** Pre-launch containment — Public Firebase Hosting
- **Why / evidence:** Production Firebase Hosting default site `taskio-v2` now serves the static no-store/noindex maintenance page. Ordinary routes (`/`, `/login`, `/admin`, `/post-task`) no longer expose the application UI on `taskio-v2.web.app` or `taskio-v2.firebaseapp.com`. Canonical apex is not attached to this Hosting site.
- **Working priority:** Critical (original: New)
- **Baseline status:** Done
- **Effort:** Under 1 hour
- **Dependencies:** A01
- **Next action:** None for A50 Hosting containment. Separate later decision if `taskio.com.au` should be pointed at this Hosting site. Rollback remains Console Release history to version `530f735512a2e5ee`.
- **Acceptance / verification:** Both default Firebase domains and any custom domain show only the maintenance message; users cannot sign up, log in, post, quote or begin payment; rollback steps are documented.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** Firebase Console > Hosting; firebase.json; maintenance build
- **Date added / last reviewed:** 2026-08-09 / 2026-08-17
- **Notes:** Hosting-only deploy 2026-08-17 with `--project taskio-v2 --only hosting --config firebase.maintenance.json`. Functions/rules/indexes/Storage/Cloud Run/IAM/staging untouched. `firebase.json` and `frontend/build` unchanged. Do not delete Firestore/Auth/Storage data.

### A51 — Separate API URLs by environment and block localhost production builds

- **Source:** Cursor follow-up
- **Phase:** 3 Deploy
- **Area / feature:** Configuration — Production API URL
- **Why / evidence:** The Firebase-hosted bundle contains REACT_APP_API_BASE_URL=http://localhost:8000, causing job posting, quotes, payments, OTP, ABN lookup and admin API calls to target each visitor's own computer.
- **Working priority:** Critical (original: New)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A03, A49
- **Next action:** Create documented development, staging and production API URL configuration; remove development env files from production builds; add a build guard that fails if a production API URL is missing, HTTP-only or localhost; rebuild only after the staging/production API URL exists.
- **Acceptance / verification:** Production build fails for localhost, loopback, missing or insecure API URLs; the exported bundle contains the intended HTTPS endpoint; staging and production each call only their own backend.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend.env.local; frontend/src/api/createApiClient.js; build/deployment workflow
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Confirmed again during frontend review: createApiClient.js falls back to http://localhost:8000 and the committed frontend template documents localhost. No production guard exists. A51 is present in this workbook even though repository audit material ends at A48.

### A52 — Resolve inconsistent completed-status normalisation

- **Source:** Cursor follow-up
- **Phase:** 2 Stabilise
- **Area / feature:** State model — Job status mapping
- **Why / evidence:** shared/jobStatusesCore.js reportedly maps lowercase 'completed' to PAID while uppercase 'COMPLETED' resolves to COMPLETED, so equivalent inputs may enter different workflow states.
- **Working priority:** High (original: New)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A01, A12
- **Next action:** Confirm the intended canonical lifecycle and legacy aliases; make normalisation case-insensitive and explicit; add tests for every accepted spelling and unknown values.
- **Acceptance / verification:** All accepted case variants resolve deterministically to the intended status; legacy records remain readable; payment and completion tests pass.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** shared/jobStatusesCore.js
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Found during G2 review; not changed in preservation commit 03e4557.

### A53 — Fail closed when CRON_SECRET is absent in production

- **Source:** Cursor follow-up
- **Phase:** 1 Secure
- **Area / feature:** Security — Cron workflow route
- **Why / evidence:** The workflow route's secondary cron-secret check reportedly becomes permissive when CRON_SECRET is unset. Admin authentication still applies, so this is weakened defence-in-depth rather than an unauthenticated route.
- **Working priority:** Medium (original: New)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A01, A03
- **Next action:** Require CRON_SECRET in production or remove the redundant check in favour of one documented authentication mechanism; add missing/wrong/correct-secret tests.
- **Acceptance / verification:** Production startup or the route fails safely when the secret is absent; incorrect secrets are rejected; authorised scheduled calls and admins follow the documented policy.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/routes/workflowRoutes.js:231
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Found during backend review; no exploit was exercised and the route still requires admin authentication.

### A54 — Isolate backend tests from the developer .env file

- **Source:** Cursor follow-up
- **Phase:** 2 Stabilise
- **Area / feature:** Testing — Backend test environment
- **Why / evidence:** The 391-test backend run loaded 12 values from backend/.env through dotenv initialisation. Values were not printed, but test behaviour can depend on one developer machine and could initialise external services unexpectedly.
- **Working priority:** Medium (original: New)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A07
- **Next action:** Create explicit test-only configuration/mocks; prevent ordinary test runs from reading backend/.env; document required safe test variables.
- **Acceptance / verification:** All backend tests pass with backend/.env absent and no external Firebase, Stripe, email or webhook call is made unless a dedicated integration test explicitly opts in.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/firebaseAdmin.js; backend/src/server.js; Jest setup
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** No repository-visible file changed during the successful 391-test baseline run.

### A55 — Remove mutable Firestore-document fallback from administrator checks

- **Source:** Cursor follow-up
- **Phase:** 1 Secure
- **Area / feature:** Security — Administrator authorisation
- **Why / evidence:** Backend requireAdmin and Firestore rules both reportedly accept admin status from users/{uid}.admin or role='admin' as a fallback to custom claims. Client escalation is blocked, but two authorization layers rely on mutable profile data.
- **Working priority:** High (original: New)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A04, A12
- **Next action:** Choose one server-controlled administrator source, preferably verified custom claims; migrate existing admins; remove or strictly protect document fallbacks; add rules and middleware tests.
- **Acceptance / verification:** Changing an ordinary user profile document cannot grant administrator access; valid administrators continue to work after token refresh; rules and backend tests cover escalation attempts.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** backend/src/middleware/auth.js; firestore.rules isAdmin()
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Confirmed independently during G1 rules review and Phase 2F backend review.

### A56 — Make Cloud Functions retry-safe and idempotent

- **Source:** Cursor follow-up
- **Phase:** 2 Stabilise
- **Area / feature:** Cloud Functions — Retry and event processing
- **Why / evidence:** Functions may be delivered more than once. unreadCount and flaggedMessageCount use FieldValue.increment outside a dedupe guard, escrow funding can satisfy two transition paths, and caught errors are swallowed so failed writes are not retried.
- **Working priority:** High (original: New)
- **Baseline status:** Ready
- **Effort:** Half day
- **Dependencies:** A09, A40, A47
- **Next action:** Introduce an event/delivery dedupe record or transaction-safe state marker; make counter updates exactly-once; collapse escrow-funded transition logic; rethrow retryable failures after safe logging; add duplicate-event and partial-failure tests.
- **Acceptance / verification:** Repeated delivery of the same event leaves one notification and one counter increment; paymentState/status updates do not notify twice; transient failures retry without corrupting state.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** functions/index.js: flagRiskyJobMessages and notifyTradieOnEscrowFunded
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Found during Functions review after commit 2e265fc. No production event was invoked.

### A57 — Notify the homeowner when a draft quote becomes submitted

- **Source:** Cursor follow-up
- **Phase:** 5 Product UX
- **Area / feature:** Cloud Functions — Quote notifications
- **Why / evidence:** notifyHomeownerOnQuoteSubmitted runs only on document creation. A quote created as draft and later updated to status='submitted' never triggers the notification.
- **Working priority:** Medium (original: New)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A40
- **Next action:** Handle a non-submitted → submitted update transition, or enforce create-as-submitted as the only valid workflow; keep the deterministic notification ID and add create/update tests.
- **Acceptance / verification:** A newly submitted quote notifies exactly once whether it was created submitted or transitioned from draft; duplicate updates do not add notifications.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** functions/index.js: notifyHomeownerOnQuoteSubmitted
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Use the A56 idempotency pattern so the added update trigger cannot duplicate notifications.

### A58 — Escape untrusted chat content in outbound HTML email

- **Source:** Cursor follow-up
- **Phase:** 1 Secure
- **Area / feature:** Security — Chat email rendering
- **Why / evidence:** senderName, jobTitle and message preview are interpolated directly into an HTML email body. Markup supplied through profile/job/message content could alter the email rendering.
- **Working priority:** High (original: New)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A40
- **Next action:** HTML-escape every untrusted interpolated value or render a plain-text email plus a safely escaped HTML alternative; add hostile-markup tests.
- **Acceptance / verification:** Tags, entities, links and event-handler-like text from user content render only as text; legitimate Unicode and line breaks remain readable.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** functions/index.js: chat email template
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** No credential or recipient leak was found; this is outbound email HTML injection, not browser script execution.

### A59 — Remove or protect the helloTaskio scaffold endpoint

- **Source:** Cursor follow-up
- **Phase:** 6 Quality
- **Area / feature:** Cloud Functions — Public scaffold endpoint
- **Why / evidence:** helloTaskio is a public unauthenticated HTTPS function returning a static health payload. It is harmless now but creates an unnecessary deployed endpoint and maintenance surface.
- **Working priority:** Low (original: New)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A40
- **Next action:** Delete the scaffold before deployment, or document and protect it as an intentional health endpoint with suitable limits and monitoring.
- **Acceptance / verification:** No unused public scaffold function is deployed; any retained health endpoint has an explicit purpose, response contract and abuse controls.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** functions/index.js: helloTaskio
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Found during Functions inventory; it reads and writes nothing and was not invoked.

### U01 — Add “Something else within this category” to every category

- **Source:** User
- **Phase:** 5 Product UX
- **Area / feature:** Job posting — Category sub-items
- **Why / evidence:** Users need a safe option when their required item is not represented by the fixed sub-item list.
- **Working priority:** High (original: User request)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A01
- **Next action:** Add a final other-option for every primary category. When selected, show a required free-text description and store/display it consistently.
- **Acceptance / verification:** Every category exposes the option; empty custom descriptions are blocked; the value survives save/reload and appears in job detail, quote and admin views.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** JobPostingForm.js; shared expertise/category catalog
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** Consider implementing this as part of U02’s array-based item model.

### U02 — Keep one primary category but allow multiple sub-items with quantities

- **Source:** User
- **Phase:** 5 Product UX
- **Area / feature:** Job posting — Multiple sub-items and quantities
- **Why / evidence:** Real jobs may contain several pictures, shelves, furniture items, cabinet handles or repair items; radio buttons force an unrealistic single choice.
- **Working priority:** High (original: User request)
- **Baseline status:** Needs Decision
- **Effort:** More than 2 days
- **Dependencies:** U01, A01
- **Next action:** Define an items array such as [{type, quantity, customDescription}]; design multi-select/quantity controls; retain backward compatibility; update storage, APIs, summaries, quote/admin views and tests.
- **Acceptance / verification:** A user can add multiple different items and quantities, edit/remove them, submit the job, reload it and see the same structured list everywhere.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** JobPostingForm.js; shared catalog; job schema; job-detail surfaces
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** Recommended model: one primary category plus one-or-more line items. Quantity should default to 1.

### U03 — Let clients inspect an expert’s safe public profile before accepting a quote

- **Source:** User
- **Phase:** 5 Product UX
- **Area / feature:** Quotes and trust — Expert profile before quote acceptance
- **Why / evidence:** Clients need enough trust information to compare experts before committing, while private contact details must remain protected.
- **Working priority:** High (original: User request)
- **Baseline status:** Ready
- **Effort:** 1-2 days
- **Dependencies:** A12, A16
- **Next action:** From each quote, open a safe profile showing photo; first name + last initial or approved business name; verification/ABN/licence/insurance badges; skills; bio; experience; portfolio; rating/review count and relevant reviews; completed jobs; completion rate after 5 jobs; general service area; quote price; and availability. Hide direct contact, exact address, financial data and identity documents.
- **Acceptance / verification:** The correct expert profile opens without losing quote state; every approved field is displayed; hidden fields are not returned by Firestore/API; low-volume completion rate is suppressed until 5 completed jobs.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** Quote cards; expert profile; Firestore/API access rules
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Product decision resolved. Keep direct contact and sensitive identity/payment data private before quote acceptance.

### U04 — Define post-release chat access and review-button behaviour

- **Source:** User
- **Phase:** 5 Product UX
- **Area / feature:** Job lifecycle — Chat and review after payment release
- **Why / evidence:** The lifecycle must clearly distinguish work completion, payment release and review so users do not lose communication or see confusing actions.
- **Working priority:** High (original: User request)
- **Baseline status:** Ready
- **Effort:** 1-2 days
- **Dependencies:** A02, A08, A12
- **Next action:** Implement role-specific actions: expert marks complete and requests payment; client reviews work and releases payment; after release show Leave a review. Allow each party one review within 14 days and publish double-blind. Keep chat writable for 30 days after release, then read-only; support may reopen it.
- **Acceptance / verification:** Only valid role/state actions appear; payment release is distinct from review; each party can review once within 14 days; reviews publish double-blind; chat becomes read-only after 30 days unless support reopens it.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** Job status machine; chat rules; homeowner/expert job detail; review flow
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Product decision resolved: 30-day writable chat, 14-day double-blind review window and support override.

### U05 — Verify that interrupted or repeated payment attempts cannot charge a client twice

- **Source:** User
- **Phase:** 4 Payments
- **Area / feature:** Payments — Payment success, recovery and duplicate prevention
- **Why / evidence:** Clients need a reliable pending/success/failure flow; redirect interruption or double-clicking must not create duplicate charges or ambiguous job state.
- **Working priority:** Critical (original: User request)
- **Baseline status:** Blocked
- **Effort:** 1-2 days
- **Dependencies:** A03, A11, A12, A49, A51
- **Next action:** Do not enable Stripe live mode. After A03/A49/A51 provide a deployed staging API, inspect the Stripe webhook endpoint and execute the idempotency/recovery test matrix using Stripe test mode.
- **Acceptance / verification:** Automated tests cover double-click, two tabs, duplicate webhook, browser close, failed card, delayed webhook and retry; each scenario produces at most one successful charge and one funded job state.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** Stripe checkout endpoint; stripeWebhook.js; payment return page; job funding state
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Pre-launch and Stripe test mode. The live frontend calls localhost:8000, so public payment initiation and webhook completion are unavailable. Resume this task only after the staging backend and correct API URL are deployed.

### U06 — Integrate the approved current Taskio logo and matching app icons

- **Source:** User
- **Phase:** 5 Product UX
- **Area / feature:** Branding — Logo and app icons
- **Why / evidence:** The UI already centralises the full logo through BrandLogo, but favicon, Apple-touch and manifest icon paths pointed to missing files. The existing in-repository logo was approved; the rejected Horizontal twin was explicitly excluded.
- **Working priority:** Medium (original: User request)
- **Baseline status:** Done
- **Effort:** 1-3 hours
- **Dependencies:** A01
- **Next action:** After a future staging deployment, visually smoke-check the full logo at 32px/40px and the browser/PWA icons. No code, manifest or hosting configuration change is currently required.
- **Acceptance / verification:** Approved full logo remains clear and transparent; favicon.ico includes 16/32/48 sizes; linked favicon, Apple-touch and 192/512 manifest paths resolve; square icons are opaque and maskable-safe; frontend verify and CI build pass.
- **Confidence:** Confirmed
- **Owner:** Cursor
- **File / location:** frontend/public/images/taskio-logo.png; frontend/public favicon and app icon assets
- **Date added / last reviewed:** 2026-08-10 / 2026-08-11
- **Notes:** Completed in 78fc522 and pushed to origin/develop in Phase 2T. Six approved current-brand assets are present; the rejected f8a81415 source was not used. Frontend verification and CI build passed. A visual smoke check remains for a future staging deployment; no deployment has occurred.

## Session log (append; do not rewrite history)

| Date | Branch / commit | IDs | Work completed | Verification | Cloud/external actions | Remaining/blockers |
|---|---|---|---|---|---|---|
| 2026-08-16 | `develop` / `e736581` | A02, A10, A12, A13, A16 and related security work require reconciliation | Security-rule hardening and CI restoration were committed and pushed; staging configuration was established locally | GitHub Actions green; frontend 392/392; backend 391/391; rules 16/16; frontend production build passed; backend readiness `ok: true` against staging | Firestore and Storage rules deployed to `taskio-v2-staging`; Email/Password enabled in staging Auth; no production deployment | Inspect exact diffs and acceptance criteria before marking individual IDs Done; Gemini model retirement remains unresolved; complete the remaining tracker in dependency order |
| 2026-08-16 | `develop` / `6e683fc` | A11, A32, A52, U04, U05 | Added mocked operational Stripe handling, stable checkout generations, exactly-once variation cancellation refunds, explicit completion/payment semantics, double-blind reviews, and 30-day post-release chat with audited support reopen | Backend focused 108/108; frontend focused 8/8; demo rules 18/18; production-mode frontend build passed | None; no Firebase project, Stripe account, or other live service accessed or modified | All deployment/runtime portions remain pending approval |
| 2026-08-16 | `develop` / U01-U02 batch | U01, U02 | Added category-scoped multi-item briefs, quantity bounds, custom items, server canonicalisation, and backward-compatible legacy payload reads; quote remains one whole-job amount | Backend focused 12/12; frontend focused 4/4; syntax and diff checks passed | None | Include in full-suite verification before push |
| 2026-08-16 | `develop` / release-prep batch | A03, A04, A05, A14, A20, A21, A41, A42, A49, A50 | Prepared a Node 24 API container, index manifest, App Check guards, CI browser smoke job, maintenance artifact, secret-name inventory, exact production order/verification/rollback, key-rotation instructions, and local configuration checklist | JSON manifests parsed; App Check/Firebase config tests 11/11; no deployment command executed | Production credentials/settings/approvals; A04 owner-operated key rotation | Run full verification; review and commit artifacts; deployment statuses remain pending/blocked |
| 2026-08-17 | `develop` / `158ad23` | A07, A08, A15, A18-A19, A22-A31, A36-A39, A43, A45-A48, U03 | Finished audited admin operations, claims-only client routing, safe photo metadata, accessible dialogs/errors/loading, shared public headers, launch truth labels, metadata/sitemap, cleanup, docs, and four-test compiled browser harness | Frontend 410/410; backend 421/421; rules 18/18; Functions 4/4; Playwright 4/4; production build, syntax, lint, maintainability and diff checks passed | Seven repository commits pushed; no cloud/service deployment or account access | Deployment/manual-only items remain pending or blocked in final reconciliation |
| 2026-08-17 | `develop` / `13a22e3` | A01, A07, A21, A40-A42 | Repaired root clean-install lock resolution after first CI run identified missing `picomatch@4.0.5`; pinned the compatible root dev dependency | Root `npm ci` passed; both demo emulator suites re-passed; GitHub Actions run `31955663683` passed all five jobs | Pushed only to `origin/develop`; no PR/settings/deployment writes | Final v5 Actions maintenance and tracker-only commit requires its own green CI confirmation |
| 2026-08-17 | `develop` / `67f97b4` | A04 | Read-only production inventory: `gcloud` absent, so Firebase operator OAuth REST was used. One enabled user-managed key last-4 `3cac` matches both local JSON files; `taskio-api` absent; four Functions v2 use default compute SA; no impersonation bindings; audit-log search incomplete. No mutation. | IAM describe/list keys; Cloud Run 404; Functions runtime identities | Read-only Google APIs on `taskio-v2` only. Staging not selected. Nothing committed | Local dependency check before any disable |
| 2026-08-17 | `develop` / `67f97b4` | A04 | Local dependency check: tracked backend/Functions/CI/Docker do not hard-require the A04 JSON files. Current `backend/.env` GAC is a different staging JSON (last-4 `f04d`). Ignored `setAdmin.js` requires `backend/serviceAccountKey.json`; `debug.js` only inspects that filename; `bootstrapAdmin.js` uses ADC/GAC. | Filename/env-name inspection only; A04 JSON files not re-opened | None. No key/resource mutation. Nothing committed | Owner approval to disable user-managed key last-4 `3cac` only; delete/local-removal remain later |
| 2026-08-17 | `develop` / `67f97b4` | A04 | Disabled user-managed key last-4 `3cac` on `taskio-v2` Admin SDK account. Key still exists and is disabled. System-managed keys unchanged. Four Functions v2 ACTIVE on default compute SA. `taskio-api` still absent. Local JSON files left in place. Local backend was not running. | Post-disable IAM list; Functions v2 list; Cloud Run 404; local file existence; no listener on 8000/8080 | IAM disable on `taskio-v2` only. Staging not selected. No delete/create/deploy. Nothing committed | Separate approval required to delete the disabled cloud key; local-file removal later |
| 2026-08-17 | `develop` / `67f97b4` | A04 | Permanently deleted disabled user-managed key last-4 `3cac`. Post-consistency list: 0 user-managed keys, 3 unchanged system-managed keys, GET of `3cac` is NOT_FOUND. Functions remain ACTIVE on default compute SA. `taskio-api` absent. Local JSON files left in place. | Pre-delete disabled=True; DELETE 200; delayed list 0 user-managed; Functions/Cloud Run re-check; no ERROR logs in 20m sample | IAM delete on `taskio-v2` only. No replacement key. Staging not selected. Nothing committed | Owner approval to securely remove both local JSON copies; A04 stays BLOCKED until then |
| 2026-08-17 | `develop` / `67f97b4` | A04 | Deleted ignored local copies `serviceAccountKey.json` and `backend/serviceAccountKey.json`. No remaining worktree JSON with production key last-4 `3cac`. Ignore/dockerignore protections remain. Ignored `setAdmin.js` left unmodified and is now non-functional. Staging key `f04d` and `.env` untouched. | File existence false; git ls-files empty; filename/env-name search; git status tracker-only | No cloud change. Nothing committed | Owner confirmation to mark A04 COMPLETED; separate decisions for `setAdmin.js` and staging key `f04d` |
| 2026-08-17 | `develop` / `67f97b4` | A04 | Owner confirmed close-out. A04 marked COMPLETED: production key `3cac` deleted; 0 user-managed keys remain; both local production credential files removed; Functions remain on runtime Compute / ADC; no replacement production credential created; ignore protections remain. Staging key `f04d` and obsolete ignored scripts are outside A04. | Tracker current record, both ledgers, and master item updated | Tracker-only edit. Nothing committed or pushed | None for A04 |
| 2026-08-17 | `develop` / `33b4629` | A50 | Hosting-only maintenance deployed to `taskio-v2` default site. CLI uploaded 1 file from `maintenance/`. Live version `654a7615bfa2b420`; previous rollback version `530f735512a2e5ee`. Default Firebase domains verified maintenance on root and app routes. Canonical apex not attached (LiteSpeed). Functions still 4 ACTIVE with unchanged source hashes. | Live GET 200 + no-store/noindex headers; channel JSON; functions:list | Hosting-only on `taskio-v2`. No Functions/rules/indexes/Cloud Run/IAM/staging. Tracker uncommitted | Owner may commit tracker; A03 remains a separate approval |
| 2026-08-17 | `develop` / `210ccf4` | A03 | Fixed production API build context: root `Dockerfile`/`.dockerignore`/`.gcloudignore`; deleted `backend/Dockerfile`; `backend/.dockerignore` no longer excludes Dockerfiles. Image keeps `/app/backend` + `/app/shared`. Release plan now uses `--source .`, `--no-traffic --tag preflight`, and separated public-access/traffic/frontend steps. | Path resolution of runtime `shared/` imports; `node --check`; backend tests (see session report). Docker not installed — image build/health outstanding and required before Cloud Run deploy approval | None. No cloud mutation. This batch committed locally; not pushed | Real container build still outstanding. Smallest next cloud preflight: Cloud Build/AR APIs + image build, without creating `taskio-api` |
| 2026-08-17 | `develop` / `c7c1887` | A03 | Added GitHub CI job `api-image`: `docker build` from repo root, inspect WorkingDir/User/Cmd, confirm `/app/backend` + `/app/shared` layout and no credential files. | GitHub Actions run `32000889708` all 6 jobs success, including `api-image` | Pushed `c7c1887` to `origin/develop`. No GCP mutation in that commit | Cloud Build/Artifact Registry preflight still required |
| 2026-08-17 | `develop` / `c7c1887` | A03 | Cloud Build / Artifact Registry preflight on `taskio-v2` only: created Docker repo `taskio-api` in `australia-southeast1`; submitted regional Cloud Build from committed root Dockerfile; pushed `:preflight`. No Cloud Run, runtime IAM, Secret Manager, Hosting, DNS, or staging. | Build `dc797823-5b5c-4119-8a4e-62edbe24b746` SUCCESS; image digest `sha256:f76b413db39f42825e9a7c6d0ea3c92d880d293e469d958e540691c2b57a213c`; `gcf-artifacts` untouched; `taskio-api` Cloud Run 404; four Functions ACTIVE unchanged; Secret Manager API disabled | AR repo + Cloud Build source/log buckets + one preflight image on `taskio-v2`. Tracker uncommitted. Nothing pushed | Next approval: dedicated `taskio-api-runtime` SA / least-privilege IAM only. Secrets and Cloud Run remain later |
| 2026-08-17 | `develop` / `9525e63` | A03 | Tracker-only record of Cloud Build / Artifact Registry preflight. | Docs review of preflight evidence | Pushed `9525e63` to `origin/develop`. No GCP mutation in that commit | Runtime identity IAM still required |
| 2026-08-17 | `develop` / `9525e63` | A03 | Created `taskio-api-runtime` on `taskio-v2`; custom Auth role `taskioApiRuntimeFirebaseAuth` with three user permissions; granted `roles/datastore.user` + custom role. No keys, no Logs Writer, no Token Creator, no extra actAs binding (owner already has actAs). No Secret Manager, Cloud Run, Hosting, Functions, or staging change. | SA enabled; 0 user-managed keys; role describe exact 3 perms; project bindings only those two roles; Compute/Functions unchanged; Cloud Run 404; Secret Manager disabled | IAM on `taskio-v2` only. Tracker uncommitted. Nothing pushed after this IAM batch | Next approval: Secret Manager named secrets + resource-level accessor for `taskio-api-runtime`. Cloud Run deploy later |
| 2026-08-17 | `develop` / `919aadc` | A03 | Tracker-only record of runtime identity IAM. | Docs review | Pushed `919aadc` to `origin/develop`. No GCP mutation in that commit | Secret Manager still required |
| 2026-08-17 | `develop` / `919aadc` | A03 | Enabled Secret Manager on `taskio-v2`. Created `ALERT_WEBHOOK_URL` (no version) and `OTP_SALT` (version 1 enabled, new production random salt). Per-secret `secretAccessor` for `taskio-api-runtime` only. No Gemini/ABN/Stripe secrets. No Cloud Run/Hosting/Functions/staging change. | API ENABLED; secrets list two names; OTP v1 enabled; ALERT versions empty; IAM members runtime SA only; 0 user keys; Cloud Run 404 | Secret Manager API + two secrets + OTP version + resource IAM. Tracker/release-plan uncommitted. Nothing pushed after this batch | Remaining boot blocker at that time: production `ALERT_WEBHOOK_URL` version. Superseded by the following repository-only optional-webhook change. |
| 2026-08-17 | `develop` / `919aadc` | A03 | Repository-only: production `validateEnv()` and `/health/ready` no longer hard-require `ALERT_WEBHOOK_URL`. `OTP_SALT` remains mandatory. `sendCriticalAlert()` still no-ops when unset. Startup warns without logging a URL. First Cloud Run `--set-secrets` documented as `OTP_SALT` only. Empty Secret Manager webhook resource left untouched as optional/future. No GCP mutation. | Focused 3 suites / 5 tests pass; full backend 47 suites / 426 tests pass; `node --check` on server/app/validateEnv/health/alerts; `git diff --check` clean | Docs + backend code/tests uncommitted. Nothing committed, pushed, or deployed | Owner approval to commit/push this batch, then a separate rebuild of `:preflight`, then a later Cloud Run `--no-traffic` approval |
| 2026-08-17 | `develop` / `f5c1783` | A03 | Committed and pushed optional `ALERT_WEBHOOK_URL` start/ready change. GitHub CI run `32009423581` all 6 jobs success, including `api-image`. | CI green on `f5c1783` | Pushed `f5c1783` to `origin/develop`. No GCP mutation in that commit | Rebuild production image from `f5c1783`; do not deploy old digest `sha256:f76b413db39f42825e9a7c6d0ea3c92d880d293e469d958e540691c2b57a213c` |
| 2026-08-17 | `develop` / `f5c1783` | A03 | Owner-reported Cloud Build `fe608395-6108-4606-96b8-a46e7a28a58c` SUCCESS from `f5c1783`. New digest `sha256:7e4ad2571ac732d16ed00db1fb8593741d0e649e2aaa9abeadd49c29d6d39f9a`. `preflight` tag not moved. Cloud Run not deployed. Build reported 24 npm audit findings. | Local `npm --prefix backend audit --omit=dev` reproduces 1 low / 12 moderate / 8 high / 3 critical; `outdated` and `audit fix --omit=dev --dry-run` inspected; no lockfile change | Tracker-only. No GCP access, tag move, commit, or push in this batch | Do not deploy Cloud Run. Next: non-breaking backend production dependency bumps, then a new image build |
| 2026-08-17 | `develop` / `f5c1783` | A03 | Repository-only direct production bumps: axios 1.19.0, express 5.2.1, express-rate-limit 8.6.2, firebase-admin 13.10.0. No overrides, no 14.x, no audit fix --force. Production audit now 16 (1 low / 9 moderate / 4 high / 2 critical). Remaining HIGH/CRITICAL are transitive. | `npm --prefix backend audit --omit=dev`; backend 47 suites / 426 tests; `node --check`; `git diff --check`; lockfile versions of protobufjs/fxp/websocket-driver/form-data/ip-address/path-to-regexp/grpc-js/jws/node-forge | package.json + lockfile + tracker uncommitted. No GCP, no commit/push | Do not commit yet. Next: separately approved scoped overrides for remaining HIGH/CRITICAL, then a new image. Do not deploy `7e4ad257…` or `f76b413…` |
| 2026-08-17 | `develop` / `f5c1783` | A03 | Added scoped npm overrides and rematerialized lockfile. Production `npm audit --omit=dev` is 0 high / 0 critical (1 low, 8 moderate uuid tree). `npm ls` confirms patched protobufjs 7.6.5, websocket-driver 0.7.5, grpc-js 1.13.5, jws 4.0.1 and 3.2.3, form-data 2.5.6 and axios 4.0.6, path-to-regexp 8.4.2. Backend tests 47/426 pass. | `npm install --package-lock-only`; `npm ci`; `npm ls`; audit omit=dev; full backend tests; `node --check`; `git diff --check` | package.json + lockfile + tracker uncommitted. No GCP, no commit/push, no image rebuild | Owner approval to commit/push this three-file batch, then a separate new Cloud Build. Do not deploy `7e4ad257…` or `f76b413…` |
| 2026-08-17 | `develop` / `090f1b5` | A03 | Committed production dependency bumps and scoped overrides. Production audit remains 0 high / 0 critical. Accepted residuals: low `@tootallnate/once@2.0.0` (advisory fixed in 3.0.1; crossing 2.x is out of scope; no override) and moderate `uuid@9.0.1` pending a separately planned Firebase/Google upgrade. | `npm audit --omit=dev`; backend 47 suites / 426 tests; `git diff --check`; GitHub Actions `32018489805` all 6 jobs success | Pushed `090f1b5` to `origin/develop`. No Cloud Run in that commit | Cloud Build of digest `e2750785…` then private Cloud Run |
| 2026-08-17 | `develop` / `090f1b5` | A03 | Private Cloud Run `taskio-api` on `taskio-v2` / `australia-southeast1`. Revision `taskio-api-preflight-090f1b5`. Digest `sha256:e275078558a06d9a54089a69f74c213abd2a1cac06dc956407d9a41c5fd37143`. Runtime SA `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com`. Secret `OTP_SALT:1` only. IAM-private; ingress all; traffic 100% as first revision. Unauthenticated live 403. Authenticated live/ready 200 (Firestore healthy, Stripe disabled). CORS allows `https://taskio.com.au`, rejects `https://evil.example`. Hosting remains A50 maintenance. Four Functions ACTIVE unchanged. | `gcloud run services/revisions describe`; empty IAM policy; authenticated CORS curls; logging read; functions list; Hosting GET `taskio-v2.web.app` | Cloud Run service/revision exist. This tracker update uncommitted. No public invocation, Hosting, DNS, Functions, or secret-value change in this verification | Separate approval: `allUsers` `roles/run.invoker` only. Do not restore Hosting or DNS |
| 2026-08-17 | `develop` / `090f1b5` | A03 | Read-only application-auth boundary while Cloud Run IAM remains on. `X-Serverless-Authorization` used so Express sees Firebase `Authorization`. Protected GETs (`/api/me`, `/api/admin/bootstrap`, `/api/tradie/profile`) return Express 401 without app token; invalid bearer returns Express 401 Invalid token. Bare request is Cloud Run 403. Route audit: mutating user-data routes have requireAuth plus role/admin/super-admin as expected. No 5xx in post-test logs. IAM/traffic/Hosting unchanged. | Code audit of `backend/src/routes/**` + `middleware/auth.js`; private curls; logging read freshness 15m | Tracker-only. No IAM, Cloud Run, traffic, Hosting, DNS, or staging change | Public invocation still a separate approval. Do not restore Hosting or DNS |
| 2026-08-17 | `develop` / `090f1b5` | A03 | Owner enabled public Cloud Run invocation with `--no-invoker-iam-check`. Revision/digest/SA/`OTP_SALT:1` unchanged. Unauthenticated `/health/live` Express 200. Unauthenticated `/api/me` Express 401 `No token provided`. Invalid Firebase bearer Express 401 `Invalid token`. No unexpected 5xx. Hosting remains A50 maintenance. DNS/custom domain and frontend restore outstanding. A03 not completed. | `gcloud run services describe` (`invoker-iam-disabled: true`); public curls to service URL; logging read; Hosting GET | Tracker checkpoint. This verification did not change Cloud Run, traffic, secrets, Hosting, DNS, Functions, or staging | Next: DNS/custom domain and/or Hosting frontend restore, separately approved |

## Required final report template

- **Outcome:** overall completion state and release recommendation
- **Completed and verified IDs:** list with one-line evidence each
- **Deferred IDs:** decision, owner, and reason
- **Blocked IDs:** exact blocker and the one next action Saeed must take
- **Changed files and commits:** grouped by tracker item
- **Verification:** commands and pass/fail totals
- **Staging/cloud activity:** project, service, change, verification, rollback
- **Production activity:** must state `none` unless separately authorized
- **Security and secrets:** confirm no secret material was committed or printed
- **Working tree / remote state:** branch, HEAD, origin parity, clean/dirty status
- **Recommended next step:** one prioritized action
