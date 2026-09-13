# Pilot Operations Cockpit — audit and design

**Status:** DESIGN plus **Admin Slices 1–3** (data foundation, visual cockpit, Job Attention Queue; 13 September 2026, local). Persisted Pilot Settings / posting activation are **not** implemented.

**Date:** 13 September 2026  
**Companion operating rules:** `docs/P06_OWNER_DECISIONS.md` §5–§5B  
**Canonical catalog:** `shared/expertiseCatalog.js` — all Phase 1 categories treated as enabled until a persisted Pilot Settings switch exists
**Canonical geography:** `shared/auLocations.js` (`melbournePilotSuburbNames` / `melbournePilotLocations`) — all 8 Inner Melbourne areas treated as enabled until a persisted Pilot Settings switch exists

P06 remains **OPEN**. P09 remains **blocked** for legal/trust copy. This Admin work must **not** imply legal review is complete.

### Implementation status (do not change operating rules)

**IMPLEMENTED (Slice 1 — data foundation)**

- `acceptingJobs` (boolean; missing/legacy ⇒ not accepting)
- `serviceAreas[]` (canonical suburb names only; missing/legacy ⇒ `[]`; home-base `serviceLocation` is not a substitute)
- Derived launch-readiness (`computeLaunchReadiness` — no stored `launchReady` flag)
- Authoritative Admin supply data: `GET /api/admin/pilot-supply` (pages all tradies; not UI `limit=50`)
- Minimal Expert profile controls to maintain the two fields

**IMPLEMENTED (Slice 2 — visual cockpit, local)**

- Admin dashboard **Supply readiness** section (display-only **supply** status, launch-ready / floor / category / geography cards)
- Slice 2 states only: `LOADING` / `DATA UNAVAILABLE` / `DATA INCOMPLETE` / `SUPPLY NOT READY` / `SUPPLY READY`
- Slice 2 must **not** show `READY TO OPEN`. That belongs to the future Pilot Status engine, which must evaluate the **full** activation gate, not Expert supply alone
- Category HEALTHY / ADEQUATE / UNDER-COVERED and geography COVERED / UNCOVERED from `GET /api/admin/pilot-supply`
- Truncation / scan-incomplete fail-safe (`DATA INCOMPLETE`); API error (`DATA UNAVAILABLE`)
- Homeowner posting shown **CLOSED** with no activation control

**IMPLEMENTED (Slice 3 — Job Attention Queue, local)**

- `GET /api/admin/job-attention` (admin-only, bounded job scan, batched quote counts, one Expert supply load)
- Display queue under Immediate Attention with priority, reason, age, coverage, and safe job-detail actions
- Pilot quote-liquidity triggers: **0 quotes >60m (HIGH)** and **exactly 1 quote >3h (MEDIUM)** — internal ops, not customer SLAs
- 6h / 24h quote-liquidity rules superseded (legacy query keys still alias the new filters)
- Job-specific `suitableLaunchReadyCount` when `primaryCategory` + `locationSuburb` are canonical; otherwise shown as unavailable (no false “no supply” alert)
- Quote-liquidity clock is `quoteReadyAt` — the server time the job first became available for Expert quoting. This is **not** a work appointment. Jobs ready at creation get `quoteReadyAt = createdAt` (same server timestamp). Photo-gated jobs get it on the first `postingReady=false → true` transition. `postingReady===false` jobs are excluded from quoting alerts
- `LOW_INVITE_COVERAGE` waits **60 minutes** so a just-opened job with 1–4 invites is not immediately MEDIUM. `NO_EXPERTS_INVITED` may still alert immediately
- **`FUNDED_JOB_STALLED` is not implemented.** `job.timeline` is a posting preference string (`Today` / `Tomorrow` / `Within 2 days` / `Flexible` / or a YYYY-MM-DD request). There is no agreed/scheduled work timestamp. `fundedAt` alone is not stall evidence
- `COMPLETION_STALLED` remains: `COMPLETED` + explicit `completedAt` older than 48h, and payment is not already released/refunded/paid

**NOT YET IMPLEMENTED**

- Persisted Pilot Status / Pilot OPEN/CLOSED/PAUSED control
- Waitlist
- Homeowner open posting
- Liquidity / marketplace funnel
- Responsiveness analytics

---

## 1. Internal launch model

**INTERNAL MODEL NAME:** Controlled Open-Demand Pilot

| Phase | What is allowed | What is not |
|---|---|---|
| **PRE-ACTIVATION** | Public landing may exist. Experts may be recruited/onboarded. Homeowners may register interest / join a waitlist. | Real homeowner **task posting CLOSED** (or capacity-gated). No paid homeowner acquisition into an under-supplied marketplace. |
| **READY TO OPEN** | Activation gate satisfied. | Posting still **CLOSED** until owner/admin **explicitly** switches it on. **Never auto-open.** |
| **OPEN (post-activation)** | Homeowners use the supported public posting flow **without a manual invitation**. Geography / category / capacity / auth / approved legal controls still apply. Expert supply remains gated and verified. | Unrestricted public scale. Open Expert signup. Licensed/high-regulatory work. |
| **WATCH / PAUSED** | Operator may pause acquisition, enable waitlist, narrow categories/geography, recruit. | Accepting demand blindly when supply or coverage is weak. Automatic shutdown without operator confirmation (unless a later approved safety rule requires it). |

**ACTIVATION GATE — all required:**

A. approximately **15 ACTIVE LAUNCH-READY EXPERTS** (definition in §2 — technical eligibility **plus** `acceptingJobs=true` **plus** at least one enabled `serviceAreas[]` value)
B. every **enabled** Phase 1 category has adequate launch-ready coverage (**minimum 4**, **healthy target 5**). The hard 4–5 band applies to **categories**, not to every suburb
C. approved launch geography has **credible service coverage** as **one Inner Melbourne zone** (see §8). Not 4–5 Experts independently in every suburb
D. all other real-user launch-readiness gates are satisfied
E. owner/admin **explicitly activates** homeowner posting/acquisition  

**15 Experts alone is not sufficient.** Do not count technically eligible but unavailable / area-unspecified Experts toward A.

**AFTER-ACTIVATION FLOOR:** ~**12** active launch-ready Experts. Below floor or material coverage drop → **WATCH / PAUSE**.

### Operating targets (not customer SLAs, not legal promises)

| Target | Value |
|---|---|
| Expert recruitment | **18–20** candidates |
| Launch-ready (activation) | **~15** |
| After-activation floor | **~12** |
| Category coverage | **minimum 4** / **healthy target 5** launch-ready Experts per **enabled** Phase 1 category |
| Initial job invitations | up to **~5** suitable Experts |
| Desired quotes | **2–3** qualified quotes |
| First qualified response | ideally **≤ 60 minutes** in normal operating periods |
| Two qualified quotes | ideally **≤ 3 hours** |
| Supported jobs with ≥1 quote | target **≥ 90%** |
| Zero-quote jobs | target **< 10%** |

Do **not** expose these as guaranteed customer SLAs.

---

## 2. Launch-ready Expert — derived, not a stored flag

Do **not** invent a stored `launchReady` boolean. Derive from authoritative fields.

**For the real Controlled Open-Demand Pilot, an Expert counts toward the ~15 / ~12 supply metrics only when technical eligibility AND both operational supply conditions are known.**

### Technical eligibility (already in repo)

Align with `backend/src/utils/v11TradieEligibility.js` and tighten admin `getReadiness()` so undefined is **not** treated as OK:

- `role === 'tradie'`
- `status === 'active'`
- `verified === true` (manual admin)
- phone verified
- profile complete (identity, bio, photo, `expertiseApproved[]`)
- ≥1 approved Phase 1 expertise
- Stripe onboarding complete when Stripe is enabled
- ABN verified if required
- business type set
- 18+ (`dob`)

`serviceLocation` (home-base suburb/postcode/state) remains part of profile completeness. It is **not** a substitute for `serviceAreas[]`.

### Operational supply conditions — LAUNCH-CRITICAL (implemented in Slice 1)

These **supplement** technical eligibility. They are **small data/profile changes required before real homeowner posting opens**. Without them the ~15 count and geography coverage would be misleading.

| Field | MVP | Why required |
|---|---|---|
| `acceptingJobs` | boolean `true` / `false` | Expert is currently willing/available to receive Taskio pilot opportunities. No calendar or scheduling system. |
| `serviceAreas[]` | multi-select of **canonical** `melbournePilotLocations` / `melbournePilotSuburbs` values | Explicit areas the Expert will service. No GIS, radius, maps, or travel-time. |

**Launch-ready (derived) =** technical eligibility **AND** `acceptingJobs === true` **AND** `serviceAreas[]` contains **at least one enabled** pilot area.

Do **not** infer accepting-jobs from `verified`. Do **not** infer service areas from `serviceLocation`.

**Not in MVP:** weekly availability calendars, booking calendars, route optimisation, travel-time, radius matching, GIS, maps, predictive availability.

### A. Fields available now

Technical eligibility fields plus Slice 1 `acceptingJobs` and `serviceAreas[]`. Admin “Ready to quote” remains **technical eligibility only**. Launch-ready counts come from `GET /api/admin/pilot-supply`.

### B. Derivable now

- **Launch-ready count:** technical eligibility + `acceptingJobs=true` + ≥1 enabled `serviceAreas[]` value (`computeLaunchReadiness`).
- **Category coverage:** count **only launch-ready** Experts whose `expertiseApproved` intersects that enabled Phase 1 category.
- **Geography coverage:** count **only launch-ready** Experts whose `serviceAreas[]` includes an enabled pilot area. **Never** present `serviceLocation` as service-area coverage.
- Invite / quote / funnel: existing job and quote data.

### C. Still missing before posting opens

| Gap | Why | Smallest later change | Launch-critical? |
|---|---|---|---|
| Waitlist / posting switch | No persisted CLOSED/OPEN/PAUSED | Audited config + confirm | **YES** before OPEN |
| Invitation-to-quote aggregates | No Expert-level API | Bounded admin join | Useful; not a substitute for the two fields |

### D. Do not add (gold-plating)

- GIS / maps / radius / travel-time / route optimisation
- Weekly or booking calendars; predictive availability
- Automatic punitive ranking
- Duplicate stored `launchReady` boolean
- Analytics warehouse

---

## 3. Current Admin Panel — implementation audit

Inspected routes in `frontend/src/App.js` and `frontend/src/features/admin/**`.

| Surface | Path / location | Verdict |
|---|---|---|
| Auth gate | `AdminRoute.js` — claims `admin` or `role=admin` | **GOOD** |
| Login | `/admin` → `Login adminMode` | **GOOD** |
| Dashboard | `/admin/dashboard` | **USABLE BUT WEAK** for pilot readiness |
| Full queue | `/admin/task-queue` | **USABLE** |
| Job detail | `/admin/job/:jobId` | **GOOD** (invite, unassign, notes, payment, variations, chat freeze, event log) |
| User detail | `/admin/user/:uid` | **GOOD** |
| Monitoring | `/admin/monitoring` | **USABLE** (secondary) |
| Support | `/admin/support` | **USABLE** |
| Profile change requests | `/admin/profile-change-requests` | **USABLE** |
| Daily checklist | `/admin/daily-checklist` | **USABLE** / slightly extra |
| Admin profile/password | `/admin/profile`, `/admin/password` | **GOOD** |

**Currently good**

- Claim-based AdminRoute; 401/403 error banners
- Job queue with status filters, workflow owner/SLA, bulk unassign
- Invite Experts + nudge + remove; expertise filter
- Verify / enable-disable / user ops modals; countdown confirms on refund/release (`AdminActionsSection`)
- Attention strip: 0 quotes after **60m**, exactly 1 quote after **3h**, disputes, failed payments, stale profile requests. Legacy `no_offer_6h` / `stale_open_24h` query keys alias the new filters. 24h remains a **dispute** stale card only, not a quote-liquidity trigger.
- Expert “Ready now” filter and readiness chips
- Support tickets + profile-change queue
- Loading/error on dashboard fetch

**Currently usable but weak**

- Overview is generic marketplace counts, not **can we open posting?**
- Quote-liquidity attention now uses the pilot **60m / 3h** triggers; do not reintroduce a 6h / 24h quoting card
- Users loaded with `limit=50` + cursor — **launch-ready 13/15 can be wrong** if not all Experts are fetched
- `getReadiness` treats **undefined** phone/profile/location as OK (lenient). Server eligibility is stricter
- No category-coverage matrix; expertise filter is per-key not per operating category
- Geography is a single `serviceLocation`, not shown as coverage vs the 8-suburb allowlist
- First-offer KPI is **7-day average hours** (beta), not 60-minute / 3-hour hit-rate
- Workflow queue (assigned-to-me / overdue) is useful ops but not the same as the job-attention queue
- Desktop-first; tablet is cramped; attention cards are colour-heavy
- Nav is tabs + several sibling routes (monitoring, checklist, profile requests) rather than one cockpit

**Missing (launch-critical cockpit)**

- Pilot status **NOT READY / READY TO OPEN / OPEN / WATCH / PAUSED**
- Launch-ready **n / 15** and floor **n / 12**
- Category coverage table (HEALTHY / WATCH / UNDER-COVERED)
- Home-base geography table
- Job attention reasons at **60 min / 3 h / invite-count**
- ≥1 / ≥2 quote coverage %, zero-quote %
- Explicit **Pilot Settings** (posting CLOSED/OPEN/PAUSED, waitlist)
- Audit log for posting-state changes

**Unnecessary / overcomplex for launch**

- Automated risk-score cards as a primary readiness signal
- Boosted-visibility as a launch KPI
- Decorative extra 7-day intervention % as a top-row decision
- New BI / pie / gauges / maps

---

## 4. Pilot status model (never auto-open)

Owner/admin activation is **always** required to reach **OPEN**. The system must **not** autonomously open posting.

| State | Criteria (proposed) |
|---|---|
| **NOT READY** | Activation gate not satisfied (launch-ready < ~15, **or** an enabled category below coverage target, **or** geography coverage inadequate, **or** other real-user gates not PASS). |
| **READY TO OPEN** | Gate A–D satisfied. Posting still **CLOSED**. UI may show “Ready — confirm to open”. |
| **OPEN** | Owner/admin has **explicitly** set homeowner posting to OPEN (confirmation required). |
| **WATCH** | Posting is OPEN **and** (launch-ready < ~12 **or** an enabled category materially below target **or** geography/liquidity degrading — e.g. zero-quote rate > 10% or first-response miss rate high). Flag only; do **not** auto-pause. |
| **PAUSED** | Owner/admin set posting to PAUSED / waitlist / capacity-gated. New homeowner demand stopped. |

Suggested operator responses in WATCH/PAUSED: pause acquisition, waitlist on, narrow categories, narrow geography, recruit replacements.

---

## 5. Proposed Overview layout (desktop-first)

Every block must support a decision. No decorative BI.

**Top row — Pilot readiness**

| Card | Decision |
|---|---|
| Pilot Status | Stay closed / confirm open / watch / pause |
| Launch-Ready Experts `n / 15` | Are we at the activation target? |
| Operating floor `n / 12` | After OPEN, are we above the floor? |
| Category coverage `k / N` adequately covered | Which categories block opening? |
| Jobs needing attention | What will hurt homeowners today? |

**Second row — Marketplace health** (meaningful **after** jobs exist; show “—” pre-activation)

| Card | Decision |
|---|---|
| ≥1 quote coverage % | Liquidity |
| ≥2 quote coverage % | Choice quality |
| First response (median or % ≤ 60 min) | Speed |
| Zero-quote jobs (count + %) | Failures |

**Main — Job Attention Queue** (highest priority after readiness)

**Supply —** category coverage table + Expert responsiveness (invite→quote, last activity)

**Marketplace —** simple funnel (counts + conversion %, 7d / 30d / pilot-to-date)

Do not communicate state by colour alone: status **text + chip + count**.

---

## 6. KPI feasibility

| KPI | Feasibility | Notes |
|---|---|---|
| Pilot Status | **C** — needs persisted posting state + derived gate | Do not fake OPEN from Expert count |
| Launch-ready `n / 15` | **A** via `GET /api/admin/pilot-supply` + Admin cockpit (Slice 2) | Derived technical eligibility + accepting + ≥1 enabled area. Pages past UI `limit=50`. If `totals.truncated` / `scanComplete=false`, do **not** treat counts as proving READY |
| Operating floor `n / 12` | same as launch-ready count | |
| Category coverage `k / N` | **B** data / **C** visuals | Count **only launch-ready** Experts per enabled category |
| Geographic coverage | **B** data / **C** visuals | From `serviceAreas[]`. Do **not** present home-base as service coverage |
| Open jobs | **A** | Existing `stats.openJobs` |
| Jobs needing attention | **B** with new time/invite rules | Current 6h/24h is too slow |
| Zero-quote jobs | **B** | Quote meta already fetched for open jobs (capped 500) |
| ≥1 / ≥2 quote % | **B** | Bounded job set + quote counts |
| First-response time | **B** | Existing first-quote timestamps; report **median minutes** and **% ≤ 60 min**, not only 7d average hours |

Do **not** ship a KPI that pretends Experts “cover” a suburb they did not list.

---

## 7. Category coverage visual

**Canonical keys:** `shared/expertiseCatalog.js` `phase1ExpertiseCatalog`.

**MVP rows:** group by catalog **`category`** (8 groups):

Mounting · Hanging · Curtains & Blinds · Furniture Assembly · Minor Repairs · Wall Patch & Touch-up · Silicone Sealing · Apartment Make-Good

Optional operating merge (matches owner example): **Mounting + Hanging → “Mounting / hanging”** (7 rows). Record the merge in Pilot Settings if used.

Per row:

| Category | Launch-ready Experts | Minimum | Target | Status |
|---|---|---|---|---|
| … | count | 4 | 5 | HEALTHY / ADEQUATE / UNDER-COVERED |

Status text: **HEALTHY** if ≥5; **ADEQUATE** (watch band) if 4; **UNDER-COVERED** if ≤3. Disabled categories omitted.

These category totals are **readiness indicators**. They do **not** prove every category × service-area pair has adequate supply. Later job matching / attention logic should count launch-ready Experts for the job’s actual category + service area. Do not build a large category-by-suburb matrix or GIS here.

Visual: horizontal bar (count/target) + numeric count + **text** chip. Not colour-only.

---

## 8. Geography coverage

**Canonical allowlist:** `melbournePilotSuburbs` / `melbournePilotLocations` in `shared/auLocations.js`:

Melbourne, Southbank, Docklands, South Yarra, Prahran, St Kilda, Richmond, Carlton.

**Do not** duplicate this list in Admin.

**Activation model:** Inner Melbourne is **one controlled pilot zone**. Taskio does **not** require 4–5 Experts independently in every suburb before opening.

However:

- every **enabled** location must have **credible Expert service coverage** via `serviceAreas[]`
- Admin must show weak/uncovered areas (informational WATCH)
- `serviceLocation` (home-base) must **not** be interpreted as all suburbs the Expert will service
- **`serviceAreas[]` is the explicit source** for service coverage once implemented

The hard **4–5** band applies to **enabled Phase 1 categories**, not suburbs. Geography totals are also indicators only: they do **not** prove every category is covered in every listed area.

**Before `serviceAreas[]` is implemented:** do **not** show a home-base suburb table as if it were service-area coverage. A note “service-area data not yet collected — do not treat home-base as coverage” is acceptable.

**After implementation — simple table (no maps/GIS):**

| Enabled area | Launch-ready Experts listing it in `serviceAreas[]` | Status |
|---|---|---|

One-zone activation: enough launch-ready Experts have **at least one** enabled area selected, and no enabled area is left with zero service listings if that area is turned on.

---

## 9. Job Attention Queue

Highest-priority operational list. Do **not** auto-resolve.

**Flags (Slice 3 — implemented locally)**

| Reason | Data | Feasibility |
|---|---|---|
| No Experts invited | invite map empty | **B** |
| Fewer than ~5 invited and <2 quotes, after 60m | invite + quote counts + `quoteReadyAt` | **B** |
| 0 quotes after 60 min | quotes + `quoteReadyAt` | **B** |
| Only 1 quote after 3 h | quote count + `quoteReadyAt` | **B** |
| No suitable Expert supply | job category vs launch-ready with that expertise | **B** |
| Accepted, funding incomplete/stale | status / paymentState | **deferred** — no reliable awaiting-funding timestamp |
| Funded job stalled | agreed schedule | **deferred** — no reliable scheduled/agreed work timestamp; do not use `fundedAt` alone |
| Completion/approval stalled | `COMPLETED` + `completedAt` >48h | **B** (excluded once released/refunded/paid) |
| Release/payment issue | `hasAdminPaymentIssue` | **A** |
| Refund/support/cancel review | status + support | **A/B** |

**Row fields:** TSK ref · category · suburb · job age · invited count · quote count · job status · payment status · attention reason · suggested action · [View Job] [Invite Experts]

Example: `TSK-1042 · Mounting · Richmond · 1h 12m · 5 invited · 0 quotes · OPEN · 0 QUOTES > 60 MIN · [View Job] [Invite Experts]`

Current attention strip can remain as a **secondary** payment/dispute layer.

---

## 10. Expert operational statistics

| Stat | Feasibility | Use |
|---|---|---|
| Verified / active | **A** | Distinguish registered vs verified |
| Launch-ready | **B** | Derived; distinguish verified vs launch-ready |
| Categories | **A** | `expertiseApproved` |
| Service **home-base** | **A** | `serviceLocation` — display as home-base only |
| Service **areas** | **A** | `serviceAreas[]` on profile + Admin supply API |
| Accepting jobs | **A** | `acceptingJobs` on profile + Admin supply API |
| Invitations / quotes / invite→quote % | **B/C** | bounded aggregate |
| Median response time | **B/C** | invite/job time → first quote |
| Jobs awarded / completed | **B** | job assignments |
| Cancellations | **B** | job status |
| Review rating | **A/B** if reviews exist on profile | do not invent |
| Last activity | **A** weak (`updatedAt`) | |
| Stripe/onboarding | **A** | |

Distinguish: **Registered** → **Verified** → **Launch-ready** → **Responsive** (invite→quote).  
Do **not** auto-punish or auto-suspend from these stats.

---

## 11. Marketplace funnel

JOB POSTED → ≥1 QUOTE → ≥2 QUOTES → QUOTE ACCEPTED → FUNDED → COMPLETED → PAYMENT RELEASED

Show count + conversion % for **7 days / 30 days / Pilot-to-date**.

**B** from admin jobs + quote meta. Keep job fetches bounded; do not scan unbounded Firestore from the browser. Prefer one admin summary endpoint when counts exceed a few hundred jobs.

Avoid GA4/external analytics for this cockpit.

---

## 12. Pilot Settings (design only)

Launch-critical control surface. **Not implemented in this task.**

| Control | Values | Rules |
|---|---|---|
| Homeowner posting | CLOSED / OPEN / PAUSED | Owner must explicitly OPEN. Confirmation. Show readiness (NOT READY vs READY TO OPEN) **before** enable. **Never auto-open.** PAUSE does not require the gate. |
| Waitlist | ON / OFF | Typical: ON while CLOSED/PAUSED |
| Enabled categories | Phase 1 groups on/off | Changing coverage targets |
| Enabled geography | allowlist subset | Do not fork a second suburb list |

Security: admin/super_admin only; production mutations **RED** / auditable (`writeUserAuditLog` or equivalent). Staging may use the same UI against a config doc.

---

## 13. Information architecture (smallest change)

**Keep** existing routes. **Add** Overview as the cockpit home (replace/repurpose current dashboard top). **Add** Pilot Settings last.

Target nav:

1. **Overview** (cockpit — default `/admin/dashboard`)
2. **Jobs** (existing queue)
3. **Experts** (existing tradies tab / user list)
4. **Homeowners** (existing)
5. **Payments** (filter of jobs + existing payment panels — do not invent a new ledger)
6. **Support / Issues** (existing support + disputes attention)
7. **Pilot Settings** (new, later)

Demote `/admin/monitoring` and `/admin/daily-checklist` to links under Overview or Support — do not delete in the first implementation.

---

## 14. Data / API gap classification

| Item | Class | Missing / why | Simplest later impl | Launch-critical? |
|---|---|---|---|---|
| Launch-ready count | **B** | UI list still `limit=50` | `GET /api/admin/pilot-supply` pages tradies (cap 250). Derived; no stored `launchReady` | Data yes; cockpit visuals later |
| Category coverage | **B** | Visuals not built | Count **only launch-ready** Experts whose `expertiseApproved` ∩ catalog category | Data yes |
| Geo home-base table | **A** (display only) | Single suburb | Show `serviceLocation` as **home-base**, never as coverage | No — must not be used as coverage |
| True service-area coverage | **B** | Field implemented | `serviceAreas[]` allowlisted multi-select. Do **not** default-copy `serviceLocation` | Data yes |
| Accepting jobs | **B** | Field implemented | `acceptingJobs` boolean (no calendar) | Data yes |
| Posting CLOSED/OPEN/PAUSED | **C** | No config | Audited config doc + confirm UI | Yes before OPEN |
| Waitlist records | **C/D** | No collection | Minimal interest emails or existing waitlist if added later | Pre-activation UX; can be manual at first |
| Attention 60m / 3h / invite count | **B** | Thresholds differ from 6h/24h | Extend `adminOps` + quote/invite meta | Yes |
| ≥1 / ≥2 / zero-quote % | **B** | — | Same quote meta, bounded | Yes |
| Funnel | **B** then **C** if slow | Client aggregation on full job list | Server summary if > few hundred jobs | Yes (simple) |
| Expert response rates | **B/C** | No aggregate API | Server join invites+quotes | Yes (simple) |
| Event warehouse | **D** | — | **Do not build** | No |

**Performance:** Pilot dataset is small. Still: no unbounded browser `getDocs` of all jobs/users. Reuse `/api/admin/jobs` and a complete tradie list (capped). Quote meta already limited (open jobs 500, 7d 100). Add indexes only if new queries require them. No warehouse.

---

## 15. Accessibility (current vs required)

| Topic | Current (approx.) | Required for cockpit |
|---|---|---|
| Keyboard | Tabs have `role="tab"`; many icon/row clicks | All cards/buttons focusable; queue actions keyboardable |
| Contrast | Mixed custom greys | Follow design tokens; chips not pastel-only |
| Status | Colour cards + some text | **Text status + colour** |
| Tables | List rows | Real table or grid with headers for coverage/queue |
| Confirmations | Refund/release countdown; some `disabled` | OPEN posting **must** confirm; destructive already stronger than OPEN |
| Charts | Almost none (good) | If bars added, counts remain in text |

Tablet: stack KPI rows; keep queue as the first scroll target.

---

## 16. Launch-critical vs post-pilot

**LAUNCH-CRITICAL**

- Pilot status + posting CLOSED until explicit OPEN
- Launch-ready n/15 and floor n/12
- Category coverage
- Geography coverage from `serviceAreas[]` (one Inner Melbourne zone; never treat home-base as coverage)
- `acceptingJobs` + `serviceAreas[]` profile fields (small data change; no calendars/GIS/maps)
- Job attention queue (60m / 3h / invites)
- Quote liquidity (≥1, ≥2, zero-quote)
- Expert responsiveness (simple)
- Core funnel
- Existing job/Expert management usability (fetch-all tradies, less lenient readiness)
- Pilot Settings OPEN/PAUSE + confirm + audit

**POST-PILOT**

- Cohort/revenue BI, complex charts, heat maps
- Predictive matching, AI recommendations
- Automated Expert ranking / forecasting
- GIS
- Full availability calendars

---

## 17. Implementation sequence

**Done in Slice 1:** persist `acceptingJobs` + `serviceAreas[]`; derived launch-ready; `GET /api/admin/pilot-supply` (category coverage from launch-ready only; geography from `serviceAreas[]`; category **minimum 4 / target 5**).

**Done in Slice 2 (local):** visual supply-readiness cockpit on the Admin dashboard. Display-only **supply** status (`SUPPLY NOT READY` / `SUPPLY READY` / `DATA INCOMPLETE` / `DATA UNAVAILABLE`). This is **not** the future Pilot Status engine (`NOT READY` / `READY TO OPEN` / `OPEN` / `WATCH` / `PAUSED`), which must consider the full activation gate. No persisted posting control. Geography display heuristic: an area is COVERED when ≥1 launch-ready Expert lists it — not 4–5 per suburb, and not a category × area proof.

**Done in Slice 3 (local):** Job Attention Queue. Bounded `GET /api/admin/job-attention`. Quote-liquidity triggers **0 quotes >60m** and **1 quote >3h** replace the old 6h / 24h quoting cards. The clock starts when the job becomes available for quoting (`quoteReadyAt`), not when the job record was created. Incomplete scans must not show “all clear”. **Funded-job stall is deferred** — Taskio has no reliable agreed/scheduled work timestamp (`timeline` is a preference string only). Completion/release waiting uses `COMPLETED` + `completedAt` >48h and excludes settled payments.

**Scan cap:** the supply endpoint pages tradie profiles (page size 100, cap 250). The attention endpoint pages jobs (page size 100, cap 250) and reuses one Expert supply load. `totals.truncated` must be accurate. If truncated / `scanComplete=false`, later Pilot Status logic and dashboards must **not** show READY, and the attention queue must **not** imply it is exhaustive.

**Job-specific supply:** category and geography totals are indicators only. They do not prove every category × service-area combination is covered. Later matching / attention should count launch-ready Experts for the job’s actual category + service area. No category-by-suburb matrix and no GIS in this slice.

**Still later (not Slice 3):**

1. Future **Pilot Status engine** (`NOT READY` / `READY TO OPEN` / `OPEN` / `WATCH` / `PAUSED`) plus persisted homeowner posting OPEN/CLOSED/PAUSED control + confirmation + audit. That engine must include supply **and** legal/privacy, production/security/operations, production acceptance, and explicit owner activation — not Expert supply alone.
2. Marketplace funnel / liquidity % and Expert response analytics.
3. Liquidity + funnel on bounded data.
4. Waitlist product UX after P06/P09 allow public copy.
5. Expert response analytics.

---

## 18. Visual / UX direction

Professional, calm, scannable, operational. KPI cards, status chips, coverage bars, compact tables, priority alerts, simple funnel, one primary action per row.

Avoid pie charts, 3D, gauge overload, maps, excessive animation, dense number walls.

**Success test:** can the owner answer “open, watch, or pause?” in ~10 seconds.
