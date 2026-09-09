# P06 owner decision pack

**Status (this document):** PREPARED — owner facts recorded 9 September 2026. Not solicitor-approved, not legal advice, not P06 PASS.

| Classification | State |
|---|---|
| P06 INVENTORY | **COMPLETE** (read-only preflight; no Terms/Privacy rewrite) |
| P06 OWNER DECISION PACK | **PREPARED** (this file + `docs/P06_SOLICITOR_BRIEF.md`) |
| P06 OWNER FACTS | **COMPLETE** (working facts below; public street address still withheld) |
| P06 STRUCTURE DECISION | **CONTROLLED SOLE-TRADER PILOT APPROVED AS OWNER WORKING POSITION** |
| P06 AU SOLICITOR REVIEW | **PENDING** |
| P06 INSURANCE REVIEW | **PENDING** (broker review required before first real paid job) |
| P06 ACCOUNTING MARKETPLACE/GST CONFIRMATION | **PENDING** |
| P06 REMEDIATION | **NOT STARTED** |
| P06 OVERALL | **OPEN** |

P09 remains **blocked** until P06 PASS. Do not implement UI/copy/retention/analytics/email/App Check changes from this pack.

This pack records **owner-confirmed working facts**, **working business positions**, and **open professional questions**. It does **not** make Privacy Act conclusions, rewrite Terms or Privacy Policy, or describe Taskio as a company or Pty Ltd.

Do **not** describe Taskio as **Taskio Pty Ltd** or as **a company** while this sole-trader pilot position stands.

---

## How to use / professional review sequence

1. Owner facts — **COMPLETE** (this update).
2. AU commercial/privacy solicitor review of this pack + `docs/P06_SOLICITOR_BRIEF.md` + draft `/terms` and `/privacy`.
3. Business insurance broker review (platform/operator cover; Expert certificate process).
4. Accountant confirmation of Stripe Connect marketplace / GST / invoicing treatment.
5. Owner accepts or finalises professional recommendations.
6. P06 legal/privacy decisions become **APPROVED** (only then is P06 eligible to PASS).
7. P09 implements approved Terms/Privacy/trust/product changes.
8. P07 / P08 / P10 follow the launch-readiness dependency plan.

Do **not** start P09 yet.

Statuses used below:

| Status | Meaning |
|---|---|
| **OWNER CAN DECIDE** | Business intent the owner can choose now. Still subject to solicitor confirmation where noted. |
| **OWNER FACT REQUIRED** | A missing fact. Do not guess. Leave blank until the owner supplies it. |
| **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** | Legal characterisation, statutory wording, or confirmation of a working position. |

---

## 1. Current product snapshot (facts already in repo)

- Invite-only Inner Melbourne MVP. Public signup **closed**. Founding Experts invited and admin-verified.
- Roles: Homeowner (Client), Expert (tradie), Admin.
- Flow: post job → invited Expert quotes → Homeowner accepts → Stripe Checkout funds → Expert marks complete → Homeowner approves → Stripe Connect **transfer** to Expert connected account → Stripe later **bank payout** (not the same event).
- Phase 1 catalog: mounting/hanging, curtains/blinds, furniture assembly, minor repairs, wall patch, cosmetic silicone, apartment make-good. Electrical/plumbing categories are not in the catalog.
- Draft Terms of Use and Privacy Policy (`frontend/src/pages/TermsPage.jsx`, `frontend/src/pages/PrivacyPolicyPage.jsx`) show **Draft — not final** (`LegalDraftBanner`). Effective date on pages: April 2026. **User-facing pages still omit** entity/ABN/address/governing law. Owner-confirmed identity is recorded in **§3 of this pack** for solicitor use; it is **not** published in Terms/Privacy until P09 after P06 PASS.
- Staging: Postmark transactional email (E01 proven), GA4 `G-SZ7RZDKTJY` (production **OFF**), App Check reCAPTCHA Enterprise with Firestore + Storage **ENFORCED**, Auth App Check **OFF**.
- Production (`taskio-v2`) remains **frozen**. Production email, analytics, and App Check are **not** enabled.

---

## 2. Working business positions — NOT FINAL LEGAL ADVICE

Recorded for owner alignment and solicitor review. These are **intended operating positions**, not solicitor-approved Terms language and not a Privacy Act determination.

| Topic | Working position |
|---|---|
| Privacy standard | Taskio intends to operate to **APP-style privacy standards** even if a small-business exemption may apply. Applicability of the Privacy Act remains a solicitor question. |
| Marketplace | Taskio intends to operate as a **marketplace / intermediary** connecting Homeowners and independent Experts. |
| Underlying services | Intended **direct service relationship** between Homeowner and Expert, subject to solicitor confirmation. Taskio does not intend to be the contracting tradesperson for the underlying job. |
| Payments | **Stripe** processes card payments and Connect transfers/payouts. Taskio must **not** claim to be a bank, trustee, custodian, or regulated escrow provider unless independently legally established. Stripe Connect **transfer** is not a bank payout. |
| Verified Expert | Means **only** the specific manual verification / eligibility checks Taskio actually performs (invite, admin `verified` flag, profile completeness, Stripe onboarding, ABN lookup where configured). Do **not** imply licensed, insured, criminal-history checked, government-certified, or quality-guaranteed unless separately verified. |
| Licensed / high-regulatory work | Remain **outside Phase 1** unless Taskio creates an approved verification and compliance process. |
| Expert minimum age | **18+** (already gated in product for Experts). Final Terms wording for solicitor confirmation. |
| Homeowner / account-holder age | **18+** (owner-confirmed working position). Final Terms wording for solicitor confirmation. Product Homeowner age gate is **not** yet implemented. |
| Structure | Remain a **sole trader** for the initial **controlled validation pilot**. This is a deliberate validation-stage decision, **not** an indefinite structure commitment. Do not describe Taskio as a company or Pty Ltd. |
| Insurance | Platform/operator insurance **not yet arranged**. For the founding controlled pilot, Taskio **intends** to require Experts to provide appropriate public-liability insurance evidence and to verify certificate + expiry **before** any user-facing “insurance verified” claim. Do **not** claim all Experts are insured, that Taskio provides insurance, that insurance guarantees workmanship, or any minimum coverage amount until broker/legal advice confirms. |
| Refunds | **Before release:** eligible funded / unreleased amounts can be refunded. **After release:** no automatic refund; manual support / dispute process. Subject to ACL / legal review. |
| AI | Gemini / AI assistants **OFF** at controlled launch unless approved privacy disclosure, provider configuration, and legal/privacy review are complete. AI remains **non-essential**. |
| Analytics | **Production** analytics may only be enabled after privacy wording and configuration are approved. Staging GA4 must not be treated as production disclosure. |
| Cross-border | Taskio intends to **transparently disclose** relevant third-party / overseas processing once provider and location wording is legally verified. Do not guess destination countries from brand names. |

---

## 3. Owner-confirmed working facts

Recorded **9 September 2026** from owner confirmation. These are **working facts for professional review**, not solicitor-approved public legal-page text. Do not copy them into Terms/Privacy until P09 after P06 PASS.

| ID | Fact | Owner-confirmed working fact |
|---|---|---|
| F01 | Exact legal entity / trading identity | **Saeed Zafari trading as Taskio**. Do **not** describe as Taskio Pty Ltd or as a company. |
| F02 | Entity type | **Individual / Sole Trader** |
| F03 | ABN | **15 729 254 373** |
| F04 | ACN | **Not applicable** while operating as a sole trader |
| F05 | Public-facing / service-of-documents address | Taskio is currently a **home-based business**. Exact public-facing / service-of-documents address remains subject to **owner/solicitor confirmation**. The owner's **residential street address is not recorded** in this repository. |
| F06 | Public privacy / contact email | **admin@taskio.com.au** |
| F07 | Support email | **support@taskio.com.au** |
| F08 | Formal privacy contact | **YES** — **admin@taskio.com.au** |
| F09 | Annual turnover category (Privacy Act **input** only; not a legal conclusion) | **AUD 3 million or less**. Current stage: **pre-launch / controlled-pilot preparation**. No exact revenue figure is recorded. Privacy Act / APP applicability remains for solicitor confirmation. |
| F10 | Taskio platform/operator insurance | **NOT YET ARRANGED / BROKER REVIEW REQUIRED BEFORE FIRST REAL PAID JOB** |
| F11 | Expert insurance checking planned? | For the founding controlled pilot, Taskio **intends** to require Experts to provide appropriate **public-liability insurance evidence**. Taskio should verify **certificate and expiry** before any user-facing claim that an Expert's insurance has been verified. See §2 insurance row for prohibited claims. |
| F12 | Off-repo personal-information handling | **Limited off-platform handling is expected** through Microsoft 365 / email, support communications, and manual operator workflows. Potential future/manual artefacts may include Expert verification records, insurance certificates, support attachments, and dispute notes. Minimise local/manual copies and establish retention rules before launch. Do **not** state that all personal information exists only in Firebase. |
| F13 | TFN / health / credit-reporting information | Taskio does **not intentionally collect** Tax File Numbers, health information, or consumer credit-reporting information. **ABNs are not TFNs.** Stripe payment processing does **not** mean Taskio intentionally collects consumer credit-reporting information. Users may incidentally submit sensitive information in free text/support; Taskio does **not** request it. |
| F14 | Homeowner / account-holder minimum age | **18+** (owner-confirmed). Final Terms wording for solicitor confirmation. |
| F15 | Gemini / AI launch state | **OFF** at controlled launch unless approved privacy disclosure exists, provider configuration is approved, and legal/privacy review is complete. AI remains non-essential. |

---

## 4. Owner-decide items

Each item is something the owner can choose as **business intent**. Solicitor confirmation is listed where the choice has legal effect.

### D01 — Privacy standard

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Should Taskio follow APP-style privacy practice for launch even if a small-business exemption might apply? |
| Current repo/product position | Product collects personal information. Privacy Policy is a **draft**. Privacy Act applicability is **not** determined in-repo. Annual turnover category is **AUD 3 million or less** (F09; pre-launch / controlled-pilot preparation). |
| Recommended working business position | Yes — APP-style standards regardless of possible exemption. |
| Owner must supply/choose | Working position already recorded: APP-style standards regardless of possible exemption. F09 supplied as a fact **input**. |
| Solicitor must confirm | Whether Taskio is an APP entity; how to word voluntary APP compliance if exempt. |
| Downstream | Privacy Policy, collection notices, P09 disclosures, P08 complaint/incident process. |

### D02 — Marketplace role

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Is Taskio a marketplace/intermediary, a service provider, an agent, or something else? |
| Current repo/product position | Draft Terms: “marketplace platform connecting Clients and Experts.” Landing: “Pay securely through Taskio.” Meta: “Taskio marketplace.” Underlying Homeowner–Expert contract is **implied, not explicit**. |
| Recommended working business position | Marketplace / intermediary. Not employer. Not the contracting tradesperson. |
| Owner must supply/choose | Confirm this model. |
| Solicitor must confirm | Contract structure; who is party to the underlying job; how to describe “pay through Taskio” without implying Taskio is the supplier or a payment institution. |
| Downstream | Terms, landing, payment screens, disputes, Expert status copy (P09). |

### D03 — Underlying Homeowner–Expert contract

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Is the contract for the physical job directly between Homeowner and Expert? |
| Current repo/product position | Not clearly stated in Terms. |
| Recommended working business position | Yes — direct service relationship, subject to solicitor confirmation. |
| Owner must supply/choose | Confirm intent. |
| Solicitor must confirm | How to document this; platform terms vs job contract; consumer-guarantee allocation. |
| Downstream | Terms, job post, quotes, support runbook (P09). |

### D04 — Payment / legal characterisation

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | How may Taskio describe funding, holding, release, and Expert payout? |
| Current repo/product position | Approved-style UI: “Pay securely through Taskio”, “Pay when you approve”, “Payment released after you approve.” Draft Terms: not a bank, trustee, custodian, or payment institution. Internal state key `in_escrow`. E02 email: “Funds are held until you approve.” Connect transfer ≠ bank payout. |
| Recommended working business position | Stripe processes payments. Do not claim bank / trustee / custodian / regulated escrow unless legally established. Distinguish transfer vs bank payout. |
| Owner must supply/choose | Confirm this constraint for all user-facing copy. |
| Solicitor must confirm | Lawful characterisation; whether “held” / “secured” needs different wording; fee disclosure. |
| Downstream | Terms, Payments page, emails E02/E04, landing (P09). **Do not change copy until approved.** |

### D05 — Verified Expert meaning

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | What may “verified Expert” mean in public copy? |
| Current repo/product position | Landing repeats “verified Experts” / “invited and verified by Taskio.” Actual process: invite-only, admin `verified=true`, profile complete, Stripe onboarding, ABN lookup if configured. **No** licence, insurance, or criminal-history check **in code**. Founding-pilot **intent** is to collect Expert public-liability certificates (F11) before any insurance-verified claim. |
| Recommended working business position | Verified = only those checks. Do not imply licensed / insured / background-checked / quality-guaranteed. |
| Owner must supply/choose | Definition confirmed as working position. F11 recorded. Do not imply licensed / insured / background-checked / quality-guaranteed. |
| Solicitor must confirm | Whether current landing claims are supportable; required qualifications/disclaimers. |
| Downstream | Landing, badge/help text, onboarding, Expert profile (P09). |

### D06 — Licensed / prohibited work

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Remain outside electrical, plumbing, and other high-regulatory work for Phase 1? |
| Current repo/product position | Catalog is Phase 1 indoor tasks only; copy says no electrical / hidden-cable / waterproofing. Free-text job descriptions are not a licence engine. TV mounting and wet-area silicone still need regulatory verification. |
| Recommended working business position | Keep high-regulatory work out of Phase 1 unless an approved verification process exists. |
| Owner must supply/choose | Confirm catalog boundary; no expansion without a process. |
| Solicitor must confirm | Victorian licensing risk for remaining catalog items (e.g. TV mounting, silicone, blinds, make-good). |
| Downstream | Catalog copy, job-post warnings, support refusal process (P09). |

### D07 — Age eligibility

| Field | Content |
|---|---|
| Status | **OWNER CONFIRMED WORKING POSITION** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Minimum age for Experts and for Homeowners / account holders? |
| Current repo/product position | Experts: DOB / 18+ gate in eligibility code. Homeowner minimum age **not found** in product. |
| Recommended working business position | Expert **18+**. Homeowner / account-holder **18+**. |
| Owner must supply/choose | **Recorded:** both 18+. |
| Solicitor must confirm | Whether 18+ is required/appropriate; how to state it in Terms. |
| Downstream | Terms, signup/activation, profile (P09). |

### D08 — Insurance claims

| Field | Content |
|---|---|
| Status | **OWNER CONFIRMED WORKING POSITION** + **P06 INSURANCE REVIEW PENDING** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | May Taskio say Experts are insured, or that Taskio is insured? |
| Current repo/product position | No insurance verification in product. Draft banner lists insurance as unresolved. Platform/operator insurance **not yet arranged**. |
| Recommended working business position | No platform-insured claim until cover exists. For the founding pilot, require Expert public-liability evidence and verify certificate + expiry **before** any user-facing insurance-verified claim. Do not claim all Experts are insured, that Taskio provides insurance, that insurance guarantees workmanship, or any minimum coverage amount until broker/legal advice confirms. |
| Owner must supply/choose | **Recorded:** F10, F11. Broker review still required before first real paid job. |
| Solicitor must confirm | Wording for unverified vs certificate-checked insurance; residual risk if Taskio itself is uninsured at pilot start. |
| Downstream | Landing, Terms, Expert onboarding (P09). **Do not add insurance claims in UI now.** |

### D09 — Refund / cancellation model

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | What happens before vs after payment release? |
| Current repo/product position | Funded unreleased: Homeowner cancel can full-refund (P02 proven on Stripe TEST). After release: no automatic Client refund; support/admin path. Draft Terms already describe this pattern. |
| Recommended working business position | Before release: eligible funded/unreleased amounts can be refunded. After release: no automatic refund; manual support/dispute. **Subject to ACL.** |
| Owner must supply/choose | Confirm this operating model for launch. |
| Solicitor must confirm | ACL / unfair-terms / consumer-guarantee interaction; after-release remedies. |
| Downstream | Terms, cancellation UI, emails E05, support runbook, P08 (P09). |

### D10 — AI launch state

| Field | Content |
|---|---|
| Status | **OWNER CONFIRMED WORKING POSITION** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** (if later turned on) |
| Question | Ship AI assistants at controlled launch, or keep them off/hidden? |
| Current repo/product position | Optional Gemini job-description and quote drafting exists in code. Hidden when API returns `fallback`. Not used for matching or auto-verify. Expert risk scoring exists for **admin** flags and does not auto-verify. |
| Recommended working business position | **OFF** at controlled launch unless approved privacy disclosure, provider configuration, and legal/privacy review are complete. AI remains non-essential. |
| Owner must supply/choose | **Recorded:** F15 = OFF unless those conditions are met. |
| Solicitor must confirm | Whether Gemini (if later on) must be named; ADM transparency from 10 December 2026 if risk scoring affects user rights. If AI stays off at launch, confirm that draft Privacy need not describe Gemini as a live processor. |
| Downstream | Privacy, AI UI, G04 behaviour, P09. **Do not change AI in this pack.** |

### D11 — Production analytics

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** |
| Question | When may production GA4 be enabled? |
| Current repo/product position | Staging GA4 on with no Signals / ads / Enhanced Measurement; no PII by design; 2-month staging retention. Production **OFF**. Privacy Policy does not name GA4. |
| Recommended working business position | Production analytics only after privacy wording and config are approved. |
| Owner must supply/choose | Confirm hold on production GA4 until P06/P09 wording exists. |
| Solicitor must confirm | Naming, cookies/opt-out, overseas processing of analytics. |
| Downstream | Privacy Policy, P04 production enablement (separate RED). **Do not change GA4 now.** |

### D12 — Cross-border disclosure intent

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Disclose third-party / overseas processing once legally verified? |
| Current repo/product position | Privacy names Stripe only (card handling). Postmark, Firebase/Google, GA4, reCAPTCHA, optional Gemini, ABR lookup are **not** named. Postmark already flagged for APP 8 review. Destination countries are **not** attested in-repo. |
| Recommended working business position | Transparently disclose relevant processors/overseas processing once wording is legally verified. Do not guess countries. |
| Owner must supply/choose | Confirm disclosure intent. |
| Solicitor must confirm | APP 8 / overseas list; which providers must be named; location verification. |
| Downstream | Privacy Policy, collection notices (P09). |

### D13 — Retention vs deletion implementation

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | What must Taskio actually delete vs retain, and what may the Privacy Policy claim? |
| Current repo/product position | `docs/PRIVACY_RETENTION_AND_DSAR.md` schedules (e.g. support/chat/audit 24 months; payment metadata 7 years). Admin deletion **anonymises** profile fields, **disables** Auth, does **not** hard-delete Auth, jobs, chat, Storage objects, Stripe, or analytics. DOB not cleared in the execute snippet. Privacy says deletion review via support. |
| Recommended working business position | Policy claims must match implementation. Prefer tightening copy now; automation later if legally required. |
| Owner must supply/choose | Accept “disclose actual behaviour” vs fund deletion-automation work. |
| Solicitor must confirm | Retention obligations; what “delete account” must mean. |
| Downstream | Privacy Policy, deletion jobs, P08 operations (P09). **Do not rewrite retention code in this pack.** |

### D14 — Controlled sole-trader validation pilot

| Field | Content |
|---|---|
| Status | **OWNER CONFIRMED WORKING POSITION** + **AU SOLICITOR / ACCOUNTANT CONFIRMATION REQUIRED** (disclosure and tax treatment) |
| Question | Operate the first real-money cohort as a sole trader? |
| Current repo/product position | Draft legal pages do not name an entity. Product is invite-only Inner Melbourne Phase 1. |
| Recommended working business position | Remain a **sole trader** for the initial **controlled validation pilot**. Deliberate validation-stage decision. **Does not** mean Taskio intends to remain a sole trader indefinitely. Pilot must stay invite-only, manually supervised, Inner Melbourne, narrow Phase 1 categories, no broad public signup, no licensed/high-regulatory work, low/modest job values, small founding Expert cohort, small invited Homeowner cohort. |
| Owner must supply/choose | **Recorded.** See §5–§6. |
| Solicitor must confirm | How to disclose “Saeed Zafari trading as Taskio” / ABN on legal pages; sole-trader marketplace implications; public address wording without publishing a residential street address until approved. |
| Accountant must confirm | Stripe Connect / commission-as-revenue / GST / invoicing (see §7). |
| Downstream | Terms/Privacy identity block (P09); do **not** implement until P06 PASS. |

---

## 5. Controlled sole-trader pilot (owner structure decision)

**Owner working position (9 September 2026):** Taskio will remain a **sole trader** for the initial **CONTROLLED VALIDATION PILOT**.

This is a deliberate **validation-stage business decision**. It does **not** mean Taskio intends to remain a sole trader indefinitely.

The pilot must remain:

- invite-only
- manually supervised
- Inner Melbourne
- narrow Phase 1 categories
- no broad public signup
- no licensed / high-regulatory work
- low / modest job values
- small founding Expert cohort
- small invited Homeowner cohort

Do **not** describe Taskio as **Taskio Pty Ltd** or as **a company** while this position stands.

---

## 6. Pty Ltd conversion — business review triggers

These are **owner business review triggers**, **not** statutory thresholds and **not** legal advice.

Review incorporation into a Pty Ltd if **any** of the following occurs:

1. approximately 30–50 genuine paid jobs completed
2. controlled pilot demonstrates repeat demand / meaningful traction
3. public signup is opened
4. significant paid marketing begins
5. external investment is sought
6. a co-founder / shareholder is introduced
7. employees are hired
8. meaningful retained profits / cash accumulate
9. higher-risk or materially higher-value job categories are introduced
10. geographic expansion beyond the controlled initial Melbourne pilot
11. a grant / investor / partner requires incorporation

**Hard review:** approximately **8–12 weeks** after commencement of the real-money controlled pilot. At that review decide:

- stop
- continue limited validation
- incorporate and scale

---

## 7. Accounting / GST professional questions

**Do not determine these in repo documentation.** Taskio needs **accountant confirmation before real trading** on:

- correct accounting treatment of Stripe Connect marketplace flows
- whether Taskio recognises **only its platform commission** as revenue
- treatment of funds passing through Stripe
- GST registration / turnover treatment
- invoicing / tax invoice responsibilities

Until that confirmation, P06 **ACCOUNTING MARKETPLACE/GST CONFIRMATION** remains **PENDING**.

---

## 8. Solicitor decision register

Matters that require **Australian solicitor confirmation**. Do not treat owner working positions as answers.

| ID | Matter |
|---|---|
| S01 | Privacy Act / APP applicability (including small-business exception inputs from F09, F12, F13) |
| S02 | Voluntary APP-compliance wording if technically exempt |
| S03 | APP 8 / overseas disclosure (Postmark, Google/Firebase, GA4, Stripe, reCAPTCHA, Gemini if enabled) — **countries not to be guessed from brand** |
| S04 | Exact entity / ABN / address / contact disclosure requirements (F01–F08 recorded; **public street address still withheld**; do not describe as a company) |
| S05 | Marketplace contract structure |
| S06 | Underlying Homeowner / Expert contract for the job |
| S07 | Payment / legal characterisation (not bank / trustee / custodian / escrow unless established) |
| S08 | ACL consumer guarantees allocation |
| S09 | Unfair contract terms risk in draft Terms (unilateral updates, suspend, pause/release/refund payments, after-release no automatic refund) |
| S10 | Cancellation / refund rules (before vs after release) |
| S11 | Liability limitations |
| S12 | Indemnities |
| S13 | Warranties |
| S14 | Dispute resolution process |
| S15 | Governing law / jurisdiction |
| S16 | Expert contractor vs employment position |
| S17 | Verification claims (“verified Expert”) |
| S18 | Licensing responsibility (platform vs Expert vs Homeowner) and Phase 1 catalog edges |
| S19 | Insurance wording (platform uninsured until broker arranges cover; Expert PL-certificate intent vs user-facing claims) |
| S20 | Age eligibility (owner: Expert 18+ and Homeowner 18+; Terms wording) |
| S21 | Spam Act treatment of E01–E05 (currently sparse/factual; no unsubscribe; no promo found) |
| S22 | Deletion / retention obligations vs current anonymise-only implementation |
| S23 | Privacy complaints handling / contact |
| S24 | NDB / data-breach posture (do not assert NDB duty until applicability is confirmed) |
| S25 | Automated decision-making transparency (from 10 December 2026) vs admin risk scoring |
| S26 | AI / provider disclosures (Gemini **OFF** at controlled launch unless later approved) |
| S27 | Sole-trader disclosure (“Saeed Zafari trading as Taskio”) vs later Pty Ltd conversion; public address without residential publication until approved |

---

## 9. Remediation dependency map (P09 after P06 approval)

Do **not** start these until P06 PASS (approved text / decisions). P09 implements; it does not invent legal conclusions.

| Approved P06 decision | Later P09 / ops work |
|---|---|
| Entity / ABN / address / contact (F01–F08 + S04, S27) | Terms + Privacy identity block; footer; invoice/support identity. **Do not publish residential street address** unless separately approved. Do not use “Pty Ltd” / “company” wording during the sole-trader pilot. |
| Privacy Act / voluntary APP wording (D01, S01–S02) | Privacy Policy rewrite (solicitor-approved); complaint path |
| Approved processor / overseas wording (D12, S03) | Privacy Policy update → collection notices → named-provider disclosure on relevant surfaces |
| Marketplace + underlying contract (D02–D03, S05–S06) | Terms; landing role copy; quote/job screens; dispute runbook |
| Payment role wording (D04, S07) | Terms; payment screens; E02/E04 templates; avoid transfer/payout conflation |
| Verified Expert definition (D05, S17) | Landing copy; onboarding; badge/help text; remove unsupported “licensed/insured/safe” implications |
| Licensed-work boundary (D06, S18) | Catalog warnings; support refusal playbook; job-post copy |
| Insurance (D08, S19) | Remove or add only broker/solicitor-approved claims; Expert certificate check process if approved |
| Age rules (D07, S20) | Terms; Homeowner 18+ gate if required |
| AI / ADM (D10, S25–S26) | Keep assistants **off** at launch unless later approved; admin risk-scoring transparency if required |
| Refund / dispute model (D09, S08–S10, S14) | Terms; job cancellation UI; support runbook; E05 alignment |
| Retention decision (D13, S22) | Privacy Policy claims; deletion jobs/automation; P08 operations |
| Analytics naming / production hold (D11) | Privacy vs `docs/ANALYTICS.md`; production GA4 remains a **separate RED** enablement |
| App Check / reCAPTCHA disclosure | Privacy technical-processing wording; **do not** change enforcement here |
| Spam Act confirmation (S21) | Keep transactional emails factual; do **not** auto-add unsubscribe unless advised |
| Login / activation legal links | Footer/onboarding Privacy + Terms **after** approved pages exist |
| Draft banner removal | Only when solicitor-approved production documents replace drafts |

Engineering/copy that is **unsafe to do before approval** (do not treat as launch blockers by themselves): login footer links, naming GA4/Postmark in UI, “verified” tooltip, “funds held” email tweak, catalog “safely” wording.

---

## 10. Explicit non-goals of this pack

This documentation batch must **not**:

- rewrite Terms or Privacy Policy
- add legal links or consent boxes
- change payment, verified, or landing copy
- rewrite retention/deletion code
- change AI, analytics, App Check, or email
- deploy, push, or mutate cloud resources
- mark P06 PASS
- publish a residential street address
- describe Taskio as Taskio Pty Ltd or as a company

Those belong after approved P06 decisions, generally under **P09** (and separate RED production enablement for email/analytics/App Check).
