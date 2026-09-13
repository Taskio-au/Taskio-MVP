# Taskio status

**Last updated:** 13 September 2026 (Admin Slice 3 stall-semantics check)

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
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. Serving API **`taskio-api-staging-54aed8b` 100%**. Hosting **`211fb288dcaff973`** (P05 App Check frontend; previous `c2b8f742e73fed84`). B4A–G and P02A hosted journeys **PASS**. P01 TEST bank payout **PASS**. P03 authentic staging E01 **VERIFIED** (quote `EJCy55qxqQaHpZQ7iMUD`, subject `New quote for TSK-6572`). Staging SMTP cleanup **verified**: native `SMTP_USER`/`SMTP_PASS` v2 only enabled. P04 **STAGING PASS / PRODUCTION PENDING** (`G-SZ7RZDKTJY`; owner-confirmed Realtime receipt). P05 **STAGING PASS / PRODUCTION PENDING** (Firestore + Storage enforced; Auth off). Production SPA is not restored. Production SMTP remains off.
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
| P06 | **OPEN** — owner facts **COMPLETE**; lean sole-trader controlled pilot as owner working plan, **subject to AU solicitor confirmation**; Pty Ltd **not** an automatic launch blocker; company conversion deferred unless advised before pilot; insurance = focused minimum-pilot broker/solicitor review; accounting **PENDING**; remediation **NOT STARTED**. Not PASS. | **Yes — current pickup** |
| P07 | **NOT STARTED** | **Yes** |
| P08 | **NOT STARTED** | **Yes** |
| P09 | **NOT STARTED** (blocked on P06) | **Yes** |
| P10 | **NOT STARTED** | **Yes** |
| P11 | **BLOCKED** — **Controlled Open-Demand Pilot**. Posting **CLOSED** until ~15 launch-ready (technical eligibility + `acceptingJobs=true` + ≥1 enabled `serviceAreas[]`) + category coverage (**minimum 4 / target 5** per **enabled category**, not per suburb) + one-zone Inner Melbourne **service** coverage + other real-user gates + explicit owner activation. 15 does **not** auto-open. Floor ~12 → WATCH/PAUSE. Slice 1–3 Admin data/cockpit/attention implemented locally (`SUPPLY READY` is not `READY TO OPEN`). Posting activation control not built. Incomplete scans must not prove supply-ready or “all clear”. | — |

Mandatory remaining before controlled launch: P06, P07, P08, P09, P10, plus P03/P04/P05 **production** PASS.

Explicitly post-launch unless later required: native apps, public Expert signup, advanced matching AI, advanced analytics dashboards, subscriptions, dynamic pricing, multi-city expansion, sophisticated automated disputes, major variation expansion.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- Remaining prelaunch gates: **P01** bank payout **PASS / COMPLETE**; **P02** normal refund **PROVEN / COMPLETE** (P02B optional/not proven); **P03** **STAGING PASS / PRODUCTION PENDING** (authentic E01 delivered); **P04** **STAGING PASS / PRODUCTION PENDING** (owner-confirmed Realtime); **P05** **STAGING PASS / PRODUCTION PENDING** (Firestore + Storage enforced; Auth out of MVP scope); **P06** **OPEN** (owner facts complete; lean sole-trader pilot subject to solicitor confirmation; Pty Ltd not an automatic blocker; focused insurance review pending; not PASS); **P07–P10** **NOT STARTED**; **P11** **BLOCKED**.
- Legal Terms/Privacy remain drafts. P06 pack: `docs/P06_OWNER_DECISIONS.md`. Solicitor brief: `docs/P06_SOLICITOR_BRIEF.md`. Do not describe Taskio as a company or Pty Ltd during the sole-trader pilot. Do not treat Pty Ltd or broad insurance as automatic launch blockers. P09 stays blocked until P06 PASS.

**Staging App Check rollback prerequisite:** Disable affected Firestore and/or Storage App Check enforcement FIRST and verify OFF plus rules-authorized access without App Check. Only then restore Hosting. Do **not** roll Hosting back while either service remains ENFORCED. Keep Auth unenforced, security rules unchanged, and production untouched. See `docs/APP_CHECK.md`.

## Next release decision

P01 and P02 staging TEST money-path proofs are **COMPLETE**. P03, P04, and P05 staging are **PASS / PRODUCTION PENDING**. P07–P10 are additional production-readiness gates and are not started. Do not infer production launch, production analytics, production App Check, or production email. Do not start P11. Production SMTP remains **NOT CONFIGURED**. Production analytics remain **OFF**. Next pickup is **P06** focused AU solicitor (Stage 1 + Stage 2) + focused insurance broker + accountant review (owner facts complete; not PASS). Pty Ltd / broad insurance are not automatic blockers unless professionally advised.
