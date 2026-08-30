# Taskio transactional email

Essential status email for the private Melbourne MVP. Not marketing, newsletters, SMS, push, or CRM.

## Classification

| Gate | State |
|---|---|
| P03 email application logic | CODE COMPLETE |
| P03 email testing | LOCAL / CI READY |
| P03 real provider delivery | **NOT VERIFIED** |
| P03 staging delivery | **NOT VERIFIED** |
| P03 production delivery | **NOT VERIFIED** |

Templates and local tests are not proof of delivery. Production activation is a separate approval.

## Purpose

Firebase Functions send concise transactional messages when quote, funding, completion, release, refund, or chat events occur. Cloud Run payment/job APIs do **not** send email. A payment release, refund, or checkout must remain successful if email delivery fails.

## Runtime owner

Email sending is owned by **Firebase Functions** (`functions/email/`, triggered from `functions/index.js`) using **nodemailer SMTP**. The backend API and webhook services do not send mail.

Chat email remains on the same path, now gated by the same enable flag.

## Safe default

`EMAIL_ENABLED` is unset or `false` unless explicitly set to `true` / `1` / `yes`.

When disabled:

- Core product flows continue.
- No SMTP network send occurs.
- Users are not shown an email error.
- Functions log `transactional_email_skipped` with reason `disabled`.

Enabled but missing SMTP / from-address / trusted `TASKIO_APP_URL` skips send with reason `not_configured`.

## Provider / config (names only)

Set on the **Functions** runtime (not Cloud Run), when a later AMBER activation is approved:

| Name | Role |
|---|---|
| `EMAIL_ENABLED` | Must be `true` to send. Safe default `false`. |
| `SMTP_HOST` | SMTP hostname |
| `SMTP_PORT` | SMTP port (`465` uses implicit TLS) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / app password (secret) |
| `CHAT_EMAIL_FROM` | Legacy from-address (still accepted) |
| `MAIL_FROM` | Preferred from-address if set; otherwise `CHAT_EMAIL_FROM` |
| `TASKIO_APP_URL` | Trusted **https** frontend origin for links (no path/query/userinfo) |

Do not commit values. Staging example origin later: `https://taskio-v2-staging.web.app`. Production must use the configured production origin, not a hardcoded staging URL.

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

## Recipients and privacy

- Recipients come from Firebase Auth email, with profile email only as fallback.
- Client `to` / `cc` / `bcc` fields are ignored.
- Header breaks, list separators, and invalid addresses are rejected.
- Email bodies omit auth tokens, Stripe IDs, payment-method details, and phone numbers.

## Staging activation (AMBER — do not execute)

See the AMBER package at the end of this document. Rollback: `EMAIL_ENABLED=false`. Production stays untouched until a separate RED approval.

## Production

Production SMTP / `EMAIL_ENABLED` remains **off** until a dedicated production approval. Do not copy staging secrets into `taskio-v2`.

## Staging activation AMBER package (do not execute)

Prepared after GREEN implementation. **Not approved. Do not run.**

1. **Recommended provider:** keep the existing **nodemailer SMTP** interface. Do not add SendGrid/SES SDKs. Preferred default: **Microsoft 365 mailbox SMTP** (Taskio SPF already includes `spf.protection.outlook.com`). Alternative if mailbox SMTP is painful: **Postmark SMTP** (still nodemailer; transactional-first).
2. **Account/config:** one staging-only mailbox or Postmark server; TEST/synthetic recipients only.
3. **Secrets (names only):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` or `CHAT_EMAIL_FROM`, `TASKIO_APP_URL`, plus `EMAIL_ENABLED=true`.
4. **Cloud component:** Firebase Functions on `taskio-v2-staging` (`australia-southeast1`). Not Cloud Run. Not production `taskio-v2`.
5. **Enable:** staging-only `EMAIL_ENABLED=true` after secrets exist. Leave production unset/false.
6. **From-address:** a domain-aligned address such as `Taskio <noreply@…>` matching SPF/DKIM for that provider.
7. **One synthetic recipient:** the existing staging Homeowner Auth email (do not invent extra mailboxes unless needed).
8. **Representative tests (tiny):** one quote-received (E01) and one payment-secured (E02) on synthetic data. Stop. No marketing send.
9. **Rollback:** `EMAIL_ENABLED=false` on staging Functions. Do not delete SMTP secrets unless rotating.
10. **Production:** remains untouched. Hosting, Cloud Run, Stripe, signup, App Check, and analytics stay as they are.

Owner question (one): use Microsoft 365 SMTP as the staging default unless you prefer Postmark SMTP instead.
