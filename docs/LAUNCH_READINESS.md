# Taskio controlled launch readiness

Completion of this document means:

**Taskio is ready for a controlled real-world production launch with real users and real money.**

This is the product-launch overlay on top of the existing P01–P06 technical gates. It does **not** replace those gates or their evidence. Adding these gates does **not** authorise production mutation.

**Admin machine-readable source (Slice 5A):** `shared/launchReadinessManifest.js`. The read-only Pilot Status engine evaluates this reviewed file plus Expert supply. It does **not** scrape this markdown at runtime. Update the manifest in the same commit as any gate-status change.

**Admin persisted operational state (Slice 5B/5C + Expert onboarding, local):** `system/pilotSettings` stores homeowner `CLOSED` / `OPEN` / `PAUSED` and independent Expert `expertOnboardingMode` `OPEN` / `WAITLIST`. Derived launch status (`NOT READY` / `READY TO OPEN`) is separate and must not be persisted. A homeowner transition to OPEN is allowed only when the live Slice 5A engine returns READY TO OPEN. Expert OPEN does **not** require READY TO OPEN.

- **Homeowner OPEN:** public supported homeowner signup and posting; **no** manual homeowner invitation; normal authentication still required.
- **Homeowner CLOSED / PAUSED:** new homeowner posting blocked; waitlist/register interest for demand; existing jobs continue.
- **Expert OPEN:** public Expert applications; new accounts stay pending review / marketplace-ineligible until Admin Verify; self-selected categories are requested only (`expertise`); Taskio-approved categories (`expertiseApproved`) are written by Admin Verify or a later expertise-approve action; launch-ready remains derived and does not count unreviewed categories.
- **Expert WAITLIST:** new Expert signup blocked; Expert waitlist available; existing and pending Experts continue.

`REACT_APP_PUBLIC_ACQUISITION_ENABLED` is deprecated and must not override homeowner or Expert eligibility. New Expert signup also requires `TASKIO_PUBLIC_SIGNUP_ENABLED`. Still **not deployed**. Do not create the settings document in staging or production without a separate approval.

**Code vs current cloud Auth (do not confuse):**

- **Code semantics when OPEN:** no manual homeowner invitation; normal homeowner auth/signup; supported posting permitted. Expert applications follow independent Expert onboarding mode and stay marketplace-ineligible until verification.
- **Current staging/production Identity Toolkit:** `disabledUserSignup=true`. Brand-new Firebase Auth users cannot be created there today. Local tests mock auth. This slice does **not** change that cloud setting.
- That cloud constraint is acceptable while Pilot Status is **NOT READY** and nothing is deployed/opened.
- The current disabled cloud setting is intentional while production is frozen. **P07 PASS** means the signup path and its application gates are security-ready; it does **not** require enabling Firebase Auth signup.
- **P10** owns a separately approved, controlled production signup enablement, brand-new-user proof, and rollback proof. **P11** owns sustained signup availability during controlled activation. Production must not be marked **READY TO OPEN** until P10 has proven the approved path. Public `GET /api/pilot-status` must not probe this cloud setting. Enabling Auth signup does not approve an Expert.

Companion records:

- Current statuses: `docs/TASKIO_STATUS.md`
- Execution evidence: `docs/TASKIO_TRACKER.md`
- Production command plan (NOT EXECUTED): `docs/TASKIO_RELEASE_PLAN.md`
- P06 owner pack (not PASS): `docs/P06_OWNER_DECISIONS.md`
- P06 solicitor brief (not PASS): `docs/P06_SOLICITOR_BRIEF.md`
- P06A reconciliation / remediation matrix (not PASS): `docs/P06_REMEDIATION_MATRIX.md`
- P07 security/config audit + P07C read-only verification (not PASS): `docs/P07_SECURITY_CONFIG_REMEDIATION.md`
- Controlled Open-Demand Pilot + Admin cockpit: `docs/PILOT_OPERATIONS_COCKPIT.md`

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
| P04 | Analytics gate **PASS**: production proof, or an explicit owner-approved production-OFF exception |
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
P04 staging PASS → production proof or owner-OFF PASS ┤
P05 staging PASS → P05 production PASS ┤
P06 PASS → P09 PASS ───────────────────┼→ P07 + P08 + P10 → FULL LAUNCH READY → P11
                                       │
P07 also consumes P03/P04/P05 production proof
```

- P01 TEST bank payout is **PASS / COMPLETE** and is no longer a current launch blocker. Production live money-loop re-proof remains inside P10.
- P06 is the **review/approval** gate. P09 **implements** P06 decisions. P09 must not invent legal conclusions.
- P03/P05 staging PASS does **not** satisfy production PASS. P04 may instead close through an explicit owner-approved production-OFF exception that does not claim live analytics proof.
- P10 is the last technical/operational acceptance gate and requires live production proof.
- P11 is first-cohort launch, not a substitute for P10.

## Mandatory before controlled launch vs post-launch

**Mandatory before P11**

- P01 bank payout proof (COMPLETE on Stripe TEST; production re-proof inside P10)
- P02 refund path (already complete on staging TEST; production refund proof lives in P10)
- P03 production email
- P04 analytics gate PASS (production proof or explicit owner-OFF exception)
- P05 production App Check
- P06 legal/privacy review
- P07 production security/config
- P08 operations readiness
- P09 implemented approved policies
- P10 production acceptance of the money loop and critical failures

**Explicitly out of launch-critical scope** unless the owner later requires them:

- native mobile apps
- Expert LIMITED-mode recruitment
- advanced matching AI
- advanced analytics dashboards
- subscriptions
- dynamic pricing
- multi-city expansion
- sophisticated automated disputes
- major variation workflow expansion

Existing nice-to-have IDs **N01–N03** stay post-launch / optional.

**Launch proposition (working product, not legal copy; P06A):** Taskio helps small home jobs get properly scoped, matched to a small number of suitable Experts, quoted clearly, paid through Taskio, and supported through completion. Do **not** position launch around generic AI, Expert/quote counts, cheapest price, “fully vetted”, workmanship guarantee, or escrow.

**Post/pilot experiments (roadmap only — not P01–P10 unless later required for legal/safety):** more structured/comparable quotes; written variations; completion checklist/evidence; more transparent category-level verification; issue-free completion metric; rehire flow; outcome-driven price/matching intelligence.

## Current launch-readiness summary (26 September 2026)

Technical staging readiness is advanced. Full production launch is **not** ready.

| Gate | Current state | Blocks P11? |
|---|---|---|
| P01 | **PASS / COMPLETE** (TEST bank payout) | No |
| P02 | **COMPLETE** (staging TEST refund) | No (production refund re-proof is inside P10) |
| P03 | **PRODUCTION PASS / COMPLETE / CLOSED** — staging PASS; exactly one guarded production proof send returned **200**, provider accepted, owner receipt confirmed, proof gate restored off, and final admin check returned **404 `proof_disabled`** | No |
| P04 | **PASS — OWNER-APPROVED PRODUCTION OFF.** Staging proof remains valid. Production GA4 stays OFF through P06/P09; no live analytics proof is claimed. If later selected, enablement/proof belongs to P10 after approved privacy wording. | No |
| P05 | **PRODUCTION PASS / COMPLETE / CLOSED** — Firestore and Storage `ENFORCED` and proven; missing/invalid App Check denied; exact synthetic Storage object deleted; temporary proof surface removed on Hosting `c42a0cac1cc5b789`; Auth remains Monitoring / `UNENFORCED`; `/` remains maintenance | No |
| P06 | **OPEN** — owner facts **COMPLETE**; P06A reconciliation **PREPARED**; lean sole-trader controlled pilot as owner working plan, subject to AU solicitor confirmation; Pty Ltd **not** an automatic launch blocker; company conversion deferred unless advised before pilot; insurance = focused minimum-pilot review; remediation **matrix prepared / implementation not started**. Not PASS. | **Yes — current pickup** |
| P07 | **PASS / CLOSED.** Secrets/runtime isolation evidenced; fail-closed API live; production Firestore/Storage rules current; signup path security/readiness complete; P03 email and P05 App Check complete; owner GA4-OFF decision recorded; Stripe LIVE correctly deferred to P10 after P06/P09; legacy Expert compatibility resolved fail-closed. Final closure required **no RED production mutation**. | No |
| P08 | **NOT STARTED** | **Yes** |
| P09 | **NOT STARTED** (blocked on P06) | **Yes** |
| P10 | **NOT STARTED** | **Yes** |
| P11 | **BLOCKED** — Controlled Open-Demand Pilot. Posting **CLOSED** until ~15 launch-ready Experts (eligibility + `acceptingJobs` + `serviceAreas[]`) + category/geo coverage + other real-user gates + **explicit** owner activation. Floor ~12 → WATCH/PAUSE. 15 does **not** auto-open. | — |

Do not start P11. Do not infer a launch percentage. Do not mark **TASKIO FULL LAUNCH READY**.

---

## P07 — Production security and configuration

| Field | Value |
|---|---|
| Objective | Prove production configuration is secure, isolated, correctly configured, and ready to serve real users. |
| Classification | Production validation. Execution is **RED**. |
| Current status | **PASS / CLOSED.** P07F1–F5B, G1–G3 and H1–H2 are complete. The fail-closed production API and current Firestore/Storage rules are live. P03 email and P05 App Check are closed. Auth signup remains intentionally disabled; GA4 remains OFF by owner decision; Stripe LIVE remains disabled for P10. Final closure required no RED production mutation. |
| Dependencies | Satisfied for P07. P06/P09 still gate later public wording, GA4 enablement if selected, customer email activation, and LIVE Stripe acceptance. |
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

- Production provider configured in P05G2. **P05 PRODUCTION PASS:** Firestore and Storage App Check are `ENFORCED` on `taskio-v2`; valid traffic succeeded; missing/invalid App Check was denied; the exact synthetic Storage object was deleted; the temporary proof surface was removed on Hosting `c42a0cac1cc5b789`. Auth remains Monitoring / `UNENFORCED`; `/` remains maintenance.
- Valid traffic proven; Firestore and Storage enforcement proven.
- Auth enforcement remains an explicit separate decision (currently out of approved MVP scope).
- Preserve the rollback rule: disable affected enforcement first, verify OFF, then roll Hosting. See `docs/APP_CHECK.md`.

**E. Production analytics**

- Owner decision: keep production GA4 **OFF through P06/P09**. This explicit production-OFF exception satisfies P07/P04 readiness without claiming live analytics proof.
- Existing code remains fail-closed and privacy-minimised: no advertising/personalisation and no PII / raw IDs / exact amounts.
- If production GA4 is later selected, approved P06/P09 privacy wording must precede enablement; safe event-payload and console-receipt proof then belong to P10.
- See `docs/ANALYTICS.md`.

**F. Production transactional email**

- Production nodemailer SMTP (Postmark host), approved sender/domain authentication, production secret binding.
- One authentic operator verification send. Customer-facing E01 stays `EMAIL_ENABLED=false` until a later decision.
- No staging URLs and no sensitive task content in the proof email.
- Result: `docs/TRANSACTIONAL_EMAIL.md`. Staging **PASS** and production **PASS**. Exactly one production proof was accepted and owner-received. `verifyTransactionalEmail` is **ACTIVE + INERT** (`EMAIL_PROOF_ENABLED=false`); both E01 Functions remain `EMAIL_ENABLED=false`. Customer emails **0**; business-data writes **0**. Production customer email remains disabled.

**G. Firebase / Hosting / API configuration audit**

- Production project IDs, CORS, API URLs.
- No localhost, no staging endpoints, no Stripe TEST configuration, no public-signup regression.

**H. Security scans**

- Dependency/security audit, frontend bundle scan, API/container scan where applicable.
- No unresolved high/critical launch blockers.
- See `docs/SECURITY_COMPLIANCE_REVIEW.md`.

**I. Production authentication / homeowner signup configuration**

- P07 validates that the approved homeowner authentication/signup path and application gates are secure and ready. Existing-account login alone is not sufficient for P10 acceptance.
- Current staging/production fact: `disabledUserSignup=true`. That is intentional while production is frozen and does **not** block P07 PASS.
- P10 must perform a separately approved controlled signup enablement, prove a brand-new homeowner can authenticate and post through the accepted browser/API architecture, and prove rollback. P11 owns sustained signup availability.
- Enabling Firebase Auth user creation for homeowners must **not** open Expert enrollment. Expert self-signup remains application-gated: frontend Expert UX flag + backend `TASKIO_PUBLIC_SIGNUP_ENABLED` / `requirePublicSignupEnabled` + Admin verification.
- Do not probe Identity Toolkit from `GET /api/pilot-status`. This is a launch-readiness / acceptance prerequisite, not a per-request public-status check.

### Evidence required

- Written audit results with redacted identifiers only.
- Production Hosting/API/App Check/email proof artefacts and the explicit GA4-OFF owner decision (no secrets).
- Scan reports and IAM review notes.

### Exit criteria

**P07 PASS / CLOSED (26 September 2026).** Production security/configuration and signup-path readiness are independently validated and no critical/high P07 blocker remains. Actual Auth signup enablement, LIVE Stripe configuration, SPA/API acceptance, and optional later GA4 enablement remain P10 work and are not implied by P07 PASS.

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
- **Controlled Open-Demand Pilot:** homeowner posting stays **CLOSED** until the supply gate and **explicit** owner/admin activation. After activation, posting is public-supported but capacity-gated — not unrestricted public signup. Expert open-signup remains off. See `docs/PILOT_OPERATIONS_COCKPIT.md`.

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
| Current status | **NOT STARTED**. Full SPA browser/API architecture stays in this gate and remains open. Target is OPTION B after an Authorization-header proof. OPTION A is the staging-proven fallback. IAM is unchanged. |
| Dependencies | **TASKIO FULL LAUNCH READY** inputs except P10 itself: P01, P02, P03–P05 production, P06, P07, P08, P09. |
| Approval | Do not run P10 while only editing the tracker. |

### Scope and tasks

**A. Core happy path (controlled, owner-approved, real money)**

A **brand-new** homeowner authenticates through the supported signup path and posts a supported task → controlled Expert → create task → admin invite → submit quote → accept quote → live Stripe payment → secured payment state → Expert marks complete → homeowner approves → Stripe transfer → connected-account bank payout → transactional emails → review.

Existing synthetic / previously invited homeowners are **not** sufficient proof for public OPEN. P10 cannot PASS public homeowner acquisition while production Auth still has `disabledUserSignup=true`. Enabling Auth signup for that proof must not open Expert self-signup.

P10 open items remain: real SPA restoration; the production browser/API architecture; Authorization-header forwarding proof; controlled Auth enablement plus brand-new-user and rollback proof; LIVE Stripe configuration and the money loop after P06/P09; the customer-email journey if required; and GA4 proof only if production analytics is later approved.

**B. Refund path**

Pre-release cancellation, full refund, no Expert transfer, correct Taskio economics, correct email/state.

**C. Failure path**

Failed payment, abandoned Checkout, payment succeeded but UI interrupted, email failure isolation, payout pending/failure, invalid App Check, stale browser/session, role/permission rejection.

**D. Production integrations**

Stripe LIVE, Postmark production, App Check production, Firebase production, API production, Hosting production, and GA4 production only if later approved after P06/P09.

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

**P10 PASS** only when the actual production environment has proven the complete money loop, a brand-new homeowner auth+post path, and critical failure paths.

---

## P11 — Controlled launch

| Field | Value |
|---|---|
| Objective | Launch to a deliberately limited first cohort and prove the operating model with real users. |
| Classification | **RED**. Cannot begin before **TASKIO FULL LAUNCH READY**. |
| Current status | **BLOCKED** |
| Geography | Inner Melbourne only: Melbourne, Southbank, Docklands, South Yarra, Prahran, St Kilda, Richmond, Carlton. |

### Scope and tasks

**A. Founding Expert onboarding / supply build**

Recruit and manually select launch-ready Experts. Public Expert open-signup remains **off**.

**Launch-ready Expert (derived; no stored `launchReady` flag)** counts toward ~15 / ~12 only when **all** of:

1. **Technical eligibility** Taskio actually performs: Expert/tradie role; active account; manually verified; phone/profile complete; approved expertise; Stripe onboarding complete as required; ABN if required; age/business requirements.
2. **`acceptingJobs === true`** — currently willing/available to receive pilot opportunities. Boolean only; no calendar/scheduling system.
3. **`serviceAreas[]`** contains at least one **enabled** canonical pilot area — explicit multi-select; not inferred from home-base `serviceLocation`.

`acceptingJobs` and `serviceAreas[]` are **small data/profile changes required before real homeowner posting opens**. They supplement eligibility; they do not replace it. They are **not** optional/post-pilot. Do **not** implement them in a docs-only task. Do **not** gold-plate with GIS, maps, radius, travel-time, or availability calendars.

**B. Homeowner posting activation gate**

**CONTROLLED OPEN-DEMAND does not mean posting is open immediately.**

Before the supply/readiness gate:

- landing **may** be visible
- Expert recruitment **may** operate
- homeowners **may** waitlist / register interest
- **real homeowner task posting stays CLOSED or capacity-gated**
- do **not** send paid homeowner acquisition into an under-supplied marketplace

Enable real homeowner posting only when **all** are true:

1. approximately **15 ACTIVE LAUNCH-READY EXPERTS** (technical eligibility **plus** `acceptingJobs=true` **plus** at least one enabled `serviceAreas[]` value)
2. adequate coverage of every Phase 1 category intended to be enabled (ideally **4–5 launch-ready Experts per enabled category**). Hard 4–5 applies to **categories**, not every suburb
3. adequate coverage of the approved launch geography as **one Inner Melbourne zone**. Every **enabled** location must have credible **service** coverage via `serviceAreas[]`. Do **not** require 4–5 Experts independently in every suburb. Do **not** treat home-base `serviceLocation` as service coverage
4. all other required real-user launch-readiness gates are satisfied
5. **owner/admin explicitly activates** homeowner acquisition / posting

The raw number 15 is **not** sufficient if category or geographic coverage is weak. **15 does not auto-open posting.** Do not count technically eligible but unavailable / area-unspecified Experts toward the ~15.

Operating targets (not customer SLAs): recruit **18–20** candidates; launch-ready **~15**; after-activation floor **~12**; ideally **4–5** launch-ready Experts per enabled Phase 1 category; invite up to **~5** suitable Experts per job aiming for **2–3** qualified quotes; first qualified response ideally **≤ 60 minutes**; two quotes ideally **≤ 3 hours**; ≥1 quote on **≥ 90%** of supported jobs; zero-quote **< 10%**.

After explicit activation, homeowners may use the public supported posting flow **without a manual invitation**, still subject to geography, categories, capacity, auth, and approved legal requirements.

Admin becomes the **Pilot Operations Cockpit** (`docs/PILOT_OPERATIONS_COCKPIT.md`): NOT READY / READY TO OPEN / OPEN / WATCH / PAUSED. Design only until a later implementation task.

**C. Launch controls and after-activation supply floor**

Ability to pause acquisition, activate waitlist mode, restrict new work, narrow categories/geography, and recruit replacement Experts. Manual admin control and daily monitoring.

**After-activation operating floor:** approximately **12** launch-ready Experts. If active supply falls below ~12, or category coverage materially falls below target, admin flags **WATCH / PAUSE**. Do not keep accepting demand blindly when supply is insufficient.

**D. First-job supervision**

Review every early job: quote flow, payment, completion, payout, support/dispute risk.

**E. Launch metrics (no PII)**

Launch-ready Expert count; Experts per enabled category; waitlist vs posting-enabled state; WATCH/PAUSE flags; homeowners who posted (after activation); jobs posted; jobs with quotes; quote acceptance; funded/completed jobs; payment release rate; payout success; refunds/cancellations; disputes; email failures; time to first quote; repeat usage; support volume.

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

Only after a stable activated cohort and supply above the operating floor: more Experts, possibly more suburbs/categories, or higher acquisition. Expansion requires an owner decision. Do not reopen or scale demand if supply is below the ~12 floor or category coverage is weak.

### Evidence required

- Cohort lists by role count only (no unnecessary PII in the tracker).
- Supervised job outcomes, payout/refund/dispute counts.
- Operator notes that support load is workable.

### Exit criteria

**P11 PASS** means a controlled real-user launch occurred; real jobs completed; real payouts succeeded; operational support proved workable; no critical security/legal/payment blocker remains; and the owner has evidence to continue or pause a broader launch.

---

## What this document does not do

- It records P07 as **PASS / CLOSED** but does not mark P08–P11 complete.
- It does not authorise production Hosting restore, Auth enablement, live Stripe, customer-email enablement or another proof send, production analytics, or production App Check changes.
- P01 TEST bank payout evidence is recorded in `docs/TASKIO_TRACKER.md` (2026-09-07). Staging TEST P01 PASS does not authorise production Stripe.
- It does not start P11.
