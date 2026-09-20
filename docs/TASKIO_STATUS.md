# Taskio status

**Last updated:** 20 September 2026 (P07F2 Expert expertise fail-closed locally; deployment pending)

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au` (production Hosting is **maintenance only**).
- Production Firebase project: `taskio-v2` — **PRE-LAUNCH FREEZE**.
- Staging Firebase project: `taskio-v2-staging` is a **temporary validation bench** (not a duplicate product). Stage 4 Boundaries 1–3 are complete. Boundary 4 hosted journeys **B4A–G PASS**. P02A refund **PASS**. P01 bank payout **PASS**.

## Launch-readiness meaning

Completion of the tracker now means:

**Taskio is ready for a controlled real-world production launch with real users and real money.**

**TASKIO FULL LAUNCH READY** = P01 PASS + P02 PASS + P03 production PASS + P04 production PASS + P05 production PASS + P06 PASS + P07 PASS + P08 PASS + P09 PASS + P10 PASS.

**P11** is the controlled Inner Melbourne launch execution gate. It cannot start before that definition is true.

Canonical gate definitions: `docs/LAUNCH_READINESS.md`. Execution evidence: `docs/TASKIO_TRACKER.md`. Production commands remain **NOT EXECUTED**: `docs/TASKIO_RELEASE_PLAN.md`.

Taskio is **not** FULL LAUNCH READY.

## Repository state

**2026-09-07 P01 bank payout (Stripe TEST):** **PASS / COMPLETE.** Automatic standard payout `po_1UCgvyKCF5W6OUwDqm8eHeOh` AUD **108.00** `status=paid` `livemode=false` for TSK-5507. Connected available after payout **AUD 0.00**. Production Hosting still `cffca9d87ce03901`. See `docs/TASKIO_TRACKER.md`.

**2026-09-06 P05 Storage enforcement (staging only):** Firestore and Storage are `ENFORCED` / **PASS**. Auth remains `UNENFORCED`. Hosting unchanged **`211fb288dcaff973`**. Homeowner profile-photo upload **200** with App Check; missing/invalid App Check **401**. Stale and new photo metadata cleared. Production Hosting still `cffca9d87ce03901`. Evidence commit `ba349d5` **pushed**; CI [`34026868256`](https://github.com/Taskio-au/Taskio-MVP/actions/runs/34026868256) **success**. See `docs/APP_CHECK.md`.

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites. CI (Node 24) builds the production frontend, runs Playwright browser-smoke against a local mock server, rules tests, Functions tests, and API/webhook image builds.
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. Serving API **`taskio-api-staging-00070-dur` 100%** (HEAD `04951a4`; previous `54aed8b` retained at 0%). Hosting **`b963ae61de25da7e`** (`main.068025df.js` / `main.5e46c8ad.css`; CSP **ENFORCED**; previous `fdc32b272f51d9e0` retained). B4A–G and P02A hosted journeys **PASS**. P01 TEST bank payout **PASS**. P03 authentic staging E01 **VERIFIED** (quote `EJCy55qxqQaHpZQ7iMUD`, subject `New quote for TSK-6572`). Staging SMTP cleanup **verified**: native `SMTP_USER`/`SMTP_PASS` v2 only enabled. P04 **STAGING PASS / PRODUCTION PENDING** (`G-SZ7RZDKTJY`; owner-confirmed Realtime receipt). P05 **STAGING PASS / PRODUCTION PENDING** (Firestore + Storage enforced; Auth off). Production SPA is not restored. Production SMTP remains off.
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`. Commands there remain **NOT EXECUTED** unless Saeed names an exact `taskio-v2` batch.

## Current launch-readiness summary

Technical staging readiness is advanced. Full production launch is **not** ready.

| Gate | Current state | Blocks P11? |
|---|---|---|
| P01 | **PASS / COMPLETE** (TEST bank payout) | No |
| P02 | **COMPLETE** (staging TEST refund) | No (production refund re-proof is inside P10) |
| P03 | **STAGING PASS / PRODUCTION PENDING** | Yes, until production PASS |
| P04 | **STAGING PASS / PRODUCTION PENDING** | Yes, until production PASS |
| P05 | **STAGING PASS / PRODUCTION PENDING** | Yes, until production PASS |
| P06 | **OPEN** — owner facts **COMPLETE**; P06A reconciliation **PREPARED** (`docs/P06_REMEDIATION_MATRIX.md`); lean sole-trader controlled pilot as owner working plan, **subject to AU solicitor confirmation**; Pty Ltd **not** an automatic launch blocker; company conversion deferred unless advised before pilot; insurance = focused minimum-pilot broker/solicitor review; accounting **PENDING**; remediation **matrix prepared / implementation not started**. Not PASS. | **Yes — current pickup** |
| P07 | **OPEN / REMEDIATION IN PROGRESS** — **AMBER-E2A+E2B+E2C+D3 COMPLETE**. **P07F1 AUDIT COMPLETE**. **P07F2 LOCAL REMEDIATION COMPLETE / DEPLOYMENT PENDING** (expertise fail-closed; read-side auto-approval removed; not deployed). Staging data remediation **not required**. Production Expert audit **PENDING**. Staging CSP **ENFORCED**. Not PASS. | **Yes** |
| P08 | **NOT STARTED** | **Yes** |
| P09 | **NOT STARTED** (blocked on P06) | **Yes** |
| P10 | **NOT STARTED** — must prove a brand-new homeowner can authenticate and post. Existing invited/synthetic users are not enough for public OPEN. | **Yes** |
| P11 | **BLOCKED** — **Controlled Open-Demand Pilot**. Homeowner **OPEN (code):** public supported signup/posting, no manual invitation, normal auth still required. **CLOSED / PAUSED:** new posting blocked; homeowner waitlist. Expert onboarding is **independent**: **OPEN** allows public Expert applications that stay pending review until Admin Verify; **WAITLIST** blocks new Expert accounts and uses `expertWaitlist`. Launch-ready remains derived. Local code only; **not deployed**. Current cloud `disabledUserSignup=true` still blocks brand-new Firebase users for both public account paths. P07/P10 must prove approved public account paths. Activation still requires ~15 launch-ready + category/geo coverage + other real-user gates + explicit owner OPEN. 15 does **not** auto-open. Floor ~12 → WATCH/PAUSE. P06 **OPEN**. P09 blocked. | — |

Mandatory remaining before controlled launch: P06, P07, P08, P09, P10, plus P03/P04/P05 **production** PASS.

Explicitly post-launch unless later required: native apps, Expert LIMITED-mode recruitment, advanced matching AI, advanced analytics dashboards, subscriptions, dynamic pricing, multi-city expansion, sophisticated automated disputes, major variation expansion.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- Remaining prelaunch gates: **P01** bank payout **PASS / COMPLETE**; **P02** normal refund **PROVEN / COMPLETE** (P02B optional/not proven); **P03** **STAGING PASS / PRODUCTION PENDING** (authentic E01 delivered); **P04** **STAGING PASS / PRODUCTION PENDING** (owner-confirmed Realtime); **P05** **STAGING PASS / PRODUCTION PENDING** (Firestore + Storage enforced; Auth out of MVP scope); **P06** **OPEN** (owner facts complete; P06A reconciliation prepared; lean sole-trader pilot subject to solicitor confirmation; Pty Ltd not an automatic blocker; focused insurance review pending; not PASS); **P07** **OPEN / REMEDIATION IN PROGRESS** (AMBER-E2A+E2B+E2C+D3 complete; P07F1 audit complete; P07F2 local expertise fail-closed, **not deployed**; CSP **ENFORCED**; production Auth/App Check/email/analytics/Stripe/Hosting/rules and production Expert audit remain; not PASS); **P08 / P10** **NOT STARTED**; **P09** blocked on P06; **P11** **BLOCKED**.
- Legal Terms/Privacy remain drafts. P06 pack: `docs/P06_OWNER_DECISIONS.md`. Solicitor brief: `docs/P06_SOLICITOR_BRIEF.md`. Claim/processor/remediation inventory: `docs/P06_REMEDIATION_MATRIX.md`. Do not describe Taskio as a company or Pty Ltd during the sole-trader pilot. Do not treat Pty Ltd or broad insurance as automatic launch blockers. P09 stays blocked until P06 PASS.

**Staging App Check rollback prerequisite:** Disable affected Firestore and/or Storage App Check enforcement FIRST and verify OFF plus rules-authorized access without App Check. Only then restore Hosting. Do **not** roll Hosting back while either service remains ENFORCED. Keep Auth unenforced, security rules unchanged, and production untouched. See `docs/APP_CHECK.md`.

## Next release decision

P01 and P02 staging TEST money-path proofs are **COMPLETE**. P03, P04, and P05 staging are **PASS / PRODUCTION PENDING**. P07 is **OPEN / REMEDIATION IN PROGRESS** (AMBER-E2A+E2B+E2C+D3 **COMPLETE**; P07F1 **AUDIT COMPLETE**; P07F2 **LOCAL REMEDIATION COMPLETE / DEPLOYMENT PENDING**; staging CSP **ENFORCED**; not PASS). P06 **OPEN**. P09 **BLOCKED BY P06**. P08/P10 are not started. Do not infer production launch. Do not start P11. Next pickups remain **P06** solicitor pack, remaining **P07** RED / optional Functions packages, and a separate approval to deploy P07F2. Production legacy Expert review stays a separate read-only approval.
