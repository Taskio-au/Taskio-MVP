# Taskio production release plan

> Status: **NOT EXECUTED**. This repository-only plan targets `taskio-v2` after a separate, exact owner approval. It must never be used for `taskio-v2-staging`, which is frozen and excluded.

## Prepared repository artifacts

- Root `Dockerfile`, `.dockerignore`, and `.gcloudignore`: Node 24 Cloud Run API image built from the **repository root** so `backend/` and repo-root `shared/` keep the runtime relative-import layout (`/app/backend/**` + `/app/shared/**`). Non-root `node` user. No Docker `HEALTHCHECK` (Cloud Run probes instead). Do **not** use `--source backend`.
- `firestore.indexes.json`: tracked index manifest. Current queries intentionally use single-field/document-ID ordering, so no composite index is declared.
- `firebase.json`: explicit Functions, Firestore rules/indexes, Storage rules, and Hosting sources.
- `firebase.maintenance.json` plus `maintenance/index.html`: Hosting-only pre-launch page with no-store/noindex headers.
- `.github/workflows/ci.yml`: repository verification only; it does not deploy.

## Release blockers and prerequisites

Do not run any command in this document until all of these are true:

1. Saeed gives a new approval naming `taskio-v2` and the exact resource batch.
2. The release commit is green in GitHub CI and local full verification.
3. An interactive operator verifies the active account, billing impact, IAM, Firebase project ID, and previous revision/release identifiers.
4. The canonical origin `https://taskio.com.au` and intended API origin are confirmed operational.
5. Firebase custom claims for `admin` and `super_admin` are assigned by an authorised operator; Firestore profile fields are not used as authority.
6. A04 is complete for production: the user-managed Admin SDK key was deleted and local production JSON copies were removed. Do not recreate a JSON key for Cloud Run; use ADC on `taskio-api-runtime`.
7. Required production values have been provisioned without placing values in Git or shell history.
8. Cloud Run source builds have an approved Cloud Build identity, Artifact Registry write path, and enabled APIs (`run.googleapis.com` already used by Functions v2; `cloudbuild.googleapis.com` and `artifactregistry.googleapis.com` are additional source-deploy prerequisites and must not be enabled as an incidental side effect). Do not create Artifact Registry repositories until that batch is approved.
9. Dedicated runtime identity `taskio-api-runtime@taskio-v2.iam.gserviceaccount.com` exists with the approved datastore/auth/secret-accessor roles. Do not use the default Compute account or `firebase-adminsdk-fbsvc` as the API identity.

### Secret-name inventory (names only)

Backend required for a production start:

- `OTP_SALT` (Secret Manager resource + enabled version 1 on `taskio-v2`)
- Application Default Credentials through the Cloud Run service identity (no JSON key)

Optional / future observability (not a production hard-start requirement):

- `ALERT_WEBHOOK_URL` (Secret Manager resource exists on `taskio-v2`; **no version**. Keep the empty resource. Do **not** mount it in `--set-secrets` until an approved production webhook version exists. Do not copy a staging value. `sendCriticalAlert()` no-ops when unset; `/health/ready` must not fail solely because it is absent.)

Do **not** mount secret names that have no resource or no enabled version. The first Cloud Run `--set-secrets` list must be only `OTP_SALT`. Do not mount `ALERT_WEBHOOK_URL`, `GEMINI_API_KEY`, or `ABN_LOOKUP_GUID` until those resources have an approved enabled version.

Backend conditional integrations (not required to boot; not created yet):

- `STRIPE_SECRET_KEY` on the main API only when `STRIPE_ENABLED=true`
- `STRIPE_WEBHOOK_SECRET` on the webhook-only runtime only when `STRIPE_ENABLED=true` (not required on the main API)
- `GEMINI_API_KEY` (AI description tidy / quote-message assist; routes fall back without it)
- `ABN_LOOKUP_GUID` (official ABR ABN verify; `/api/me/abn/verify` returns 501 without it)

Functions email integration, currently disabled:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CHAT_EMAIL_FROM`, `TASKIO_APP_URL`

Frontend build-time values:

- `REACT_APP_FIREBASE_EXPECTED_PROJECT_ID`
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_STORAGE_BUCKET`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
- `REACT_APP_FIREBASE_APP_ID`
- `REACT_APP_API_BASE_URL`
- `REACT_APP_STRIPE_PUBLISHABLE_KEY` only when payments are enabled
- `REACT_APP_APPCHECK_SITE_KEY` only after App Check registration is approved

`CRON_SECRET` is intentionally absent. `REACT_APP_E2E_AUTH_BYPASS` must be `false`. `REACT_APP_APPCHECK_DEBUG_TOKEN`, `TASKIO_SHOW_DEV_OTP`, `FOUNDING_EXPERT_TEST_MODE`, and `ENABLE_SET_ADMIN_ENDPOINT` must be absent/disabled.

## Proposed production order — NOT EXECUTED

All commands are examples for an approved operator. Run them from a clean release checkout and retain command output without secret values.

### 1. Record rollback anchors

```powershell
git rev-parse HEAD
git status --short
firebase use
gcloud config get-value project
gcloud run revisions list --service taskio-api --project taskio-v2 --region australia-southeast1
```

In the Firebase console, record the current Hosting release/version and current Firestore/Storage rules before any write. Do not continue if the selected account or project is ambiguous.

### 2. Verify locally

```powershell
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix functions ci
npm run test:rules
npm run test:functions
npm --prefix backend test
npm --prefix frontend run verify
npm --prefix frontend run build
npm --prefix frontend run e2e
git diff --check
```

Use only demo Firebase project IDs/emulators during these checks.

### 3. Deploy the Express API to Cloud Run

Build from the **repository root**, not `backend/`. Runtime files import repo-root `shared/` as `../../../shared/...` from `backend/src/{routes,services,constants,utils}` and `../../../../shared/...` from `backend/src/routes/admin`. The image layout is `/app/backend/**` plus `/app/shared/**`, with `WORKDIR /app/backend`.

Local image build (same context Cloud Run `--source .` will use):

```powershell
docker build -t taskio-api:preflight .
```

An actual container build is **still outstanding** in this workspace: Docker is not installed locally, so the image has not been built or inspected. That build must succeed (locally or in Cloud Build) before Cloud Run deployment approval. Do not treat the Dockerfile as a verified image.

Do not set `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`. Cloud Run must use ADC via `initializeApp()` when `K_SERVICE` is present.

Keep the following as **separate approvals**. Do not collapse them into one command. A new Cloud Run service does not inherently have to receive public production traffic: deploy the first revision with `--no-traffic` and a `preflight` tag, keep unauthenticated invocation off, and only later enable traffic and public access.

If the CLI refuses `--no-traffic` on first create, **stop and report**. Do not send 100% traffic as a workaround without a new owner approval.

Non-secret environment values must include:

- `NODE_ENV=production`
- `PORT=8080`
- `TRUST_PROXY=true`
- `CORS_ORIGINS=https://taskio.com.au`
- `FRONTEND_URL=https://taskio.com.au`
- `STRIPE_ENABLED=false` until the separate Stripe launch gate
- `GEMINI_API_VERSION=v1`
- `GEMINI_MODEL=gemini-3.6-flash`

#### 3a. Build and deploy a no-traffic revision

Mount only secrets that exist with an enabled version. The first Cloud Run revision must mount **only** `OTP_SALT`. Do **not** include `ALERT_WEBHOOK_URL` in `--set-secrets` until an approved production webhook version exists (the Secret Manager resource is currently empty; Cloud Run cannot mount `:latest` on a secret with no version). Do **not** include `GEMINI_API_KEY` or `ABN_LOOKUP_GUID` until those resources are created.

The existing Artifact Registry image `taskio-api:preflight` (`sha256:f76b413db39f42825e9a7c6d0ea3c92d880d293e469d958e540691c2b57a213c`) was built before `ALERT_WEBHOOK_URL` became optional. Do **not** deploy that digest with OTP_SALT-only mounts. Rebuild `:preflight` from the commit that makes the webhook optional, then prefer `--image` for the no-traffic deploy.

```powershell
gcloud run deploy taskio-api --image australia-southeast1-docker.pkg.dev/taskio-v2/taskio-api/taskio-api:preflight --project taskio-v2 --region australia-southeast1 --platform managed --service-account taskio-api-runtime@taskio-v2.iam.gserviceaccount.com --port 8080 --no-allow-unauthenticated --no-traffic --tag preflight --startup-probe httpGetPath=/health/live,periodSeconds=10,timeoutSeconds=3,failureThreshold=3 --liveness-probe httpGetPath=/health/live,periodSeconds=30,timeoutSeconds=3,failureThreshold=3 --set-env-vars NODE_ENV=production,PORT=8080,TRUST_PROXY=true,CORS_ORIGINS=https://taskio.com.au,FRONTEND_URL=https://taskio.com.au,STRIPE_ENABLED=false,GEMINI_API_VERSION=v1,GEMINI_MODEL=gemini-3.6-flash --set-secrets OTP_SALT=OTP_SALT:latest
```

#### 3b. Private / tagged preflight verification

Call the `preflight` tag URL with an identity token. The service remains `--no-allow-unauthenticated`. Confirm `/health/live` and `/health/ready`, CORS allow/deny behaviour, structured request IDs, ADC/Firestore without a JSON key, and no secret material in logs.

#### 3c. Public invocation approval

Only after 3b, a separate approval may grant public invocation (`--allow-unauthenticated` and/or ingress changes). Revision existence is not public access.

#### 3d. Production traffic enablement

```powershell
gcloud run services update-traffic taskio-api --project taskio-v2 --region australia-southeast1 --to-latest
```

#### 3e. Frontend connection

Connecting Hosting, CORS, and `REACT_APP_API_BASE_URL` (A51) remains a later approval. Do not restore the public SPA or change DNS as part of the API revision deploy.

### 4. Deploy rules and indexes

```powershell
firebase deploy --project taskio-v2 --only firestore,storage
```

Verify participant/non-participant chat writes, invitation attachments, claims-only admin access, profile-photo restrictions, and representative admin queries. Existing tokenized profile-photo URLs still require A16 migration/rotation before this gate can be accepted.

### 5. Deploy Functions

SMTP remains disabled unless separately configured. Review the CLI deletion prompt for the removed `helloTaskio` export and stop unless deletion is explicitly authorised.

```powershell
firebase deploy --project taskio-v2 --only functions
```

Verify the four intended exports, deterministic notification IDs, duplicate delivery, and draft-to-submitted notification behaviour. Confirm `helloTaskio` is absent only if its deletion was separately approved.

### 6. Build and deploy the application Hosting release

Populate the approved build environment through the release system, never a committed file. Then:

```powershell
npm --prefix frontend run build
firebase deploy --project taskio-v2 --only hosting
```

Verify `https://taskio.com.au`, `https://taskio-v2.web.app`, canonical metadata, asset cache behaviour, navigation refreshes, the HTTPS API URL, auth, posting, quoting, admin access, and that the E2E bypass cannot activate.

### 7. Enable integrations only through separate launch gates

Stripe, App Check enforcement, SMTP, DNS/domain changes, and any live Gemini smoke test are excluded from the repository release. Each needs its own credentials, monitoring, rollback, and owner approval.

## Rollback — NOT EXECUTED

- Cloud Run: if a prior healthy revision exists, send 100% traffic to that recorded revision. If the first preflight revision never received production traffic, delete or leave it untagged rather than “rolling back” onto it:

  ```powershell
  gcloud run services update-traffic taskio-api --project taskio-v2 --region australia-southeast1 --to-revisions <PREVIOUS_REVISION>=100
  ```

- Functions/rules/indexes: check out the recorded release commit in a separate clean worktree and redeploy only the affected resource. Firestore indexes may continue building after a rollback; inspect them before any deletion.
- Hosting: use Firebase Console → Hosting → Release history → the recorded previous release → **Roll back**. Firebase documents this as creating a new release that points to the previous version.
- Application code: revert through a new commit; never force-push or rewrite release history.

## Maintenance-only Hosting artifact — NOT DEPLOYED

Preflight locally without contacting Firebase:

```powershell
npx serve maintenance
```

After exact Hosting-only approval, verify `firebase.maintenance.json` contains no rewrites to backend services, record the current live Hosting release, then run:

```powershell
firebase deploy --project taskio-v2 --only hosting --config firebase.maintenance.json
```

Public verification must check the canonical domain and both Firebase Hosting domains for the maintenance title, HTTP 200, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, no API calls, and no missing assets. Roll back from Firebase Console Release history to the recorded prior version, then verify all three domains again.

## Manual service-account key rotation (A04)

A04 is complete for `taskio-v2`. Do not recreate a user-managed JSON key for the API. Cloud Run must use ADC on the approved runtime service account. Staging key handling remains outside this production plan.

## Manual local-runtime switch back to `taskio-v2`

Do not perform this while a development server is running, and do not copy values into chat or documentation.

1. Stop frontend, backend, emulator, and test processes.
2. Confirm the intended ignored filenames are exactly `frontend/.env.local` (or the documented CRA variant) and `backend/.env`; rename incorrectly named files manually only after reviewing their purpose. Do not use `frontend/env.staging.example`.
3. Compare variable **names only** against `frontend/env.example` and `backend/env.example`. Ensure each name appears once; remove duplicate declarations manually without displaying values.
4. Frontend shape checks: expected/project IDs are both `taskio-v2`; auth domain ends in `taskio-v2.firebaseapp.com`; Storage bucket is one documented `taskio-v2` bucket form; API and frontend origins are HTTPS, contain no credentials, have no surrounding quotes/whitespace, and have no trailing path unless intentionally supported.
5. Remove all staging project identifiers. Keep `REACT_APP_E2E_AUTH_BYPASS=false`, App Check disabled until registration approval, and Storage emulator flags absent/false for a real-project run.
6. Backend shape checks: `NODE_ENV` matches the intended local mode; `FRONTEND_URL` and `CORS_ORIGINS` use the canonical origin; `TRUST_PROXY` is appropriate to the runtime; `STRIPE_ENABLED=false`; test/debug/admin flags are absent/false. Do not create `CRON_SECRET`.
7. Check for malformed values: duplicated protocol prefixes, commas inside a single-origin value, JSON pasted into scalar fields, quote characters retained as data, placeholder text, embedded newlines, and values in the wrong file.
8. Restart the backend first, then the frontend, because CRA reads `REACT_APP_*` only at process start. Clear only build caches—not user data—if the old bundle persists.
9. Verify the UI’s project-ID guard and API URL guard before signing in. Stop immediately if either reports staging or localhost.

## References

- Firebase partial deploy syntax: <https://firebase.google.com/docs/cli>
- Firebase Hosting release rollback: <https://firebase.google.com/docs/hosting/manage-hosting-resources>
- Cloud Run revision rollback: <https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration>
