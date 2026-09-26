# P06A current-state legal / privacy / trust reconciliation

**Date:** 14 September 2026  
**Repo HEAD:** `cd5e4687dbf602cffc83c0e9bf8206e86d453a3c` (`develop` = `origin/develop`)  
**Status:** ANALYSIS PREPARED — not solicitor advice, not P06 PASS, not P09 unblocked.

This document inventories **current product behaviour and public claims** after the Controlled Open-Demand Pilot and Expert-onboarding work. It does **not** declare Privacy Act applicability, escrow status, insurance, licensing, or Taskio’s legal characterisation.

**Companions:** `docs/P06_OWNER_DECISIONS.md`, `docs/P06_SOLICITOR_BRIEF.md`, `docs/LAUNCH_READINESS.md`.

**Do not include in solicitor send:** source dumps, secrets, service-account files, production user data.

---

## 1. Current product inventory (code, not cloud-activated)

Local product code on `develop`. Staging/production Auth remains `disabledUserSignup=true`. No `system/pilotSettings` document in cloud. Production Firebase `taskio-v2` is **frozen**.

### Homeowners

| Flow | Current behaviour |
|---|---|
| Public signup / auth | **Intended launch model when operational state is OPEN:** public supported homeowner signup/posting; no manual invitation; normal Firebase authentication still required; Phase 1 + Inner Melbourne still apply. **Cloud today:** Identity Toolkit signup disabled — P07/P10 must prove the public account path. |
| Waitlist | When homeowner state is CLOSED or PAUSED: new posting blocked; public waitlist (`POST /api/pilot-waitlist` → `pilotWaitlist`). Existing login and in-flight jobs continue. |
| Profile / account | Name, email, phone, suburb/location, account completeness gates for quotes/chat/payments. |
| Job posting | `POST /api/jobs` is the hard gate. OPEN allows supported new jobs. CLOSED/PAUSED reject new posts. Photos via Storage. |
| Quotes | Invited Experts quote. Homeowner compares and accepts. |
| Quote acceptance | Accept → Stripe Checkout Session. Payment success → funded (`paymentState=in_escrow` internally). |
| Payment / funding | Stripe Checkout; Taskio does not store full card numbers. Release is a later homeowner/admin action. |
| Completion approval | Expert marks complete (`POST /api/jobs/:id/complete`). Homeowner **Approve work & release payment** (`POST /api/jobs/:id/release`) creates a Stripe Connect **transfer**. Stripe later **payouts** the connected account. Transfer ≠ payout. |
| Reviews | After **paid release**, both parties may submit within 14 days (double-blind until both submit or the window ends). See §13. |
| Support / disputes | In-app support tickets. Homeowner “report issue” is available while status is `COMPLETED` and payment is still unreleased. Admin refund/release/dispute tooling exists. |

### Experts

| Flow | Current behaviour |
|---|---|
| Public signup when Expert onboarding **OPEN** | New Expert may create an account (also requires `TASKIO_PUBLIC_SIGNUP_ENABLED`). Starts `verified=false`, `expertise` = requested Phase 1 keys, `expertiseApproved=[]`. Cannot quote/invite until eligibility + Admin Verify. |
| Waitlist when **WAITLIST** | New Expert account creation blocked. Public CTA → `/expert-waitlist` (`POST /api/expert-waitlist` → `expertWaitlist`). Existing/pending Experts may still log in and complete onboarding. Missing/invalid mode fail-safes to WAITLIST. |
| Profile | Display name, phone, DOB (18+ gate), bio, photo, ABN/business fields, service areas, `acceptingJobs`. |
| Requested vs approved expertise | `expertise` = self-selected. `expertiseApproved` = Admin-approved subset. Signup never writes approved expertise. Removing a requested category drops it from effective eligibility. |
| Stripe onboarding | Connect onboarding required before marketplace participation. |
| `verified` | Admin boolean. Admin Verify also approves currently requested categories (explicit UI). Does **not** write a stored `launchReady` flag. |
| Launch-ready | **Derived** (`computeLaunchReadiness`): technical eligibility + `acceptingJobs` + `serviceAreas[]` + approved expertise. |
| Admin Enable / Disable | Account `status` active/disabled. |
| Job invitations / quotes | Supply, invite, and quote matching use effective **approved** expertise where category data is reliable. |
| Reviews | Public Expert reviews endpoint; no reviewer PII. |

Homeowner posting state and Expert onboarding mode are **independent**. Expected operating sequence: homeowner CLOSED + Expert OPEN while building supply; later homeowner OPEN, optionally Expert WAITLIST.

### Admin

User/job management; Expert Verify / unverify; expertise approve; Enable/Disable; pilot operational settings (`CLOSED`/`OPEN`/`PAUSED`, `expertOnboardingMode`); support tickets; payment/refund/release/dispute operations; launch-readiness / supply cockpit.

### Integrations (as used or intended)

| System | Current launch posture |
|---|---|
| Firebase Auth / Firestore / Storage / Hosting / Functions | Core platform. Staging Sydney (`australia-southeast1`) for several services; **global Google processing not attested**. |
| Stripe / Stripe Connect | Staging TEST proven. Production live Stripe **off / frozen**. |
| Postmark | Staging and production transactional email runtime/provider proof complete. Production customer sending remains disabled. |
| GA4 | Staging `G-SZ7RZDKTJY` **STAGING PASS**. Production analytics **OFF**. |
| reCAPTCHA Enterprise / App Check | Staging Firestore + Storage **ENFORCED**; Auth **OFF**. Production App Check **OFF**. |
| Gemini / AI | Code exists (`/api/generate-description`, `/api/quote-assistant`). **Intended OFF at launch** unless disclosure/config/legal review complete. Missing key returns local fallback. **Do not enable.** |
| Microsoft 365 / Outlook | Manual operator mail/support. Not an in-app integration. |
| ABR ABN lookup | Optional if GUID configured. |

Do **not** infer features that are not in this inventory (no licence engine, no insurance-certificate workflow, no police-check workflow, no identity-document KYC, no automated matching AI).

---

## 2. Public-claim inventory

Legend: **Supported?** = currently true in product as implemented. **Legal review?** = solicitor should confirm wording. This table does **not** silently rewrite copy.

| File / component | Exact or paraphrased claim | Surface | Currently supported by product? | Legal review required? | Recommended action |
|---|---|---|---|---|---|
| `landing/landingMedia.js` LANDING_PROOF | “Verified Experts” / “Verified by Taskio before quoting” | Public | Partially: Admin `verified=true` is required before quoting. Does **not** mean licence/insurance/police/qualification checks. | Yes | P09: qualify what Taskio actually checks, after solicitor wording. |
| `landing/landingMedia.js` LANDING_PILLARS | “Experts are invited and verified by Taskio — not an open directory anyone can join.” | Public | **Stale vs intended model.** Expert onboarding may be **OPEN** (public applications) with later Admin Verify. Invite-only is no longer the canonical Expert path. | Yes | P09: replace invite-only claim; do not imply closed directory if public apply is on. |
| `landing/landingMedia.js` hero / journey | “Verified Expert ready”; quote cards “Verified · suburb” | Public (illustrative preview) | Illustrative sample, not live data. Still a trust claim. | Yes | Keep illustrative; avoid implying live verified inventory. |
| `LandingPage.js` | “Compare quotes from verified Experts”; “Pay securely through Taskio”; “pay when you approve” | Public | Payment path exists (Stripe Checkout + delayed release). “Verified” as above. “Securely” is marketing, not a legal warranty. | Yes | Keep payment direction; solicitor to approve “securely”. |
| Catalog `shared/expertiseCatalog.js` | “Mount a TV **safely** to the wall. No electrical or hidden-cable work.” | Public / in-app | Exclusion of electrical/hidden-cable is catalog intent. “Safely” is not a certified safety check. | Yes | P09: consider removing “safely” unless solicitor accepts. |
| Catalog silicone / make-good | “No waterproofing”; “cosmetic”; make-good “up to 2 hours” | Public / in-app | Product exclusions are copy, not a licence engine. Free-text descriptions can still request out-of-scope work. | Yes | Flag wet-area / make-good / TV mounting for solicitor. |
| `QuotesSection.jsx` | Badge “Verified Expert” when `expert.verified === true` | In-app (homeowner) | Matches Admin boolean only. | Yes | Add solicitor-approved qualifier / tooltip in P09. |
| `QuotesSection.jsx` | “Payment is secured through Stripe and released after you approve completion.” | In-app | Product: Stripe Checkout success → unreleased PaymentIntent; release on approval. “Secured” is not a legal escrow characterisation. | Yes | Preferred direction; solicitor to confirm. |
| `HomeownerJobDetail.js` | “Stripe processes the payment securely. Funds are not released to the Expert until you approve the completed work.” | In-app | Matches delayed-release workflow. | Yes | Align with solicitor payment wording. |
| `BenefitsCard.jsx` (Expert signup) | “Get paid through Taskio with **protected payments**” | Public / Expert signup | Overclaim vs product: delayed Stripe release, not a payment-protection scheme or guarantee. | Yes | P09: replace “protected payments”. |
| `BenefitsCard.jsx` | “**Verified reviews** help build trust” | Public / Expert signup | Reviews require paid release + 14-day window. Public badge says “Verified Taskio review”. Not independently moderated. | Yes | Do not claim third-party verification. |
| `ExpertReviewsPage.jsx` | “✓ Verified Taskio review” | Public / Expert profile | Means: submitted through Taskio after paid release (job-linked). **Not** a guarantee of workmanship or identity. | Yes | Solicitor: is “verified review” supportable? |
| `functions/email/templates.js` E02 | “Funds are **held** until you approve” | Email | Internal state is Stripe PaymentIntent delayed transfer. Terms say Taskio is not a custodian. Tension with “held”. | Yes | P09 after solicitor: prefer “not released until…” |
| Draft `TermsPage.jsx` | Marketplace connecting Clients and Experts; not a bank, payment institution, trustee, or custodian; funding not released until approval or Taskio resolution; funded-unreleased refundable; after release no automatic refund | Public draft | Roughly matches product money path. Does **not** clearly say the underlying job contract is between Homeowner and Expert. Broad Taskio payment-intervention rights. Entity/ABN/governing law missing. Banner: draft. | Yes | Solicitor mark-up; do not rewrite now. |
| Draft `PrivacyPolicyPage.jsx` | Collects account/task/quote/payment metadata/support; “verify experts”; Stripe for cards; deletion review via support; coarse analytics | Public draft | Incomplete vs waitlists, DOB, ABN, photos, chat, Postmark, Firebase, GA4, reCAPTCHA, Microsoft 365, Gemini. “Verify experts” over-broad. | Yes | Solicitor rewrite; waitlist disclosure required before treating waitlists as privacy-complete. |
| `LegalDraftBanner.jsx` | “Draft — not final”; entity/ABN/ACL/liability/insurance/dispute unresolved | Public (staging) | Accurate that pages are not production-final. | Yes | Remove only after approved production text. |
| Admin `DashboardOpsModals.jsx` | Verify “does not confirm licences, insurance, qualifications, or police checks” | Admin | Accurate. | No (keep) | Preserve this Admin honesty. |
| Landing tests | Assert landing does **not** contain “escrow”, “guaranteed”, “insured” | Tests | Landing currently avoids those words. | — | Do not reintroduce. |
| Internal identifiers | `paymentState: in_escrow`, `escrow_funded` notification type, `totalSecuredInEscrowCents`, `isEscrowFunded` | Code / some admin titles | Technical keys. Most customer UI uses “Payment secured”. | Optional | Public copy must stay escrow-free unless solicitor **approves** “escrow”. Internal rename is not urgent. |

Not found as current public launch claims: “escrow”, “fully vetted”, “licensed”, “insurance verified”, “police checked”, “risk free”, “refund guarantee”, “workmanship guarantee”, “best Expert”.

---

## 3. Payment terminology

**Working position (not legal advice):** Stripe Connect / PaymentIntent / delayed release does **not** automatically mean legal escrow. Taskio must **not** publicly claim “escrow” unless an Australian solicitor specifically approves that word.

### Internal technical identifiers (may remain)

- Firestore/API `paymentState`: `in_escrow` \| `released` \| `refund_pending` \| `refunded` \| `disputed`
- Notification type `escrow_funded`
- Helpers `isEscrowFunded`, `totalSecuredInEscrowCents`
- Code comments and admin `title` attributes that mention `in_escrow`

### Public / customer-facing wording found

| Location | Wording | Escrow-like? |
|---|---|---|
| Landing | “Pay securely through Taskio”; “Payment released after you approve”; “Payment through Taskio” | No “escrow”; “securely” still a claim |
| Quote accept hint | “Payment is secured through Stripe and released after you approve completion.” | “Secured” |
| Job detail | “Funds are not released to the Expert until you approve” | Hold/release |
| E02 emails | “Funds are held until you approve” | **Hold/custodian tension** |
| Draft Terms | Not a trustee/custodian; not released until approval or Taskio resolution | Contradicts “held” in email if “held” implies custody |
| Expert signup | “protected payments” | Overclaim |
| Payments page | Customer-visible strings tested to avoid “escrow” | OK direction |
| Support keyword list | includes `escrow` as a **classifier** for routing, not a customer claim | Internal |

**Preferred concept direction (subject to legal review — do not finalise here):**

- “in-platform payment”
- “secure payment through Taskio”
- “payment released after the agreed completion step”

---

## 4. Expert verification — what Taskio actually checks

Confirmed in code:

- Expert account/profile completeness (phone, 18+ DOB gate, profile fields)
- Requested expertise (`expertise`) vs Taskio-approved expertise (`expertiseApproved`)
- Service areas (`serviceAreas[]`) and `acceptingJobs`
- ABN/business fields; optional ABR lookup if configured
- Stripe Connect onboarding status
- Admin `verified` boolean
- Account `status` active/disabled
- Derived launch-ready technical eligibility

**Taskio-approved expertise** means Admin reviewed the Expert’s requested Phase 1 categories. It must **not** automatically imply licensed, qualified, insured, or certified.

Not found in code (do **not** claim unless separately implemented and recorded):

- trade licence verification
- insurance verification / certificate-of-currency workflow
- police / criminal-history checks
- qualification or government-certification verification
- identity-document verification (beyond account profile fields)
- workmanship guarantee

**Solicitor question:** What wording can Taskio safely use around “verified Expert” for the pilot, based only on the checks actually performed?

---

## 5. Phase 1 category / regulatory boundary (flags, not conclusions)

Catalog (`shared/expertiseCatalog.js`): mounting (TV/shelves/mirrors), hanging, curtains/blinds, furniture assembly, minor repairs, wall patching, cosmetic silicone, apartment make-good.

Stated copy exclusions: electrical / hidden-cable; waterproofing / wet-area rebuilds; non-electrical fixture repairs.

**Ambiguous edges for solicitor (no Victorian licensing conclusion here):**

- TV mounting (“safely”; wall types; electrical adjacent)
- Blind / curtain install
- Kitchen/bathroom cosmetic silicone vs waterproofing
- Apartment make-good (scope creep into licensed building work)
- Free-text job descriptions and photos (no licence classifier)
- Gemini prompts (if later enabled) instruct not to introduce electrical/plumbing/gas/waterproofing — **not a legal control**

Regulated/high-risk work remains **outside** the intended pilot unless specifically approved. Flag accidental inclusion; do not expand categories in this pack.

---

## 6. Homeowner waitlist — privacy facts

**Collection:** `pilotWaitlist` (Admin SDK only). Client Firestore `allow read, write: if false`.

**Fields stored:** normalized email; optional suburb; `source`; `createdAt` / `updatedAt`; `consentVersion=pilot-waitlist-contact-v1`; `consentAcceptedAt` (server timestamp).

**Consent meaning (product):** contact about **Melbourne pilot availability**. **Not** generic marketing consent.

**Controls in code:** `consentAccepted === true` required (strict boolean); no email enumeration on duplicate; deterministic doc id (hash of email); idempotent upsert that does not weaken prior consent; rate-limited public POST.

**Open questions (do not claim legal sufficiency):**

- Privacy Policy does not currently disclose this waitlist flow
- Retention / deletion / access process for waitlist records
- Operational owner for contacting waitlist emails (expected: Microsoft 365 / `admin@` or `support@`)
- Distinction from marketing/comms

---

## 7. Expert waitlist — privacy facts

**Collection:** `expertWaitlist` (separate from `pilotWaitlist`). Client Firestore denied.

**Fields stored:** normalized email; optional canonical Phase 1 expertise key; optional canonical Inner Melbourne suburb; `source`; timestamps; `consentVersion=expert-waitlist-contact-v1`; `consentAcceptedAt`.

**Consent meaning (product):** contact about **becoming a Taskio Expert**. **Not** general marketing consent.

Same disclosure / retention / deletion / access questions as the homeowner waitlist. Keep purposes **distinct**.

---

## 8. Marketplace / operator role

**Working product intention:** Taskio is a marketplace/intermediary. The underlying service agreement is intended to be between Homeowner and Expert, **subject to solicitor confirmation**. Taskio facilitates matching, structured job/quote process, Stripe platform payment, and workflow/dispute support. Taskio does not automatically become the service provider.

**Draft Terms:** “marketplace platform connecting Clients and Experts”; not a bank/trustee/custodian. **Missing:** explicit Homeowner–Expert contract clause; entity/ABN; governing law; fee amount; Expert independent-contractor language.

**Contradictory or risky copy to review:**

- “Pay through Taskio” / “protected payments” (may sound like Taskio is the payee or a scheme provider)
- E02 “Funds are held” vs Terms “not a custodian”
- “Verified Experts” / “invited and verified” (may sound like Taskio warrants Experts)
- Catalog “safely”
- Broad Terms rights to pause/review/release/refund (ACL / unfair-terms candidate)
- No copy found that Taskio employs Experts or performs the physical work — keep it that way

---

## 9. Refunds / disputes / release — actual product behaviour

Do **not** invent policy. Current code:

| Situation | Product behaviour |
|---|---|
| Before payment | Homeowner cancel → `CANCELLED`. No Stripe refund. |
| Funded / unreleased, work **not** started (`AWAITING_FUNDING` with payment succeeded, or `FUNDED`) | Homeowner cancel → Stripe **full** refund on PaymentIntent + funded variations; `REFUND_PENDING` then webhook finalises `REFUNDED`. No Connect transfer. |
| Work started (`IN_PROGRESS`) | Homeowner `/cancel` returns **409** — “cannot be cancelled here once work has started.” No automatic refund path. |
| Expert marks complete | Status `COMPLETED`; payment still unreleased. |
| Homeowner reports issue | Only while `COMPLETED` + unreleased → `DISPUTED`. Admin handles thereafter. |
| Homeowner approves / release | Stripe Connect **transfer** to Expert connected account; `paymentState=released`. |
| After release | **No** automatic Client refund in product. Support/admin/manual only. Chargebacks are Stripe events, not a self-serve policy UI. |
| Admin | Manual refund/release/dispute tooling exists for operators. |

**Solicitor decisions required (do not answer here):** cancellation before work; after work starts; no-show; partial completion; disputed completion; variations; homeowner non-response; chargebacks; refunds after payout/release; Expert withdrawal; abandoned jobs.

---

## 10. Reviews

- Who: job **participants** only (homeowner and accepted Expert).
- When: job must be **paid/released** (`paymentState=released` and paid status), with a recorded release timestamp; **14-day** window from that anchor.
- One submission per party per job; idempotent.
- Double-blind until both submit or the window elapses; then public on the Expert profile.
- Public list strips reviewer PII.
- Badge: “Verified Taskio review” = in-platform job-linked review after paid release — **not** independently moderated, edited, or third-party verified.
- No in-product moderation/edit/delete workflow found for published reviews (admin deletion of users is a separate path).

Flag defamation / moderation / platform-policy questions for solicitor. Do not claim “verified-job reviews” beyond the paid-release gate actually enforced.

---

## 11. AI and analytics

**AI:** Gemini job-description tidy and Expert quote-wording assistant exist in API code. If `GEMINI_API_KEY` is absent, routes return local **fallback** (no provider call). Owner position: **OFF at launch** unless disclosure, provider configuration, and legal/privacy review are complete. Matching and Admin Verify remain human. If later enabled, prompts would include user-entered job description and (for quote assist) job title/details — personal/job data. **Do not enable in this task.**

**Analytics:** P04 **STAGING PASS / PRODUCTION PENDING**. Production GA4 **OFF**. Staging is coarse funnel events with a PII denylist. Privacy Policy mentions generic coarse events and does not name GA4.

**App Check / reCAPTCHA:** staging enforcement on Firestore + Storage; Auth off; production off.

**Firebase operational telemetry / logs:** exist for running the service; not a public marketing tracker.

---

## 12. Processor / cross-border inventory

Do **not** invent destination countries. “Possible overseas processing” = provider may process outside Australia; **location verification required**.

| Provider | Purpose | Data types (typical) | Used at launch? | Possible overseas processing? | Disclosure status | Action required |
|---|---|---|---|---|---|---|
| Google / Firebase | Auth, Firestore, Storage, Hosting, Functions, logs | Account, jobs, photos, chat, waitlists, audit | Yes (core) | Unknown / verify Google terms | Not named in Privacy | Solicitor + provider location wording |
| Stripe | Checkout, refunds, Connect transfer/payout, identity for Connect | Payment metadata, Connect account data; cards handled by Stripe | Staging TEST yes; production live **off until approved** | Unknown / verify Stripe | Stripe named for cards only | Expand if solicitor requires Connect/payout detail |
| Postmark | Transactional email | Email address, sparse task refs | Staging and production runtime/provider proven; production customer sending **OFF** | Unknown / verify | **Not named** | APP 8 / disclosure question before customer activation |
| Microsoft 365 / Outlook | Operator support, waitlist contact, manual verification | Email content, attachments, names | Yes (manual ops) | Unknown / verify Microsoft | **Not named** | Disclose off-platform handling |
| Gemini | Optional description/quote assist | Job description / job fields | **Intended OFF** | Unknown / verify Google | **Not named** | Disclose only if enabled |
| GA4 | Product funnel | Coarse events (no PII by design) | Staging on; **production OFF** | Unknown / verify Google | Generic events only; GA4 not named | Production enablement blocked on P06/P09 |
| reCAPTCHA Enterprise / App Check | Bot/abuse | Tokens, device/app attestations | Staging on (partial); production **OFF** | Unknown / verify Google | **Not named** | Disclose if production-on |

---

## 13. Retention / deletion mismatches

Internal schedule (`docs/PRIVACY_RETENTION_AND_DSAR.md`): support/chat/audit 24 months; payment metadata 7 years; abandoned onboarding 90 days. **Automated purge jobs were not found.**

Admin user deletion: anonymise selected profile fields + disable Auth. Does **not** hard-delete Auth, jobs, chat, Storage objects, Stripe, analytics, or waitlists as a complete erasure. Draft Privacy: “deletion review through support.”

**Categories needing a retention decision:** accounts; jobs; photos; quotes; payment metadata; reviews; support tickets; **homeowner waitlist**; **Expert waitlist**; Expert verification/profile; audit logs; analytics; email records; dispute/refund evidence.

**Mismatch:** Privacy promises a support-led deletion review; product cannot currently fulfil a hard-delete of all categories. Waitlists are not mentioned at all.

Do **not** implement deletion flows in this task.

---

## 14. Security / credential handoff (P07)

Historical production service-account credential exposure remains a **P07 rotation / revocation** item if not yet fully closed. Do not print credentials. Do not change credentials in this task. See `docs/LAUNCH_READINESS.md` P07 and `docs/SECRETS_AND_KEY_ROTATION.md`.

---

## 15. Competitive strategy — ROADMAP ONLY

**Launch proposition (do not treat as live legal copy):** Taskio helps small home jobs get properly scoped, matched to a small number of suitable Experts, quoted clearly, paid through Taskio, and supported through completion.

**Do not position launch around:** generic AI; number of Experts; number of quotes; cheapest price; “fully vetted”; workmanship guarantee; escrow.

**Possible post/pilot experiments (not P01–P10 unless later required for legal/safety):** more structured/comparable quotes; written variations; completion checklist/evidence; more transparent category-level verification; issue-free completion metric; rehire flow; outcome-driven price/matching intelligence.

---

## 16. Solicitor attachment pack (send these, not source)

1. This file — `docs/P06_REMEDIATION_MATRIX.md`
2. `docs/P06_SOLICITOR_BRIEF.md`
3. `docs/P06_OWNER_DECISIONS.md`
4. `docs/LAUNCH_READINESS.md` (gates only; ignore production commands)
5. Current Terms page text — `frontend/src/pages/TermsPage.jsx` (render `/terms`; still **Draft**)
6. Current Privacy page text — `frontend/src/pages/PrivacyPolicyPage.jsx` (render `/privacy`; still **Draft**)
7. Funds-flow / payment summary — Brief §E–G + this file §3 and §9
8. Category / exclusion list — `shared/expertiseCatalog.js` summaries + this file §5
9. Expert verification / eligibility summary — this file §4 + owner pack D05
10. Homeowner + Expert waitlist data summary — this file §6–§7
11. Processor / data-flow summary — this file §12
12. Refund / dispute workflow summary — this file §9

**Exclude:** `.env`, service-account JSON, secrets, production user PI, full source tree, `frontend/landing-final-review/`.

---

## 17. Remediation matrix

**P06 PASS** still requires solicitor (+ insurance broker + accountant) acceptance. Copy/code implementation is **P09** after P06 PASS unless noted.

| ID | Issue | Severity | Current product / copy | Legal decision required? | Code change? | Copy change? | Policy / ops change? | Blocking P06? | Owner |
|---|---|---|---|---|---|---|---|---|---|
| R01 | Draft Terms/Privacy not production-ready (entity, ABN, governing law, role, waitlists, processors) | CRITICAL LAUNCH BLOCKER | Draft banner; April 2026 date; incomplete disclosures | Yes | No until approved text | Yes (P09) | Yes | **Yes** | Solicitor + owner; engineering implements P09 |
| R02 | Public “verified Expert” / “invited and verified / not an open directory” vs actual checks and public Expert OPEN | HIGH | Landing + in-app badge | Yes — safe pilot wording | Possibly tooltip | Yes | Admin script for Verify meaning | **Yes** (wording decision) | Solicitor; P09 copy |
| R03 | Payment “held” / “protected” / “secured” vs no escrow claim | HIGH | E02 “held”; Expert “protected payments”; UI “secured”; Terms not custodian | Yes — forbid or allow “escrow”; approve hold/secure words | Internal `in_escrow` optional later | Yes (email + signup + maybe UI) | Support macros | **Yes** (wording decision) | Solicitor; P09 |
| R04 | Marketplace vs supplier / trustee / employer / warrantor | HIGH | Terms marketplace; missing HO–Expert contract; “pay through Taskio” | Yes | Unlikely | Yes | Dispute runbook | **Yes** | Solicitor |
| R05 | Refund/cancel/release gaps vs ACL expectations | HIGH | Auto full refund only before work start; after start 409; after release no auto refund | Yes — policy for no-show, partial, after-start, chargebacks | Maybe after policy | Yes | Support/admin SOP | **Yes** | Solicitor; P08/P09 |
| R06 | Waitlist personal data not in Privacy Policy | HIGH | Two public waitlist writes live in **code** (not cloud-activated as a settings doc) | Yes — consent/retention/access | Not in P06A | Yes | Ops owner for contact + deletion | **Yes** before treating waitlist as launch-complete | Solicitor; P09 |
| R07 | Processor / overseas disclosure incomplete | HIGH | Privacy names Stripe (cards) only | Yes — APP 8 / naming | No | Yes | Provider location verification | **Yes** | Solicitor |
| R08 | Retention/deletion policy vs anonymise-only execute | HIGH | Privacy “deletion review”; no purge jobs; waitlists omitted | Yes | Later if required | Yes | DSAR runbook P08 | **Yes** (what may be claimed) | Solicitor; P08 |
| R09 | Phase 1 catalog edges (TV, silicone, make-good, “safely”) | HIGH | Catalog copy; no licence engine | Yes — warning vs exclude | Catalog/job-post warnings after advice | Yes | Support refusal | **Yes** (boundary advice) | Solicitor |
| R10 | Expert insurance / Taskio insurance unconfirmed | HIGH | No product verification; do not claim insured | Yes + broker | Collect-status UI later | Do not add badges now | Broker quote | **Yes** (minimum pilot cover decision) | Broker + solicitor |
| R11 | Sole-trader / public address / ABN on legal pages | CRITICAL LAUNCH BLOCKER | Identity in owner pack only | Yes | No | Yes (P09) | Service-of-documents process | **Yes** | Solicitor |
| R12 | ACL / unfair terms / liability / indemnities largely unresolved | HIGH | Draft Terms have broad platform rights; little liability text | Yes | No | Yes | — | **Yes** | Solicitor |
| R13 | Reviews “Verified Taskio review” / no moderation | MEDIUM | Job-linked after paid release | Yes | Moderation later if required | Possibly | Takedown process | Decision yes; product optional | Solicitor |
| R14 | AI present in code while intended OFF | MEDIUM | Fallback if no key; could be enabled by secret | Confirm OFF-at-launch disclosure | Do not enable | Privacy if later on | Keep key unmounted at launch | Decision for launch wording | Owner + solicitor |
| R15 | Production analytics / cookies / App Check off but Privacy already mentions coarse events | MEDIUM | P04 production pending | Yes before production ON | No enable now | Yes | P04 production is separate RED | Wording yes; enable is P04/P09 | Solicitor |
| R16 | 10% fee in product vs silence in Terms | MEDIUM | Fee snapshot in checkout/UI | Yes — disclosure | No | Yes | Invoicing/GST with accountant | **Yes** (disclosure) | Solicitor + accountant |
| R17 | Homeowner 18+ not gated in product | MEDIUM | Owner position 18+; Expert gated | Yes | Possible P09 | Terms | — | Decision yes | Solicitor |
| R18 | Login/activation missing Privacy/Terms links | MEDIUM | Footer on some pages only | After approved pages | Yes P09 | Yes | — | No (P09) | Engineering after P06 |
| R19 | Internal `in_escrow` identifiers | POST-PILOT | Code/admin | Only if public leak | Optional rename | Keep public escrow-free | — | No | Engineering optional |
| R20 | Competitive experiments (checklists, rehire, metrics) | POST-PILOT | Not built | Only if they become public claims | Later | Later | — | No | Product roadmap |
| R21 | TASKIO word-mark | POST-PILOT | Brand in use | Optional | No | No | Trade-mark advice | No | Solicitor optional |
| R22 | Historical production credential rotation | HIGH (P07, not P06 copy) | P07 item | No legal copy | P07 RED | No | Rotate/revoke if open | Blocks **launch** via P07, not P06 wording | Engineering P07 |

P06 remains **OPEN**. P09 remains **blocked**. Do not implement the copy/code column until solicitor-approved positions exist.
