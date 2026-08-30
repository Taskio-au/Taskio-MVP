# Taskio status

**Last updated:** 30 August 2026

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au` (production Hosting is **maintenance only**).
- Production Firebase project: `taskio-v2` — **PRE-LAUNCH FREEZE**.
- Staging Firebase project: `taskio-v2-staging` is a **temporary validation bench** (not a duplicate product). Stage 4 Boundaries 1–3 are complete. Boundary 4 hosted user journeys are **not started**.

## Repository state

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites. CI (Node 24) builds the production frontend, runs Playwright browser-smoke against a local mock server, rules tests, Functions tests, and API/webhook image builds.
- Staging Cloud Run `taskio-api-staging` (closed signup, CORS for staging Hosting + localhost) and staging Hosting SPA are live. B4A–G and P02A hosted journeys **PASS**. Production SPA is not restored. P05 App Check application code is in-repo with enforcement **off**.
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`. Commands there remain **NOT EXECUTED** unless Saeed names an exact `taskio-v2` batch.

## External blockers

- Any `taskio-v2` production mutation requires a fresh RED approval.
- App Check registration/enforcement, SMTP/transactional email **delivery**, live Stripe, public signup, and production SPA restore remain separate gates. P03 application logic is on origin with `EMAIL_ENABLED=false`; Postmark staging delivery is **NOT VERIFIED**. P05 App Check enforcement **off**. P04 analytics GREEN is **on origin** (`e7ffbf0`; CI `33310943590`); staging GA4 **NOT CONFIGURED**; production analytics **NOT ENABLED**.
- Legal Terms/Privacy remain drafts until owner (and preferably Australian legal) review before first real users.

## Next release decision

GREEN private-MVP repo work, then one combined staging **B4A–C** AMBER package (read-only SPA + existing synthetic login + authenticated read). Do not infer production launch from staging work.
