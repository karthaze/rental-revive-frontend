/* ============================================================
   THE SOLUTION ENGINE
   ------------------------------------------------------------
   The scan used to end by showing the leak twice: once as a
   reveal, once as a table. That is a diagnosis, not an answer.

   This file turns the diagnosis into the thing the founder's
   docs actually specify. 03-MISSED-RENTAL-AUDIT §4 says the
   scan must output five things:

     1. biggest leak
     2. estimated monthly opportunity
     3. FASTEST FIX
     4. recommended offer: starter, sprint or full desk
     5. next step

   and §7 says the close is never yes/no — it is two paths:
   "would you rather your team operate the system internally,
   or would you rather we manage the recovery for 60 days?"
   (§8, and 06-SALES-CALL-SCRIPT §2 step 4.)

   So the honest way to build this is to work out, per leak,
   which path can actually close it. That is not a rhetorical
   device — it falls straight out of the exclusion lists:
   11-LOW-TICKET-DOWNSELL §11 says the self-managed starter
   explicitly does NOT include human quote follow up, missed
   call management or customer reactivation. Three of the five
   leaks are therefore uncloseable by the cheap path, and we
   can price exactly how much each path leaves on the table.

   Every number here traces to a leak already shown to the
   owner with its arithmetic. Nothing new is invented.
   ============================================================ */

import { money } from '../../../common/leaks.js'
import { segmentById } from '../../../common/segments.js'

/* ------------------------------------------------------------
   Offer names.

   07-RESCUE-AND-DESK-AGREEMENTS §2 is explicit about which
   names go in agreements — and explicitly retires "Yard Dog"
   and "Rescue offer". Those are the doc names, used verbatim.

   The one liberty: the docs are crane-only, but the scan was
   deliberately broadened to eight machinery segments, so the
   word "Crane" is dropped from the two offers that carry it
   unless the yard's primary line actually is cranes.
   ------------------------------------------------------------ */
export function offerNames(primarySegment) {
  const crane = primarySegment === 'cranes'
  return {
    audit: 'Revenue Leak Audit Pack',
    starter: crane ? 'Crane Pipeline Starter' : 'Pipeline Starter',
    sprint: crane
      ? '60 Day Crane Revenue Recovery Sprint'
      : '60 Day Revenue Recovery Sprint',
    desk: 'Full Revenue Desk',
  }
}

export const PRICES = {
  audit: 'USD 297 one time',
  starter: 'USD 397 activation + USD 197 a month',
  sprint: 'USD 2,000 a month for 2 months',
  desk: 'USD 5,000 – 6,000 a month',
}

/* ------------------------------------------------------------
   Per-leak fixes.

   `mechanism` is the documented deliverable that closes the
   leak. `self` is whether the self-managed starter can close
   it — driven by 11 §10 (included) and §11 (excluded), not by
   preference.
   ------------------------------------------------------------ */
export const FIXES = {
  calls: {
    label: 'Missed calls',
    fix: 'Missed inquiry workflow',
    /* 08-SPRINT-DELIVERY-SOP §3 days 4–7 */
    what: 'Every unanswered call captured and turned into a structured rental conversation: logged, chased and handed back to the counter in your name.',
    self: false,
    /* 11 §11.3 — the starter explicitly excludes missed call management */
    selfNote: 'The starter does not manage missed calls. This leak stays open on the self-managed path.',
    live: 'Week 1',
  },
  speed: {
    label: 'Slow quotes',
    fix: 'QuickyQuotes intake on your site',
    /* 11 §5 component 1 — three outcomes, never a binding quote */
    what: 'Job details collected up front, then one of three outcomes: a budgetary estimate where your approved pricing rules allow it, a request for the missing details, or a straight route to manual review when the job is complex.',
    self: true,
    live: 'Week 1',
  },
  pile: {
    label: 'Quotes going cold',
    fix: 'Worked quote pile, three touches',
    /* 08 §6 — same day, +2 business days, +5 business days */
    what: 'Your open quotes classified by value and urgency, then worked on a three-touch sequence (same day, two days, five days) until every one is a yes, a no or a logged lost reason.',
    self: false,
    selfNote: 'The starter excludes human quote follow up. Nobody chases the pile on the self-managed path but your own team.',
    live: 'Week 2',
  },
  quiet: {
    label: 'Quiet accounts',
    fix: 'Account reactivation',
    what: 'The accounts that stopped calling get worked back: approved scripts, your name on every message, lost reasons recorded.',
    self: false,
    selfNote: 'Customer reactivation is not in the starter. This one only moves on the managed path.',
    live: 'Week 4',
  },
  outbound: {
    label: 'Jobs you never hear about',
    fix: 'Project Radar signals',
    /* 11 §8/§9 — filtered signals, scored /100, never "leads" */
    what: '25 filtered local project signals a month: permits and planned work inside your radius, scored on fit, timing and contactability, with a suggested angle for each. Signals, not guaranteed customers.',
    self: true,
    live: 'Week 3',
  },
}

/* Which leaks each path can actually close. */
const SELF_CLOSES = Object.keys(FIXES).filter((id) => FIXES[id].self)

/* ------------------------------------------------------------
   Full Revenue Desk qualification gate — 00-BUSINESS-PLAN §9.
   "Do not sell Full Revenue Desk unless at least 3 of the
   following are true." Evaluated against the owner's answers,
   and shown to him, met or unmet. A gate you can see is a gate
   you can trust.
   ------------------------------------------------------------ */
function deskGate(L, state) {
  const pileCount = { 'Under 20': 12, '20 – 50': 34, '50 – 150': 95, '150+': 220 }[state.quotePile] || 0
  const slow = state.quoteSpeed === 'Next day' || state.quoteSpeed === 'Two days or more'
  const missing = state.missedCalls && state.missedCalls !== 'Almost none'

  const criteria = [
    {
      label: '100+ inbound rental inquiries a month',
      met: L.inquiries >= 100,
      detail: L.inquiries ? `You reported about ${L.inquiries}` : 'Not answered',
    },
    {
      label: '50+ unclosed quotes available to work',
      met: pileCount >= 50,
      detail: pileCount ? `About ${pileCount} sitting open` : 'Not answered',
    },
    {
      label: 'Evidence of missed calls or slow response',
      met: !!(missing || slow),
      detail: missing && slow ? 'Both, on your answers'
        : missing ? 'Missed calls, on your answers'
        : slow ? 'Response lag, on your answers'
        : 'Neither, your counter is holding',
    },
    {
      label: 'Follow-up capacity is genuinely short',
      met: pileCount >= 20 && state.team !== '4+ people',
      detail: state.team ? `${state.team}, ${pileCount} open quotes` : 'Not answered',
    },
    {
      label: 'Average job value can support the fee',
      /* 03 §6 uses a USD 2,500 job as its worked example */
      met: L.ticket >= 2500,
      detail: L.ticket ? `${money(L.ticket)} average ${L.segment.job}` : 'Not answered',
    },
    {
      label: 'Consistent volume across the operation',
      met: false,
      detail: 'Confirmed on the call, not in a scan',
      unknown: true,
    },
  ]

  const met = criteria.filter((c) => c.met).length
  return { criteria, met, needed: 3, passes: met >= 3 }
}

/* ------------------------------------------------------------
   The recommendation.

   03-MISSED-RENTAL-AUDIT §5 gives the mapping outright:
     0–7   low urgency
     8–14  starter system fit
     15–20 managed sprint fit
     21–25 possible full desk candidate
   The desk gate (00 §9) then has to agree before the desk is
   ever named. 00 §15.1: do not discount the managed sprint —
   downsell to a different, smaller product instead.
   ------------------------------------------------------------ */
function recommend(L, state, names, gate) {
  const s = L.leakScore

  if (s <= 7) {
    return {
      key: 'audit',
      name: names.audit,
      price: PRICES.audit,
      headline: 'Low urgency. We are not going to sell you a managed desk.',
      why: 'Your counter is holding. On these answers there is not enough sitting on the table to justify a monthly service, and pretending otherwise would be the sales trick this scan exists to avoid.',
      next: 'If you want the findings written up properly (quote path reviewed, competitors compared, 15 local project signals, a 30 minute call), that is the audit pack. Otherwise, keep doing what you are doing.',
      tone: 'calm',
    }
  }

  if (s <= 14) {
    return {
      key: 'starter',
      name: names.starter,
      price: PRICES.starter,
      headline: 'Starter fit. Your team can run this one internally.',
      why: 'The leak is real but it is concentrated in the quote path and the radius, both of which are system problems, not staffing problems. You do not need us answering your phone to fix them.',
      next: 'Installed inside 7 business days or the activation fee comes back. If you upgrade to the managed sprint within 30 days the activation credits against it.',
      tone: 'calm',
    }
  }

  if (s <= 20 || !gate.passes) {
    return {
      key: 'sprint',
      name: names.sprint,
      price: PRICES.sprint,
      headline: s > 20
        ? 'Severe leak, but the desk gate is not met yet. Sprint first.'
        : 'Managed sprint fit. This is the one that pays for itself first.',
      why: s > 20
        ? `Your leak score is ${s}/25, which is desk territory, but only ${gate.met} of the ${gate.criteria.length} qualification criteria are met on your answers and we need ${gate.needed}. Selling you the desk today would be selling ahead of the proof.`
        : 'More than half your leak sits in work nobody currently has time to do: chasing quotes, catching calls, reviving accounts. That is capacity, and capacity is what a managed sprint is.',
      next: 'Two months. If dashboard-attributed booked revenue does not exceed the fees you paid, we keep working up to 60 more days without another service fee.',
      tone: 'urgent',
    }
  }

  return {
    key: 'desk',
    name: names.desk,
    price: PRICES.desk,
    headline: 'Desk candidate, and the gate agrees.',
    why: `A ${s}/25 leak score, with ${gate.met} of the ${gate.criteria.length} qualification criteria met and only ${gate.needed} required. You are not missing a tool. You are missing a revenue function.`,
    next: 'The sprint still runs first, and the desk only follows if the sprint proves the number on your own yard. We are not going to ask you to sign something permanent off the back of a two minute scan.',
    tone: 'urgent',
  }
}

/* ------------------------------------------------------------
   The 60 day sequence — 08-SPRINT-DELIVERY-SOP §3, with the
   owner's own numbers dropped into it.
   ------------------------------------------------------------ */
function sequence(L, state) {
  const pileCount = { 'Under 20': 12, '20 – 50': 34, '50 – 150': 95, '150+': 220 }[state.quotePile] || 0
  const firstPush = Math.min(25, pileCount)
  const secondPush = Math.max(0, Math.min(50, pileCount) - firstPush)

  return [
    {
      when: 'Days 1 – 3',
      title: 'Intake',
      body: `Website and quote-form access, a look at how quotes reach you today, your pricing rules, your service area${pileCount ? `, and ${Math.min(50, pileCount)} of the open quotes off that pile` : ''}. Nothing else: no customer database on day one.`,
    },
    {
      when: 'Days 4 – 7',
      title: 'Install',
      body: 'QuickyQuotes goes on the site against your approved pricing rules, the missed inquiry workflow goes live, the dashboard starts counting, and we run a test inquiry through end to end before a real customer ever touches it.',
    },
    {
      when: 'Days 8 – 21',
      title: 'Recovery push one',
      body: firstPush
        ? `Your top ${firstPush} open quotes classified by value and urgency, then worked on the three-touch sequence. Replies tracked, lost reasons logged, including the ones you will not like.`
        : 'Every new inquiry worked the day it lands, with lost reasons logged from the start.',
    },
    {
      when: 'Days 22 – 45',
      title: 'Recovery push two',
      body: `${secondPush ? `The remaining ${secondPush} quotes worked, and ` : ''}Project Radar signals start landing, filtered on your radius and your ${L.segment.jobs}. Intake gaps we keep hitting get fixed rather than worked around.`,
    },
    {
      when: 'Days 46 – 60',
      title: 'The count',
      body: 'Booked revenue attributed in the dashboard against the fees you paid. That number decides what happens next: continue, step up, or stop. It is not a renewal conversation, it is an arithmetic one.',
    },
  ]
}

/* ------------------------------------------------------------
   buildSolution — the whole answer, assembled.
   ------------------------------------------------------------ */
export function buildSolution(L, state) {
  const names = offerNames(state.primary || state.segment)
  const gate = deskGate(L, state)

  /* live leaks, biggest first, each with its documented fix */
  const active = L.ranked.map((leak) => ({
    ...leak,
    ...FIXES[leak.id],
    id: leak.id,
    amount: leak.amount,
  }))

  /* what each path can actually close, in dollars. L.monthly is the
     plausibility-bounded total, but per-leak amounts are raw — so the
     self path's subset sum must be bounded too, or a clamped scan
     could show the cheap path "recovering" more than the whole leak. */
  const selfAmount = Math.min(
    active
      .filter((l) => SELF_CLOSES.includes(l.id))
      .reduce((sum, l) => sum + l.amount, 0),
    L.monthly,
  )
  const managedAmount = L.monthly
  const selfGap = Math.max(0, managedAmount - selfAmount)
  const uncovered = active.filter((l) => !SELF_CLOSES.includes(l.id))

  /* The fastest fix (03 §4.3): the biggest leak that is live in
     week one. Chasing a pile pays more but cannot start until
     the intake stops refilling it — so week-one fixes win. */
  const fastest = active.find((l) => l.live === 'Week 1') || active[0] || null

  const paths = [
    {
      key: 'self',
      kind: 'Self managed',
      name: names.starter,
      price: PRICES.starter,
      /* 00 §6 split table */
      you: 'Your team works the inquiries and quotes.',
      us: 'We install the quote path, run Project Radar and keep it maintained.',
      closes: active.filter((l) => SELF_CLOSES.includes(l.id)).map((l) => l.label),
      leaves: uncovered.map((l) => l.label),
      recovers: selfAmount,
      gap: selfGap,
      guarantee: 'Live in 7 business days or the activation fee is refunded. 25 project signals a month or the next month is credited.',
      excludes: 'No missed call management, no human quote follow up, no reactivation, no revenue guarantee.',
    },
    {
      key: 'managed',
      kind: 'Managed',
      name: names.sprint,
      price: PRICES.sprint,
      you: 'You approve the scripts and answer the escalations.',
      us: 'We work the missed inquiries and the quote pile for 60 days, in your name.',
      closes: active.map((l) => l.label),
      leaves: [],
      recovers: managedAmount,
      gap: 0,
      guarantee: 'If dashboard-attributed booked revenue does not exceed the fees paid across the 60 days, we keep working up to 60 more days without another service fee.',
      excludes: 'Requires access to recent quotes and a weekly 20 minute review. Not worth buying if nobody on your side will take that call.',
    },
  ]

  return {
    names,
    gate,
    active,
    fastest,
    paths,
    selfAmount,
    selfGap,
    uncovered,
    sequence: sequence(L, state),
    recommendation: recommend(L, state, names, gate),
    /* 04-MYSTERY-CALL-SOP — the free real-world verification */
    verification: {
      title: 'Before any of that: we check the scan against reality',
      body: `Everything above is built from what you told me. So the next step is not a sales call. It is three inbound calls to ${state.place?.name || 'your yard'} at different times of day, one timed quote request through your website, and a count of what came back. Scored out of 10: live answer, intake questions, contact captured, clear next step, response time stated, follow-up received.`,
      note: 'Simple inquiries only, no invented jobs, no wasted dispatcher time. If your counter scores 8+, we will tell you that and there is nothing to sell.',
    },
  }
}
