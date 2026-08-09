# Incident Response

## Severity Matrix

- `SEV1`: payments blocked, major auth outage, widespread production outage, or active data/security exposure
- `SEV2`: partial outage, degraded support operations, broken key workflow, or repeated webhook failures
- `SEV3`: contained defect with workaround and low customer impact

## Immediate Response

1. Assign an incident lead.
2. Capture start time, affected systems, and customer impact.
3. Check `GET /health/ready`, logs, Stripe delivery, and recent deploys.
4. Contain the issue before expanding scope.
5. Route customer-facing updates through one owner.

## Communications

- Internal updates every 15 minutes for `SEV1`
- Internal updates every 30 minutes for `SEV2`
- Record the current status, next action, and owner each time

## Minimum Investigation Checklist

- Request IDs or example user/job IDs
- Recent deploy or config changes
- Stripe, Firebase, or third-party dependency status
- Evidence of fraud, auth bypass, or object-level access issues
- Whether support has already contacted affected users

## Post-Incident Review

Capture:

- timeline
- root cause
- detection gap
- customer impact
- short-term fix
- long-term prevention work

Every `SEV1` and `SEV2` should produce follow-up engineering work with an owner and due date.
