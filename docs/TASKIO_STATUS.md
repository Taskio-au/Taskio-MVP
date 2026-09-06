# Taskio status

**Last updated:** 6 September 2026

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au` (production Hosting is **maintenance only**).
- Production Firebase project: `taskio-v2` — **PRE-LAUNCH FREEZE**.
- Staging Firebase project: `taskio-v2-staging` is a **temporary validation bench** (not a duplicate product). Stage 4 Boundaries 1–3 are complete. Boundary 4 hosted journeys **B4A–G PASS**. P02A refund **PASS**.

## Repository state

**2026-09-06 P05 GREEN safety follow-up (local, not pushed):** Hosted builds now reject debug configuration before compilation, including CRA-loaded environment files; staging deploy also rejects debug input. Debug requires explicit loopback development and an isolated developer Firebase project. Staging App Check defaults are pinned. Rollback order is enforcement OFF and verified FIRST, then Hosting/frontend rollback. Local verification: frontend 74 suites / 516 tests, build/deploy 26 tests, hosted guard 11 tests, final focused App Check 17 tests, E2E 4 tests, synthetic staging-mode build and 57-file bundle scan PASS. New commit CI remains pending push; baseline CI 34015484745 passed. Provider/enforcement/metrics live API reads returned 403, so NOT CONFIGURED / OFF remain recorded states requiring Console confirmation. Public bundle main.9647f8fc.js matches the checkpoint. Overall READY FOR CONTROLLED STAGING ACTIVATION subject to Console reconciliation. No cloud mutation or production access. Full preflight and next approval package: `docs/APP_CHECK.md`.

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites. CI (Node 24) builds the production frontend, runs Playwright browser-smoke against a local mock server, rules tests, Functions tests, and API/webhook image builds.
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. Serving API **`taskio-api-staging-54aed8b` 100%**. Hosting **`c2b8f742e73fed84`** (P04 staging GA4 + floating-shelves hero; previous `548438126950e209`). B4A–G and P02A hosted journeys **PASS**. P03 authentic staging E01 **VERIFIED** (quote `EJCy55qxqQaHpZQ7iMUD`, subject `New quote for TSK-6572`). Staging SMTP cleanup **verified**: native `SMTP_USER`/`SMTP_PASS` v2 only enabled. P04 **STAGING PASS / PRODUCTION PENDING** (`G-SZ7RZDKTJY`; owner-confirmed Realtime receipt). App Check activation **not started**. Production SPA is not restored. Production SMTP remains off.
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`. Commands there remain **NOT EXECUTED** unless Saeed names an exact `taskio-v2` batch.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- Remaining prelaunch gates: **P01** bank payout **NOT PROVEN**; **P02** normal refund **PROVEN / COMPLETE** (P02B optional/not proven); **P03** **STAGING PASS / PRODUCTION PENDING** (authentic E01 delivered); **P04** **STAGING PASS / PRODUCTION PENDING** (owner-confirmed Realtime); **P05** App Check code complete, staging enforcement **OFF**; **P06** legal review **still required** before real-user production, including Postmark APP 8 / overseas processing.
- Legal Terms/Privacy remain drafts until owner (and preferably Australian legal) review before first real users.

**Staging App Check rollback prerequisite:** In `taskio-v2-staging`, disable affected Firestore/Storage enforcement FIRST and verify OFF plus rules-authorized access without App Check. Only then restore Hosting or disable frontend App Check; verify normal Auth/Firestore/Storage browser flows afterwards. A frontend restore without App Check requires BOTH services verified OFF. Keep security rules unchanged and production untouched. See `docs/APP_CHECK.md`. All cloud steps remain AMBER.

## Next release decision

P03 and P04 staging are **PASS / PRODUCTION PENDING**. Next controlled staging work is P05 App Check. Do not infer production launch, production analytics, or production email. Production SMTP remains **NOT CONFIGURED**. Production analytics remain **OFF**.
