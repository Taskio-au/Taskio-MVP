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
| P03 production delivery | **VERIFIED** (guarded operator proof, 2026-09-25) |
| P03 overall | **PRODUCTION PASS / COMPLETE / CLOSED** |

Production SMTP is configured and the guarded production proof is complete. Customer-facing email remains disabled on both E01 Functions (`EMAIL_ENABLED=false`); production remains frozen and is not open to real users.

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

Production SMTP is configured. Customer-facing `EMAIL_ENABLED` remains **false** until a separate real-user decision. Do not copy staging secrets into `taskio-v2`.

## P03G1 — production transactional-email plan (24 September 2026)

**P03 production email plan: COMPLETE.** This section records the original pre-execution plan. **P03G2 later completed under separate explicit RED owner approval on 25 September 2026; see the executed evidence below.** No production cloud query, secret read, email send, or deploy was performed during P03G1 itself.

### Provider architecture (from current code)

Production email expects **nodemailer SMTP**, not a Postmark HTTP API client and not a Cloud Run mailer. Package: `nodemailer` in `functions/package.json`. Postmark is the intended SMTP host. Sender init is lazy in `getTransporter()` only when `EMAIL_ENABLED` is true and host, port, user, and pass are present. Missing config returns `not_configured` and does not throw. `EMAIL_ENABLED` defaults false. `sendTransactionalEmail` never throws. Logs record event, jobId, messageId, and error message. They do not record secret values or full recipient addresses.

Secret names expected by the E01 functions: `SMTP_USER`, `SMTP_PASS` (`defineSecret`). Non-secret runtime names: `EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT` (465 = implicit TLS), `MAIL_FROM` (else `CHAT_EMAIL_FROM`), `TASKIO_APP_URL` (https origin only).

### Email paths

| Path | Trigger | Secrets bound | Staging-proven | P03 production PASS |
|---|---|---|---|---|
| `notifyHomeownerOnQuoteSubmitted` | Firestore create `quotes/{quoteId}` | `SMTP_USER`, `SMTP_PASS` | Yes (E01) | Required runtime, not the proof message |
| `notifyHomeownerOnQuoteSubmittedUpdate` | Firestore update `quotes/{quoteId}` | same | Deployed with E01; the proven send was create | Required with the create function so draft→submitted cannot bypass it |
| `notifyTradieOnEscrowFunded` | Firestore update `jobs/{jobId}` | none | No (E02–E05 local only) | Defer |
| Chat email inside `flagRiskyJobMessages` | Firestore create `jobs/{jobId}/messages/{messageId}` | none | No | Defer |
| OTP / welcome / waitlist / admin / support email | — | — | Not implemented | Out of P03 |

The dedicated operator proof function is `verifyTransactionalEmail`. Backend/API and webhooks do not send mail. Phone OTP is Firebase Auth, not this path.

### Staging proof (docs only, 2026-09-04, `taskio-v2-staging`)

E01 quote-received was exercised through the Functions trigger. Provider authentication was proven (SMTP secrets v2 enabled; log `transactional_email_sent`). Sending identity recorded as `MAIL_FROM=Taskio <admin@taskio.com.au>`. Recipient class was the operator mailbox used as the synthetic homeowner. Delivery was owner-confirmed in Outlook Inbox/Focused. Link/content rendering was the real E01 template (job ref, staging URL). A prior failed send remains as audit; retries and E02–E05 were not hosted-proven.

Recorded provider account facts to reconfirm in RED, not re-query here: Postmark account approved; sender `admin@taskio.com.au` activated; DKIM verified for `taskio.com.au`; Return-Path verified. SPF and DMARC were not recorded as verified.

### Production gaps identified before P03G2 (historical)

| Gap | Class |
|---|---|
| E01 implementation | Present in repo. Not a code gap. |
| Safe proof entrypoint that sends static copy without a quote/job/payment write | **RESOLVED.** `verifyTransactionalEmail` is fixed-copy, admin-protected, and write-free. |
| Production `SMTP_USER` / `SMTP_PASS` | **RESOLVED.** Production secrets are bound; values are not recorded. |
| `EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`, `TASKIO_APP_URL` on production Functions | **RESOLVED FOR P03.** Required E01 runtime deployed; customer sending remains `EMAIL_ENABLED=false`. |
| Production sender/domain still authorised | **RESOLVED.** Sender/domain were authorised for the production proof. |
| Which production Function revisions are live | **RESOLVED.** Both required E01 Functions and the guarded proof Function were active for verification. |
| One controlled production send and mailbox receipt | **PASS.** Exactly one proof send; owner receipt confirmed. |
| Provider dashboard acceptance / bounce check | **PASS.** Function log recorded `transactional_email_proof_sent`; provider accepted. |
| E02 “funds are held” wording and real-user Postmark disclosure | **LEGAL/COPY** (P06). Does not block the operator proof. |
| Monitoring of email failures | **OPTIONAL** for this proof. Existing logs are the signal. |

### Secret / env classification

| Name | Class |
|---|---|
| `SMTP_USER`, `SMTP_PASS` | **REQUIRED** on the functions that send |
| `EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`, `TASKIO_APP_URL` | **REQUIRED** to send. Absent or false → skip, no crash |
| `CHAT_EMAIL_FROM` | **OPTIONAL** fallback if `MAIL_FROM` is unset |
| Staging secret versions and legacy `taskio-staging-postmark-*` | **STAGING-ONLY**. Do not copy |
| Postmark Server API token | **DEPRECATED** for this path (SMTP only) |
| Exact SMTP host string and whether SPF/DMARC are already published | **UNKNOWN / MUST PREFLIGHT** |

Email is lazy. Production API does not read these values. A function that declares `secrets:` fails deploy if the secret resource is missing. A function that does not declare them skips send when user/pass are empty. Startup of the API stays healthy if email is unconfigured.

### MVP requirement

**P03 MUST HAVE:** production nodemailer SMTP bound to the activated sender, E01 create+update functions deployed with secrets and `EMAIL_ENABLED=false` until a later real-user decision, and one authentic operator send of static verification copy through that same SMTP stack.

**DEFER:** E02–E05, chat email, OTP/welcome/waitlist/admin mail. Do not deploy `notifyTradieOnEscrowFunded` or change `flagRiskyJobMessages` for this proof.

### Failure behaviour

Email is best-effort. Quote, job, and payment flows do not fail when SMTP fails. `sendTransactionalEmail` does not throw, so the `retry: true` trigger does not retry a swallowed SMTP error. After success, `emailSentAt` blocks a duplicate. Chat uses a 15-minute throttle. There is no dead-letter queue. No HIGH/CRITICAL product-flow blocker.

### Privacy

Send-path logs: **SAFE** for secrets and full addresses (unit-tested). Product templates put job title, reference, and amount in the provider message: **LOW / MEDIUM**, acceptable for later real E01, not acceptable as the production proof body. No OTP, token, Stripe ID, phone, or UID in the email bodies. Not HIGH. No code change in G1.

### P06

The operator proof is operational transactional mail to an owner-controlled mailbox. It is not blocked by P06 and it is not marketing. Real-user production email remains under the existing P06 APP 8 / overseas-processor note. Do not enable customer-facing `EMAIL_ENABLED` on E01 as part of the proof.

### Production proof design and executed evidence

Do not create a production quote, job, payment, or Auth user to prove email. The entrypoint is `verifyTransactionalEmail`.

**P03G1A (local, 24 September 2026): IMPLEMENTED.** Function `verifyTransactionalEmail` (HTTPS, `australia-southeast1`). It is an operator verification tool, not a customer feature. Disabled unless `EMAIL_PROOF_ENABLED` is exactly `true`. Recipient secret name: `EMAIL_PROOF_RECIPIENT` (no address in Git). Staging created and bound that secret in P03G1B; the value is not recorded. Sender is `MAIL_FROM` only. Subject and body are fixed in source. Customer mail stays on `EMAIL_ENABLED`.

**P03G1B (staging, 24 September 2026): PASS.** `verifyTransactionalEmail` was deployed alone to `taskio-v2-staging`, `australia-southeast1`, GEN_2. An existing staging admin Firebase ID token was used (`aud`/`iss` for `taskio-v2-staging`, custom claim `admin === true`). Unauthenticated POST returned **401 unauthenticated**. With the proof gate off, the admin POST returned **404 proof_disabled**. The gate was then set to exact `true` for one send. That POST returned **HTTP 200**. The Function log recorded `transactional_email_proof_sent`. Provider accepted: **YES**. **OWNER DELIVERY CONFIRMATION: PASS** for subject `Taskio production email verification`. Copy was the fixed non-sensitive proof body. Proof attempts: **exactly 1**. The gate was restored to **false**. A final admin POST returned **404 proof_disabled**. Additional sends after shutdown: **0**. The function remains **DEPLOYED** and **INERT**. `EMAIL_PROOF_RECIPIENT`, `SMTP_USER`, and `SMTP_PASS` stay bound. Secret values are not recorded. G1B customer emails: **0**. Application-data writes: **0**. Production interactions: **0**. Existing staging E01 `EMAIL_ENABLED=true` **pre-dated** G1B and was not changed, redeployed, or triggered.

**P03G2 (production, 25 September 2026): PASS.** Separate explicit RED owner approval was granted. An existing owner-controlled Google Firebase admin was used; no user was created or reset, no provider or signup configuration changed, no custom claim other than the pre-existing `admin=true` was involved, and no refresh tokens were revoked. A fresh Firebase ID token proved `aud=taskio-v2`, provider `google.com`, and `admin=true` without recording the token or unnecessary account metadata.

Production SMTP and the authorised sender/domain were configured. `verifyTransactionalEmail` was active with `SMTP_USER`, `SMTP_PASS`, and `EMAIL_PROOF_RECIPIENT` bound. Both E01 Functions stayed active with `EMAIL_ENABLED=false`. The proof gate was changed from `EMAIL_PROOF_ENABLED=false` to exact `true` only for the controlled proof. Exactly one authenticated POST returned **HTTP 200**. The Function logged `transactional_email_proof_sent` exactly once, provider acceptance was confirmed, and the owner confirmed mailbox receipt for subject `Taskio production email verification`. The message used the fixed non-sensitive source copy; no customer, job, quote, payment, OTP, caller-controlled content, HTML, CC, BCC, or attachment was included.

The proof gate was immediately restored to `EMAIL_PROOF_ENABLED=false`. A final authenticated admin POST returned **404 `proof_disabled`**. Additional proof sends after shutdown: **0**. Total production proof attempts: **exactly 1**. Customer emails caused by P03G2: **0**. Business-data writes: **0**. No high-risk privacy or security issue was identified. `verifyTransactionalEmail` remains **ACTIVE + INERT**; production customer email delivery remains disabled and production remains **FROZEN / NOT OPEN**.

That function is not a general-purpose admin mail endpoint. It must be:

- disabled by default
- operator/admin protected
- fixed subject: `Taskio production email verification`
- fixed non-sensitive body, with no customer, job, payment, or template data
- no arbitrary sender, message body, or real-user recipient
- recipient resolved only from secret `EMAIL_PROOF_RECIPIENT`, never from the caller
- no recipient address committed to Git
- no persistent business-state mutation
- not a normal production product feature

The production proof sends exactly one controlled verification message through the same nodemailer SMTP path, production `MAIL_FROM`, and production secrets.

Success: provider accepted the message, production sender identity was used, the owner mailbox received it, no bounce/reject, and logs contain no secret or high-risk PII.

### DNS / domain preflight (RED, read-only)

Reconfirm sender `admin@taskio.com.au`, domain `taskio.com.au`, DKIM, SPF, Return-Path, DMARC recommendation, provider account not in a sandbox that cannot prove delivery, and that the production server token is distinct from staging. Do not query them in G1.

`MAIL_FROM` candidate already recorded from staging: `Taskio <admin@taskio.com.au>`. Production `TASKIO_APP_URL` for any later product mail: `https://taskio.com.au`. The proof body must not depend on the SPA, because Hosting is maintenance.

### Execution sequence used for P03G2

1. RED read-only preflight on `taskio-v2`: secret **names**, Function state, sender/domain, and zero prior production proof sends.
2. Reuse the locally and staging-proven `verifyTransactionalEmail`; no customer trigger or business-data write.
3. Confirm production `SMTP_USER`, `SMTP_PASS`, and `EMAIL_PROOF_RECIPIENT` were bound without recording values.
4. Confirm all three required Functions active, both E01 gates `EMAIL_ENABLED=false`, and the proof gate initially `EMAIL_PROOF_ENABLED=false`.
5. Enable only `EMAIL_PROOF_ENABLED=true` on `verifyTransactionalEmail`.
6. Use a fresh validated production admin token for exactly one controlled send.
7. Confirm HTTP 200, the single `transactional_email_proof_sent` log, provider acceptance, and owner mailbox receipt.
8. Restore `EMAIL_PROOF_ENABLED=false`, then prove final authenticated **404 `proof_disabled`** with no additional send.

Do not deploy API, Hosting, Auth, App Check, rules, Stripe, GA4, or optional email functions.

### Rollback

Function revision and `EMAIL_ENABLED=false` roll back independently of the Postmark account, DKIM, and domain. Unbind or disable the secret version only if the owner asks. Do not delete the provider account, domain, or DKIM.

### NO-GO

Stop if the sender is unverified, secret names are ambiguous, the project is not `taskio-v2`, the recipient is not owner-controlled, any function would email a real user, the proof needs a real customer/job/payment write, logs would expose secrets or high-risk PII, the provider is sandbox-only, live Function state differs from the preflight, or required DNS/sender auth is incomplete.

### P03 production PASS

All of the following, and nothing optional:

- Production SMTP provider configured on `taskio-v2`.
- Sender/domain authorised for `admin@taskio.com.au` / `taskio.com.au`.
- E01 functions deployed with secrets and customer send still off (`EMAIL_ENABLED=false`).
- One authentic controlled production send of the static verification message succeeds.
- Delivery confirmed to the owner-controlled mailbox.
- No bounce or reject.
- No high-risk privacy or security issue in that send.
- Optional E02–E05 and chat email are not required.

### P07

P07-07 closes when P03 production PASS is recorded. P07 does not repeat the send.

### P03G2 — Configure + prove production transactional email

**PRODUCTION PASS (25 September 2026).** Separate RED owner approval was granted and the bounded proof completed.

May include: production secret create/bind, deploy of the verification function and the two E01 functions only, provider/runtime config, one controlled send, docs.

Must not include: Auth, App Check, Hosting, API, rules, Stripe, GA4, `pilotSettings`, Expert data, launch, or open-demand.

Staging and production validation are complete. G2 did not send via a quote and did not enable customer-facing E01 mail. Real-user transactional disclosure remains P06/P09, not this proof. The P07 production-email blocker is **CLOSED** because P03 production PASS is recorded; P07 itself remains open for its other blockers.
