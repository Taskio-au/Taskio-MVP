# Secrets And Key Rotation

## Production Rule

Do not run production from checked-in `.env` files. Use a managed secret store or platform-injected environment variables.

## Secrets Inventory

- Firebase service account credentials
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `ALERT_WEBHOOK_URL`
- Any ABN lookup or third-party verification credentials

## Storage Requirements

- Restrict secret access to the workload identity or runtime service account only.
- Never copy production secrets into local developer machines unless explicitly approved.
- Never print secrets in CI logs, app logs, or support screenshots.

## Rotation Cadence

- Stripe keys: quarterly and immediately after suspected exposure
- Firebase service credentials: quarterly or on admin/staff change
- AI and webhook credentials: quarterly
- Emergency rotation: same day for any suspected compromise

## Rotation Runbook

1. Create the new secret version in the managed secret store.
2. Update the runtime to read the new version.
3. Confirm `GET /health/ready` stays healthy after deploy.
4. Validate the affected capability:
   - Stripe checkout + webhook
   - Firebase auth/admin reads
   - Gemini-backed features
   - Alert delivery
5. Disable and then revoke the old secret.
6. Record the rotation date, owner, and validation result.

## CI And Access Rules

- CI should read secrets from repository or environment secrets only.
- Limit secret edit rights to a small operations group.
- Review secret access at least quarterly.
