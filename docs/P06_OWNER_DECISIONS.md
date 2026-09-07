# P06 owner decision pack

**Status (this document):** PREPARED — not approved, not legal advice, not P06 PASS.

| Classification | State |
|---|---|
| P06 INVENTORY | **COMPLETE** (read-only preflight; no Terms/Privacy rewrite) |
| P06 OWNER DECISION PACK | **PREPARED** (this file + `docs/P06_SOLICITOR_BRIEF.md`) |
| P06 OWNER FACTS | **PENDING** |
| P06 AU SOLICITOR REVIEW | **PENDING** |
| P06 REMEDIATION | **NOT STARTED** |
| P06 OVERALL | **OPEN** |

P09 remains **blocked** until P06 PASS. Do not implement UI/copy/retention/analytics/email/App Check changes from this pack.

This pack records **working business positions** and **open questions**. It does **not** invent legal entity details, make Privacy Act conclusions, or rewrite Terms or Privacy Policy.

---

## How to use

1. Owner fills **§3 Owner facts required** (blanks only — do not infer).
2. Owner confirms or amends **§2 Working positions** and **§4 Owner-decide items**.
3. Australian solicitor reviews `docs/P06_SOLICITOR_BRIEF.md` plus current draft `/terms` and `/privacy`.
4. Owner + solicitor produce an **approval record**. Only then can P09 implement approved text.

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
- Draft Terms of Use and Privacy Policy (`frontend/src/pages/TermsPage.jsx`, `frontend/src/pages/PrivacyPolicyPage.jsx`) show **Draft — not final** (`LegalDraftBanner`). Effective date on pages: April 2026. Legal entity, ABN, address, and governing law are **missing**.
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
| Expert minimum age | **18+** (already gated in product for Experts). |
| Homeowner / account-holder age | **Recommended working position: 18+.** Owner confirmation + legal review still required. |
| Insurance | **No claim** that Experts are insured unless Taskio actually verifies insurance. No claim that Taskio itself holds a named policy until the owner records that fact. |
| Refunds | **Before release:** eligible funded / unreleased amounts can be refunded. **After release:** no automatic refund; manual support / dispute process. Subject to ACL / legal review. |
| AI | AI Job Description Assistant and AI Quote Assistant remain **non-essential**. They may be disabled or hidden if privacy, legal, or provider configuration is not launch-ready. |
| Analytics | **Production** analytics may only be enabled after privacy wording and configuration are approved. Staging GA4 must not be treated as production disclosure. |
| Cross-border | Taskio intends to **transparently disclose** relevant third-party / overseas processing once provider and location wording is legally verified. Do not guess destination countries from brand names. |

---

## 3. Owner facts required

Do **not** fill these from inference, landing copy, or `admin@taskio.com.au` operational use. Leave unknown values blank.

| ID | Fact | Owner answer |
|---|---|---|
| F01 | Exact legal entity name | _OWNER TO SUPPLY_ |
| F02 | Entity type (e.g. Pty Ltd, sole trader — owner states; do not assume) | _OWNER TO SUPPLY_ |
| F03 | ABN | _OWNER TO SUPPLY_ |
| F04 | ACN (if applicable) | _OWNER TO SUPPLY_ |
| F05 | Registered / business address for public legal pages | _OWNER TO SUPPLY_ |
| F06 | Public privacy / contact email | _OWNER TO SUPPLY_ |
| F07 | Support email (if different from F06) | _OWNER TO SUPPLY_ |
| F08 | Should `admin@taskio.com.au` be the **formal** privacy contact? (yes / no / other) | _OWNER TO SUPPLY_ |
| F09 | Current / expected annual turnover category (needed as an **input** to Privacy Act advice; not a legal conclusion) | _OWNER TO SUPPLY_ |
| F10 | Any insurance Taskio itself holds (public liability, PI, cyber — names/limits only if owner confirms) | _OWNER TO SUPPLY_ |
| F11 | Any Expert insurance checking planned for launch? (none / planned process) | _OWNER TO SUPPLY_ |
| F12 | Any **off-repo** personal-data processing (spreadsheets, inboxes, devices, contractors)? | _OWNER TO SUPPLY_ |
| F13 | Is TFN, health, or credit information ever handled (in or out of product)? | _OWNER TO SUPPLY_ |
| F14 | Intended Homeowner / account-holder minimum age | _OWNER TO SUPPLY_ (working recommendation: 18+) |
| F15 | Intended Gemini / AI launch state (off / hidden fallback / on for invited users) | _OWNER TO SUPPLY_ |

---

## 4. Owner-decide items

Each item is something the owner can choose as **business intent**. Solicitor confirmation is listed where the choice has legal effect.

### D01 — Privacy standard

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Should Taskio follow APP-style privacy practice for launch even if a small-business exemption might apply? |
| Current repo/product position | Product collects personal information. Privacy Policy is a **draft**. Privacy Act applicability is **not** determined in-repo. Annual turnover is **missing** (F09). |
| Recommended working business position | Yes — APP-style standards regardless of possible exemption. |
| Owner must supply/choose | Confirm or amend the working position; supply F09 as a fact input. |
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
| Current repo/product position | Landing repeats “verified Experts” / “invited and verified by Taskio.” Actual process: invite-only, admin `verified=true`, profile complete, Stripe onboarding, ABN lookup if configured. **No** licence, insurance, or criminal-history check in code. |
| Recommended working business position | Verified = only those checks. Do not imply licensed / insured / background-checked / quality-guaranteed. |
| Owner must supply/choose | Confirm this definition; confirm F11 (insurance checking). |
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
| Status | **OWNER CAN DECIDE** + **OWNER FACT REQUIRED** (F14) + **AU SOLICITOR DECISION / CONFIRMATION REQUIRED** |
| Question | Minimum age for Experts and for Homeowners / account holders? |
| Current repo/product position | Experts: DOB / 18+ gate in eligibility code. Homeowner minimum age **not found**. |
| Recommended working business position | Expert 18+ (already). Homeowner / account-holder 18+. |
| Owner must supply/choose | F14. Confirm Expert 18+ remains. |
| Solicitor must confirm | Whether 18+ is required/appropriate; how to state it in Terms. |
| Downstream | Terms, signup/activation, profile (P09). |

### D08 — Insurance claims

| Field | Content |
|---|---|
| Status | **OWNER CAN DECIDE** + **OWNER FACT REQUIRED** (F10, F11) |
| Question | May Taskio say Experts are insured, or that Taskio is insured? |
| Current repo/product position | No insurance verification in product. Draft banner lists insurance as unresolved. |
| Recommended working business position | No Expert-insured claim unless Taskio verifies insurance. No Taskio-insured claim until F10 is supplied. |
| Owner must supply/choose | F10, F11. |
| Solicitor must confirm | Any residual wording if insurance is unverified. |
| Downstream | Landing, Terms, Expert onboarding (P09). |

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
| Status | **OWNER CAN DECIDE** + **OWNER FACT REQUIRED** (F15) |
| Question | Ship AI assistants at controlled launch, or keep them off/hidden? |
| Current repo/product position | Optional Gemini job-description and quote drafting. Hidden when API returns `fallback`. Not used for matching or auto-verify. Expert risk scoring exists for **admin** flags and does not auto-verify. |
| Recommended working business position | Assistants remain non-essential and may be disabled if provider/privacy is not launch-ready. |
| Owner must supply/choose | F15. |
| Solicitor must confirm | Whether Gemini (if on) must be named; ADM transparency from 10 December 2026 if risk scoring affects user rights. |
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

---

## 5. Solicitor decision register

Matters that require **Australian solicitor confirmation**. Do not treat owner working positions as answers.

| ID | Matter |
|---|---|
| S01 | Privacy Act / APP applicability (including small-business exception inputs from F09, F12, F13) |
| S02 | Voluntary APP-compliance wording if technically exempt |
| S03 | APP 8 / overseas disclosure (Postmark, Google/Firebase, GA4, Stripe, reCAPTCHA, Gemini if enabled) — **countries not to be guessed from brand** |
| S04 | Exact entity / ABN / address / contact disclosure requirements (after F01–F08) |
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
| S19 | Insurance wording |
| S20 | Age eligibility |
| S21 | Spam Act treatment of E01–E05 (currently sparse/factual; no unsubscribe; no promo found) |
| S22 | Deletion / retention obligations vs current anonymise-only implementation |
| S23 | Privacy complaints handling / contact |
| S24 | NDB / data-breach posture (do not assert NDB duty until applicability is confirmed) |
| S25 | Automated decision-making transparency (from 10 December 2026) vs admin risk scoring |
| S26 | AI / provider disclosures (Gemini if launch-on) |

---

## 6. Remediation dependency map (P09 after P06 approval)

Do **not** start these until P06 PASS (approved text / decisions). P09 implements; it does not invent legal conclusions.

| Approved P06 decision | Later P09 / ops work |
|---|---|
| Entity / ABN / address / contact (F01–F08 + S04) | Terms + Privacy identity block; footer; invoice/support identity |
| Privacy Act / voluntary APP wording (D01, S01–S02) | Privacy Policy rewrite (solicitor-approved); complaint path |
| Approved processor / overseas wording (D12, S03) | Privacy Policy update → collection notices → named-provider disclosure on relevant surfaces |
| Marketplace + underlying contract (D02–D03, S05–S06) | Terms; landing role copy; quote/job screens; dispute runbook |
| Payment role wording (D04, S07) | Terms; payment screens; E02/E04 templates; avoid transfer/payout conflation |
| Verified Expert definition (D05, S17) | Landing copy; onboarding; badge/help text; remove unsupported “licensed/insured/safe” implications |
| Licensed-work boundary (D06, S18) | Catalog warnings; support refusal playbook; job-post copy |
| Age rules (D07, S20) | Terms; activation/profile gates if required |
| Insurance (D08, S19) | Remove or add only verified claims |
| Refund / dispute model (D09, S08–S10, S14) | Terms; job cancellation UI; support runbook; E05 alignment |
| Retention decision (D13, S22) | Privacy Policy claims; deletion jobs/automation; P08 operations |
| Analytics naming / production hold (D11) | Privacy vs `docs/ANALYTICS.md`; production GA4 remains a **separate RED** enablement |
| App Check / reCAPTCHA disclosure | Privacy technical-processing wording; **do not** change enforcement here |
| AI / ADM (D10, S25–S26) | Hide or disclose assistants; admin risk-scoring transparency if required |
| Spam Act confirmation (S21) | Keep transactional emails factual; do **not** auto-add unsubscribe unless advised |
| Login / activation legal links | Footer/onboarding Privacy + Terms **after** approved pages exist |
| Draft banner removal | Only when solicitor-approved production documents replace drafts |

Engineering/copy that is **unsafe to do before approval** (do not treat as launch blockers by themselves): login footer links, naming GA4/Postmark in UI, “verified” tooltip, “funds held” email tweak, catalog “safely” wording.

---

## 7. Explicit non-goals of this pack

This documentation batch must **not**:

- rewrite Terms or Privacy Policy
- add legal links or consent boxes
- change payment, verified, or landing copy
- rewrite retention/deletion code
- change AI, analytics, App Check, or email
- deploy, push, or mutate cloud resources
- mark P06 PASS

Those belong after approved P06 decisions, generally under **P09** (and separate RED production enablement for email/analytics/App Check).
