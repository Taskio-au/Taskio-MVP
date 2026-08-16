# Taskio status

**Last updated:** 16 August 2026

## Active scope

- Development branch: `develop`.
- Canonical public origin: `https://taskio.com.au`.
- Eventual launch Firebase project: `taskio-v2`.
- `taskio-v2-staging` is frozen, dormant, and excluded by owner decision. Do not inspect, test, configure, deploy, seed, or delete it.
- Current work is repository-only. No Firebase, Google Cloud, Stripe, SMTP, DNS, or other live-service changes are authorised.

## Repository state

- Security rules are covered by Firestore/Storage emulator tests using demo project IDs only.
- Cloud Functions have emulator-backed retry/idempotency tests.
- Frontend and backend have isolated local suites; CI builds the production frontend and runs browser smoke tests against a local mock server.
- The Express API has a Node 24 container definition and health/readiness routes, but it has not been deployed under the current authorization.
- Production deployment artifacts and rollback steps are in `docs/TASKIO_RELEASE_PLAN.md`; every command there is **NOT EXECUTED**.
- The maintenance-only Hosting artifact is prepared in `maintenance/` with `firebase.maintenance.json`; it is **NOT DEPLOYED**.

## External blockers

- `taskio-v2` requires a new exact production approval before any resource change.
- Required runtime credentials, alerting, OTP salt, IAM/service identity, and integration settings have not been provisioned during this run.
- Existing local service-account files remain uninspected and untouched; A04 requires the owner-operated rotation/deletion procedure in the release plan.
- App Check code is prepared but registration, monitoring, and enforcement require a separate production gate.
- Stripe and SMTP remain disabled; all payment/email verification in this run is mocked or local rendering only.

## Next release decision

Complete repository verification and CI first. Then review the production release plan and approve, postpone, or narrow one exact `taskio-v2` resource batch. Do not combine maintenance Hosting, backend traffic, rules, Functions, Stripe, or App Check into an implicit blanket approval.
