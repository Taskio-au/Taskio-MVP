# Taskio production release plan

> Status: **NOT EXECUTED**. This repository-only plan targets `taskio-v2` after a separate, exact owner approval. It must never be used for `taskio-v2-staging`, which is frozen and excluded.

## Prepared repository artifacts

- `backend/Dockerfile` and `.dockerignore`: Node 24 Cloud Run container, non-root runtime, `/health/live` container health check.
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
6. The two uninspected local service-account keys have been rotated and removed manually (procedure below).
7. Required production values have been provisioned without placing values in Git or shell history.

### Secret-name inventory (names only)

Backend required for a production start:

- `ALERT_WEBHOOK_URL`
- `OTP_SALT`
- Application Default Credentials through the Cloud Run service identity (no JSON key)

Backend conditional integrations:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` only when `STRIPE_ENABLED=true`
- `GEMINI_API_KEY`
- `ABN_LOOKUP_GUID`

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

First build with no traffic, using an approved service identity and secret mappings. Non-secret environment values must include:

- `NODE_ENV=production`
- `PORT=8080`
- `TRUST_PROXY=true`
- `CORS_ORIGINS=https://taskio.com.au`
- `FRONTEND_URL=https://taskio.com.au`
- `STRIPE_ENABLED=false` until the separate Stripe launch gate
- `GEMINI_API_VERSION=v1`
- `GEMINI_MODEL=gemini-3.6-flash`

```powershell
gcloud run deploy taskio-api --source backend --project taskio-v2 --region australia-southeast1 --platform managed --service-account <APPROVED_RUNTIME_SERVICE_ACCOUNT> --no-traffic --set-env-vars NODE_ENV=production,PORT=8080,TRUST_PROXY=true,CORS_ORIGINS=https://taskio.com.au,FRONTEND_URL=https://taskio.com.au,STRIPE_ENABLED=false,GEMINI_API_VERSION=v1,GEMINI_MODEL=gemini-3.6-flash --set-secrets ALERT_WEBHOOK_URL=ALERT_WEBHOOK_URL:latest,OTP_SALT=OTP_SALT:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ABN_LOOKUP_GUID=ABN_LOOKUP_GUID:latest
```

Verify the no-traffic revision directly using an authenticated revision tag or approved test path. Confirm `/health/live` and `/health/ready`, CORS allow/deny behaviour, structured request IDs, and no secret material in logs. Then, under a separate traffic approval:

```powershell
gcloud run services update-traffic taskio-api --project taskio-v2 --region australia-southeast1 --to-latest
```

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

- Cloud Run: send 100% traffic to the recorded prior revision:

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

The key files were deliberately not read, moved, changed, or deleted during repository work.

1. In Google Cloud IAM → Service Accounts for the project named inside each key (determine this manually without sharing the JSON), identify the matching key ID.
2. Confirm the intended workload runs with an approved managed service identity or ADC and does not depend on either JSON file.
3. Disable one old key, verify the workload, then delete that key. Repeat for the other key; never rotate both simultaneously without verification.
4. Securely remove the two local files only after confirming no process uses them.
5. Search Git history by filename and secret-scanning tooling without printing key contents; escalate if any key was ever committed.
6. Record key IDs, operator, timestamps, workload verification, and deletion confirmation in the private operations log—not this repository.

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
