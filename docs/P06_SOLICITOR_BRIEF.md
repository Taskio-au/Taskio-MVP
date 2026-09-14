# P06 solicitor brief

**Purpose:** Practical brief for Australian legal review of Taskio’s draft Terms of Use, Privacy Policy, and launch practices.

**Not:** legal advice, a Privacy Act determination, or approved production wording.

**Companion:** `docs/P06_OWNER_DECISIONS.md` (owner facts, working positions, solicitor question register). **Reconciliation matrix:** `docs/P06_REMEDIATION_MATRIX.md`.

**Last documentation update:** 14 September 2026 (P06A current-state reconciliation). Production Firebase `taskio-v2` is frozen. Local product code is **not** cloud-activated. Auth `disabledUserSignup=true` on staging/production is unchanged. Do not treat staging proofs as live-user operation.

The owner wants **focused advice for two stages**, deliberately avoiding unnecessary pre-revenue corporate/insurance cost while still managing real legal/risk exposure. This is **not** a request to ignore liability, privacy, ACL, insurance, or safety.

**STAGE 1 — CONTROLLED PILOT:** Can Taskio reasonably conduct the **Controlled Open-Demand Pilot** under the current sole-trader structure, and what **minimum** legal/insurance controls should be in place?

Current **intended** Stage 1 operating model (code; not production-enabled):

- Homeowner posting **CLOSED** until a supply gate **and** explicit owner OPEN. CLOSED/PAUSED use a **homeowner waitlist**. OPEN is public supported homeowner signup/posting (no invitation), still Phase 1 + Inner Melbourne + auth.
- Expert onboarding is **independent**. It may be **OPEN** (public Expert applications, pending Admin Verify) **before** homeowner posting opens. It may later switch to **WAITLIST**. Public apply is **not** auto-approval.
- High-touch support; modest-value household jobs; no licensed electrical/plumbing categories in the catalog.

**STAGE 2 — BROADER SCALE:** At what point should Taskio transition to a Pty Ltd / company structure, and what legal/insurance changes should accompany broader public operation?

Pty Ltd incorporation is **not** treated as an automatic tracker launch blocker. If you advise incorporation is required or materially preferable **before** the pilot, that must be addressed **before P10/P11**. A sole trader does **not** have limited liability. A later Pty Ltd does **not** eliminate personal or director liability.

Do not include secrets or real user personal information in advice back to engineering. Staging journey IDs in the tracker are synthetic test artefacts.

---

## A. What Taskio is

Taskio is a web marketplace for **small indoor home jobs** in Inner Melbourne. The product connects **Homeowners** (Clients) with **independent Experts** (tradies).

**Owner-confirmed working identity (not yet on legal pages; not a company):**

- **Saeed Zafari trading as Taskio**
- Entity type: **individual / sole trader**
- ABN: **15 729 254 373**
- ACN: **not applicable** while a sole trader
- Do **not** describe Taskio as **Taskio Pty Ltd** or as **a company**

**Owner structure decision (lean):** remain a sole trader for the initial **controlled validation pilot** unless you advise incorporation first. This is a validation-stage decision and **does not** mean Taskio intends to remain a sole trader indefinitely. Pty Ltd is **not** automatically required by the tracker before the pilot. Conversion triggers (before broader scaling) are in `docs/P06_OWNER_DECISIONS.md` §6 — business reviews, not statutory thresholds, and not arbitrary revenue gates.

**Working owner position (not legal advice):** Taskio intends to be a marketplace/intermediary, not the contracting tradesperson, not an employer, and not a bank/trustee/custodian/regulated escrow provider.

Draft Terms currently say Taskio is a “marketplace platform connecting Clients and Experts” and that Taskio is not a bank, payment institution, trustee, or custodian. They do **not** clearly state that the underlying job contract is solely between Homeowner and Expert.

Live draft pages (staging; production Hosting is maintenance-only):

- Terms: `frontend/src/pages/TermsPage.jsx` (route `/terms`)
- Privacy: `frontend/src/pages/PrivacyPolicyPage.jsx` (route `/privacy`)
- Banner: `frontend/src/components/LegalDraftBanner.jsx` — **Draft — not final**

---

## B. Melbourne launch scope

- Intended first cohort: Inner Melbourne, frozen **8 suburbs**, Phase 1 catalog only.
- **CONTROLLED PILOT** (owner definition): Inner Melbourne; Phase 1 only; Expert applications may be publicly OPEN with **manual Admin Verify** (not auto-approval) or WAITLIST; every initial job monitored; high-touch support; modest-value household jobs; no licensed electrical/plumbing.
- **CONTROLLED OPEN-DEMAND does not open posting immediately.** Before the supply gate: landing **may** be public; Expert recruitment **may** run; homeowners **may** waitlist / register interest; **real homeowner task posting stays CLOSED or capacity-gated**. Do not buy homeowner traffic into an under-supplied marketplace.
- **Posting activation gate (all required):** ~**15 active launch-ready Experts**; ideally **4–5 launch-ready Experts per enabled Phase 1 category**; adequate approved-geography coverage; other real-user launch gates satisfied; **owner/admin explicitly activates** posting. The number 15 alone is not enough if coverage is weak.
- **After activation:** homeowners may use the public supported posting flow without a manual invitation, still limited by geography, categories, capacity, auth, and approved legal terms. **After-activation floor:** ~**12** launch-ready Experts — if supply or category coverage falls below target, admin flags **WATCH / PAUSE** (pause acquisition, waitlist, narrow categories/geography, recruit).
- Home-based in **Victoria**. Public street address should not be unnecessarily published. **Exact public/service address requirements are for your advice.** Residential street address is **not** in this repo and must not go into public legal text without an explicit legal requirement and owner approval.
- Contacts: privacy **admin@taskio.com.au** (formal privacy contact: **yes**); support **support@taskio.com.au**.
- Controlled launch (tracker P11) is **blocked** until legal/privacy review (P06) and other launch gates pass.
- Geography in copy is a **service area**, not a governing-law clause. **Governing law is missing.**

---

## C. Access model (code vs cloud)

- **Intended launch (code):** when homeowner state is OPEN, public supported homeowner signup/posting with normal Firebase authentication; no homeowner invitation. When CLOSED/PAUSED, homeowner waitlist. Expert OPEN allows public Expert account creation (pending review). Expert WAITLIST uses a separate waitlist. See `docs/P06_REMEDIATION_MATRIX.md` §1.
- **Current cloud:** `TASKIO_PUBLIC_SIGNUP_ENABLED` is the Expert enrollment kill switch; Identity Toolkit `disabledUserSignup=true` on staging/production still blocks **brand-new** Firebase users. P07/P10 must prove public account paths. Enabling Auth signup does **not** approve an Expert.
- Guest post-job OTP architecture exists behind a flag and is **not** the current public path.
- Landing copy still includes **stale** “invited and verified — not an open directory” (flagged for P09 after your wording).

---

## D. User roles

| Role | Function |
|---|---|
| Homeowner / Client | Posts jobs (when OPEN), waitlists when CLOSED/PAUSED, compares quotes, funds via Stripe Checkout, approves completion, can cancel funded unreleased jobs **before work starts** (refund path). After work starts, cancel is blocked in-product; after release, no automatic refund. |
| Expert / tradie | May **apply publicly** when Expert onboarding is OPEN (or waitlist when WAITLIST). Completes profile (18+ DOB gate, phone, requested expertise, ABN where required, Stripe Connect, `acceptingJobs`, `serviceAreas[]`). Quotes only after Admin Verify + eligibility. Marks complete; receives Connect transfer then later Stripe bank payout. |
| Admin | Manual Expert verify/unverify; approve requested expertise; user deletion execute; pilot settings; support/dispute/refund/release tooling. |

**Please advise** on contractor/marketplace relationship wording, Taskio verification representations, Expert responsibilities, ABN/business declarations, payment relationship, tax responsibilities, insurance wording, licensing responsibility, and independent service-provider relationship. Do not expect engineering to answer these legally.

---

## E. Job / quote / payment flow

1. Homeowner posts a Phase 1 job (photos/description allowed).
2. Admin invites an **eligible** Expert to quote (no AI matching). Eligibility uses Taskio-approved expertise, not merely requested categories.
3. Expert submits a quote (optional AI draft assist exists in code; **intended OFF at launch**).
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

**Product fact (14 September 2026):** Homeowner self-serve cancel with Stripe refund applies when the job is funded/unreleased **and work has not started**. Once status is `IN_PROGRESS`, `/cancel` returns 409. Homeowner “report issue” is available while `COMPLETED` and payment still unreleased. After release, no automatic Client refund. Admin has manual refund/release/dispute tools. See `docs/P06_REMEDIATION_MATRIX.md` §9. Please advise on after-start cancellation, no-show, partial completion, variations, chargebacks, Expert withdrawal, and abandoned jobs — **do not invent policy in product**.

---

## H. Expert verification process

What the product actually does:

- Expert onboarding **OPEN** or **WAITLIST** (independent of homeowner posting).
- New Expert: account/onboard allowed when OPEN + signup kill-switch; `verified=false`; requested expertise only; `expertiseApproved=[]`.
- Admin sets `verified=true` (manual) and, on Verify, explicitly approves currently requested Phase 1 categories.
- Later category adds require `PUT /api/admin/users/:uid/expertise/approve`.
- Eligibility helpers: profile complete, phone, 18+ DOB, **approved** expertise, location/`serviceAreas[]`, `acceptingJobs`, Stripe Connect onboarding complete.
- ABN stored; ABR lookup if configured (optional; can 501 without GUID).
- Launch-ready is **derived** (not a stored flag). Admin Verify must not write `launchReady`.
- Admin trust-bucket / risk-scoring **assists admins**. Code comments: automation **does not auto-verify**.

What the product does **not** currently do in code:

- Government licence check
- Insurance verification (no certificate workflow in product yet)
- Criminal history / police check
- Identity-document verification
- Qualification / government certification check
- Quality / workmanship guarantee

**“Taskio-approved expertise”** must not be described as licensed, qualified, insured, or certified.

Landing nevertheless uses **“verified Experts”** and still says “invited and verified by Taskio — not an open directory anyone can join.” Catalog copy includes “Mount a TV **safely**.” Expert signup says “protected payments” and “verified reviews.” Please advise what is supportable for the pilot based on checks actually performed.

**Owner insurance working position (lean):** Taskio platform/operator insurance is **NOT YET CONFIRMED / BROKER REVIEW REQUIRED**. Do not treat Taskio as insured or as needing no insurance. Before real users, the owner will obtain a **focused** AU broker discussion/quote on **minimum sensible pilot** cover (questions may include public liability, cyber, professional/management/platform-related cover — these are questions, not predetermined mandatory policies). Broad/expensive cover is **not** an automatic launch blocker.

**Expert insurance (lean):** collect status; ask whether they hold current public-liability insurance; if they say they are insured, Taskio may request a certificate of currency; “insurance verified” **only** if Taskio actually checks current evidence. Do **not** imply Taskio provides platform-wide insurance, that every Expert is insured, or that a policy covers a specific job. Whether insurance is **mandatory for all founding Experts** is for **owner + solicitor + broker**. Higher-risk categories may later require verified insurance.

---

## I. Phase 1 categories / exclusions

In catalog (`shared/expertiseCatalog.js`): TV/shelves/mirrors mounting, hanging, curtains/blinds, furniture assembly, minor repairs, wall patching, cosmetic silicone, apartment make-good.

Stated product exclusions in copy: electrical / hidden-cable work; waterproofing.

**Please advise** whether remaining items (especially TV mounting, wet-area silicone, blinds, make-good) create Victorian licensing exposure the platform should warn about or exclude. There is no licence engine on free-text job descriptions.

---

## J. Personal-data categories

Collected or derived in product (not an exhaustive legal characterisation):

**Homeowners:** name, email, phone, suburb/location, job details, photos/files, chat, reviews, payment metadata, support content, Firebase UID, timestamps.

**Experts:** above plus profile photo, requested expertise, Taskio-approved expertise, ABN + lookup status, DOB, Stripe Connect identifiers/status, payout metadata, admin verified flag, `acceptingJobs`, `serviceAreas[]`.

**Waitlists (new):** see §J1–J2. Not in draft Privacy.

**Admins:** account + audit/activity (actor, action, userAgent).

**Technical:** App Check / reCAPTCHA tokens (staging), GA4 coarse events (staging; denylist of PII/raw IDs/exact amounts), logs with claimed PII redaction, optional Gemini prompt text if AI is enabled.

**Owner-confirmed (not a Privacy Act conclusion):** Taskio does **not intentionally collect** TFNs, health information, or consumer credit-reporting information. ABNs are not TFNs. Stripe processing does not mean Taskio intentionally collects consumer credit-reporting information. Users may incidentally submit sensitive information in free text/support; Taskio does not request it.

**Off-platform PI:** Limited handling is expected, including potentially `admin@taskio.com.au`, `support@taskio.com.au`, Microsoft 365 / Outlook, manual Expert verification correspondence, support/dispute evidence, insurance certificates if collected, and temporary operator files. Do **not** state that all personal information exists only in Firebase, or that no off-platform processing exists. Minimise copies; avoid uncontrolled spreadsheets/downloads. Exact off-repo storage/access/retention must be documented before controlled launch under **P08/P09**.

Draft Privacy Policy describes this only generically (“account details, task and quote content, payment-related metadata…”) and names **Stripe** for cards. It does **not** list DOB, ABN, photos, chat, GA4, Postmark, App Check, Firebase/Google, Gemini, Microsoft 365, waitlists, or off-platform artefacts.

---

## J1. Homeowner waitlist

Public `POST /api/pilot-waitlist` → Firestore `pilotWaitlist` (Admin SDK). Client rules deny all read/write.

Stored: normalized email; optional suburb; source; createdAt/updatedAt; `consentVersion=pilot-waitlist-contact-v1`; `consentAcceptedAt`. Server requires `consentAccepted === true` (strict boolean). Idempotent hashed doc id; no email enumeration.

**Consent meaning:** contact about Melbourne **pilot availability**. **Not** generic marketing consent.

Please advise Privacy disclosure, retention, access/deletion, marketing distinction, and operational owner. Do **not** treat current consent UX as legally sufficient.

---

## J2. Expert waitlist

Public `POST /api/expert-waitlist` → `expertWaitlist` (separate collection). Same strict consent and Firestore deny pattern.

Stored: normalized email; optional canonical Phase 1 category; optional canonical Inner Melbourne suburb; source; timestamps; `consentVersion=expert-waitlist-contact-v1`; `consentAcceptedAt`.

**Consent meaning:** contact about **becoming a Taskio Expert**. Keep this purpose distinct from the homeowner waitlist.

Same disclosure/retention/deletion questions as J1.

---

## J3. Reviews

After **paid release**, homeowner and accepted Expert may each submit one rating/text within 14 days (double-blind until both submit or the window ends). Public Expert profile shows reviews without reviewer PII and a “Verified Taskio review” badge. No in-product moderation/edit/delete of published reviews was found. Please advise whether “verified review” is supportable and what moderation/takedown process is required.

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
| Gemini (Google) | Optional draft assist in code; owner position **OFF at controlled launch** unless disclosure/config/legal review complete | **No** |
| Microsoft 365 / email | Operator mailbox / support / manual workflows — **expected off-platform PI handling**, not only staging proof receipt | **No** |

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

**AI:** drafting assistants exist in code (job description, quote) but owner position is **OFF at controlled launch** unless approved privacy disclosure, provider configuration, and legal/privacy review are complete. AI remains non-essential. Matching and verification remain human. Admin risk scores may influence review routing; they do not auto-verify. Flag possible **automated-decision transparency** rules from **10 December 2026** if scoring materially affects user interests.

---

## N. Deletion / retention implementation

Internal schedule: `docs/PRIVACY_RETENTION_AND_DSAR.md` (support/chat/audit 24 months; payment metadata 7 years; abandoned onboarding 90 days). **Automated purge jobs were not found.**

User deletion: request + cooling-off + **manual admin execute**. Execute **anonymises** selected profile fields and **disables** Firebase Auth. It does **not** hard-delete Auth, jobs, chat, Storage files, Stripe records, or analytics. Financial records are intentionally retained per code comments. DOB is not clearly cleared in the execute path.

Draft Privacy: deletion “review through support.” Expert UI has a danger zone describing cooling-off and legal-record keeping.

**Mismatch:** policy/UI vs actual implementation (including **waitlist** records, which have no deletion path described). Please advise what “delete” must mean before Privacy claims are finalised.

---

## O. Current Terms / Privacy status

- Pages exist; landing footer links; staging Hosting is **noindex**.
- Banner: draft, not for real users; entity/ABN/ACL/liability/insurance/dispute **unresolved**.
- Effective date **April 2026**; no version IDs.
- Login and invited-account activation **lack** Privacy/Terms links.
- Payments and Support pages link **Terms** only, not Privacy.
- Legal identity is **recorded in the owner pack** (sole trader; ABN; contacts) but **not yet published** on `/terms` or `/privacy`. Public street address remains **withheld**. Governing law is missing.

---

## P. Known inconsistencies (for review, not rewrite)

1. “Pay through Taskio” vs “not a payment institution.”
2. E02 “Funds are held” vs Terms “does not act as a custodian.”
3. Internal `in_escrow` vs user-facing avoidance of “escrow.”
4. “Verified Experts” vs Admin boolean + eligibility only; landing still says invite-only / not an open directory while Expert OPEN is the intended apply path.
5. “Mount a TV safely” vs no safety certification.
6. 10% fee in UI vs silence in Terms.
7. Privacy “deletion via support” vs Expert self-serve request + anonymise-only execute.
8. Privacy generic data list vs DOB/ABN/photos/chat/GA4/Postmark/App Check/AI/**waitlists**.
9. ACL mentioned in draft Terms while banner says ACL wording unresolved.
10. Expert signup “protected payments” / “verified reviews” vs delayed Stripe release and job-linked reviews only.
11. Identity recorded in owner pack vs still absent from draft `/terms` and `/privacy`.
12. After-start cancel blocked in code vs Terms “funded unreleased can be refunded” without that qualifier.

---

## Q. Exact legal questions requiring advice

Please advise on each (owner facts F01–F15 are now recorded in `docs/P06_OWNER_DECISIONS.md`):

1. Is Taskio an APP entity given sole-trader identity, **pre-launch / validation** stage, previously recorded turnover category **AUD 3 million or less** (fact input only — **not** an exemption conclusion), and off-platform Microsoft 365 / support handling? If possibly exempt, how to word **voluntary** APP-style compliance?
2. APP 8 / overseas disclosure — which processors must be named, and how, without guessing countries?
3. Entity/ABN/contact disclosure for a **sole trader** (“Saeed Zafari trading as Taskio”); how to handle **home-based** operation without publishing a residential street address until approved.
4. Marketplace contract structure and the Homeowner–Expert job contract.
5. Payment-law characterisation; permitted wording for fund / hold / release / payout.
6. ACL consumer guarantees; unfair contract terms in the draft (unilateral variation, termination/suspension, payment intervention, after-release refunds).
7. Cancellation/refund rules before vs after release.
8. Liability, indemnities, warranties — currently largely **absent**.
9. Dispute resolution and governing law.
10. Expert independent-contractor vs employment risk.
11. Supportable “verified Expert” / trust / safety claims.
12. Licensing responsibility and Phase 1 catalog edges.
13. Insurance: what **minimum sensible Stage 1 pilot** cover is appropriate (do not assume a full policy stack is mandatory)? Expert status-collection vs mandatory-for-all-founding-Experts? Residual wording if Taskio or some Experts are not insured.
14. Age eligibility — owner working position Expert **18+** and Homeowner **18+**; please confirm Terms wording.
15. Spam Act treatment of E01–E05.
16. Deletion/retention: what the Privacy Policy may claim vs current anonymise-only execute; off-platform artefact retention.
17. Privacy complaints contact (`admin@taskio.com.au`) and process; support mailbox `support@taskio.com.au`.
18. NDB / incident notification posture (do not assume NDB duty until applicability is confirmed).
19. Automated decision-making transparency (from 10 December 2026) vs admin risk scoring.
20. AI/Gemini disclosure if assistants stay **off** at launch vs if later enabled; also reCAPTCHA, GA4, Firebase, Microsoft 365.
21. **Stage 1 vs Stage 2 structure:** can this tightly controlled pilot reasonably proceed as a sole trader, and at what point / risk change should Taskio move to a Pty Ltd? Do not treat incorporation as automatically required now. Do not advise as if a company eliminates personal/director liability.
22. Waitlist contact-consent (homeowner vs Expert — distinct purposes): disclosure, retention, deletion/access, Spam Act.
23. What wording can Taskio safely use around “verified Expert” and “Taskio-approved expertise” given the checks actually performed?
24. Review badge “Verified Taskio review” and moderation/defamation posture.
25. Victorian governing law / jurisdiction (currently missing).
26. Optional: TASKIO word-mark protection.

The numbered solicitor register with working positions is in `docs/P06_OWNER_DECISIONS.md` §8 (SR01–SR24). Remediation severity is in `docs/P06_REMEDIATION_MATRIX.md` §17.

**Also required (accountant, not solicitor unless you advise otherwise) before real trading:** Stripe Connect marketplace accounting; whether Taskio recognises only platform commission as revenue; treatment of funds passing through Stripe; GST registration/turnover treatment; invoicing/tax invoice responsibilities. Do not determine these in the repo.

**Requested output from counsel:** marked-up or replacement Terms and Privacy (identity facts now available except public street address), a short “do/don’t say” list for landing/payments/email, and a list of product changes that are legally required vs optional.

Engineering will **not** implement copy or retention changes until owner + solicitor approval is recorded. That implementation is tracker **P09**, which cannot PASS before **P06**. P06 remains **OPEN** until focused solicitor, insurance-broker, and accountant marketplace/GST confirmation are accepted. Pty Ltd and broad insurance spend are **not** automatic PASS blockers unless you advise they must be.

---

## R. Solicitor attachment pack

Send these (not source, secrets, or production PI):

1. This brief
2. `docs/P06_OWNER_DECISIONS.md`
3. `docs/P06_REMEDIATION_MATRIX.md`
4. `docs/LAUNCH_READINESS.md` (gate definitions only)
5. Current Terms — `frontend/src/pages/TermsPage.jsx` (`/terms`, Draft)
6. Current Privacy — `frontend/src/pages/PrivacyPolicyPage.jsx` (`/privacy`, Draft)
7. Funds-flow summary — this brief §E–G + matrix §3 and §9
8. Category list — `shared/expertiseCatalog.js` summaries + this brief §I
9. Expert verification summary — this brief §H
10. Waitlist summaries — this brief §J1–J2
11. Processor list — this brief §K + matrix §12
12. Refund/dispute workflow — this brief §G + matrix §9
