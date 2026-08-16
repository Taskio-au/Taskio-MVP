# Security And Compliance Review (Pre-Scale)

This review captures what is already enforced in Taskio and what must be completed before scaling traffic.

## Implemented Baseline Controls

- **Transport and headers**
  - `helmet` enabled in backend app.
  - `x-powered-by` disabled.
- **CORS**
  - Allowlist-based CORS with production safeguard against empty allowlist.
- **Rate limiting**
  - General API limiter in place.
  - Additional AI endpoint limiter added to reduce abuse/cost risk.
- **Authentication and authorization**
  - Firebase ID token verification in `requireAuth`.
  - Administrator authority comes only from Firebase custom claims; mutable Firestore profile fields do not grant privilege.
- **Payment safety**
  - Admin payment routes enforce state transitions and Stripe preconditions.
  - Contract tests cover dispute, clear-dispute, release, refund paths.
- **Auditability**
  - Admin and user audit log helpers persist actor, action, request metadata.
- **Observability**
  - Structured JSON logging with PII/token redaction.
  - Request IDs attached to all responses (`x-request-id`).
  - Error handler includes request ID and optional alert webhook integration.

## Compliance-Oriented Data Handling

- Avoid storing raw sensitive values in logs (token/password redaction active).
- Preserve audit trail for privileged actions.
- Keep user-facing error responses generic while retaining detailed server logs.

## Outstanding Items Before Production Scale

- **Secrets management**
  - Move all production secrets to managed secret storage (not `.env` files).
  - See `docs/SECRETS_AND_KEY_ROTATION.md`.
- **Key rotation**
  - Define quarterly rotation for Stripe/Firebase/API keys with runbook.
- **Data retention**
  - Set retention periods for support tickets, chat flags, and audit logs.
  - See `docs/PRIVACY_RETENTION_AND_DSAR.md`.
- **Privacy operations**
  - Formalize DSAR/deletion workflows and legal retention exceptions.
- **Incident response**
  - Establish severity matrix, on-call rotation, and post-incident template.
  - See `docs/INCIDENT_RESPONSE.md`.
- **Dependency governance**
  - Add recurring dependency vulnerability scan to CI.
- **Operations visibility**
  - Keep readiness probes, alert routing, and request-id based investigation guidance current.
  - See `docs/OBSERVABILITY_AND_OPERATIONS.md`.
  - Pilot response ownership and payment/dispute procedures should stay current in `docs/PILOT_RUNBOOK.md`.
- **Pen test**
  - Run focused external test for authz, payment abuse, and object-level access.

## Recommended Release Gate

Before opening to higher traffic, require:

1. `frontend`: `npm run verify` passes.
2. `backend`: `npm test` passes.
3. Production env has explicit `CORS_ORIGINS`, `TRUST_PROXY=true`, monitored `ALERT_WEBHOOK_URL`, and a newly provisioned non-default `OTP_SALT` (none was generated during repository-only preparation).
4. Review and sign-off on this checklist by engineering and operations.
