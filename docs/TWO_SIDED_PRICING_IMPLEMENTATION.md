# Two-sided pricing implementation — 5 October 2026

Local implementation on `develop`, based on HEAD `4bba4b8b2f2a012745101a75e278a3111d14d112`. No commit, push, deployment, production access or live Stripe action was performed.

## Behaviour

- New quotes use pricing version `taskio_15_plus_5_v1`.
- Standard Expert fee: 15% of the task price. Customer service fee: 5% of the task price, rounded to cents, minimum A$4.99 and maximum A$19.99 per booking.
- Example: A$175 task; customer pays A$183.75; standard Expert receives A$148.75; Taskio gross fees are A$35 before tax, processor costs and other expenses.
- Customer total and fee breakdown appear before quote acceptance. Calculations run on the server; client-supplied totals are ignored.
- Customer pricing is stored when the quote is accepted and retained on checkout retries. Expert fees retain the existing funding-time locking behaviour.
- Unversioned quotes/bookings keep their legacy fee treatment. Existing locked Expert snapshots are preserved. Founding Expert zero/reduced fees remain; an existing active enrolment's explicit post-offer rate is honoured. New enrolments use the new standard rate.
- Customer fees are excluded from Expert commission calculations and transfers. Expert and admin payment summaries include customer fees separately, so total customer payment reconciles with total platform fees plus Expert proceeds.
- Paid variations charge only the incremental customer fee on the cumulative task price. The minimum is not charged again and the booking cap remains A$19.99. One unresolved variation is allowed at a time for these bookings to avoid allocating the same cap twice.
- An unpaid variation checkout must be expired before cancellation/decline. A late checkout response cannot reopen a cancelled variation. Paid or processing sessions require support handling.
- Full-refund plans use the full collected customer amounts, including customer fees. This change does not introduce partial refunds or rewrite cancellation terms.
- Firestore job update allow-lists now cover added and removed keys, preventing clients from injecting server-owned pricing fields.
- Normal card processing is covered by Taskio in this model. No additional customer card surcharge or Expert processor deduction is introduced.

## Verification

- Backend full suite: 96 suites, 1,134 tests passed. Command: `node backend/node_modules/jest/bin/jest.js --config backend/package.json --runInBand --silent`.
- Frontend full suite: 97 suites, 656 tests passed. Command from `frontend`: `node node_modules/react-scripts/bin/react-scripts.js test --watchAll=false --runInBand --silent`.
- After final payment-display changes: PaymentsPage and ExpertFeeProgramCard tests passed (22 tests); admin, Expert payment-activity and pricing lifecycle tests passed (78 tests).
- Security rules: 27 tests passed using local Firestore/Storage emulators and synthetic project `demo-taskio-rules`. Isolated ports 18080/19199 and temporary CLI configuration were used because the default port was occupied and normal CLI configuration was inaccessible. No existing emulator was stopped.
- Optimized frontend build compiled successfully using synthetic `demo-taskio-e2e` configuration. Output is outside the repository in the chat artifact directory, `pricing-test-build`. This is a test build with the E2E harness and MUST NOT be deployed.
- `node frontend/scripts/check-maintainability.js` passed, with existing inline-style warnings. `git diff --check` passed. Build reported stale Browserslist data; no dependencies were installed or upgraded.
- Changes were reviewed through Git diffs. Stripe calls were mocked in tests. A hosted Stripe test-mode end-to-end payment/refund exercise and manual browser visual review were not performed.

## Release considerations

Code is ready for review locally, not a claim of live payment readiness. A separately approved staging release should include the backend, frontend and Firestore rules together, followed by Stripe test-mode checkout, variation, transfer and refund checks. Deployment and external-resource changes require separate approval under AGENTS.md.

Amounts are gross amounts. No extra GST is added by this implementation, and it does not enable Stripe Tax or issue new tax invoices. Confirm Taskio's GST registration, tax invoice responsibilities and final customer/Expert terms before accepting live payments. Existing pricing disclosures should be communicated before moving current Experts to new standard pricing.

## Files changed for this task

Pricing and backend:

- `shared/bookingPricing.js` (new)
- `shared/feePlans.js`
- `backend/src/routes/jobs.js`
- `backend/src/routes/tradie.js`
- `backend/src/services/baseQuoteFundingCompletion.js`
- `backend/src/services/expertFeeProgram.js`
- `backend/src/services/expertJobRelease.js`
- `backend/src/services/jobFeeSnapshotService.js`
- `backend/src/services/stripe.js`
- `backend/src/services/variationCustomerPricing.js` (new)
- `backend/src/services/variationFeeSnapshotService.js`
- `backend/src/services/variationPaymentCompletion.js`
- `backend/src/utils/adminPaymentFeeSummary.js`
- `firestore.rules`

Website:

- `frontend/src/AdminUserDetail.js`
- `frontend/src/components/JobPostingForm.js`
- `frontend/src/components/PaymentsPage.js`
- `frontend/src/components/VariationPanel.js`
- `frontend/src/components/expert/ExpertFeeProgramCard.jsx`
- `frontend/src/features/admin/job-detail/PaymentFeeBreakdownPanel.jsx`
- `frontend/src/features/homeowner/job-detail/QuotesSection.jsx`

Tests:

- `backend/tests/bookingPricing.test.js` (new)
- `backend/tests/twoSidedPricing.lifecycle.test.js` (new)
- `backend/tests/adminUserDetailFoundingExpert.contract.test.js`
- `backend/tests/checkoutRetry.contract.test.js`
- `backend/tests/expertFeeProgram.test.js`
- `backend/tests/expertJobRelease.snapshot.test.js`
- `backend/tests/jobFeeSnapshotService.test.js`
- `backend/tests/meProfile.contract.test.js`
- `backend/tests/tradieFeeEstimate.contract.test.js`
- `backend/tests/tradiePaymentActivity.contract.test.js`
- `frontend/src/components/ExpertFeeProgramCard.test.jsx`
- `frontend/src/features/homeowner/job-detail/QuotesSection.test.jsx`
- `rules-tests/security.rules.test.js`

This document is also new. Pre-existing P08/operations documentation, launch-readiness manifest, generated job-posting semantics and landing-review files were outside this task and preserved. All task changes remain unstaged/uncommitted; `develop` remains 0 ahead / 0 behind its locally recorded upstream.
