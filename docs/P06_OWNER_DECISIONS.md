# P06 owner decision pack

**Status (this document):** PREPARED — owner facts recorded 9 September 2026; lean alignment 12 September 2026; **Controlled Open-Demand Pilot + posting gate 13 September 2026**. Not solicitor-approved, not legal advice, not P06 PASS.

**INTERNAL MODEL NAME:** Controlled Open-Demand Pilot. Admin design: `docs/PILOT_OPERATIONS_COCKPIT.md` (audit/design only; not implemented).

| Classification | State |
|---|---|
| P06 INVENTORY | **COMPLETE** (read-only preflight; no Terms/Privacy rewrite) |
| P06 OWNER DECISION PACK | **PREPARED** (this file + `docs/P06_SOLICITOR_BRIEF.md`) |
| P06 OWNER FACTS | **COMPLETE** (working facts below; public street address still withheld) |
| P06 STRUCTURE DECISION | **LEAN CONTROLLED SOLE-TRADER PILOT — OWNER WORKING POSITION** (not an automatic Pty Ltd launch blocker) |
| P06 LEGAL STRUCTURE REVIEW | **REQUIRED before controlled real-user pilot** — current sole-trader plan permitted by owner, **subject to AU solicitor confirmation** |
| P06 COMPANY CONVERSION | **DEFERRED** unless solicitor advises it is required/materially preferable before pilot; **must be reconsidered before broader scaling** |
| P06 AU SOLICITOR REVIEW | **PENDING** (Stage 1 controlled pilot + Stage 2 broader scale — see solicitor brief) |
| P06 INSURANCE REVIEW | **PENDING** — minimum sensible **pilot** cover to be reviewed with broker/solicitor before real users. Broad/expensive cover is **not** an automatic launch blocker |
| P06 ACCOUNTING MARKETPLACE/GST CONFIRMATION | **PENDING** |
| P06 PILOT MODEL | **CONTROLLED OPEN-DEMAND PILOT** — posting **CLOSED** until activation gate + explicit owner/admin switch. 15 Experts does **not** auto-open posting |
| P06 REMEDIATION | **NOT STARTED** |
| P06 OVERALL | **OPEN** |

P09 remains **blocked** until P06 PASS. Do not implement UI/copy/retention/analytics/email/App Check changes from this pack.

This pack records **owner-confirmed working facts**, **lean validation working positions**, and **open professional questions**. It does **not** make Privacy Act conclusions, rewrite Terms or Privacy Policy, invent a company, or treat Pty Ltd incorporation or broad insurance spend as automatic launch blockers.

Do **not** describe Taskio as **Taskio Pty Ltd** or as **a company** while the sole-trader pilot position stands.

**Lean validation (owner intent):** reach a **controlled real-user pilot** without unnecessary pre-revenue corporate/insurance spend, while still obtaining **focused** legal and insurance advice before real users. This does **not** mean ignoring liability, privacy, ACL, insurance, or safety. A sole-trader structure does **not** create limited liability. Incorporating later does **not** eliminate personal or director liability.

---

## How to use / professional review sequence

1. Owner facts — **COMPLETE**.
2. **Focused** AU commercial/privacy solicitor review for **Stage 1 (controlled pilot)** and **Stage 2 (broader scale)** — this pack + `docs/P06_SOLICITOR_BRIEF.md` + draft `/terms` and `/privacy`.
3. **Focused** Australian business-insurance broker discussion/quote: what **minimum sensible pilot** cover is appropriate (not “buy every policy before PMF”).
4. Accountant confirmation of Stripe Connect marketplace / GST / invoicing treatment.
5. If the solicitor advises incorporation is **required or materially preferable before the pilot**, address it **before P10/P11**.
6. Owner accepts or finalises professional recommendations.
7. P06 legal/privacy decisions become **APPROVED** (only then is P06 eligible to PASS).
8. P09 implements approved Terms/Privacy/trust/product changes.
9. P07 / P08 / P10 follow the launch-readiness dependency plan.

Do **not** start P09 yet. Do **not** add insurance badges or publish legal claims from this pack.

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
| Structure | **Lean controlled sole-trader pilot.** Pty Ltd is **not** automatically required by the tracker before the controlled pilot. Owner will obtain focused AU legal advice on whether the limited pilot may proceed as a sole trader. If counsel says incorporate first, do so before P10/P11. Revisit company conversion **before broader scaling**. Do not describe Taskio as a company or Pty Ltd. Do not claim sole-trader limited liability or that a Pty Ltd eliminates personal/director liability. |
| Taskio insurance | **NOT YET CONFIRMED / BROKER REVIEW REQUIRED.** Do not state Taskio is insured, that Taskio needs no insurance, or that any named policy is legally mandatory. Before real users: focused broker discussion on **minimum sensible pilot** cover (questions may include public liability, cyber, professional/management/platform-related cover). Broad/expensive cover is **not** an automatic launch blocker. |
| Expert insurance | Collect insurance **status**. Ask whether the Expert holds current public-liability insurance. If they say they are insured, Taskio **may** request a certificate of currency. Call an Expert “insurance verified” **only** if Taskio actually checks current evidence. Do **not** imply Taskio provides platform-wide insurance, that every Expert is insured, or that a policy covers a specific Taskio job. Whether insurance is **mandatory for all founding Experts** is an **owner + solicitor + broker** decision — **not** an automatic tracker requirement. Higher-risk categories may later require verified insurance. |
| Refunds | **Before release:** eligible funded / unreleased amounts can be refunded. **After release:** no automatic refund; manual support / dispute process. Subject to ACL / legal review. |
| AI | Gemini / AI assistants **OFF** at controlled launch unless approved privacy disclosure, provider configuration, and legal/privacy review are complete. AI remains **non-essential**. |
| Analytics | **Production** analytics may only be enabled after privacy wording and configuration are approved. Staging GA4 must not be treated as production disclosure. |
| Cross-border | Taskio intends to **transparently disclose** relevant third-party / overseas processing once provider and location wording is legally verified. Do not guess destination countries from brand names. |

---

## 3. Owner-confirmed working facts

Recorded **9 September 2026** from owner confirmation; lean-pilot insurance/structure alignment **12 September 2026**. These are **working facts for professional review**, not solicitor-approved public legal-page text. Do not copy them into Terms/Privacy until P09 after P06 PASS.

| ID | Fact | Owner-confirmed working fact |
|---|---|---|
| F01 | Exact legal entity / trading identity | **Saeed Zafari trading as Taskio**. Do **not** describe as Taskio Pty Ltd or as a company. |
| F02 | Entity type | **Individual / Sole Trader** |
| F03 | ABN | **15 729 254 373** |
| F04 | ACN | **Not applicable** under the current sole-trader structure. Taskio does **not** currently have an ACN. |
| F05 | Public-facing / service-of-documents address | Principal/business location is **home-based in Victoria**. Public street address should **not** be unnecessarily published. Exact public/service-of-documents address requirements remain subject to **solicitor advice**. Do **not** place the owner's home street address into public-facing legal text without an explicit legal requirement **and** owner approval. The residential street address is **not recorded** in this repository. |
| F06 | Public privacy / contact email | **admin@taskio.com.au** |
| F07 | Support email | **support@taskio.com.au** |
| F08 | Formal privacy contact | **YES** — **admin@taskio.com.au** |
| F09 | Annual turnover | Taskio is currently in **pre-launch / validation stage**. Previously recorded working category: **AUD 3 million or less** (no exact revenue figure). This is a **fact input only**. Do **not** treat the small-business turnover threshold as a Privacy Act exemption conclusion. Applicability remains a **solicitor question**. |
| F10 | Taskio platform/operator insurance | **NOT YET CONFIRMED / BROKER REVIEW REQUIRED.** Do not state Taskio is insured, that Taskio does not need insurance, or that any particular policy is legally mandatory. See §2 and D08. |
| F11 | Expert insurance working approach | **Collect status.** Ask whether the Expert holds current public-liability insurance. If they say they are insured, Taskio may request evidence (e.g. certificate of currency). “Insurance verified” **only** if Taskio actually checks current evidence. Mandatory-for-all-founding-Experts is **owner + solicitor + broker** — not an automatic tracker requirement. |
| F12 | Off-repo personal-information handling | Limited off-platform handling is **expected**, including potentially `admin@taskio.com.au`, `support@taskio.com.au`, Microsoft 365 / Outlook, manual Expert verification correspondence, support/dispute evidence, insurance certificates if collected, and temporary operator files used for legitimate support/verification. **Minimise** copies; avoid uncontrolled local spreadsheets/downloads. Exact off-repo storage, access, and retention must be documented before controlled launch under **P08/P09**. Do **not** claim that no off-platform processing exists, or that all PI exists only in Firebase. |
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
| Current repo/product position | Product collects personal information. Privacy Policy is a **draft**. Privacy Act applicability is **not** determined in-repo. Stage is **pre-launch / validation**. F09 is a fact **input** only — not an exemption conclusion. |
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
| Current repo/product position | Landing repeats “verified Experts” / “invited and verified by Taskio.” Actual process: invite-only, admin `verified=true`, profile complete, Stripe onboarding, ABN lookup if configured. **No** licence, insurance, or criminal-history check **in code**. “Verified Expert” must **not** automatically imply insurance verified, trade licence verified, police/background check, government certification, or workmanship guarantee. |
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
| Status | **OWNER CONFIRMED LEAN WORKING POSITION** + **P06 INSURANCE REVIEW PENDING** + **AU SOLICITOR / BROKER CONFIRMATION REQUIRED** |
| Question | What insurance must exist before the controlled pilot, and what may Taskio say? |
| Current repo/product position | No insurance verification in product. Draft banner lists insurance as unresolved. Platform/operator insurance **not yet confirmed**. |
| Recommended working business position | **Taskio:** obtain a focused AU broker discussion/quote on **minimum sensible pilot** cover (questions may include public liability, cyber, professional/management/platform-related cover). Do not predetermine mandatory policies. Do not state Taskio is insured or needs no insurance. Broad/expensive cover is not an automatic launch blocker. **Experts:** collect status; request evidence if they say they are insured; “insurance verified” only after Taskio checks current evidence. Do not imply platform-wide insurance, that every Expert is insured, or that a policy covers a specific job. Mandatory-for-all-founding-Experts = owner + solicitor + broker. |
| Owner must supply/choose | **Recorded:** F10, F11 (lean approach). |
| Solicitor / broker must confirm | Minimum sensible pilot cover; whether Expert insurance must be mandatory for all founding Experts; residual wording if some Experts are uninsured or Taskio cover is not yet bound. |
| Downstream | Landing, Terms, Expert onboarding (P09). **Do not add insurance badges or claims in UI now.** |

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

### D14 — Lean controlled sole-trader pilot

| Field | Content |
|---|---|
| Status | **OWNER CONFIRMED WORKING POSITION** + **AU SOLICITOR CONFIRMATION REQUIRED** before real users |
| Question | May the Controlled Open-Demand Pilot (posting closed until supply gate + explicit activation) proceed under the current sole-trader structure? |
| Current repo/product position | Draft legal pages do not name an entity. **Current product** is still invite-only Inner Melbourne Phase 1. Intended model is Controlled Open-Demand (not implemented). |
| Recommended working business position | Owner prefers to **validate first** as **Saeed Zafari trading as Taskio** (individual / sole trader; ABN 15 729 254 373; no ACN) to avoid unnecessary pre-revenue company/accounting/compliance cost. **Pty Ltd is not automatically required by this tracker before the controlled pilot.** If the solicitor advises incorporation is required or materially preferable before pilot launch, address it **before P10/P11**. A sole trader does **not** have limited liability. |
| Owner must supply/choose | **Recorded.** See §5–§6. |
| Solicitor must confirm | Whether the limited pilot may reasonably proceed as a sole trader given marketplace activity, physical household work, Stripe Connect, refund/dispute exposure, ACL, and property-damage / personal-injury risk; how to disclose identity/ABN; public address without publishing a home street address. |
| Accountant must confirm | Stripe Connect / commission-as-revenue / GST / invoicing (see §7). |
| Downstream | Terms/Privacy identity block (P09); do **not** implement until P06 PASS. |

---

## 5. Controlled pilot definition and legal-structure working position

**WORKING OWNER POSITION — LEGAL STRUCTURE (12 September 2026, lean alignment)**

Taskio currently operates as:

- **Saeed Zafari trading as Taskio**
- **Individual / Sole Trader**
- **ABN 15 729 254 373**
- **No ACN**

The owner prefers to validate the business with a small **Controlled Open-Demand Pilot** (posting closed until the supply gate) before incurring unnecessary company/accounting/compliance costs.

A Pty Ltd company is therefore **not automatically required by the Taskio tracker before the controlled pilot**.

Before admitting real pilot users, the owner will obtain **focused Australian commercial/legal advice** confirming whether operating the limited pilot as a sole trader is acceptable given:

- marketplace activity
- physical household work
- payments through Stripe Connect
- refund / dispute exposure
- consumer law
- potential property damage / personal injury risk

If the solicitor advises incorporation is **required or materially preferable** before pilot launch, address it **before P10/P11**.

This limited operating model is part of Taskio's **risk-control strategy** while testing product/market fit. It does **not** replace legal obligations or insurance advice. It does **not** give the operator limited liability.

### CONTROLLED PILOT means

- Inner Melbourne
- narrow Phase 1 categories
- no public Expert **open** signup (Experts are recruited / applied and manually selected)
- manual operator oversight
- every initial job monitored
- modest-value household jobs
- no licensed electrical / plumbing work
- no categories Taskio is not prepared to verify/manage
- signup/onboarding and homeowner **posting** can be paused immediately
- high-touch support

**CONTROLLED OPEN-DEMAND** (if later used as the demand model) does **not** mean homeowner task posting is open immediately. See §5A–§5B.

Do **not** describe Taskio as **Taskio Pty Ltd** or as **a company** while this position stands.

---

## 5A. Homeowner posting activation gate

**Owner working position (13 September 2026).**

Before the **pilot supply/readiness gate** is satisfied:

- the public Taskio landing site **may** be visible
- Expert recruitment / application **may** operate
- homeowners **may** be allowed to join a waitlist / register interest
- **real homeowner task posting must remain CLOSED or capacity-gated**
- do **not** send paid homeowner acquisition into an active marketplace that does not yet have adequate Expert supply

### Initial supply gate (all must be true)

Real homeowner task posting may be enabled only when **all** of the following are true:

1. approximately **15 ACTIVE LAUNCH-READY EXPERTS**
2. **adequate coverage across every Phase 1 category** Taskio intends to enable — ideally at least **4–5 launch-ready Experts** capable of servicing **each enabled category**
3. **adequate coverage of the approved launch geography**
4. **all other required Taskio launch-readiness gates** for real users are satisfied
5. **owner/admin explicitly activates** homeowner acquisition / posting

The raw number **15 is not sufficient by itself** if category or geographic coverage is weak.

“Launch-ready Expert” here means an Expert Taskio is actually prepared to invite to real jobs (manual selection/verification and other eligibility Taskio actually performs — not a claim of licence, insurance, or quality guarantee unless those checks exist).

### Pre-gate user experience

Homeowners should see an appropriate **early-access / waitlist** state rather than being allowed to submit a real task into an under-supplied marketplace.

Experts may continue to be recruited and onboarded.

### Post-gate user experience

Once the gate is satisfied **and** the owner explicitly activates the pilot:

- Homeowners may enter the **public supported** Taskio posting flow **without needing a manual invitation**.
- They remain subject to supported geography, supported categories, capacity controls, account/auth requirements, and approved legal requirements.

This post-gate posting path is still the **controlled pilot**. It is **not** unrestricted public scale and is **not** by itself a company-conversion trigger.

**Do not implement** waitlist UI, posting unlock, or landing-copy changes in this documentation update. Those belong after approved P06 outcomes, generally under P09 / P11, and only when the owner activates the gate.

---

## 5B. After-activation supply floor

The **12 launch-ready Expert** figure is an **AFTER-ACTIVATION operating floor**, not the activation gate.

If active supply falls below approximately **12**, or category coverage **materially falls below target**:

Admin should flag **WATCH / PAUSE**.

The operator should consider:

- pausing homeowner acquisition
- activating waitlist mode
- narrowing categories
- narrowing geography
- recruiting replacement Experts

Do **not** allow the marketplace to continue accepting demand blindly when supply is insufficient.

### Operating targets (not SLAs, not public guarantees)

| Item | Working target |
|---|---|
| Expert recruitment | **18–20** candidates |
| Launch-ready (activation) | **~15** |
| After-activation floor | **~12** |
| Category coverage | ideally **4–5** launch-ready Experts per **enabled** Phase 1 category |
| Initial invitations per job | up to **~5** suitable Experts |
| Desired quotes | **2–3** qualified |
| First qualified response | ideally **≤ 60 minutes** (normal hours) |
| Two qualified quotes | ideally **≤ 3 hours** |
| Jobs with ≥1 quote | target **≥ 90%** |
| Zero-quote jobs | target **< 10%** |

### Pilot status (operator; never auto-open)

**NOT READY** → **READY TO OPEN** → **OPEN** / **WATCH** / **PAUSED**

The system must **not** autonomously open posting. Criteria and Admin cockpit design: `docs/PILOT_OPERATIONS_COCKPIT.md`.

---

## 6. Company-conversion triggers (before broader scaling)

These are **owner business review triggers**, **not** statutory thresholds, **not** legal advice, and **not** arbitrary revenue gates.

**COMPANY CONVERSION:** deferred unless required/advised before the pilot; **must be reconsidered before broader scaling**.

Revisit conversion to a proprietary limited company if **any** of the following occurs, or if a professional so recommends:

- unrestricted public / open signup (post-activation **capacity-gated** homeowner posting is still the controlled pilot, not this trigger)
- material increase in transaction volume
- higher-value jobs
- expansion into higher-risk categories
- taking on employees / contractors **in the Taskio business**
- outside investment / fundraising
- material recurring revenue
- solicitor / accountant / insurer recommendation
- risk profile no longer suitable for a sole-trader pilot

Do **not** define arbitrary job-count or revenue thresholds unless professionally advised.

Do **not** claim a Pty Ltd eliminates personal or director liability.

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
| S19 | Insurance: minimum sensible **pilot** cover (not a predetermined policy list); Expert “insurance verified” wording; whether founding-Expert insurance must be mandatory; residual risk if cover is not yet bound |
| S20 | Age eligibility (owner: Expert 18+ and Homeowner 18+; Terms wording) |
| S21 | Spam Act treatment of E01–E05 (currently sparse/factual; no unsubscribe; no promo found) |
| S22 | Deletion / retention obligations vs current anonymise-only implementation |
| S23 | Privacy complaints handling / contact |
| S24 | NDB / data-breach posture (do not assert NDB duty until applicability is confirmed) |
| S25 | Automated decision-making transparency (from 10 December 2026) vs admin risk scoring |
| S26 | AI / provider disclosures (Gemini **OFF** at controlled launch unless later approved) |
| S27 | **Stage 1:** can the Controlled Open-Demand Pilot (posting closed until gate + explicit activation) reasonably proceed as a sole trader, and what minimum legal/insurance controls should be in place? **Stage 2:** when should Taskio transition to a Pty Ltd, and what legal/insurance changes should accompany broader public operation? Public address without publishing a home street address. Do not treat Pty Ltd as automatically required now. |

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
| Insurance (D08, S19) | No badges until approved. “Insurance verified” only if evidence actually checked. Do not imply all Experts or Taskio are insured |
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
- treat Pty Ltd incorporation as an automatic launch blocker
- treat broad/expensive insurance as an automatic launch blocker
- claim Taskio is insured, Experts are insured, a sole trader has limited liability, or that a company eliminates personal/director liability

Those belong after approved P06 decisions, generally under **P09** (and separate RED production enablement for email/analytics/App Check).
