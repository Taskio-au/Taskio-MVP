# Taskio controlled launch readiness

Completion of this document means:

**Taskio is ready for a controlled real-world production launch with real users and real money.**

This is the product-launch overlay on top of the existing P01–P06 technical gates. It does **not** replace those gates or their evidence. Adding these gates does **not** authorise production mutation.

Companion records:

- Current statuses: `docs/TASKIO_STATUS.md`
- Execution evidence: `docs/TASKIO_TRACKER.md`
- Production command plan (NOT EXECUTED): `docs/TASKIO_RELEASE_PLAN.md`
- P06 owner pack (not PASS): `docs/P06_OWNER_DECISIONS.md`
- P06 solicitor brief (not PASS): `docs/P06_SOLICITOR_BRIEF.md`

## Approval model (unchanged)

| Class | Allowed | Not allowed |
|---|---|---|
| **GREEN** | Repo, docs, code, tests, local commits | Push, staging mutation, production |
| **AMBER** | Push, staging mutation, Stripe TEST, staging external resources | Production deploy, live Stripe, real charges/payouts |
| **RED** | Named production deploy, production App Check, live Stripe, real charges/payouts, production IAM/secrets, DNS/public launch | Incidental production work inside another task |

P07–P11 inherit this model. Defining a gate is GREEN. Executing its production work is RED unless the owner names an exact `taskio-v2` batch.

## Full launch-ready definition

**TASKIO FULL LAUNCH READY** is true only when all of the following are **PASS**:

| Gate | Required result |
|---|---|
| P01 | Connected-account bank payout **PASS** |
| P02 | Pre-release full refund **PASS** (already **COMPLETE** on staging TEST) |
| P03 | Transactional email **production PASS** |
| P04 | Analytics **production PASS** |
| P05 | App Check **production PASS** (Firestore + Storage enforcement proven in production; Auth remains a separate decision) |
| P06 | Legal/privacy review **PASS** |
| P07 | Production security and configuration **PASS** |
| P08 | Production operations **PASS** |
| P09 | Approved legal/trust implementation **PASS** |
| P10 | Production acceptance **PASS** |

**P11** is the controlled launch execution and validation gate. It **cannot** start until **TASKIO FULL LAUNCH READY** is true.

### Dependency chain

```
P02 PASS (already)
P01 PASS (already) ────────────────────┐
P03 staging PASS → P03 production PASS ┤
P04 staging PASS → P04 production PASS ┤
P05 staging PASS → P05 production PASS ┤
P06 PASS → P09 PASS ───────────────────┼→ P07 + P08 + P10 → FULL LAUNCH READY → P11
                                       │
P07 also consumes P03/P04/P05 production proof
```

- P01 TEST bank payout is **PASS / COMPLETE** and is no longer a current launch blocker. Production live money-loop re-proof remains inside P10.
- P06 is the **review/approval** gate. P09 **implements** P06 decisions. P09 must not invent legal conclusions.
- P03/P04/P05 staging PASS does **not** satisfy production PASS.
- P10 is the last technical/operational acceptance gate and requires live production proof.
- P11 is first-cohort launch, not a substitute for P10.

## Mandatory before controlled launch vs post-launch

**Mandatory before P11**

- P01 bank payout proof (COMPLETE on Stripe TEST; production re-proof inside P10)
- P02 refund path (already complete on staging TEST; production refund proof lives in P10)
- P03 production email
- P04 production analytics
- P05 production App Check
- P06 legal/privacy review
- P07 production security/config
- P08 operations readiness
- P09 implemented approved policies
- P10 production acceptance of the money loop and critical failures

**Explicitly out of launch-critical scope** unless the owner later requires them:

- native mobile apps
- public Expert signup
- advanced matching AI
- advanced analytics dashboards
- subscriptions
- dynamic pricing
- multi-city expansion
- sophisticated automated disputes
- major variation workflow expansion

Existing nice-to-have IDs **N01–N03** stay post-launch / optional.

## Current launch-readiness summary (12 September 2026)

Technical staging readiness is advanced. Full production launch is **not** ready.

| Gate | Current state | Blocks P11? |
|---|---|---|
| P01 | **PASS / COMPLETE** (TEST bank payout) | No |
| P02 | **COMPLETE** (staging TEST refund) | No (production refund re-proof is inside P10) |
| P03 | **STAGING PASS / PRODUCTION PENDING** | Yes, until production PASS |
| P04 | **STAGING PASS / PRODUCTION PENDING** | Yes, until production PASS |
| P05 | **STAGING PASS / PRODUCTION PENDING** | Yes, until production PASS |
| P06 | **OPEN** — owner facts **COMPLETE**; lean sole-trader controlled pilot as owner working plan, subject to AU solicitor confirmation; Pty Ltd **not** an automatic launch blocker; company conversion deferred unless advised before pilot; insurance = focused minimum-pilot review; remediation **NOT STARTED**. Not PASS. | **Yes — current pickup** |
| P07 | **NOT STARTED** | **Yes** |
| P08 | **NOT STARTED** | **Yes** |
| P09 | **NOT STARTED** (blocked on P06) | **Yes** |
| P10 | **NOT STARTED** | **Yes** |
| P11 | **BLOCKED** | — |

Do not start P11. Do not infer a launch percentage. Do not mark **TASKIO FULL LAUNCH READY**.

---

## P07 — Production security and configuration

| Field | Value |
|---|---|
| Objective | Prove production configuration is secure, isolated, correctly configured, and ready to serve real users. |
| Classification | Production validation. Execution is **RED**. |
| Current status | **NOT STARTED** |
| Dependencies | P03/P04/P05 production work; A04 / `docs/SECRETS_AND_KEY_ROTATION.md`; existing staging proofs. |
| Approval | GREEN: checklists and audits that do not mutate production. RED: any `taskio-v2` secret, IAM, Hosting, App Check, GA4, SMTP, or Stripe live change. |

### Scope and tasks

**A. Production secrets audit**

- Stripe live keys, Firebase credentials, Postmark/SMTP, production GA4 ID, production App Check site key.
- No staging/test credentials in production.
- No secrets committed to the repo.
- No secret values in logs or CI.
- Names-only inventory remains in `docs/TASKIO_RELEASE_PLAN.md` and `docs/SECRETS_AND_KEY_ROTATION.md`.

**B. Historical credential remediation**

- Confirm any historically exposed production service-account credential is rotated/revoked.
- Confirm obsolete credentials are disabled/revoked.
- Do not print historical secret values. See A04 in the release plan.

**C. IAM review**

- Least privilege for runtime and operator identities.
- Service-account, Secret Manager, Firebase/GCP role review.
- Remove unnecessary privileged access.
- Do not use the default Compute account or `firebase-adminsdk-fbsvc` as the API identity.

**D. Production App Check**

- Production provider configured; App Check-enabled frontend deployed.
- Valid traffic proven; Firestore enforcement proven; Storage enforcement proven.
- Auth enforcement remains an explicit separate decision (currently out of approved MVP scope).
- Preserve the rollback rule: disable affected enforcement first, verify OFF, then roll Hosting. See `docs/APP_CHECK.md`.

**E. Production analytics**

- Production GA4 property/stream with privacy-minimised settings.
- No advertising/personalisation, no PII / raw IDs / exact amounts.
- Safe event-payload proof and production console receipt.
- See `docs/ANALYTICS.md`.

**F. Production transactional email**

- Production Postmark config, approved sender/domain authentication, production secret binding.
- Authentic transactional email proof.
- No staging URLs and no sensitive task content in email.
- See `docs/TRANSACTIONAL_EMAIL.md`.

**G. Firebase / Hosting / API configuration audit**

- Production project IDs, CORS, API URLs.
- No localhost, no staging endpoints, no Stripe TEST configuration, no public-signup regression.

**H. Security scans**

- Dependency/security audit, frontend bundle scan, API/container scan where applicable.
- No unresolved high/critical launch blockers.
- See `docs/SECURITY_COMPLIANCE_REVIEW.md`.

### Evidence required

- Written audit results with redacted identifiers only.
- Production Hosting/API/App Check/GA4/email proof artefacts (no secrets).
- Scan reports and IAM review notes.

### Exit criteria

**P07 PASS** only when production security/configuration is independently validated and no critical/high launch blocker remains. Defining this gate does not perform that validation.

---

## P08 — Production operations

| Field | Value |
|---|---|
| Objective | A small team can operate Taskio safely after launch. |
| Classification | Docs/tooling may be GREEN; live production monitors/alerts are **RED**. |
| Current status | **NOT STARTED** |
| Dependencies | Existing `docs/OBSERVABILITY_AND_OPERATIONS.md`, `docs/INCIDENT_RESPONSE.md`, `docs/PILOT_RUNBOOK.md`, `docs/MAINTENANCE_RHYTHM.md`. |
| Approval | GREEN: runbooks and checklists. AMBER: staging monitors. RED: production monitors, webhooks, and on-call routing. |

### Scope and tasks

**A. Monitoring**

- Production uptime; frontend/backend/Functions errors; Stripe webhook/payment failures; transactional email failures; App Check rejection visibility.

**B. Alerting**

Define owner-reachable alerts for API outage, payment failure, payout failure, email delivery failure, abnormal App Check rejection, authentication outage, and Firestore/Storage permission failure.

**C. Incident runbook**

- Owner/operator escalation.
- Freeze signup; maintenance mode; disable an affected feature.
- Payment, security, and data incidents.
- Rollback steps.
- Extend `docs/INCIDENT_RESPONSE.md` rather than inventing a second severity model.

**D. Rollback runbook**

Must preserve App Check safety:

1. Disable affected Firestore/Storage enforcement first.
2. Verify OFF and rules-authorized access without App Check.
3. Only then roll Hosting/frontend.

Also cover Hosting, API, Functions, and config rollback. See `docs/TASKIO_RELEASE_PLAN.md` and `docs/APP_CHECK.md`.

**E. Backup/recovery**

- Firestore backup/export strategy, Storage recovery expectations, named recovery owner, and a tested or documented recovery proof.

**F. Support operations**

- Refund, dispute, payout issue, verification issue, customer contact path, and evidence/log collection.
- See `docs/PILOT_RUNBOOK.md` and `docs/PRIVACY_RETENTION_AND_DSAR.md`.

**G. Capacity / launch-control tooling**

- Signup/waitlist control, pause onboarding, restrict new work, admin visibility into active jobs/payments.
- Invite-only remains the default until a separate owner decision.

**H. Daily/weekly operating checklist**

- Payments, payouts, unresolved jobs, email failures, support cases, security/monitoring alerts.

### Evidence required

- Named monitors and alert destinations (no secrets).
- Operator-usable runbooks.
- A walkthrough showing a non-developer operator can follow the ordinary incident path.

### Exit criteria

**P08 PASS** only when a non-developer operator can safely respond to ordinary launch incidents using documented procedures.

---

## P09 — Legal and trust implementation

| Field | Value |
|---|---|
| Objective | Implement P06 outcomes in the product and operating model. |
| Classification | GREEN for draft wiring against approved text. Production copy/legal publish is **RED** after P06. |
| Current status | **NOT STARTED** |
| Dependencies | **P06 PASS** is required before P09 can PASS. Staging draft banners (G03) are not production legal. |
| Approval | P06 decides. P09 implements. Do not invent legal conclusions. |

P09 does **not** replace P06. P06 is review and approval. P09 is implementation of those approved decisions.

### Scope and tasks

**A. Final production legal documents**

- Privacy Policy, Terms & Conditions, cancellation/refund policy, dispute handling, and Beta/early-access wording if still applicable.

**B. Cross-border / provider disclosures as approved in P06**

Include providers such as Postmark, Google Analytics, Stripe, and Firebase/Google Cloud **only as P06 approves**. Do not add extra legal claims here.

**C. Marketplace role wording**

Make Taskio’s approved role clear for homeowner/Expert relationship, payments, quoting, completion, and disputes. Avoid unsupported escrow/custodian claims.

**D. Expert trust framework**

- Verified-status meaning, identity/eligibility, ABN handling if applicable, licensing boundaries, prohibited categories, manual admin verification.

**E. Safety / prohibited jobs**

Phase 1 must continue excluding work that requires licences or qualifications Taskio is not prepared to manage. Keep the frozen 8 Inner Melbourne suburbs and Phase 1 catalog unless the owner expands them.

**F. Policy implementation**

Link approved wording from signup/login where relevant, posting, payment, footer, profile/onboarding, and support/cancellation surfaces.

**G. Privacy minimisation**

Verify analytics, email, logs, profile data, retention, support uploads, and job descriptions match P06. See `docs/ANALYTICS.md`, `docs/TRANSACTIONAL_EMAIL.md`, and `docs/PRIVACY_RETENTION_AND_DSAR.md`.

### Evidence required

- P06 approval record.
- Production-facing URLs/screens showing the approved documents.
- Confirmation that product data handling matches the approved privacy position.

### Exit criteria

**P09 PASS** requires approved policies to be implemented in production-facing UI and operations, not merely drafted.

---

## P10 — Production acceptance

| Field | Value |
|---|---|
| Objective | Prove the complete production system end-to-end before inviting launch users. |
| Classification | **RED**. Real-money tests need explicit owner approval. |
| Current status | **NOT STARTED** |
| Dependencies | **TASKIO FULL LAUNCH READY** inputs except P10 itself: P01, P02, P03–P05 production, P06, P07, P08, P09. |
| Approval | Do not run P10 while only editing the tracker. |

### Scope and tasks

**A. Core happy path (controlled, owner-approved, real money)**

Invite/enrol controlled homeowner → controlled Expert → create task → admin invite → submit quote → accept quote → live Stripe payment → secured payment state → Expert marks complete → homeowner approves → Stripe transfer → connected-account bank payout → transactional emails → review.

**B. Refund path**

Pre-release cancellation, full refund, no Expert transfer, correct Taskio economics, correct email/state.

**C. Failure path**

Failed payment, abandoned Checkout, payment succeeded but UI interrupted, email failure isolation, payout pending/failure, invalid App Check, stale browser/session, role/permission rejection.

**D. Production integrations**

Stripe LIVE, Postmark production, GA4 production, App Check production, Firebase production, API production, Hosting production.

**E. Device/browser**

Desktop Chrome, mobile Chrome, Safari/iPhone where available; responsive widths; no horizontal overflow; login/post/quote/payment flows.

**F. Accessibility**

Keyboard navigation, focus visibility, labels, contrast, basic automated accessibility scan.

**G. Performance**

Acceptable homepage load; no oversized accidental assets; no runtime staging/local references; no severe console errors.

**H. Production smoke checklist**

A repeatable checklist for every future release.

### Evidence required

- Redacted job/payment/payout/refund IDs and states.
- Email, analytics, and App Check production receipts without secrets or PII dumps.
- Device/browser and accessibility notes.

### Exit criteria

**P10 PASS** only when the actual production environment has proven the complete money loop and critical failure paths.

---

## P11 — Controlled launch

| Field | Value |
|---|---|
| Objective | Launch to a deliberately limited first cohort and prove the operating model with real users. |
| Classification | **RED**. Cannot begin before **TASKIO FULL LAUNCH READY**. |
| Current status | **BLOCKED** |
| Geography | Inner Melbourne only: Melbourne, Southbank, Docklands, South Yarra, Prahran, St Kilda, Richmond, Carlton. |

### Scope and tasks

**A. Founding Expert onboarding**

About **5–10** suitable verified Experts: manual verification, approved categories, Stripe onboarding, bank payout capability, profile readiness, human welcome.

**B. Initial homeowner cohort**

About **10–20** controlled/invited homeowners. No open public signup unless separately approved.

**C. Launch controls**

Invite-only remains default. Ability to pause signups, waitlist fallback, manual admin control, daily monitoring.

**D. First-job supervision**

Review every early job: quote flow, payment, completion, payout, support/dispute risk.

**E. Launch metrics (no PII)**

Invited/activated homeowners; invited/verified Experts; jobs posted; jobs with quotes; quote acceptance; funded/completed jobs; payment release rate; payout success; refunds/cancellations; disputes; email failures; time to first quote; repeat usage; support volume.

Use existing privacy-safe analytics plus operator counts. Do not add PII to analytics.

**F. Success thresholds**

Decide continue / adjust / temporarily pause onboarding from operational safety and successful job completion. Do not invent aggressive growth targets.

Suggested first-cohort safety bars (owner may tighten, not loosen, without a new decision):

- every funded job is either completed, refunded, or actively supervised
- every released payment has a matching Connect transfer
- every intended payout is created or has an owned incident
- no unresolved SEV1 payment/security/legal incident
- email failures are isolated and do not block payment state

**G. Controlled expansion**

Only after a stable initial cohort: more homeowner invitations, more Experts, possibly more suburbs/categories. Expansion requires an owner decision.

### Evidence required

- Cohort lists by role count only (no unnecessary PII in the tracker).
- Supervised job outcomes, payout/refund/dispute counts.
- Operator notes that support load is workable.

### Exit criteria

**P11 PASS** means a controlled real-user launch occurred; real jobs completed; real payouts succeeded; operational support proved workable; no critical security/legal/payment blocker remains; and the owner has evidence to continue or pause a broader launch.

---

## What this document does not do

- It does not mark P07–P11 complete.
- It does not authorise production Hosting restore, live Stripe, production email, production analytics, or production App Check.
- P01 TEST bank payout evidence is recorded in `docs/TASKIO_TRACKER.md` (2026-09-07). Staging TEST P01 PASS does not authorise production Stripe.
- It does not start P11.
