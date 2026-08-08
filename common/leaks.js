/* ============================================================
   THE LEAK ENGINE
   ------------------------------------------------------------
   Every number this file produces gets shown to the owner with
   the arithmetic that made it. That is deliberate: the buyer is
   a skeptical operator who has been sold "leads" before, and a
   figure he cannot audit reads as a sales trick.

   So the rules are:
     - conservative assumptions, stated out loud
     - one formula per leak, rendered as a readable string
     - nothing labelled a guarantee, everything labelled an estimate

   See 03-MISSED-RENTAL-AUDIT: potential = missed opportunities
   x close rate x average job value.
   ============================================================ */

import { segmentById } from './segments.js'

const WEEKS = 4.33

/* Recovery assumptions. Originally the only invented numbers in the
   model; BENCHMARKED 2026-08-06 against published sales-response and
   win-back data. Each one now sits at or below the low end of its
   published range — the conservative lean is unchanged, but the
   numbers are no longer guesses.

   reachable  — 45% of voicemail-leavers have already contacted a
                competitor by callback time, so ~55% are still in
                play; manual callback conversion runs under 30% while
                automated sub-minute text-back recovers 93%. 0.45 is
                just under the still-in-play ceiling for the prompt,
                worked callback the fix actually installs.
   winnable   — 35–50% of sales go to the vendor that responds first
                (78% of buyers pick the first responder when several
                answer); moving response from the 24h bucket to
                minutes lifts close ~2.6× (12% → 32%). 0.5 sits at
                the top of the first-responder share, below the 78%.
   revivable  — B2B dormant-lead reactivation recovers 5–15%; only 2%
                of sales close on first contact and 80% need 5+
                touches (92% of reps quit by 4 — which is why a
                worked pile produces anything at all). 0.08 sits at
                the low-middle of the published range.
   reactivated— B2B lapsed-customer win-back runs 5–15% (email-only
                8–15%; full campaigns 10–30%). 0.12 is mid-range of
                the most conservative bracket.
   quoteRate  — the share of inquiries that get far enough to be
                worth a quote. Not directly published anywhere, but
                the compound it produces is checkable: 0.8 × the
                segment default close gives an implied inquiry→booked
                of 20–40%, at or below the published rental-industry
                inquiry→confirmed benchmark of 38–48% for every
                segment (see segments.js). The model books LESS of
                the flow than the industry says a yard actually
                books — the conservative direction. */
export const ASSUMPTIONS = {
  reachable: 0.45,
  winnable: 0.5,
  revivable: 0.08,
  reactivated: 0.12,
  quoteRate: 0.8,
}

/* --- answer bands -> defensible midpoints --- */
const INQUIRIES = { 'Under 25': 18, '25 – 60': 42, '60 – 120': 88, '120+': 165 }

/* Missed calls per week. RE-CUT 2026-08-06 — the old table
   (0 / 2 / 6.5 / 14) described a yard taking a handful of calls a
   day and understated every band above "almost none".

   Against published contractor and home-service benchmarks the
   missed share of inbound volume runs 20–30% in a normal week
   (27% is the 2024–26 rolling average across the trades) and
   40–50% at seasonal peak; a mid-size shop taking 200–300 calls a
   week misses 40–90 of them, and 25–40% of all inbound arrives
   outside counter hours. A yard answering "a few a week" is
   describing 5–10, not 2.

   Midpoints are still held below the benchmark centre — the top
   band prices 22 against a 40–90 observed range — because every
   number in this file leans conservative on purpose. */
const MISSED = { 'Almost none': 0, '1 – 5 a week': 3, '6 – 15 a week': 10, '15+ a week': 22 }

/* TWO INPUT SHAPES, ONE PRICE.
   The owner now answers missed calls on a 0–100 slider, so the scan
   hands this engine a NUMBER — the yard's own figure, taken at face
   value, no bucketing.
   The AD-11 probe path cannot: it measures a rate, not a weekly
   volume, so it still substitutes one of the band STRINGS above.
   Both must price, and the numeric score thresholds below are the
   band boundaries exactly, so the two agree at the seams. */
const missedWeekly = (v) =>
  typeof v === 'number' ? (Number.isFinite(v) && v > 0 ? v : 0) : (MISSED[v] ?? 0)

/* A slider committed at 0 is a real answer ("they all get answered"),
   not an unanswered question — so this cannot be a plain truthiness
   check or the leak would render as never asked. */
const missedAnswered = (v) => (typeof v === 'number' ? Number.isFinite(v) : !!v)
const PILE = { 'Under 20': 12, '20 – 50': 34, '50 – 150': 95, '150+': 220 }
const QUIET = { 'Just a few': 5, '10 – 25': 17, '25 – 75': 48, '75+': 115 }

/* Share of quotes that die specifically because the answer came late.
   A yard answering inside the hour still loses some, just not to lag.

   RE-CUT 2026-08-06 against speed-to-lead data: teams answering
   inside 5 minutes convert ~21% of leads vs ~2.3% for a day-plus
   wait, and moving from the 24h bucket to minutes lifts close from
   12% to 32%. 35–50% of sales go to whoever answers first, so even
   the two-day band is held at half that floor — the lag share of a
   two-day yard's losses is real, but not everything is lag. */
const LAG_LOSS = {
  'Inside the hour': 0.02,
  'Same day': 0.07,
  'Next day': 0.15,
  'Two days or more': 0.25,
}

/* Jobs per month in the radius that a yard with no outbound never
   gets invited to quote. Held deliberately small. */
const OUTBOUND_MISS = {
  'Yes, we work them': 0,
  'Now and then': 1.2,
  'No, we wait for the phone': 2.5,
}

/* Relative multipliers on the missed-call count, anchored on the
   owner's own weekly figure. Grounded loosely: 25–40% of inbound to
   the trades arrives outside counter hours, and weekend/evening
   unanswered rates run ~2× weekday — so a phone that simply rings
   out after close misses meaningfully more than the owner counts,
   and live after-hours coverage removes most of the leak. */
const AFTER_HOURS_WEIGHT = {
  'Voicemail': 1,
  'Nothing, it just rings': 1.15,
  'Answering service': 0.6,
  'Someone on call': 0.35,
}

export const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format(Math.max(0, Math.round(n)))

const pct = (n) => `${Math.round(n * 100)}%`

/**
 * Turn the answered state into a full leak picture.
 * Safe to call at any point in the flow — unanswered questions
 * simply contribute nothing, which is what lets the live meter
 * climb as the conversation goes on.
 */
export function computeLeaks(state) {
  const seg = segmentById(state.segment)

  /* Ticket is a slider now — the owner's own invoice figure, priced
     as given. Band LABELS still resolve (older stored scans, test
     fixtures, and any future measured substitution) through the
     segment's own midpoint table. `live` keys off this being > 0, so
     an unanswered question must stay 0 rather than fall back to a
     default — a guessed ticket would silently price the whole model. */
  const ticket = typeof state.ticket === 'number'
    ? (Number.isFinite(state.ticket) && state.ticket > 0 ? state.ticket : 0)
    : (seg.ticketBands.find((b) => b.label === state.ticket)?.mid ?? 0)
  const inquiries = INQUIRIES[state.inquiries] || 0
  const close = (state.closeRate ?? seg.defaultClose) / 100
  const quotes = inquiries * ASSUMPTIONS.quoteRate

  /* Without a ticket value there is no money model yet. */
  const live = ticket > 0

  /* --- 1. the missed call --- */
  const missedPerWeek = missedWeekly(state.missedCalls)
  const ahWeight = AFTER_HOURS_WEIGHT[state.afterHours] ?? 1
  const missedRaw = missedPerWeek * WEEKS * ahWeight

  /* Volume sanity bound. This is the ONE leak whose input is an
     absolute count rather than a share of the yard's own flow, so
     with realistic weekly bands nothing stops a yard reporting 42
     inquiries a month from being priced on 95 missed rentals. A
     yard cannot plausibly be missing more new-rental calls in a
     month than actually reach it, so the priced opportunity is
     capped at its own inquiry volume. Uncapped when inquiries have
     not been answered yet — the meter simply has nothing to bound
     against, and the leak is zero until a ticket exists anyway. */
  const missedMonthly = inquiries > 0 ? Math.min(missedRaw, inquiries) : missedRaw
  const missedCapped = missedMonthly < missedRaw
  const callLeak = live ? missedMonthly * ASSUMPTIONS.reachable * close * ticket : 0

  /* --- 2. the slow quote --- */
  const lagLoss = LAG_LOSS[state.quoteSpeed] ?? 0
  const speedLeak = live ? quotes * lagLoss * ASSUMPTIONS.winnable * ticket : 0

  /* --- 3. quotes going cold, every month --- */
  const coldPerMonth = quotes * (1 - close)
  const pileFlowLeak = live && state.quotePile ? coldPerMonth * ASSUMPTIONS.revivable * ticket : 0

  /* The standing pile is a separate, one-time number: what is sitting
     on the shelf today, as opposed to what goes cold each month. */
  const pileCount = PILE[state.quotePile] || 0
  const pileStanding = live ? pileCount * ASSUMPTIONS.revivable * ticket : 0

  /* --- 4. the quiet account --- */
  const quietCount = QUIET[state.quietAccounts] || 0
  const quietLeak = live ? (quietCount * ASSUMPTIONS.reactivated * ticket) / 12 : 0

  /* --- 5. the job you never heard about --- */
  const missedProjects = OUTBOUND_MISS[state.outbound] ?? 0
  const outboundLeak = live ? missedProjects * close * ticket : 0

  const leaks = [
    {
      id: 'calls',
      label: 'Missed calls',
      icon: 'phone',
      amount: callLeak,
      answered: missedAnswered(state.missedCalls),
      score: scoreCalls(state),
      formula: missedPerWeek
        ? missedCapped
          /* the cap changed the number, so it has to appear in the
             arithmetic — an unexplained smaller figure is worse than
             a big one (the whole point of showing the working) */
          ? `${fmtNum(missedPerWeek)} missed/wk × ${WEEKS} wks = ${fmtNum(missedRaw)}/mo, capped at your ${inquiries} inquiries/mo × ${pct(ASSUMPTIONS.reachable)} still reachable × ${pct(close)} booked × ${money(ticket)}`
          : `${fmtNum(missedPerWeek)} missed/wk × ${WEEKS} wks × ${pct(ASSUMPTIONS.reachable)} still reachable × ${pct(close)} booked × ${money(ticket)}`
        : 'No call leakage reported',
      note: seg.frames.calls,
    },
    {
      id: 'speed',
      label: 'Slow quotes',
      icon: 'clock',
      amount: speedLeak,
      answered: !!state.quoteSpeed,
      score: scoreSpeed(state),
      formula: lagLoss
        ? `${fmtNum(quotes)} quotes/mo × ${pct(lagLoss)} lost to lag × ${pct(ASSUMPTIONS.winnable)} winnable × ${money(ticket)}`
        : 'Response time is not costing you quotes',
      note: seg.frames.quotes,
    },
    {
      id: 'pile',
      label: 'Quotes going cold',
      icon: 'file',
      amount: pileFlowLeak,
      answered: !!state.quotePile,
      score: scorePile(state),
      formula: pileFlowLeak
        ? `${fmtNum(coldPerMonth)} quotes go cold/mo × ${pct(ASSUMPTIONS.revivable)} revivable × ${money(ticket)}`
        : 'No quote pile reported',
      note: seg.frames.pile,
      standing: pileStanding,
      standingFormula: pileCount
        ? `${pileCount} open quotes × ${pct(ASSUMPTIONS.revivable)} revivable × ${money(ticket)}`
        : '',
    },
    {
      id: 'quiet',
      label: 'Quiet accounts',
      icon: 'users',
      amount: quietLeak,
      answered: !!state.quietAccounts,
      score: scoreQuiet(state),
      formula: quietCount
        ? `${quietCount} lapsed accounts × ${pct(ASSUMPTIONS.reactivated)} come back × ${money(ticket)} ÷ 12 months`
        : 'No lapsed accounts reported',
      note: seg.frames.quiet,
    },
    {
      id: 'outbound',
      label: 'Jobs you never hear about',
      icon: 'radar',
      amount: outboundLeak,
      answered: !!state.outbound,
      score: scoreOutbound(state),
      formula: missedProjects
        ? `${fmtNum(missedProjects)} ${seg.jobs}/mo in your radius × ${pct(close)} booked × ${money(ticket)}`
        : 'You already work local project activity',
      note: seg.frames.outbound,
    },
  ]

  const rawMonthly = leaks.reduce((sum, l) => sum + l.amount, 0)
  const leakScore = leaks.reduce((sum, l) => sum + l.score, 0)
  const answeredCount = leaks.filter((l) => l.answered).length

  /* --- the plausibility bound ---
     Each leak is individually conservative, but five of them compound
     against the same flow — and with the worst answer everywhere the
     sum exceeds what the yard's own answers imply it BOOKS. A number
     bigger than the yard reads as the sales trick the shown
     arithmetic exists to avoid, so the total is capped at half the
     implied booked revenue: claiming leak = 50% of bookings already
     means claiming a third of the yard's whole won-plus-lost flow is
     recoverable, and past that the honest reading is "the answers
     are noisy", not "the leak is bigger".

     The bound only exists once inquiries are answered — before that
     there is no revenue base to bound against, and the early meter
     climb (one leak at a time) never remotely approaches it. Like
     the missed-call volume cap, when it binds it is SHOWN in the
     report as its own ledger line, never applied silently. */
  const PLAUSIBLE_SHARE = 0.5
  const impliedMonthly = quotes * close * ticket
  const bound = impliedMonthly * PLAUSIBLE_SHARE
  const clamped = live && impliedMonthly > 0 && rawMonthly > bound
  const monthly = clamped ? bound : rawMonthly

  /* The single biggest leak drives the headline and the offer. */
  const ranked = [...leaks].filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)
  const dominant = ranked[0] || null

  return {
    segment: seg,
    ticket,
    inquiries,
    quotes,
    close,
    live,
    leaks,
    ranked,
    dominant,
    monthly,
    annual: monthly * 12,
    /* clamp bookkeeping — the report renders the bound as a ledger
       line so the table still sums to the headline */
    rawMonthly,
    impliedMonthly,
    plausibleShare: PLAUSIBLE_SHARE,
    clamped,
    pileStanding,
    leakScore,
    answeredCount,
    band: bandFor(leakScore),
  }
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/* --- leak scoring, 0-5 each, 25 total (03-MISSED-RENTAL-AUDIT §5) --- */
/* Numeric thresholds are the band boundaries exactly (1–5 / 6–15 /
   16+), so a slider answer and a probe-substituted band score the
   same at the seams. */
function missedScoreBase(v) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return 0
    if (v <= 5) return 2
    if (v <= 15) return 4
    return 5
  }
  return { 'Almost none': 0, '1 – 5 a week': 2, '6 – 15 a week': 4, '15+ a week': 5 }[v] ?? 0
}
function scoreCalls(s) {
  const base = missedScoreBase(s.missedCalls)
  if (!base) return 0
  const penalty = { 'Nothing, it just rings': 0, 'Voicemail': 0, 'Answering service': -1, 'Someone on call': -2 }[s.afterHours] ?? 0
  return Math.max(1, Math.min(5, base + penalty))
}
function scoreSpeed(s) {
  return { 'Inside the hour': 0, 'Same day': 2, 'Next day': 4, 'Two days or more': 5 }[s.quoteSpeed] ?? 0
}
function scorePile(s) {
  return { 'Under 20': 1, '20 – 50': 3, '50 – 150': 4, '150+': 5 }[s.quotePile] ?? 0
}
function scoreQuiet(s) {
  return { 'Just a few': 1, '10 – 25': 3, '25 – 75': 4, '75+': 5 }[s.quietAccounts] ?? 0
}
function scoreOutbound(s) {
  return { 'Yes, we work them': 0, 'Now and then': 3, 'No, we wait for the phone': 5 }[s.outbound] ?? 0
}

/* Bands and their meaning come straight from 03-MISSED-RENTAL-AUDIT §5 —
   the same 0–25 scale the founder's audit already scores against, and the
   same four readings. The offer each band implies is decided in plan.js. */
function bandFor(score) {
  if (score <= 7) return { key: 'low', label: 'Low urgency', tone: 'good' }
  if (score <= 14) return { key: 'mid', label: 'Starter fit', tone: 'warn' }
  if (score <= 20) return { key: 'high', label: 'Managed sprint fit', tone: 'bad' }
  return { key: 'severe', label: 'Desk candidate', tone: 'bad' }
}
