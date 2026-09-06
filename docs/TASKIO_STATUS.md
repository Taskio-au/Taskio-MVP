# Taskio status

**Last updated:** 6 September 2026

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au` (production Hosting is **maintenance only**).
- Production Firebase project: `taskio-v2` — **PRE-LAUNCH FREEZE**.
- Staging Firebase project: `taskio-v2-staging` is a **temporary validation bench** (not a duplicate product). Stage 4 Boundaries 1–3 are complete. Boundary 4 hosted journeys **B4A–G PASS**. P02A refund **PASS**.

## Repository state

**2026-09-06 P05 Storage enforcement (staging only, unpushed evidence):** Firestore and Storage are `ENFORCED` / **PASS**. Auth remains `UNENFORCED`. Hosting unchanged **`211fb288dcaff973`**. Homeowner profile-photo upload **200** with App Check; missing/invalid App Check **401**. Stale and new photo metadata cleared. Production Hosting still `cffca9d87ce03901`. See `docs/APP_CHECK.md`.

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites. CI (Node 24) builds the production frontend, runs Playwright browser-smoke against a local mock server, rules tests, Functions tests, and API/webhook image builds.
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. Serving API **`taskio-api-staging-54aed8b` 100%**. Hosting **`211fb288dcaff973`** (P05 App Check frontend; previous `c2b8f742e73fed84`). B4A–G and P02A hosted journeys **PASS**. P03 authentic staging E01 **VERIFIED** (quote `EJCy55qxqQaHpZQ7iMUD`, subject `New quote for TSK-6572`). Staging SMTP cleanup **verified**: native `SMTP_USER`/`SMTP_PASS` v2 only enabled. P04 **STAGING PASS / PRODUCTION PENDING** (`G-SZ7RZDKTJY`; owner-confirmed Realtime receipt). P05 **STAGING PASS / PRODUCTION PENDING** (Firestore + Storage enforced; Auth off). Production SPA is not restored. Production SMTP remains off.
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`. Commands there remain **NOT EXECUTED** unless Saeed names an exact `taskio-v2` batch.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- Remaining prelaunch gates: **P01** bank payout **NOT PROVEN**; **P02** normal refund **PROVEN / COMPLETE** (P02B optional/not proven); **P03** **STAGING PASS / PRODUCTION PENDING** (authentic E01 delivered); **P04** **STAGING PASS / PRODUCTION PENDING** (owner-confirmed Realtime); **P05** **STAGING PASS / PRODUCTION PENDING** (Firestore + Storage enforced; Auth out of MVP scope); **P06** legal review **still required** before real-user production, including Postmark APP 8 / overseas processing.
- Legal Terms/Privacy remain drafts until owner (and preferably Australian legal) review before first real users.

**Staging App Check rollback prerequisite:** Disable affected Firestore and/or Storage App Check enforcement FIRST and verify OFF plus rules-authorized access without App Check. Only then restore Hosting. Do **not** roll Hosting back while either service remains ENFORCED. Keep Auth unenforced, security rules unchanged, and production untouched. See `docs/APP_CHECK.md`.

## Next release decision

P03, P04, and P05 staging are **PASS / PRODUCTION PENDING**. Do not infer production launch, production analytics, production App Check, or production email. Production SMTP remains **NOT CONFIGURED**. Production analytics remain **OFF**.
