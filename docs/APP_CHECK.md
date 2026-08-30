# Taskio App Check (P05)

Firebase App Check for the private Melbourne MVP. This document is GREEN application/readiness only. Staging provider registration and enforcement are a later AMBER package. Production enforcement is a later RED decision.

## Classification

| Gate | State |
|---|---|
| P05 App Check architecture | DECIDED |
| P05 App Check application code | CODE COMPLETE |
| P05 App Check local / CI testing | **PASS** (CI [`33308449769`](https://github.com/Taskio-au/Taskio-MVP/actions/runs/33308449769)) |
| P05 staging provider config | **NOT CONFIGURED** |
| P05 staging token generation | **NOT VERIFIED** |
| P05 Firestore enforcement | **NOT ENABLED** |
| P05 Storage enforcement | **NOT ENABLED** |
| P05 production enforcement | **NOT ENABLED** |
| P05 overall | **PARTIAL / READY FOR CONTROLLED STAGING ACTIVATION** |

Do not mark P05 fully PASS until controlled staging enforcement has been validated.

## Architecture decision

**Maximum practical security with minimum MVP complexity.**

Browser clients talk to:

| Product | Browser use | App Check |
|---|---|---|
| Firebase Auth | Sign-in | Not an App Check enforcement product in this MVP |
| Cloud Firestore | Direct client reads/writes (jobs, chat, notifications, profiles) | **Yes — primary.** Complements security rules; does not replace them |
| Cloud Storage | Photo / attachment uploads | **Yes — with Firestore.** Same client SDK token |
| Cloud Functions | **None from the browser.** All exports are Firestore triggers (chat flagging, notifications, email) | **No.** Event-driven Admin SDK; client App Check is irrelevant |
| Realtime Database | Unused | **No** |
| Cloud Run API | Authenticated `fetch`/`axios` with Firebase ID tokens | **Not for MVP.** See below |

### Cloud Run API — not worth it for MVP

Existing controls: Firebase ID token auth on protected routes, role checks, CORS, Helmet, rate limits, invite-only signup, Firestore rules for client data.

App Check on Cloud Run would require attaching `X-Firebase-AppCheck` to every API call, extra middleware, and would break the operator dual-header staging harness unless special-cased (a bypass we will not add). Stolen ID tokens issued by a real Taskio browser session would still present valid App Check tokens. Health endpoints (`/health/live`, `/health/ready`) must stay reachable without App Check.

**Recommendation: C — not worth it for MVP.** Nice-to-have after launch (B) if scripted API abuse appears. **Not required before launch (not A).**

Do **not** implement API App Check middleware in this phase.

### Unauthenticated API endpoints

| Endpoint | App Check |
|---|---|
| `/health`, `/health/live`, `/health/ready` | Must remain without App Check |
| `POST /api/auth/resolve-email` | Auth bootstrap; rate-limited. Do not require App Check for MVP |
| `POST /api/generate-description` | Unauthenticated + AI limiter; UI hidden when Gemini is fallback. **Not a launch blocker.** Later: prefer require-auth over App Check |
| `POST /api/quote-assistant` | Already `requireAuth` + tradie role + limiter |
| `GET /api/tradies/:tradieUid/reviews` | Public expert reviews; rate-limited. Do not require App Check for MVP |
| `GET /api/suburb-search` | Unauthenticated catalog helper; not App Check for MVP |
| `GET /api/me/deletion/confirm` | Email-link confirmation; do not require App Check |
| Stripe webhooks | Server-to-server HMAC; never App Check |

## Provider

Keep the existing env names:

- `REACT_APP_APPCHECK_ENABLED` (safe default unset/false)
- `REACT_APP_APPCHECK_SITE_KEY` (public site key only)
- `REACT_APP_APPCHECK_DEBUG_TOKEN` (local/dev only; forbidden in `NODE_ENV=production` and staging Hosting builds)
- `REACT_APP_APPCHECK_PROVIDER` optional: `recaptcha-v3` (default) or `recaptcha-enterprise`

**GREEN default constructor:** reCAPTCHA v3 (`ReCaptchaV3Provider`), matching the existing A14 scaffold.

**AMBER staging preference:** reCAPTCHA Enterprise if the Firebase/GCP project can register an Enterprise site key without disproportionate setup. If Enterprise is not ready, stay on v3. Do not create keys in GREEN.

## Local / debug

- Debug tokens only when App Check is enabled **and** `NODE_ENV` is not `production`.
- Staging Hosting wrapper rejects `REACT_APP_APPCHECK_DEBUG_TOKEN` and blanks it in the child env.
- Browser-smoke/e2e keep `REACT_APP_APPCHECK_ENABLED=false` until enforcement activation.
- Never commit debug tokens. Do not print them in normal logs.

## Observability (future enforcement)

When Firebase Console monitor/enforcement is on, use Firebase App Check metrics. Application logs must not include tokens, debug secrets, or device identifiers. No extra metrics platform for GREEN.

## Rollback (future AMBER)

1. Set `REACT_APP_APPCHECK_ENABLED=false` and rebuild/deploy staging Hosting.
2. Turn off Firebase Console App Check enforcement for Firestore/Storage.
3. Production remains untouched.

## Staging activation AMBER package (do not execute)

1. **Products:** Firestore + Storage App Check only. Not Functions. Not Cloud Run.
2. **Provider:** reCAPTCHA Enterprise if a site key can be registered cleanly; otherwise reCAPTCHA v3.
3. **Public site key** in staging frontend env (`REACT_APP_APPCHECK_SITE_KEY`). Never a secret.
4. **Firebase Console:** register the staging web app for App Check; start **monitor / unenforced**.
5. **Staging frontend:** `REACT_APP_APPCHECK_ENABLED=true`, no debug token, `TASKIO_APP` URL unchanged. Rebuild Hosting only.
6. **Deploy scope:** staging Hosting SPA only. No Cloud Run, Functions, Auth, IAM, App Check production, Firestore rules.
7. **Monitor period:** confirm valid tokens from invite-only synthetic browsers; watch `app_check_missing` / invalid in Firebase metrics.
8. **Enforcement:** enable Firestore first, retest login/job/chat/upload; then Storage if needed.
9. **Positive tests:** synthetic Homeowner/Expert hosted login, job read, chat, profile photo upload.
10. **Rejection tests:** request without App Check should fail only after enforcement; health/API ID-token routes still work.
11. **Rollback:** disable flag + Hosting rebuild; disable Console enforcement.
12. **Production:** untouched.

Do not execute this package until approved.
