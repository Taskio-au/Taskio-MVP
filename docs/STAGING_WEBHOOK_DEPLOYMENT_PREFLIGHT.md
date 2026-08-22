# Taskio staging webhook deployment preflight

Status: prepared, not deployed by this document. Production remains frozen.

This checklist is limited to the approved `taskio-v2-staging` project and Stripe TEST mode. It must not be used against `taskio-v2`, must not enable live Stripe, and is not launch approval.

## Fixed deployment contract

| Setting | Staging value |
|---|---|
| GCP project | `taskio-v2-staging` |
| Region | `australia-southeast1` |
| Runtime mode | `NODE_ENV=production` |
| Deployment identity | `TASKIO_DEPLOYMENT_ENV=staging` |
| Stripe mode | TEST only; `STRIPE_EXPECTED_LIVEMODE=false` |
| Main API ingress | Private/authenticated only |
| Webhook ingress | Public only on the webhook-only service |
| Internal destination | `<private API origin>/internal/stripe/verified-event` |
| Production project | No changes |

Use distinct staging service and service-account names. Recommended names are `taskio-api-staging`, `taskio-stripe-webhook-staging`, `taskio-api-staging-runtime`, and `taskio-webhook-staging-runtime`. Record the actual names before deployment.

## Inventory before mutation

Capture read-only output for the staging project:

- current Cloud Run services, regions, URLs, ingress, and authentication policy;
- runtime service accounts and project IAM bindings;
- Secret Manager secret names and versions, without printing secret values;
- Artifact Registry repositories and image digests;
- Firestore database and Storage bucket identity;
- staging frontend origin and authorized Firebase Auth domains;
- Stripe TEST-mode webhook endpoint state and subscribed event types.

Stop if the active project is not exactly `taskio-v2-staging`, if any command targets `taskio-v2`, or if a Stripe key/event reports live mode.

## Build and configuration gates

1. Build the main API from the repository root `Dockerfile` and the webhook service from `Dockerfile.webhook`. Pin deployments to immutable image digests.
2. Keep both services on `NODE_ENV=production`, `TASKIO_DEPLOYMENT_ENV=staging`, and `GOOGLE_CLOUD_PROJECT=taskio-v2-staging`.
3. Configure the main API with a Stripe `sk_test_` secret and `STRIPE_EXPECTED_LIVEMODE=false`.
4. Configure the webhook service with the TEST endpoint signing secret, `STRIPE_EXPECTED_LIVEMODE=false`, and the exact private API HTTPS origin as `STRIPE_INTERNAL_AUDIENCE`.
5. Do not put `STRIPE_SECRET_KEY`, Firebase credentials, Gemini credentials, ABN credentials, OTP secrets, or frontend configuration on the webhook service.
6. Keep `ENABLE_SET_ADMIN_ENDPOINT=false` and `TASKIO_SHOW_DEV_OTP=false`.

The application now fails closed if staging is declared outside `taskio-v2-staging`, if that project is declared as production, if staging expects live events, or if staging receives a non-test Stripe secret key.

## Identity and IAM gates

- The main API has no `allUsers` invoker binding.
- The webhook service is the only public Cloud Run ingress used by Stripe.
- The webhook runtime service account has `roles/run.invoker` on the staging main API only.
- The main API checks the caller email against `STRIPE_WEBHOOK_CALLER_SERVICE_ACCOUNT` and requires a verified Google identity token with the exact configured audience.
- The webhook service account has no Firestore, Storage, Firebase Admin, Secret Manager access beyond its single webhook signing-secret version, or project-wide invoker grant.
- The API runtime service account receives only the data and secret access required by the API.

## Smoke and evidence gates

Retain command output, timestamps, image digests, service revisions, and redacted configuration for each result:

1. Main API readiness is healthy and identifies staging dependencies.
2. Direct unauthenticated access to the private API and internal ingest route is rejected.
3. Webhook service root and unrelated paths return HTTP 404.
4. A webhook request with no or invalid Stripe signature is rejected and creates no event record.
5. A signed Stripe TEST event reaches the webhook service, is forwarded with a Google identity token, and is persisted once by the private API.
6. Replaying the same Stripe event is idempotent and produces no duplicate business mutation.
7. A signed event with `livemode=true` is rejected.
8. Logs contain request/event correlation but no bearer tokens, signing secrets, secret keys, raw credentials, or private customer data.
9. The deployed webhook image still contains no `.env`, service-account JSON, frontend, shared directory, or API-only credentials.
10. All seven repository CI jobs remain green at the deployed commit.

## Rollback gate

Before the first TEST event, record the prior Cloud Run revision and traffic allocation for every existing staging service. Rollback means removing the Stripe TEST endpoint first, routing traffic back to the recorded revision, and revoking the webhook service account's API invoker binding if the webhook path is abandoned. Do not delete staging data during rollback.

## Completion boundary

This gate completes only when the inventory, IAM evidence, deployment digests, smoke results, idempotency result, and rollback evidence are attached to the tracker. Completion authorizes the next staging TEST-mode rehearsal only; it does not authorize production deployment or launch.
