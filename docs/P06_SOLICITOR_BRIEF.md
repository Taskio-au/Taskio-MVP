# P06 solicitor brief

**Purpose:** Practical brief for Australian legal review of Taskio’s draft Terms of Use, Privacy Policy, and launch practices.

**Not:** legal advice, a Privacy Act determination, or approved production wording.

**Companion:** `docs/P06_OWNER_DECISIONS.md` (owner facts, working positions, solicitor question register).

**Repo state when this brief was prepared:** `develop` at `325217ecd23b958df65e8622afe03bcbf60f59dc`. Production Firebase `taskio-v2` is frozen. Do not treat staging proofs as live-user operation.

Do not include secrets or real user personal information in advice back to engineering. Staging journey IDs in the tracker are synthetic test artefacts.

---

## A. What Taskio is

Taskio is a web marketplace for **small indoor home jobs** in Inner Melbourne. The product connects **Homeowners** (Clients) with **independent Experts** (tradies).

**Working owner position (not legal advice):** Taskio intends to be a marketplace/intermediary, not the contracting tradesperson, not an employer, and not a bank/trustee/custodian/regulated escrow provider.

Draft Terms currently say Taskio is a “marketplace platform connecting Clients and Experts” and that Taskio is not a bank, payment institution, trustee, or custodian. They do **not** clearly state that the underlying job contract is solely between Homeowner and Expert.

Live draft pages (staging; production Hosting is maintenance-only):

- Terms: `frontend/src/pages/TermsPage.jsx` (route `/terms`)
- Privacy: `frontend/src/pages/PrivacyPolicyPage.jsx` (route `/privacy`)
- Banner: `frontend/src/components/LegalDraftBanner.jsx` — **Draft — not final**

---

## B. Melbourne launch scope

- Intended first cohort: Inner Melbourne, frozen **8 suburbs**, Phase 1 catalog only.
- Controlled launch (tracker P11) is **blocked** until legal/privacy review (P06) and other launch gates pass.
- Geography in copy is a **service area**, not a governing-law clause. **Governing law is missing.**

---

## C. Invite-only model

- Public signup is **closed** (`TASKIO_PUBLIC_SIGNUP_ENABLED=false`; Auth signup disabled on staging).
- Founding Experts are **invited**.
- Guest post-job OTP architecture exists behind a flag and is **not** the current public path.
- Landing promotes invite-only / log in to post.

---

## D. User roles

| Role | Function |
|---|---|
| Homeowner / Client | Posts jobs, compares quotes, funds via Stripe Checkout, approves completion, can cancel funded unreleased jobs (refund path). |
| Expert / tradie | Invited, completes profile (including 18+ DOB gate, phone, expertise, ABN where required, Stripe Connect), quotes invited jobs, marks complete, receives Connect transfer then later Stripe bank payout. |
| Admin | Manual Expert verify/unverify; user deletion execute; support/dispute tooling. |

---

## E. Job / quote / payment flow

1. Homeowner posts a Phase 1 job (photos/description allowed).
2. Admin invites an Expert to quote (no AI matching).
3. Expert submits a quote (optional AI draft assist).
4. Homeowner accepts → Stripe Checkout Session (TEST in staging).
5. Payment succeeds → job funded (internal state key `in_escrow`; user-facing copy generally avoids “escrow”).
6. Expert marks complete → Homeowner **Approve & Release**.
7. Platform creates a Stripe Connect **transfer** to the Expert connected account.
8. Stripe later pays the connected account’s bank (**payout**). Transfer ≠ payout.

Platform fee in product: **10%** (founding-Expert fee profile also exists). **Draft Terms do not state the fee.**

---

## F. Stripe Connect / payment architecture

- Card details: **Stripe Checkout**. Taskio states it does not store full card numbers.
- Staging proven on Stripe **TEST** (`livemode=false`): Checkout → Connect transfer → connected balance → automatic standard **bank payout**.
- Production live Stripe is **off** / frozen.
- Refund of funded **unreleased** jobs: full Stripe refund; **no** Connect transfer (staging P02).
- After release, product does **not** automatically refund the Homeowner.

Please do not describe Taskio as holding client money as a trustee unless you conclude that is legally accurate. Current **intent** is the opposite.

---

## G. Refund / release model

**Working owner position (subject to ACL review):**

- **Before release:** eligible funded/unreleased amounts can be refunded.
- **After release:** no automatic refund; manual support/dispute.

Draft Terms already describe funded-unreleased refunds and no automatic refund after release, plus broad Taskio rights to pause/review/release/refund/investigate. Those clauses are **unfair-terms / ACL candidates** for your review (see Q).

---

## H. Expert verification process

What the product actually does:

- Invite-only founding Experts.
- Admin sets `verified=true` (manual).
- Eligibility helpers: profile complete, phone, 18+ DOB, expertise, location, Stripe Connect onboarding complete.
- ABN stored; ABR lookup if configured (optional; can 501 without GUID).
- Admin trust-bucket / risk-scoring **assists admins**. Code comments: automation **does not auto-verify**.

What the product does **not** do:

- Government licence check
- Insurance verification
- Criminal history check
- Quality guarantee

Landing nevertheless uses **“verified Experts”** / “invited and verified by Taskio.” Catalog copy includes “Mount a TV **safely**.” Please advise what is supportable.

---

## I. Phase 1 categories / exclusions

In catalog (`shared/expertiseCatalog.js`): TV/shelves/mirrors mounting, hanging, curtains/blinds, furniture assembly, minor repairs, wall patching, cosmetic silicone, apartment make-good.

Stated product exclusions in copy: electrical / hidden-cable work; waterproofing.

**Please advise** whether remaining items (especially TV mounting, wet-area silicone, blinds, make-good) create Victorian licensing exposure the platform should warn about or exclude. There is no licence engine on free-text job descriptions.

---

## J. Personal-data categories

Collected or derived in product (not an exhaustive legal characterisation):

**Homeowners:** name, email, phone, suburb/location, job details, photos/files, chat, reviews, payment metadata, support content, Firebase UID, timestamps.

**Experts:** above plus profile photo, expertise, ABN + lookup status, DOB, Stripe Connect identifiers/status, payout metadata, admin verified flag.

**Admins:** account + audit/activity (actor, action, userAgent).

**Technical:** App Check / reCAPTCHA tokens (staging), GA4 coarse events (staging; denylist of PII/raw IDs/exact amounts), logs with claimed PII redaction, optional Gemini prompt text if AI is enabled.

**Not found in product:** TFNs, health-service records, credit-reporting data. Owner must confirm no off-repo handling (`docs/P06_OWNER_DECISIONS.md` F12–F13).

Draft Privacy Policy describes this only generically (“account details, task and quote content, payment-related metadata…”) and names **Stripe** for cards. It does **not** list DOB, ABN, photos, chat, GA4, Postmark, App Check, Firebase/Google, or Gemini.

---

## K. Processors / providers

| Provider | Role | Named in Privacy Policy? |
|---|---|---|
| Firebase / Google Cloud | Auth, Firestore, Storage, Hosting, Functions, logs. Staging/production services use `australia-southeast1` in tracker; **global Google processing not attested** | No |
| Stripe / Stripe Connect | Checkout, refunds, transfers, payouts | Stripe named for cards only |
| Postmark | Transactional email (staging configured; production **not** configured) | **No** — already flagged for APP 8 review |
| Google Analytics 4 | Product funnel (staging `G-SZ7RZDKTJY`; production **OFF**) | Generic “coarse events”; **GA4 not named** |
| reCAPTCHA Enterprise / App Check | Bot/abuse (staging Firestore + Storage enforced; Auth off) | **No** |
| ABR ABN lookup | Optional Expert ABN check | **No** |
| Gemini (Google) | Optional draft assist; hidden on `fallback` | **No** |
| Microsoft 365 / Outlook | Operator mailbox used to **receive** staging proof email — not an in-app processor | n/a |

**Do not infer destination countries from brand names.** Location verification is a separate legal/ops task.

---

## L. Cross-border issues

**Actual data flows** can include Postmark, Google (Firebase, GA4, reCAPTCHA, optional Gemini), and Stripe.

**Current user disclosure** names Stripe (cards) and generic analytics. Overseas processing is **not** described.

Engineering has already flagged **Postmark / APP 8** as a P06 item. Please advise required disclosure. This brief does **not** conclude APP 8 liability.

---

## M. Analytics / App Check / email / AI

**Analytics (staging):** GA4; no Google Signals; no ads personalisation; Enhanced Measurement off; no PII / raw Taskio IDs / exact payment amounts; canonicalised page location/referrer; **2-month** retention on the staging property. Production analytics **must stay off** until privacy wording/config are approved.

**App Check:** reCAPTCHA Enterprise; Firestore + Storage enforcement on staging; Auth enforcement **off** (out of approved MVP scope).

**Email (E01–E05):** sparse transactional templates in `functions/email/templates.js`. Footer: “This is a transactional message from Taskio.” No unsubscribe, no promo/upsell found. Only E01 hosted-proven. E02 says “Funds are held until you approve.” **Spam Act confirmation requested** — engineering should **not** auto-add unsubscribe to factual transactional mail unless you advise it.

**AI:** drafting assistants only (job description, quote). Matching and verification remain human. Admin risk scores may influence review routing; they do not auto-verify. Flag possible **automated-decision transparency** rules from **10 December 2026** if scoring materially affects user interests.

---

## N. Deletion / retention implementation

Internal schedule: `docs/PRIVACY_RETENTION_AND_DSAR.md` (support/chat/audit 24 months; payment metadata 7 years; abandoned onboarding 90 days). **Automated purge jobs were not found.**

User deletion: request + cooling-off + **manual admin execute**. Execute **anonymises** selected profile fields and **disables** Firebase Auth. It does **not** hard-delete Auth, jobs, chat, Storage files, Stripe records, or analytics. Financial records are intentionally retained per code comments. DOB is not clearly cleared in the execute path.

Draft Privacy: deletion “review through support.” Expert UI has a danger zone describing cooling-off and legal-record keeping.

**Mismatch:** policy/UI vs actual implementation. Please advise what “delete” must mean before Privacy claims are finalised.

---

## O. Current Terms / Privacy status

- Pages exist; landing footer links; staging Hosting is **noindex**.
- Banner: draft, not for real users; entity/ABN/ACL/liability/insurance/dispute **unresolved**.
- Effective date **April 2026**; no version IDs.
- Login and invited-account activation **lack** Privacy/Terms links.
- Payments and Support pages link **Terms** only, not Privacy.
- Legal identity (entity, ABN, ACN, address, public privacy email, governing law) = **MISSING** in legal pages. Operational sender `admin@taskio.com.au` exists for email; it is **not** published as privacy contact on the Privacy page. Owner must say whether it should be (F06–F08).

---

## P. Known inconsistencies (for review, not rewrite)

1. “Pay through Taskio” vs “not a payment institution.”
2. E02 “Funds are held” vs Terms “does not act as a custodian.”
3. Internal `in_escrow` vs user-facing avoidance of “escrow.”
4. “Verified Experts” vs manual eligibility checks only.
5. “Mount a TV safely” vs no safety certification.
6. 10% fee in UI vs silence in Terms.
7. Privacy “deletion via support” vs Expert self-serve request + anonymise-only execute.
8. Privacy generic data list vs DOB/ABN/photos/chat/GA4/Postmark/App Check/AI.
9. ACL mentioned in draft Terms while banner says ACL wording unresolved.
10. Continued-use acceptance of updated Terms; broad suspend and payment-intervention rights.

---

## Q. Exact legal questions requiring advice

Please advise on each (owner facts F01–F15 will be supplied separately):

1. Is Taskio an APP entity? If possibly exempt, how to word **voluntary** APP-style compliance?
2. APP 8 / overseas disclosure — which processors must be named, and how, without guessing countries?
3. Entity/ABN/address/contact disclosure requirements for Terms and Privacy.
4. Marketplace contract structure and the Homeowner–Expert job contract.
5. Payment-law characterisation; permitted wording for fund / hold / release / payout.
6. ACL consumer guarantees; unfair contract terms in the draft (unilateral variation, termination/suspension, payment intervention, after-release refunds).
7. Cancellation/refund rules before vs after release.
8. Liability, indemnities, warranties — currently largely **absent**.
9. Dispute resolution and governing law.
10. Expert independent-contractor vs employment risk.
11. Supportable “verified Expert” / trust / safety claims.
12. Licensing responsibility and Phase 1 catalog edges.
13. Insurance wording if Taskio does not verify Expert insurance.
14. Age eligibility (Experts 18+ in code; Homeowners undecided; working recommendation 18+).
15. Spam Act treatment of E01–E05.
16. Deletion/retention: what the Privacy Policy may claim vs current anonymise-only execute.
17. Privacy complaints contact and process.
18. NDB / incident notification posture (do not assume NDB duty until applicability is confirmed).
19. Automated decision-making transparency (from 10 December 2026) vs admin risk scoring.
20. AI/Gemini (and reCAPTCHA, GA4, Firebase) disclosure if those features are on at launch.

**Requested output from counsel:** marked-up or replacement Terms and Privacy (when owner identity facts are available), a short “do/don’t say” list for landing/payments/email, and a list of product changes that are legally required vs optional.

Engineering will **not** implement copy or retention changes until owner + solicitor approval is recorded. That implementation is tracker **P09**, which cannot PASS before **P06**.
