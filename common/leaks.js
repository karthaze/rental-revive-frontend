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

/* Recovery assumptions. These are the only invented numbers in the
   model, so they are held low on purpose and surfaced in the report. */
export const ASSUMPTIONS = {
  reachable: 0.45,   // of missed callers, the share still reachable after the fact
  winnable: 0.5,     // of quotes lost to response lag, the share speed would have saved
  revivable: 0.08,   // of a cold quote pile, the share that comes back with follow-up
  reactivated: 0.12, // of lapsed accounts, the share that rents again when worked
  quoteRate: 0.8,    // of inquiries, the share that actually turns into a quote
}

/* --- answer bands -> defensible midpoints --- */
const INQUIRIES = { 'Under 25': 18, '25 – 60': 42, '60 – 120': 88, '120+': 165 }
const MISSED = { 'Almost none': 0, '1 – 3 a week': 2, '4 – 10 a week': 6.5, '10+ a week': 14 }
const PILE = { 'Under 20': 12, '20 – 50': 34, '50 – 150': 95, '150+': 220 }
const QUIET = { 'Just a few': 5, '10 – 25': 17, '25 – 75': 48, '75+': 115 }

/* Share of quotes that die specifically because the answer came late.
   A yard answering inside the hour still loses some, just not to lag. */
const LAG_LOSS = {
  'Inside the hour': 0.02,
  'Same day': 0.06,
  'Next day': 0.13,
  'Two days or more': 0.21,
}

/* Jobs per month in the radius that a yard with no outbound never
   gets invited to quote. Held deliberately small. */
const OUTBOUND_MISS = {
  'Yes, we work them': 0,
  'Now and then': 1.2,
  'No, we wait for the phone': 2.5,
}

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

  const ticketBand = seg.ticketBands.find((b) => b.label === state.ticket)
  const ticket = ticketBand ? ticketBand.mid : 0
  const inquiries = INQUIRIES[state.inquiries] || 0
  const close = (state.closeRate ?? seg.defaultClose) / 100
  const quotes = inquiries * ASSUMPTIONS.quoteRate

  /* Without a ticket value there is no money model yet. */
  const live = ticket > 0

  /* --- 1. the missed call --- */
  const missedPerWeek = MISSED[state.missedCalls] ?? 0
  const ahWeight = AFTER_HOURS_WEIGHT[state.afterHours] ?? 1
  const missedMonthly = missedPerWeek * WEEKS * ahWeight
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
      answered: !!state.missedCalls,
      score: scoreCalls(state),
      formula: missedPerWeek
        ? `${fmtNum(missedPerWeek)} missed/wk × ${WEEKS} wks × ${pct(ASSUMPTIONS.reachable)} still reachable × ${pct(close)} booked × ${money(ticket)}`
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

  const monthly = leaks.reduce((sum, l) => sum + l.amount, 0)
  const leakScore = leaks.reduce((sum, l) => sum + l.score, 0)
  const answeredCount = leaks.filter((l) => l.answered).length

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
function scoreCalls(s) {
  const base = { 'Almost none': 0, '1 – 3 a week': 2, '4 – 10 a week': 4, '10+ a week': 5 }[s.missedCalls] ?? 0
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
