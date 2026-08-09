# Melbourne Pilot Runbook

## Launch Gate

Before opening the pilot to real users:

1. Confirm `frontend` verification passes.
2. Confirm `backend` tests pass.
3. Confirm production env has `CORS_ORIGINS`, `TRUST_PROXY=true`, `ALERT_WEBHOOK_URL`, `OTP_SALT`, and Stripe live/test mode configured intentionally.
4. Confirm `GET /health/ready` returns green in the deployed environment.
5. Confirm Stripe webhook delivery is active for the deployed environment and mode.

## Support Ownership

- Product / support owner:
  - First response for homeowner, task expert, and dispute tickets.
- Engineering owner:
  - Handles auth failures, payment failures, webhook lag, and readiness failures.
- Operations owner:
  - Confirms deploy health, alert routing, and escalation timing.

## Payment Incidents

- If Checkout succeeds but the job still shows unfunded:
  - Check `GET /health/ready`.
  - Check Stripe webhook delivery for the matching event.
  - Call `POST /api/jobs/:jobId/payment-confirmed` as the homeowner-safe recovery path.
  - If Stripe shows `payment_intent.succeeded`, confirm the job moved to `funded`.
- If payout release fails:
  - Confirm task status is `completed` and payment state is `in_escrow`.
  - Confirm the assigned task expert has completed Stripe onboarding.
  - If needed, use the admin manual release path and record the reason in the support ticket.
- If refund is required:
  - Use the admin refund action.
  - Keep the support ticket and job audit trail linked.

## Disputes

- Flag disputed jobs immediately to freeze the normal release path.
- Record the dispute reason in admin notes/support.
- Clear a dispute only when the task should return to its prior lifecycle.
- If funds must be returned, use the refund flow and document the outcome in the support ticket.

## Readiness / Alert Workflow

- Alert triggers should page engineering for:
  - repeated `GET /health/ready` failures
  - Stripe webhook failures or mode mismatch
  - unhandled backend exceptions sent to `ALERT_WEBHOOK_URL`
- Every investigation should start with `x-request-id` when available.

## Melbourne Pilot Scope

- Prioritise inner and middle Melbourne suburbs already shown in public marketing and onboarding.
- Decline or manually review requests outside the supported pilot area until coverage is expanded.
