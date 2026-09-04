# Taskio transactional email

Essential status email for the private Melbourne MVP. Not marketing, newsletters, SMS, push, or CRM.

## Classification

| Gate | State |
|---|---|
| P03 application logic | CODE COMPLETE |
| P03 local / CI | **PASS** |
| Postmark account | **APPROVED** |
| Postmark sender | **ACTIVATED** (`admin@taskio.com.au`) |
| DKIM | **VERIFIED** (`taskio.com.au`) |
| Return-Path | **VERIFIED** |
| Postmark provider delivery | **VERIFIED** |
| P03 staging SMTP | **CONFIGURED** |
| P03 E01 Functions | **DEPLOYED** |
| P03 authentic Taskio staging delivery | **VERIFIED** (E01, 2026-09-04) |
| P03 duplicate suppression | **PASS** — local / CI |
| P03 failure isolation | **PASS** — local / CI |
| P03 production delivery | **NOT CONFIGURED / NOT VERIFIED** |
| P03 overall | **STAGING PASS / PRODUCTION PENDING** |

Production email remains a separate RED approval. Do not copy staging secrets into `taskio-v2`.

## Purpose

Firebase Functions send concise transactional messages when quote, funding, completion, release, refund, or chat events occur. Cloud Run payment/job APIs do **not** send email. A payment release, refund, or checkout must remain successful if email delivery fails.

Bodies stay data-minimised. Detailed job information belongs inside authenticated Taskio. Open/click tracking is not intentionally enabled.

## Runtime owner

Email sending is owned by **Firebase Functions** (`functions/email/`, triggered from `functions/index.js`) using **nodemailer SMTP**. The backend API and webhook services do not send mail.

Chat email remains on the same path, now gated by the same enable flag.

Staging E01 functions bind credentials with Firebase-native `defineSecret("SMTP_USER")` and `defineSecret("SMTP_PASS")` on `notifyHomeownerOnQuoteSubmitted` and `notifyHomeownerOnQuoteSubmittedUpdate` only.

## Safe default

`EMAIL_ENABLED` is unset or `false` unless explicitly set to `true` / `1` / `yes`.

When disabled:

- Core product flows continue.
- No SMTP network send occurs.
- Users are not shown an email error.
- Functions log `transactional_email_skipped` with reason `disabled`.

Enabled but missing SMTP / from-address / trusted `TASKIO_APP_URL` skips send with reason `not_configured`.

## Provider / config (names only)

Set on the **Functions** runtime (not Cloud Run):

| Name | Role |
|---|---|
| `EMAIL_ENABLED` | Must be `true` to send. Safe default `false`. |
| `SMTP_HOST` | SMTP hostname |
| `SMTP_PORT` | SMTP port (`465` uses implicit TLS) |
| `SMTP_USER` | Secret Manager secret ID (Firebase `defineSecret`) |
| `SMTP_PASS` | Secret Manager secret ID (Firebase `defineSecret`) |
| `CHAT_EMAIL_FROM` | Legacy from-address (still accepted) |
| `MAIL_FROM` | Preferred from-address if set; otherwise `CHAT_EMAIL_FROM` |
| `TASKIO_APP_URL` | Trusted **https** frontend origin for links (no path/query/userinfo) |

Do not commit values. Staging origin: `https://taskio-v2-staging.web.app`. Production must use the configured production origin, not a hardcoded staging URL.

Staging currently uses Postmark SMTP and `MAIL_FROM=Taskio <admin@taskio.com.au>`. Host/port and secret payloads are not documented.

## Essential MVP events

| ID | Event | Recipients | Intent |
|---|---|---|---|
| E01 | Quote received | Homeowner | An Expert submitted a quote (amount OK; no extra Expert PII) |
| E02 | Payment secured | Homeowner + Expert | Funds secured / held until approval. **Do not** say the Expert has been paid |
| E03 | Expert marked complete | Homeowner | Ready to review. **Do not** imply release |
| E04 | Payment released | Homeowner + Expert | Released to the Expert’s Stripe account. Bank payout timing is managed by Stripe. **Do not** claim bank payout completed |
| E05 | Refund completed | Homeowner + Expert | Taskio payment refunded; Expert: no payment due. **Do not** guarantee card settlement timing |
| E06 | Account/admin | — | **Not implemented.** No current product trigger needs it |

Customer-facing copy does not use “escrow”. In-app notification type `escrow_funded` is an existing Firestore key.

Only E01 is proven on hosted staging. E02–E05 remain implemented and locally tested.

## Failure behaviour

- `sendTransactionalEmail` never throws.
- Dispatch writes the in-app notification, then attempts email.
- SMTP / provider failure is logged (`transactional_email_failed`) without secrets, passwords, or full recipient addresses.
- Job and payment writes in the Cloud Run API are independent of Functions email.

## Duplicate / idempotency

Deterministic notification document IDs:

- Quote: `quote_{quoteId}`
- Funding: `funded_{jobId}` (Expert), `funded_homeowner_{jobId}`
- Complete: `complete_{jobId}`
- Release: `released_{jobId}` (Expert), `released_homeowner_{jobId}`
- Refund: `refund_{jobId}` (Expert), `refund_homeowner_{jobId}`

If `emailSentAt` is already set, email is not sent again. Chat keeps the existing 15-minute `lastEmailSentAt` throttle.

Hosted E01 produced one message. Duplicate suppression is proven in local/CI.

## Recipients and privacy

- Recipients come from Firebase Auth email, with profile email only as fallback.
- Client `to` / `cc` / `bcc` fields are ignored.
- Header breaks, list separators, and invalid addresses are rejected.
- Email bodies omit auth tokens, Stripe IDs, payment-method details, phone numbers, chat content, DOB, ABN, and Firebase UIDs.

Postmark is an **overseas** transactional-email provider. P06 legal review must cover APP 8 / cross-border processing before real-user production. Do not rewrite the Privacy Policy in this record.

## Staging (executed)

Rollback remains: staging `EMAIL_ENABLED=false` and redeploy only the required Functions. Production stays untouched until a separate RED approval.

Proven 2026-09-04 on `taskio-v2-staging`:

- Synthetic homeowner Auth/profile for `admin@taskio.com.au` (P03 test-only).
- Job `507iZTK6ZsEEqswzgoRN`; authentic E01 quote `EJCy55qxqQaHpZQ7iMUD`.
- Functions `notifyhomeowneronquotesubmitted-00007-kih` and `notifyhomeowneronquotesubmittedupdate-00007-xoc` (`SMTP_USER` / `SMTP_PASS` version **2**; both Ready=True after cleanup verification; not redeployed).
- Log `transactional_email_sent`; notification `emailSentAt` set; subject `New quote for TSK-6572`.
- Owner confirmed Outlook Inbox/Focused delivery; no Junk / Unverified warning; staging URL only; no duplicate.
- Earlier failed quote `rxnajk8qLRz2rp55N4rC` left in place as audit evidence (`send_failed` under the previous token).

Credential cleanup (2026-09-04, metadata only; no `versions access`; no destroy; no email send):

- `SMTP_USER` / `SMTP_PASS` version **2 ENABLED**; version **1 DISABLED**. These v2 versions are the only active Taskio staging SMTP secret versions.
- Legacy `taskio-staging-postmark-smtp-user` versions 1–3 **DISABLED**. Legacy `taskio-staging-postmark-smtp-pass` versions 1–2 **DISABLED**. Secret resources were not destroyed.
- Owner confirmation: obsolete 30 Aug SMTP token removed/revoked; current working SMTP token retained; Server API token not removed. No SMTP values recorded.

E02–E05 were not hosted in this proof.

## Production

Production SMTP / `EMAIL_ENABLED` remains **off** until a dedicated production approval. Do not copy staging secrets into `taskio-v2`.
