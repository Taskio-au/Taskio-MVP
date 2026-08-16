# Taskio Codex Execution Tracker

> Repository handover generated from `Taskio_Development_Tracker_Updated.xlsx`. This Markdown file is the working tracker for Codex. The spreadsheet remains the historical source snapshot.

## Current checkpoint (supersedes the spreadsheet snapshot)

> Owner authorization revised 2026-08-16: `taskio-v2-staging` is frozen and excluded. This run is repository-only. Neither Firebase project, Stripe, nor any other live service may be accessed or modified. Production deployment remains a separate approval boundary.

- Repository: `Taskio-MVP`
- Working branch: `develop`
- Starting local/remote commit for this run: `e736581 fix(ci): restore frontend verification`
- Starting working tree: untracked owner-authored `docs/TASKIO_TRACKER.md`; otherwise clean
- GitHub Actions: all four jobs green (`security-rules`, `frontend`, `backend`, `functions`)
- Frontend: 53 suites / 392 tests passed; production build compiled successfully
- Backend: 38 suites / 391 tests passed
- Firebase rules: 16/16 emulator tests passed
- Historical staging actions below pre-date the revised authorization. Staging is now frozen and must not be accessed.
- Production project `taskio-v2`: pre-launch and contains no real users or real transactions; do not modify it without explicit permission
- Gemini repository configuration now targets stable `gemini-3.6-flash` over the existing REST `v1` integration; local mocks verify the request and no live Gemini call was made.

## 2026-08-16 repository-only execution ledger

This ledger records current evidence without erasing the historical baseline in each item. “Repository complete” does not imply a cloud deployment. Any source that eventually needs production deployment remains **PENDING FINAL DEPLOYMENT APPROVAL**.

| ID | Current status | Evidence / exact remaining requirement |
|---|---|---|
| A02 | COMPLETED | Firestore message creation requires a valid participant role and open, funded, unfrozen chat; demo-project rules suite passes. |
| A06 | COMPLETED | Production E2E bypass guard and tests added; CI explicitly builds with bypass disabled. |
| A09 | COMPLETED | Risk flags and counters are written by retry-safe server automation; duplicate emulator delivery is idempotent. |
| A12 | COMPLETED | Demo-only Firestore/Storage emulator suite passes 17/17, including privilege, chat, attachment, and profile-photo cases. |
| A13 | COMPLETED | Firebase web configuration remains environment-driven and project-ID guarded; focused tests pass. |
| A16 | BLOCKED | Rules now limit profile-photo reads to owner/admin. Existing tokenized download URLs require a repository migration plus later token rotation and rules deployment before acceptance can be claimed. |
| A33 | COMPLETED | Storage rules use the same list/map invitation representations as Firestore and permit valid invited-expert chat attachments; emulator coverage passes. |
| A34 | COMPLETED | Registration responses map Firebase/internal failures to safe messages and request IDs; raw errors are logged structurally and regression-tested. |
| A40 | COMPLETED | Functions tests run under a demo Firestore emulator and are wired into CI with Node 24 and Java 21. |
| A51 | COMPLETED | Production API URL resolver rejects missing, local, HTTP, credentialed, and malformed endpoints; CI/build configuration and tests added. |
| A52 | COMPLETED | Every case variant of `completed` now normalises to `COMPLETED`; only explicit legacy paid values map to `PAID`; parity tests pass. |
| A53 | COMPLETED | Per owner decision, stale refresh is an authenticated claims-admin manual action; permissive cron-secret handling was removed. |
| A54 | COMPLETED | Backend test entry points no longer load developer `.env` files when `NODE_ENV=test`; focused suites pass without external calls. |
| A55 | COMPLETED | Backend and rules administrator checks trust Firebase custom claims only; mutable-profile escalation tests pass. |
| A56 | COMPLETED | Message automation uses deterministic transaction markers, exactly-once counters/notifications, retry rethrows, and duplicate-delivery emulator tests. |
| A57 | COMPLETED | Draft-to-submitted quote updates create the same deterministic homeowner notification as submitted-on-create; transition tests pass. |
| A58 | COMPLETED | Chat email HTML escapes all untrusted fields; hostile-markup tests pass and SMTP was not used. |
| A59 | BLOCKED | Scaffold export is removed from source and syntax checks pass. The already-deployed function remains unchanged until a separately approved production Functions deployment/deletion. |

The original spreadsheet was last reconciled around commit `88ab54a`. Therefore, statuses below are a baseline. Codex must inspect commits `5038a24`, `7d1d521`, `551fd77`, and `e736581`, the current files, and test evidence before changing any status. Never mark an item Done from a commit title alone.

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
- **Why / evidence:** The live Firebase Hosting bundle calls http://localhost:8000. No Express deployment configuration, cloud API hostname or deployment workflow exists in the repository, so every API-dependent production action is unavailable.
- **Working priority:** Critical (original: Critical)
- **Baseline status:** Needs Decision
- **Effort:** 1-2 days
- **Dependencies:** A01, A04, A49
- **Next action:** Verify Cloud Run, App Engine and Stripe Webhooks for any unrecorded manual deployment. If empty, formally select Cloud Run in australia-southeast1; configure production secrets and required environment variables; deploy to staging; then connect the frontend through A51.
- **Acceptance / verification:** Staging health/readiness returns 200 over HTTPS; CORS accepts only approved staging/production origins; the backend starts with NODE_ENV=production; job posting, quote, OTP/ABN, admin and Stripe test-webhook flows reach the deployed API.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** backend/; firebase.json; backend/package.json; createApiClient.js; deployed frontend bundle
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** firebase.json serves frontend/build and has only an SPA catch-all; it contains no Function or Cloud Run API rewrite. Environment templates still default REACT_APP_API_BASE_URL and FRONTEND_URL to localhost. Production also requires CORS_ORIGINS, TRUST_PROXY, ALERT_WEBHOOK_URL and OTP_SALT before the backend can start. No deployment occurred during A01.

### A04 — Remove and rotate local service-account keys

- **Source:** Cursor Audit
- **Phase:** 1 Secure
- **Area / feature:** Secrets — Firebase Admin credentials
- **Why / evidence:** Two service-account JSON files containing private keys reportedly exist locally. Git history was reported clean, but the keys provide full project control.
- **Working priority:** Critical (original: Critical)
- **Baseline status:** Ready
- **Effort:** 1-3 hours
- **Dependencies:** A01, A03
- **Next action:** Confirm which project/key is involved; rotate the key in Google Cloud IAM; use ADC or an external credential path; securely remove both local copies.
- **Acceptance / verification:** Old key ID is disabled; backend starts using ADC or approved environment configuration; no key files exist inside the repo.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** serviceAccountKey.json; backend/serviceAccountKey.json
- **Date added / last reviewed:** 2026-08-09 / —
- **Notes:** —

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
- **Why / evidence:** The live Firebase site exposes authentication and direct Firebase-backed screens while all Express-dependent actions fail. Existing rules findings mean the partial site should not remain publicly usable before launch.
- **Working priority:** Critical (original: New)
- **Baseline status:** Ready
- **Effort:** Under 1 hour
- **Dependencies:** A01
- **Next action:** Preserve the current release details, then deploy a maintenance-only page or otherwise restrict public access. Disable signup and all application entry points until security rules and backend connectivity are verified.
- **Acceptance / verification:** Both default Firebase domains and any custom domain show only the maintenance message; users cannot sign up, log in, post, quote or begin payment; rollback steps are documented.
- **Confidence:** Confirmed
- **Owner:** Saeed + Cursor
- **File / location:** Firebase Console > Hosting; firebase.json; maintenance build
- **Date added / last reviewed:** 2026-08-09 / 2026-08-09
- **Notes:** Immediate containment action; do not delete Firestore/Auth/Storage data.

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
