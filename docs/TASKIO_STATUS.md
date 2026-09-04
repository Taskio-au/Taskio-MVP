# Taskio status

**Last updated:** 4 September 2026

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au` (production Hosting is **maintenance only**).
- Production Firebase project: `taskio-v2` — **PRE-LAUNCH FREEZE**.
- Staging Firebase project: `taskio-v2-staging` is a **temporary validation bench** (not a duplicate product). Stage 4 Boundaries 1–3 are complete. Boundary 4 hosted journeys **B4A–G PASS**. P02A refund **PASS**.

## Repository state

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites. CI (Node 24) builds the production frontend, runs Playwright browser-smoke against a local mock server, rules tests, Functions tests, and API/webhook image builds.
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. Serving API **`taskio-api-staging-54aed8b` 100%**. Hosting **`548438126950e209`** (invite-only landing redesign from `e8efcbe`; previous `70429316be0dd106`). B4A–G and P02A hosted journeys **PASS**. P03 authentic staging E01 **VERIFIED** (quote `EJCy55qxqQaHpZQ7iMUD`, subject `New quote for TSK-6572`). Staging SMTP cleanup **verified**: native `SMTP_USER`/`SMTP_PASS` v2 only enabled. P04/P05 application code is on origin; staging GA4 and App Check activation **not started**. Production SPA is not restored. Production SMTP remains off.
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`. Commands there remain **NOT EXECUTED** unless Saeed names an exact `taskio-v2` batch.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- Remaining prelaunch gates: **P01** bank payout **NOT PROVEN**; **P02** normal refund **PROVEN / COMPLETE** (P02B optional/not proven); **P03** **STAGING PASS / PRODUCTION PENDING** (authentic E01 delivered); **P04** analytics code complete, staging GA4 **NOT CONFIGURED**; **P05** App Check code complete, staging enforcement **OFF**; **P06** legal review **still required** before real-user production, including Postmark APP 8 / overseas processing.
- Legal Terms/Privacy remain drafts until owner (and preferably Australian legal) review before first real users.

## Next release decision

P03 staging email is **PASS**. Staging SMTP credential cleanup is **verified** (v2 only active). Next controlled staging work is P04 GA4 (not started). Do not infer production launch or production email from this staging pass. Production SMTP remains **NOT CONFIGURED**.
