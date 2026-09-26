# Taskio status

**Last updated:** 26 September 2026 (P07 PASS / CLOSED by approved readiness boundaries; P03/P05 complete; production remains frozen)

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au` (production Hosting is **maintenance only**).
- Production Firebase project: `taskio-v2` — **PRE-LAUNCH FREEZE**.
- Staging Firebase project: `taskio-v2-staging` is a **temporary validation bench** (not a duplicate product). Stage 4 Boundaries 1–3 are complete. Boundary 4 hosted journeys **B4A–G PASS**. P02A refund **PASS**. P01 bank payout **PASS**.

## Launch-readiness meaning

Completion of the tracker now means:

**Taskio is ready for a controlled real-world production launch with real users and real money.**

**TASKIO FULL LAUNCH READY** = P01 PASS + P02 PASS + P03 production PASS + P04 gate PASS (production proof or explicit owner-OFF exception) + P05 production PASS + P06 PASS + P07 PASS + P08 PASS + P09 PASS + P10 PASS.

**P11** is the controlled Inner Melbourne launch execution gate. It cannot start before that definition is true.

Canonical gate definitions: `docs/LAUNCH_READINESS.md`. Execution evidence: `docs/TASKIO_TRACKER.md`. Production commands remain **NOT EXECUTED**: `docs/TASKIO_RELEASE_PLAN.md`.

Taskio is **not** FULL LAUNCH READY.

## Repository state

**2026-09-07 P01 bank payout (Stripe TEST):** **PASS / COMPLETE.** Automatic standard payout `po_1UCgvyKCF5W6OUwDqm8eHeOh` AUD **108.00** `status=paid` `livemode=false` for TSK-5507. Connected available after payout **AUD 0.00**. Production Hosting still `cffca9d87ce03901`. See `docs/TASKIO_TRACKER.md`.

**2026-09-06 P05 Storage enforcement (staging only):** Firestore and Storage are `ENFORCED` / **PASS**. Auth remains `UNENFORCED`. Hosting unchanged **`211fb288dcaff973`**. Homeowner profile-photo upload **200** with App Check; missing/invalid App Check **401**. Stale and new photo metadata cleared. Production Hosting still `cffca9d87ce03901`. Evidence commit `ba349d5` **pushed**; CI [`34026868256`](https://github.com/Taskio-au/Taskio-MVP/actions/runs/34026868256) **success**. See `docs/APP_CHECK.md`.

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites. CI (Node 24) builds the production frontend, runs Playwright browser-smoke against a local mock server, rules tests, Functions tests, and API/webhook image builds.
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. Serving API **`taskio-api-staging-00072-vur` 100%** (HEAD `57505d0`; previous `00070-dur` retained at 0%; `54aed8b` also 0%). Hosting **`b963ae61de25da7e`** (`main.068025df.js` / `main.5e46c8ad.css`; CSP **ENFORCED**; previous `fdc32b272f51d9e0` retained). B4A–G and P02A hosted journeys **PASS**. P01 TEST bank payout **PASS**. P03 staging and production are **PASS / CLOSED**. Production SMTP is configured, but both customer-facing E01 gates remain `EMAIL_ENABLED=false`; `verifyTransactionalEmail` is active and inert with `EMAIL_PROOF_ENABLED=false`. P04 is **PASS by owner-approved production-OFF exception** (`G-SZ7RZDKTJY` staging proof remains valid; production GA4 remains OFF through P06/P09). P05 is **PRODUCTION PASS / CLOSED** (Firestore + Storage enforced and proven; Auth monitoring). Production SPA is not restored.
- Production App Check has one registered reCAPTCHA Enterprise provider. **P05G4 PASS:** Firestore `ENFORCED`; valid missing-document read; missing/invalid App Check **403**. **P05G5 PASS:** Storage `ENFORCED`; exactly one 68-byte synthetic upload and valid metadata read succeeded; missing/invalid App Check **401**; exact object deleted and verified absent. **P05G6 PASS:** proof assets/CSP removed on Hosting `c42a0cac1cc5b789`. Firestore and Storage remain `ENFORCED`; Auth remains Monitoring / `UNENFORCED`; `/` and former proof paths serve maintenance only. **P05 is PRODUCTION PASS.**
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`. Commands there remain **NOT EXECUTED** unless Saeed names an exact `taskio-v2` batch.

## Current launch-readiness summary

Technical staging readiness is advanced. Full production launch is **not** ready.

| Gate | Current state | Blocks P11? |
|---|---|---|
| P01 | **PASS / COMPLETE** (TEST bank payout) | No |
| P02 | **COMPLETE** (staging TEST refund) | No (production refund re-proof is inside P10) |
| P03 | **PRODUCTION PASS / COMPLETE / CLOSED** — staging PASS; production SMTP/sender/domain proven; exactly one guarded proof send returned **200**, provider accepted, and owner receipt was confirmed. Proof gate restored off; final **404 `proof_disabled`**. Customer emails **0**; business-data writes **0**. | No |
| P04 | **PASS — OWNER-APPROVED PRODUCTION OFF.** Staging proof remains valid. Production GA4 stays OFF through P06/P09; no live production analytics proof is claimed. | No |
| P05 | **PRODUCTION PASS / COMPLETE / CLOSED** — **P05G1A–G2 COMPLETE; P05G3–G6 PASS.** Production Firestore and Storage `ENFORCED` and proven; Auth Monitoring / `UNENFORCED`; temporary proof object deleted; proof surface removed; Hosting `c42a0cac1cc5b789`; `/` remains maintenance | No |
| P06 | **OPEN** — owner facts **COMPLETE**; P06A reconciliation **PREPARED** (`docs/P06_REMEDIATION_MATRIX.md`); lean sole-trader controlled pilot as owner working plan, **subject to AU solicitor confirmation**; Pty Ltd **not** an automatic launch blocker; company conversion deferred unless advised before pilot; insurance = focused minimum-pilot broker/solicitor review; accounting **PENDING**; remediation **matrix prepared / implementation not started**. Not PASS. | **Yes — current pickup** |
| P07 | **PASS / CLOSED.** Secrets/runtime isolation evidenced; fail-closed production API live; production Firestore/Storage rules current; signup security/readiness proven; P03 email and P05 App Check closed; legacy Expert compatibility resolved fail-closed. Owner decisions keep Auth signup, GA4 and Stripe LIVE disabled while frozen. P10 owns controlled activation/proof. Final P07 closure required **no RED production mutation**. | No |
| P08 | **NOT STARTED** | **Yes** |
| P09 | **NOT STARTED** (blocked on P06) | **Yes** |
| P10 | **NOT STARTED** — open items include real SPA restoration, production browser/API architecture, Authorization-header forwarding proof, controlled Auth enable/new-user/rollback proof, LIVE Stripe configuration and money loop, customer-email journey if required, and optional GA4 proof only if later approved. | **Yes** |
| P11 | **BLOCKED** — **Controlled Open-Demand Pilot**. Homeowner **OPEN (code):** public supported signup/posting, no manual invitation, normal auth still required. **CLOSED / PAUSED:** new posting blocked; homeowner waitlist. Expert onboarding is **independent**. Current cloud signup remains intentionally disabled. Sustained signup and real-money availability belong to P11 only after P10. Activation still requires ~15 launch-ready Experts, category/geographic coverage, all other gates, and explicit owner OPEN. 15 does **not** auto-open. Floor ~12 → WATCH/PAUSE. P06 **OPEN**. P09 blocked. | — |

Mandatory remaining before controlled launch: P06, P08, P09 and P10. P03, P04, P05 and P07 are closed under their recorded evidence/owner decisions.

Explicitly post-launch unless later required: native apps, Expert LIMITED-mode recruitment, advanced matching AI, advanced analytics dashboards, subscriptions, dynamic pricing, multi-city expansion, sophisticated automated disputes, major variation expansion.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- Remaining prelaunch gates: **P01/P02 COMPLETE**; **P03/P05 PRODUCTION PASS / CLOSED**; **P04 PASS by owner-approved production-OFF exception**; **P07 PASS / CLOSED**; **P06 OPEN**; **P08/P10 NOT STARTED**; **P09 blocked on P06**; **P11 BLOCKED**.
- Legal Terms/Privacy remain drafts. P06 pack: `docs/P06_OWNER_DECISIONS.md`. Solicitor brief: `docs/P06_SOLICITOR_BRIEF.md`. Claim/processor/remediation inventory: `docs/P06_REMEDIATION_MATRIX.md`. Do not describe Taskio as a company or Pty Ltd during the sole-trader pilot. Do not treat Pty Ltd or broad insurance as automatic launch blockers. P09 stays blocked until P06 PASS.

**Staging App Check rollback prerequisite:** Disable affected Firestore and/or Storage App Check enforcement FIRST and verify OFF plus rules-authorized access without App Check. Only then restore Hosting. Do **not** roll Hosting back while either service remains ENFORCED. Keep Auth unenforced, security rules unchanged, and production untouched. See `docs/APP_CHECK.md`.

## Next release decision

P01 and P02 staging TEST money-path proofs are **COMPLETE**. P03 and P05 are **PRODUCTION PASS / CLOSED**. P04 is **PASS by explicit owner-approved production-OFF exception**; GA4 remains OFF through P06/P09. P07 is **PASS / CLOSED** with no final RED mutation. Auth signup and Stripe LIVE remain intentionally disabled and move to controlled P10 acceptance; P11 owns sustained activation. Overall legal pickup remains **P06**. P09 is **BLOCKED BY P06**. P08/P10 are not started. READY TO OPEN remains **impossible**.
