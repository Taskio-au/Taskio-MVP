# Privacy, Retention, And DSAR Operations

## Australian Readiness Goal

Taskio should be able to explain what data it keeps, how long it keeps it, and how it handles access or deletion requests.

## Minimum Retention Schedule

- Support tickets: 24 months after closure
- Job chat and job events: 24 months after task completion or cancellation
- Audit logs for admin/security actions: 24 months minimum
- Payment reconciliation metadata: 7 years if required for finance and tax record keeping
- Failed or abandoned onboarding artefacts: 90 days unless legally required longer

## Deletion And Access Requests

1. Verify requester identity.
2. Locate the user record, related jobs, support tickets, reviews, and audit entries.
3. Export what must be provided to the requester.
4. Delete or anonymize data that is eligible for erasure.
5. Preserve records that must remain for fraud, payment, tax, or dispute obligations.
6. Record the request outcome, approver, and completion date.

## Legal Hold / Exceptions

Do not delete records that are part of:

- active disputes
- payment investigations
- fraud reviews
- tax or accounting obligations
- security incidents

## Product Expectations

- Support responses should ask for job IDs rather than unnecessary personal information.
- Operators should use Taskio message history and audit trails before asking users to resend evidence.
- Any future bulk deletion tooling must preserve auditability of who initiated the request.
