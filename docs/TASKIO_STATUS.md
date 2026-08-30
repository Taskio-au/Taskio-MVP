# Taskio status

**Last updated:** 30 August 2026

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au` (production Hosting is **maintenance only**).
- Production Firebase project: `taskio-v2` — **PRE-LAUNCH FREEZE**.
- Staging Firebase project: `taskio-v2-staging` is a **temporary validation bench** (not a duplicate product). Stage 4 Boundaries 1–3 are complete. Boundary 4 hosted journeys **B4A–G PASS**. P02A refund **PASS**.

## Repository state

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites. CI (Node 24) builds the production frontend, runs Playwright browser-smoke against a local mock server, rules tests, Functions tests, and API/webhook image builds.
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. Serving API **`taskio-api-staging-54aed8b` 100%**. Hosting **`70429316be0dd106`**. B4A–G and P02A hosted journeys **PASS**. P04/P05 application code is on origin; staging GA4 and App Check activation **not started**. Production SPA is not restored.
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`. Commands there remain **NOT EXECUTED** unless Saeed names an exact `taskio-v2` batch.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- Remaining prelaunch gates: **P01** bank payout **NOT PROVEN**; **P02** normal refund **PROVEN / COMPLETE** (P02B optional/not proven); **P03** email code complete, Postmark approval pending, staging delivery **NOT VERIFIED**, DKIM **NOT complete**; **P04** analytics code complete, staging GA4 **NOT CONFIGURED**; **P05** App Check code complete, staging enforcement **OFF**; **P06** legal review **still required** before real-user production.
- Legal Terms/Privacy remain drafts until owner (and preferably Australian legal) review before first real users.

## Next release decision

Wait for Postmark approval, then controlled P03 staging email activation. Do not start P04 GA4, P05 App Check, P01 payout, or production work tonight. Do not infer production launch from staging work.
