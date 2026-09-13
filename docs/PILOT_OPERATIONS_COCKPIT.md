# Pilot Operations Cockpit — audit and design

**Status:** DESIGN / DOCUMENTATION ONLY — **not implemented**. No Admin, backend, schema, posting, or waitlist code in this batch.

**Date:** 13 September 2026  
**Companion operating rules:** `docs/P06_OWNER_DECISIONS.md` §5–§5B  
**Canonical catalog:** `shared/expertiseCatalog.js`  
**Canonical geography:** `shared/auLocations.js` (`melbournePilotSuburbs` / `melbournePilotLocations`)

P06 remains **OPEN**. P09 remains **blocked** for legal/trust copy. This Admin design may proceed independently and must **not** imply legal review is complete.

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

A. approximately **15 ACTIVE LAUNCH-READY EXPERTS**  
B. every **enabled** Phase 1 category has adequate launch-ready coverage (ideally **4–5** Experts capable of servicing it)  
C. approved launch geography has adequate coverage  
D. all other real-user launch-readiness gates are satisfied  
E. owner/admin **explicitly activates** homeowner posting/acquisition  

**15 Experts alone is not sufficient.**

**AFTER-ACTIVATION FLOOR:** ~**12** active launch-ready Experts. Below floor or material coverage drop → **WATCH / PAUSE**.

### Operating targets (not customer SLAs, not legal promises)

| Target | Value |
|---|---|
| Expert recruitment | **18–20** candidates |
| Launch-ready (activation) | **~15** |
| After-activation floor | **~12** |
| Category coverage | ideally **4–5** launch-ready Experts per **enabled** Phase 1 category |
| Initial job invitations | up to **~5** suitable Experts |
| Desired quotes | **2–3** qualified quotes |
| First qualified response | ideally **≤ 60 minutes** in normal operating periods |
| Two qualified quotes | ideally **≤ 3 hours** |
| Supported jobs with ≥1 quote | target **≥ 90%** |
| Zero-quote jobs | target **< 10%** |

Do **not** expose these as guaranteed customer SLAs.

---

## 2. Launch-ready Expert — use existing repo data

Do **not** invent a parallel “launchReady” flag if existing eligibility already covers it. Align with `backend/src/utils/v11TradieEligibility.js` and `frontend/src/utils/adminDashboardUtils.js` `getReadiness()`.

### A. Fields available now

| Need | Existing field / source |
|---|---|
| Role | `users.role === 'tradie'` |
| Account active | `users.status` (`active` / `disabled` / `pending_deletion` / `deleted`) |
| Manually verified | `users.verified === true` (admin) |
| Phone | `users.phoneVerified` or Auth `phone_number` |
| Profile complete | stored `profileCompleted` **or** derived: display name, bio ≥20, photo URL, `expertiseApproved[]` |
| Categories | `users.expertiseApproved[]` — Phase 1 keys from `shared/expertiseCatalog.js` |
| Stripe | `stripe.onboardingComplete` **or** `stripeOnboardingStatus === 'completed'` **or** charges+payouts enabled |
| ABN | `abn` / `abnVerified` when required by business type / business name |
| Business type | `businessType` |
| Age 18+ | `dob` {day, month, year} |
| Single service location | `serviceLocation` {suburb, state, postcode} |
| Last activity (weak) | `updatedAt` / `updatedAtMs` |
| Boost (not launch-ready) | `boost.isBoosted` / `boostedVisibility` |

Admin UI already labels a close subset **“Ready to quote” / “Ready now (eligible to quote)”**.

### B. Fields derivable now

- **Launch-ready (MVP):** `role=tradie` AND `status=active` AND `verified` AND phone OK AND profile complete AND ≥1 Phase 1 `expertiseApproved` AND Stripe complete (when Stripe enabled) AND ABN OK if required AND valid `serviceLocation` AND 18+ AND business type set.
- **Category coverage:** count launch-ready Experts whose `expertiseApproved` includes any key in that catalog `category` (or a declared operating group).
- **Home-base geography:** count launch-ready Experts whose `serviceLocation.suburb` is in `melbournePilotSuburbs`.
- **Invite / quote liquidity (jobs):** invited Expert count from job invite maps; quote counts/timestamps from existing quote fetches used by `useAdminDashboardMetrics`.
- **Funnel:** job `status` / `paymentState` already on admin job list.

### C. Missing data genuinely needed (smallest)

| Gap | Why | Smallest later change | Launch-critical? |
|---|---|---|---|
| **Service areas (plural)** | `serviceLocation` is **one** home-base suburb, not “suburbs I will travel to”. Cannot honestly answer “how many launch-ready Experts **service Richmond**”. | Optional `serviceAreas[]` of allowlisted suburbs, defaulting to `[serviceLocation]` until collected. | **Useful, not a blocker** if we label current metric **home-base coverage** and require at least one launch-ready Expert home-based in the 8-suburb allowlist overall. Per-suburb “serves this area” is **C** if the operator must decide suburb-level coverage. |
| **Accepting jobs / pause** | No `acceptingJobs` / availability flag. A verified Expert may be on holiday. | Optional boolean `acceptingJobs` (default true). | **Launch-critical for WATCH/PAUSE honesty** once posting is OPEN; can start as a manual admin note. |
| **Waitlist / posting switch** | No persisted `homeownerPostingState` (`closed` / `open` / `paused`) or waitlist collection. | Single admin-controlled config doc + confirmation + audit. | **Launch-critical** before OPEN. Design only in this task. |
| **Invitation-to-quote rate / median response** | Quotes and invites exist, but no first-class Expert-level aggregates API. | Derive from invites + quotes in a **bounded** admin endpoint (pilot-sized). | Launch-critical for responsiveness; **B/C** not a new event platform. |

### D. Do not add yet

- GIS / maps / travel-time
- Automatic punitive ranking or suspension scores as user-facing trust
- Duplicate `launchReady` boolean that drifts from eligibility
- Predictive matching / AI recommendations
- Full analytics warehouse
- Per-hour availability calendars

**Willingness to receive jobs:** **not** a reliable field today. Treat as missing; do not infer from `verified`.

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
- Attention strip: 0 offers after **6h**, open >**24h**, disputes, failed payments, stale profile requests
- Expert “Ready now” filter and readiness chips
- Support tickets + profile-change queue
- Loading/error on dashboard fetch

**Currently usable but weak**

- Overview is generic marketplace counts, not **can we open posting?**
- Attention windows (**6h / 24h**) are slower than pilot liquidity targets (**60 min / 3 h**)
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
| Launch-ready `n / 15` | **B** if **all** tradies are loaded with the same rules as `computeEligibility` | Fix 50-user page; do not use lenient `getReadiness` undefined=OK |
| Operating floor `n / 12` | **B** (same count, different target) | |
| Category coverage `k / N` | **B** | Group `expertiseApproved` by catalog `category` (see §7) |
| Geographic coverage | **B as home-base only**; **C** for true service-area | Label honestly |
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

| Category | Launch-ready Experts | Target (4–5) | Status |
|---|---|---|---|
| … | count | 5 | HEALTHY / WATCH / UNDER-COVERED |

Status text (example): HEALTHY if ≥5; WATCH if 4; UNDER-COVERED if ≤3. Disabled categories omitted.

Visual: horizontal bar (count/target) + numeric count + **text** chip. Not colour-only.

---

## 8. Geography coverage

**Canonical allowlist:** `melbournePilotSuburbs` in `shared/auLocations.js`:

Melbourne, Southbank, Docklands, South Yarra, Prahran, St Kilda, Richmond, Carlton.

**Do not** duplicate this list in Admin.

**MVP table (honest):**

| Suburb | Launch-ready Experts **home-based** (`serviceLocation.suburb`) | Status |
|---|---|---|

This answers “where Experts **live / listed**”, **not** “who will travel to this job”.

If per-suburb **service** coverage is required to operate safely: smallest add is optional `serviceAreas[]` (allowlisted suburbs). **No maps/GIS.**

Until then, activation geography criterion **C** = every enabled suburb has **at least one** launch-ready Expert **home-based there**, **or** owner accepts “Inner Melbourne treated as one zone” and only requires overall home-bases inside the allowlist. **Owner must choose** that interpretation before treating geo as a hard gate. Default recommendation: **one-zone Inner Melbourne** for activation (all launch-ready Experts must have a valid allowlisted `serviceLocation`); per-suburb table is informational WATCH.

---

## 9. Job Attention Queue

Highest-priority operational list. Do **not** auto-resolve.

**Flags (proposed)**

| Reason | Data | Feasibility |
|---|---|---|
| No Experts invited | invite map empty | **B** |
| Fewer than ~5 suitable invited | invite count | **B** |
| 0 quotes after 60 min | quotes + `createdAt` | **B** (new threshold vs current 6h) |
| Only 1 quote after 3 h | quote count + age | **B** |
| No suitable Expert supply | job category vs launch-ready with that expertise | **B** |
| Accepted, funding incomplete/stale | status / paymentState | **A/B** |
| Funded job stalled | status + updatedAt | **B** |
| Completion/approval stalled | status | **B** |
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
| Launch-ready | **B** | Distinguish verified vs launch-ready |
| Categories | **A** | `expertiseApproved` |
| Service **home-base** | **A** | `serviceLocation` |
| Service **areas** | **C** | missing |
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
| Launch-ready count | **B** (fix fetch + use server rules) | Incomplete if users `limit=50`; lenient client readiness | Admin `GET` tradies with eligibility derived server-side, paginate all or `role=tradie` unbounded-but-capped (~200) | Yes |
| Category coverage | **B** | Need consistent grouping | Count `expertiseApproved` ∩ catalog category | Yes |
| Geo home-base table | **B** | Single suburb only | Count by `serviceLocation.suburb` vs allowlist | Yes (as home-base) |
| True service-area coverage | **C** | No `serviceAreas[]` | Optional array, default `[serviceLocation]` | Only if owner rejects one-zone geo |
| Accepting jobs | **C** | No field | `acceptingJobs` boolean | After OPEN |
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
- Geography as **home-base** table (service-areas later if required)
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

## 17. Recommended implementation sequence (later; not this commit)

1. Server-side launch-ready count + category coverage + home-base geo (read-only Overview cards).  
2. Job Attention Queue with 60m / 3h / invite flags (reuse job detail invite).  
3. Liquidity + funnel on bounded data.  
4. Pilot Settings CLOSED/OPEN/PAUSED + confirmation + audit (**does not** ship legal copy).  
5. Optional `acceptingJobs` and `serviceAreas[]` only if operators cannot run without them.  
6. Waitlist product UX after P06/P09 allow public copy.

Do **not** implement in this documentation task.

---

## 18. Visual / UX direction

Professional, calm, scannable, operational. KPI cards, status chips, coverage bars, compact tables, priority alerts, simple funnel, one primary action per row.

Avoid pie charts, 3D, gauge overload, maps, excessive animation, dense number walls.

**Success test:** can the owner answer “open, watch, or pause?” in ~10 seconds.
