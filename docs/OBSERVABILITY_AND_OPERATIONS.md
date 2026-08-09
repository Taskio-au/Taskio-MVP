# Observability And Operations

## Runtime Signals

- Every API response should include `x-request-id`.
- Use structured backend logs as the primary incident timeline.
- Set `LOG_LEVEL` per environment and configure `ALERT_WEBHOOK_URL` for critical backend failures.

## Health Endpoints

- `GET /health/live`
  - Process-level liveness for load balancers and container platforms.
- `GET /health/ready`
  - Readiness check for Firestore connectivity plus Stripe/env safety expectations.
- `GET /health`
  - Alias of readiness for simple platforms that only support one probe.
- `GET /health/metrics`
  - Process memory and uptime; prefer internal-only access.

## Operator Workflow

1. Start with the failing request's `x-request-id`.
2. Correlate that ID in backend logs.
3. Confirm `GET /health/ready` is green.
4. If payments are involved, inspect Stripe webhook delivery and the matching `paymentIntentId`.
5. If webhook delivery lags, use `POST /api/jobs/:jobId/payment-confirmed` as the recovery path before manual escalation.
6. If the issue is user-facing, review the linked support ticket and job audit trail together.

## Alerts To Wire Up

- Repeated readiness probe failures.
- Unhandled backend exceptions sent through `ALERT_WEBHOOK_URL`.
- Stripe webhook failures or delivery lag.
- Stripe mode mismatch between deployed keys and incoming webhook events.
- Sudden spikes in support tickets by category.
- Elevated auth, payment, or AI endpoint error rates.

## Shutdown Expectations

- Deployments should send `SIGTERM`.
- The backend now closes the HTTP server before exit to reduce dropped requests during rollout.
- During platform rollout, remove an instance from readiness before terminating it.
