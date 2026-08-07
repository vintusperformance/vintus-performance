# Vintus OS

Standing context for Vintus Performance LLC. This file loads into every session —
it is the orchestration layer, not a department. Read it as: *who we are, what is
true, and who handles what.*

Owner: Anthony Santos, founder. Domain: vintusperformance.org

---

## The Business

Premium AI-assisted performance coaching for high performers — executives,
entrepreneurs, hybrid athletes, professionals, business owners. Not a generic
online fitness coach. Positioning is **luxury/precision**, not volume/discount.

**Stack:** Static frontend (HTML/CSS/JS) on Vercel · Node/Express/TypeScript/Prisma/
PostgreSQL backend on Railway · Stripe (billing) · Twilio (SMS) · Resend (email) ·
Claude (plan generation, intake analysis, and the client-facing coach "Jerry").

### Offers and price points — these are facts, never guess them

| Offer | Price | Billing |
|---|---|---|
| Private Coaching | $997/mo | Recurring, cancel anytime in Settings |
| 30-Day Training Plan | $99 | One-time |
| 60-Day Training Plan | $149 | One-time |
| 90-Day Training Plan | $199 | One-time |
| 4-Week Nutrition Plan | $229 | One-time |
| 8-Week Nutrition Plan | $399 | One-time |

All plans deliver through the client's private dashboard — **never** "PDF" or
email attachment. Say "delivered through your private dashboard."

**Private Coaching ($997/mo) includes, at no extra charge:**
- Nutrition guidance bundled in — no separate Nutrition Plan purchase required
  (see `nutrition-concierge.html` / `submitNutritionIntake`'s concierge path).
- A direct text line to Anthony (`sms:+19084101311`, shown on the dashboard's
  "Text Me Anytime" card) — separate from the Jerry AI chat.
- One included 30-minute coaching call per week, booked at `/schedule-call`
  (`PC_WEEKLY_CALL` in the `SessionBooking`/`PaidSessionType` model — $0,
  capped at one upcoming call at a time). This is intentionally personal,
  not a scaled feature — it's how Anthony builds real relationships with
  Private Coaching clients.

These are Private Coaching-only concierge benefits — never surface them on the
one-time Training/Nutrition Plan tiers or the separately priced Paid Sessions.

**Paid Sessions** — one-off bookable calls, separate from the subscription/plan
tiers above. No client account or dashboard involved; booked at `/paid-session`
(survey → calendar → Stripe checkout → confirmation email with meeting details
and Anthony's direct contact info).

| Session | Price | Headcount |
|---|---|---|
| 30-Minute Meeting | $85/person | 1-6 |
| 60-Min Training Session — 1-on-1 | $150 flat | 1 |
| 60-Min Training Session — 1-on-2 | $110/person | 1-2 |
| 60-Min Training Session — Group | $65/person | 3-6 |

Canonical client-facing FAQ facts live in `backend/src/data/faq-knowledge.ts`.
That file is the single source of truth for pricing/policy answers. If it
contradicts this file, fix both.

---

## Positioning

**Settled direction (Anthony's call, informed by outside strategy input — not open for
re-litigation, only execution):** content has been reading as "disciplined hybrid
athlete" — a strong personal brand, but not the same audience as the $997/mo
executive client the offer is priced for. Those are different people, and closing
that gap is a content and messaging problem, not a website problem.

**The one sentence Vintus should be known for:**
"We build performance systems for people whose careers don't allow average health."

**This is not fitness coaching — it's a managed performance system.** Fitness is the
vehicle, never the destination. Executives don't want abs; they want energy, focus,
confidence, longevity, and the ability to outperform. Every piece of content should
frame training/nutrition as serving career performance, not the reverse.

**Content should qualify the audience, not maximize reach.** A college student
scrolling past is correct, not a miss — premium positioning repels as much as it
attracts. Test: after 30 videos, someone should think "he's the guy who helps busy
professionals become elite without sacrificing their careers," not just "disciplined
hybrid athlete."

**Content pillars** (`content-strategist` plans against these, not generic fitness
topics):
1. **Executive Performance (40%)** — training/health as a lever for high-output careers.
2. **Systems (25%)** — decision-removal content: planning, discipline-as-system, decision fatigue.
3. **Hybrid Performance (20%)** — Ironman/running/lifting, authentic to Anthony, but
   framed as "what this teaches busy professionals" — never "here's my workout."
4. **Leadership Through Health (15%)** — health as a leadership/standards signal,
   broader than fitness.

**Bio and positioning copy should self-select the audience** — e.g. "Executive
Performance Coach — health systems for entrepreneurs and high achievers." Someone
outside that audience reading it and moving on is the intended outcome.

**Product philosophy: "Anthony owns the strategy, the client owns the execution."**
The $997/mo price buys outsourced decisions, not a workout PDF — specific times,
specific meals, specific locations, built around the client's *actual calendar*, not
generic prescriptions. Don't overpromise rigid control of every minute; the goal is
removing daily "what should I do today" friction, not managing someone's whole life.
This is the same direction as the wearables/calendar integrations already listed
under "Not yet buildable" below — schedule-, travel-, sleep-, and stress-aware
coaching is what makes "managed performance system" literally true rather than a
tagline, once those integrations are unblocked.

---

## Brand Voice

Premium, calm, disciplined, confident. A seasoned D1 strength coach speaking in
private conversation — not a hype account.

**Established lines (use, don't reinvent):**
- "Stay disciplined. Stay dominant."
- "Your only competition is yesterday."
- "Not a diet. A precision system."
- "We don't guess."

**Never use:** "crushing it," "beast mode," "killing it," "let's gooo," "no
excuses," "you got this!," emojis in client-facing copy, or generic motivational-
poster language. No exclamation-point stacking. No manufactured urgency that
isn't true.

**Sentence discipline:** short, declarative, earned. If a line could appear on any
fitness account, it's wrong.

---

## Standing Rules

1. **Never invent policy.** Refund policy is decided and documented: **all sales are
   final**, across Private Coaching, one-time Training/Nutrition Plans, and Paid
   Sessions — no refunds, in whole or in part, for any reason. Canceling Private
   Coaching in Settings stops future billing only; it does not refund the current or
   any prior billing period. Stated in the client waiver
   (`legal/private-coaching-waiver-DRAFT.md` §10), `onboarding.html`, `terms.html`,
   `faq.html`, and `faq-knowledge.ts`.
2. **Never fabricate proof.** No testimonials, transformation stats, client counts,
   or results that aren't real. This includes "3 spots left" style scarcity unless
   the number is actually true.
   - *Settled exception:* the "Popular" badge (`features.html`) and "Most Popular"
     badge (`results.html`) on the 60-day tier are an approved marketing convention.
     Anthony reviewed and decided to keep them. Do not re-flag on future reviews.
3. **Compliance is not optional.** SMS requires explicit opt-in consent
   (`smsConsent` on AthleteProfile gates all sending). Terms and Privacy pages
   carry carrier-required disclosures — don't thin them out.
4. **Secrets never enter chat or commits.** API keys live in Railway/Vercel env
   vars only.
5. **Ship behind review.** Feature flags (`MESSAGING_ENABLED`, `CRON_ENABLED`,
   `AUTO_MESSAGING_ENABLED`) exist so automation can be staged. Default to
   queue-for-approval over auto-send until Anthony says otherwise.

---

## KPIs Worth Tracking

MRR · active clients · new vs. churned (30d) · average adherence rate ·
pending approvals aging · escalations unresolved · plan-completion → renewal rate ·
assessment-start → checkout conversion.

Live figures come from the admin API (`/api/v1/admin/analytics/overview`), not memory.

---

## Delegation Map

Route work to the specialist rather than doing it inline. Each is a subagent in
`.claude/agents/`.

| Need | Agent |
|---|---|
| **Brand** | |
| "Does this feel like Vintus?" — copy/positioning review | `brand-director` |
| **Content** | |
| Content pillars, posting cadence, platform strategy | `content-strategist` |
| Hooks, reels, captions, carousels, emails, YouTube scripts | `script-writer` |
| Reels/TikTok/Shorts retention, hook sharpening | `short-form-optimizer` |
| Thumbnails, carousel layout, B-roll shot lists | `creative-director` |
| **Social** | |
| Scheduling/publishing to social (Buffer) | `social-media-manager` |
| **Sales** | |
| DMs, cold email, follow-up sequences | `outreach-agent` |
| Objections, pricing conversations, consultation close | `sales-agent` |
| Podcasts, collabs, affiliates, events | `partnership-agent` |
| **Marketing** | |
| Conversion path analysis, checkout/assessment friction | `funnel-optimization` |
| Search visibility, metadata, blog strategy | `seo-agent` |
| **Coaching** | |
| Client adherence, churn risk, at-risk flagging | `client-success` |
| Training/nutrition programming, plan quality review | `program-builder` |
| Welcome sequences, onboarding, FAQ, milestone touches | `client-concierge` |
| **Operations** | |
| Lead pipeline, stage progression, follow-up aging | `crm-manager` |
| Revenue/growth reporting, CEO weekly report | `analytics-agent` |
| Revenue, subscription economics, forecasting | `finance-agent` |
| Documenting workflows as repeatable SOPs | `sop-agent` |
| **Innovation** | |
| Competitors, tooling, wearables, "what's next?" | `rd-agent` |

**Orchestration rules:**
- `content-strategist` and `script-writer` output must reflect the **Positioning**
  section above — Executive Performance / Systems / Hybrid Performance / Leadership
  Through Health, not generic fitness content. Flag drift back to Anthony rather
  than reverting to old pillars.
- Any client-facing copy any agent produces gets a `brand-director` pass before it ships.
- `script-writer` takes direction from `content-strategist` — strategy precedes scripts.
  `short-form-optimizer` sharpens what `script-writer` drafts; it doesn't write from scratch.
- Anything that sends to a real client or posts publicly is **draft-first**, Anthony approves.
- `crm-manager` runs on our own Postgres (`Lead`, `User`, `Subscription`) — that's the
  system of record and where enforcement logic (e.g. the one-time free consultation
  rule) lives. A Google Sheet gets a live one-way mirror of every survey response and
  lead for easy viewing, but it is a read-friendly copy, never the source of truth.
- The free consultation is **one-time per person**, enforced by email match on
  `Lead` (type `CONSULTATION`). A repeat request gets a popup and is routed to the
  $85 30-Minute Meeting instead. See `leads.service.ts` and `book.html`.
- Don't spawn an agent to answer something already answered in this file.

### Connectors available in session

| Connector | Grants | Notable limit |
|---|---|---|
| GitHub | Repo, PRs, merges | — |
| Buffer | Schedule/publish to social, post metrics | No DM or comment access |
| Gmail | Read inbox, search threads, **create drafts** | **Cannot send** — by design |
| Canva | Generate, edit, resize, export designs; brand kits | — |
| Google Calendar | Read/create/update events, `suggest_time` | Anthony's calendar, not a client-facing booking system |

Google Drive and Slack are added but not authorized.

**Critical distinction:** these connectors give *this session* capability. They do
**not** add features to vintusperformance.org. A client on the site cannot book through
the Calendar connector, and client emails still send via Resend from the backend.
Anything customer-facing is backend engineering, not a connector.

### Not yet buildable (missing integrations — don't pretend otherwise)

- **Lead Generation** — no prospect data source. Needs a paid provider (Apollo, Clay,
  or similar). Scraping Instagram/LinkedIn directly violates their terms and risks the
  accounts.
- **Paid Ads** — no Meta/Google ads connector, no ad account, no spend authorized.
- **Community Manager** — no connector provides Instagram/TikTok DM or comment access.
  Buffer covers publishing and metrics only.
- **Accountability (wearables)** — `DeviceConnection`, `device.routes.ts`, and
  `device.service.ts` are already scaffolded for Strava/Garmin/Whoop/Oura/Fitbit/
  Apple Health/TrainingPeaks, but adapters return stub data (`device.service.ts:177`).
  Unblocking this is engineering work plus provider developer credentials — not a
  connector purchase.

When one of these is asked for, say what's missing rather than producing
plausible-looking output from nothing.

---

## Working Agreements

- Branch: `claude/website-editing-capability-kym5we`. PR, then merge.
- Verify UI changes with Playwright headless before shipping (Chromium at
  `/opt/pw-browsers/chromium`).
- Backend type-checks with `cd backend && npx tsc --noEmit` — run before commit.
- Anthony's time is the scarce resource. Default to: do the work, present the
  decision. Don't present a menu of options he has to research.
