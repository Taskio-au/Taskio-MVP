# Taskio staging webhook deployment preflight

Status: prepared, not deployed by this document. Production remains frozen.

Owner decision 2026-08-23: Taskio will **not** maintain a full duplicate staging environment. Staging is a **temporary, minimal infrastructure and Stripe TEST-mode validation bench** before production. This checklist must not be used against `taskio-v2`, must not enable live Stripe, and is not launch approval.

## Purpose

Use staging only to prove Cloud Run / IAM / OIDC / Stripe TEST integration. Do not turn staging into a second product environment. The intended phase is short (roughly a few focused hours if infrastructure behaves as expected). That estimate is **not** a hard deadline.

Stop expanding staging unless a defect specifically requires it.

## Fixed deployment contract

| Setting | Staging value |
|---|---|
| GCP project | `taskio-v2-staging` |
| Region | `australia-southeast1` |
| Runtime mode | `NODE_ENV=production` |
| Deployment identity | `TASKIO_DEPLOYMENT_ENV=staging` |
| Stripe mode | TEST only; `STRIPE_EXPECTED_LIVEMODE=false`; `sk_test_` only |
| Main API ingress | Private/authenticated only |
| Webhook ingress | Public only on the webhook-only service |
| Internal destination | `<private API origin>/internal/stripe/verified-event` |
| Production project | No changes |

Use distinct staging service and service-account names. Recommended names are `taskio-api-staging`, `taskio-stripe-webhook-staging`, `taskio-api-staging-runtime`, and `taskio-webhook-staging-runtime`. Record the actual names before deployment.

## Out of scope (not blockers)

Do **not** treat these as required before production readiness unless testing reveals a specific need:

- polished staging frontend
- `staging.taskio.com.au` or other custom staging DNS
- full duplicate Firebase Hosting environment
- complete staging Auth-provider rollout
- staging App Check rollout
- full staging Storage / user-content migration
- exhaustive staging browser regression
- permanent staging monitoring dashboards
- complete replication of production configuration
- comprehensive staging data population
- long-lived staging operational environment

Browser/user-journey acceptance still happens later, using the safest practical environment while production remains contained. It does not require a full permanent staging stack.

## Minimal read-only inventory (next pickup)

Answer only what is needed for the small deployment. Do **not** execute mutations until separately approved.

Capture:

- confirm the active project identity is exactly `taskio-v2-staging`
- existing Cloud Run services, regions, URLs, ingress, and authentication policy
- candidate/runtime service accounts
- relevant IAM bindings
- required Secret Manager secret **names and versions only** — never values
- Artifact Registry availability
- Firestore existence
- Stripe TEST configuration availability/state needed for one critical rehearsal

Do **not** require staging frontend, DNS, or Hosting work as part of this inventory.

Stop if the active project is not exactly `taskio-v2-staging`, if any command targets `taskio-v2`, or if a Stripe key/event reports live mode.

After inventory, report the **minimum exact mutations required**. Do not execute them in the same batch.

## Build and configuration gates

1. Build the main API from the repository root `Dockerfile` and the webhook service from `Dockerfile.webhook`. Pin deployments to immutable image digests.
2. Keep both services on `NODE_ENV=production`, `TASKIO_DEPLOYMENT_ENV=staging`, and `GOOGLE_CLOUD_PROJECT=taskio-v2-staging`.
3. Configure the main API with a Stripe `sk_test_` secret and `STRIPE_EXPECTED_LIVEMODE=false`. Do **not** mount or set `STRIPE_WEBHOOK_SECRET` or `STRIPE_CONNECT_WEBHOOK_SECRET` on the main API. The private API receives verified events at `/internal/stripe/verified-event` after Google OIDC checks. The Stripe API key remains private-API only.
4. Configure the webhook service with **both** TEST endpoint signing secrets (`STRIPE_WEBHOOK_SECRET` for platform/account events and `STRIPE_CONNECT_WEBHOOK_SECRET` for connected-account events), `STRIPE_EXPECTED_LIVEMODE=false`, and the exact private API HTTPS origin as `STRIPE_INTERNAL_AUDIENCE`. Both secrets belong only to the webhook runtime. The private API gets neither.
5. Do not put `STRIPE_SECRET_KEY`, Firebase credentials, Gemini credentials, ABN credentials, OTP secrets, or frontend configuration on the webhook service.
6. Keep `ENABLE_SET_ADMIN_ENDPOINT=false` and `TASKIO_SHOW_DEV_OTP=false`.
7. Use only required staging secrets. Dedicated minimum-privilege runtime service accounts only.

Staging requires **two** Stripe TEST webhook destinations on the same webhook Cloud Run service. Do not register them until separately approved:

| Destination | Route | Signing secret |
|---|---|---|
| Platform / account | `POST /api/stripe/webhook` | `STRIPE_WEBHOOK_SECRET` |
| Connected accounts | `POST /api/stripe/connect-webhook` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

Registered staging URLs (operator-registered TEST destinations; do not change them in a source-cleanup batch):

- Platform: `https://taskio-stripe-webhook-staging-1077378545256.australia-southeast1.run.app/api/stripe/webhook`
- Connected accounts: `https://taskio-stripe-webhook-staging-1077378545256.australia-southeast1.run.app/api/stripe/connect-webhook`

Relevant platform/account events currently consumed (10):

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `refund.failed`
- `refund.updated`
- `transfer.reversed`

Relevant connected-account events currently consumed (2):

- `account.updated`
- `payout.failed`

Stripe API version for the staging destinations is `2025-07-30.basil`. The Workbench edit screen exposes those 10 platform events, including `transfer.reversed` and not `transfer.failed`. Destination details may display `transfer.canceled` as a historical compatibility alias; do not treat it as a separately selectable or required Taskio event.

Proven TEST gates (do not resend events from a source-cleanup batch): platform HMAC → OIDC → private API; same-event idempotent resend; Connected Accounts HMAC → OIDC → private API.

Synthetic Checkout preflight found and resolved an expert phone-verification consistency issue. A verified Firebase Auth `phone_number` claim can satisfy the expert phone gate; manual Firestore `phoneVerified` seeding is **not** required for the staging rehearsal.

The current dual-header Cloud Run invocation method (`X-Serverless-Authorization` Google identity token + Firebase `Authorization`) is an **OPERATOR STAGING TEST HARNESS**. It does **not** by itself prove that a normal browser end user can directly call the IAM-private Cloud Run API. Browser/user-journey connectivity remains a later pre-launch gate.

Next pickup is SYNTHETIC PAYMENT EXECUTION — PHASE A/B SETUP (identities/profiles/TEST Express onboarding only). Stop before job creation, quote, or Checkout. Do not start until separately approved.

Each destination must use only its own signing secret. Do not share, fall back, or try both secrets on one route.

The application now fails closed if staging is declared outside `taskio-v2-staging`, if that project is declared as production, if staging expects live events, or if staging receives a non-test Stripe secret key.

## Identity and IAM gates

- The main API has no `allUsers` invoker binding.
- The webhook service is the only public Cloud Run ingress used by Stripe.
- The webhook runtime service account has `roles/run.invoker` on the staging main API only.
- The main API checks the caller email against `STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT` and requires a verified Google identity token with the exact configured audience.
- The webhook service account has no Firestore, Storage, Firebase Admin, Secret Manager access beyond its webhook signing-secret versions, or project-wide invoker grant.
- The API runtime service account receives only the data and secret access required by the API.

## Required verification (minimal)

Retain command output, timestamps, image digests, service revisions, and redacted configuration for each result:

1. API is private (unauthenticated API and internal ingest rejected).
2. Webhook is the only public Cloud Run service (root and unrelated webhook paths 404).
3. Webhook SA can invoke the private API.
4. Webhook SA does **not** have Firestore / Firebase Admin access.
5. HMAC validation works; missing/invalid Stripe signature is rejected and creates no event record.
6. Google OIDC forwarding works.
7. Exact audience works.
8. Exact caller identity works.
9. Invalid signature fails.
10. Wrong / `livemode=true` event fails.
11. Duplicate event is idempotent and produces no duplicate business mutation.
12. Logs contain request/event correlation but no bearer tokens, signing secrets, secret keys, raw credentials, or private customer data.

## One representative Stripe TEST lifecycle

After the identity hop is proven, execute **one** critical TEST-mode path only:

- TEST Checkout / funding
- webhook confirmation
- one representative refund / cancellation path

Do not expand into a full product-matrix rehearsal in staging unless a defect specifically requires it.

## Rollback gate

Before the first TEST event, record the prior Cloud Run revision and traffic allocation for every existing staging service created or changed by this work. Rollback means removing the Stripe TEST endpoint first (if one was created), routing traffic back to the recorded revision, and revoking the webhook service account's API invoker binding if the webhook path is abandoned. Capture enough information to undo the staging services and IAM. Do not delete staging data during rollback. Do not touch production.

## Completion boundary

This gate completes only when the minimal inventory, IAM evidence, deployment digests, required verification results, one representative Stripe TEST lifecycle, and rollback evidence are attached to the tracker.

Completion authorizes the next step in the remaining gate order (stop expanding staging unless needed, then critical browser/user journeys, then security/observability/rollback/launch-runbook, legal, production configuration, owner launch approval). It does **not** authorize production deployment or launch.
