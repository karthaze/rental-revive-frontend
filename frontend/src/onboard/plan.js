/* ============================================================
   THE SOLUTION ENGINE
   ------------------------------------------------------------
   The scan ends by naming what the owner needs BUILT, not what
   it costs. That is deliberate and it is the current rule:

     "Never put the service price on the Scan page. A service
      price published next to a free diagnostic turns the
      diagnostic into a sales page, and the Scan stops
      converting."
        — 16-WEBSITE-AND-SCAN-PAGE-COPY-BRIEF §1, §8.1

   So this file maps each measured leak to the engine that
   closes it, works out which of those are software (his team
   can run them) and which are labour (somebody has to make the
   calls), and hands the owner a build list plus one next step:
   twenty minutes on a call, where the number is discussed by a
   human.

     "Delivered live on a 20 minute call. Never emailed as a
      PDF." — 03-MISSED-RENTAL-AUDIT §3

   The close is never yes/no. It is two doors, both of which we
   are happy with — his team runs the machine, or we run the
   recovery for ninety days. 03 §9, 06 §10.

   HISTORY — read before adding a price back in.
   Until Aug 2026 this file hardcoded the killed ladder: a $297
   audit pack, a $197/mo starter, a $2,000/mo 60-day sprint and
   a $5-6k "Full Revenue Desk", plus a guarantee written against
   "dashboard-attributed booked revenue" — the exact guarantee
   the doc set replaced, because attribution disputes were
   already a listed kill trigger. All of it was live to real
   prospects. Every one of those names is now on the purge list
   in 07 §2. Do not reintroduce a SKU here.
   ============================================================ */

import { money } from '../../../common/leaks.js'
import { segmentById } from '../../../common/segments.js'

/* ------------------------------------------------------------
   The three names. There are no others.
   02-INDUSTRY-LANGUAGE-GUIDE §1.
   ------------------------------------------------------------ */
export const BRAND = {
  software: 'Captain Yard',
  managed: 'RentalRevive by Captain Yard',
  engine: 'Rent at Scale Engine',
}

/* ------------------------------------------------------------
   Per-leak engines.

   `people` is whether closing this leak requires somebody to
   actually make calls. It is not a preference — it is what
   separates the two doors, and it is why the software-only
   path genuinely leaves money on the table rather than just
   costing less.

   `gated` marks work that may not be sold before day 60 of an
   engagement, per 08-SPRINT-DELIVERY-SOP §"Day 60 — the add-on
   gate". Naming it here, unsold, is the honest treatment: the
   owner learns the leak is real and learns we will not take
   money for it yet.
   ------------------------------------------------------------ */
export const ENGINES = {
  calls: {
    label: 'Missed calls',
    engine: 'The Never-Missed Counter',
    what: 'Every call the counter cannot get to — lunch, after hours, mid-rush — answered before the next yard picks up, captured as a real rental conversation and handed back to your people with the job already written down.',
    people: true,
    peopleNote: 'Software can catch the call. Somebody still has to sell the job, and that is the part your counter has no minutes for.',
    live: 'Week 1',
  },
  speed: {
    label: 'Slow quotes',
    engine: 'The 60-Second Quote',
    what: 'The job gets described on your own site and comes back priced. Straightforward machines reserve on the spot against live availability. Anything that comes off a load chart is never auto-priced — it reaches your estimator with the weight, the radius and the access already captured.',
    people: false,
    live: 'Week 1',
  },
  pile: {
    label: 'Quotes going cold',
    engine: 'Dead Quote Recovery',
    what: 'Your open quotes sorted by value and urgency, then worked on a three-touch sequence — same day, two days, five days — until every one is a yes, a no, or a logged reason you can actually do something with.',
    people: true,
    peopleNote: 'Nobody chases a quote pile by accident. This one is entirely hands, and it is usually the fastest money in the building.',
    live: 'Week 2',
  },
  quiet: {
    label: 'Quiet accounts',
    engine: 'The Comeback Engine',
    what: 'The accounts that stopped calling, worked back in your name, on scripts you approve before anything goes out, with the reason recorded when one says no.',
    people: true,
    peopleNote: 'Reactivation is a conversation, not a send. It only moves when a person is doing it.',
    live: 'Week 4',
  },
  outbound: {
    label: 'Jobs you never hear about',
    engine: 'Local visibility',
    what: 'Being the yard a contractor finds when he goes looking — your profile, your local search, your fleet published as pages a search engine and an AI assistant can both actually read.',
    people: true,
    gated: true,
    gatedNote: 'We will not sell you this yet. Pushing more inquiries into a yard that answers slowly makes the leak bigger, not smaller. It comes up again at day sixty, once your response time is fixed and there is proof it is.',
    live: 'Day 60+',
  },
}

/* Leaks a software-only deployment can genuinely close. */
const SOFTWARE_CLOSES = Object.keys(ENGINES).filter((id) => !ENGINES[id].people)

/* ------------------------------------------------------------
   The read.

   Bands are the Leak Score from 03-MISSED-RENTAL-AUDIT §6, and
   the mapping is the one that document already specifies:
   low urgency gets told so, a mid score opens on the machine,
   a high score opens on the managed recovery. No score ever
   selects a cheaper offer to be polite — it selects how hard
   we think the owner should act.
   ------------------------------------------------------------ */
function read(L, state) {
  const s = L.leakScore
  const seg = segmentById(state.primary || state.segment)

  if (s <= 7) {
    return {
      key: 'none',
      headline: 'Your counter is holding. We are not going to sell you anything.',
      why: 'On your own answers there is not enough sitting on the table to justify a monthly service, and telling you otherwise would be the exact trick this scan exists to avoid.',
      next: 'Keep doing what you are doing. If it is useful, we will still run the real-world check below and send you the result, because a baseline is worth having before a busy season rather than after one.',
      tone: 'calm',
    }
  }

  if (s <= 14) {
    return {
      key: 'software',
      headline: 'The leak is real, and most of it is a system problem rather than a staffing one.',
      why: `It is concentrated in the quote path: a ${seg.customer} asks for a price and the answer takes longer than the job can wait. That is fixable with a machine on your own site. You do not need anybody answering your phone for you to close most of this.`,
      next: 'The twenty minutes is worth taking anyway, because the parts of your leak the machine cannot reach are the parts we would want to look at together.',
      tone: 'calm',
    }
  }

  return {
    key: 'managed',
    headline: 'More than half of this is work nobody currently has time to do.',
    why: 'Chasing quotes, catching calls, reviving accounts. That is not a tool problem — it is capacity. A machine on your site will close part of it and then stop, because the rest of it only moves when somebody picks up a phone.',
    next: 'Which is the conversation to have on a call rather than on a web page.',
    tone: 'urgent',
  }
}

/* ------------------------------------------------------------
   The ninety days — 08-SPRINT-DELIVERY-SOP §4, with the
   owner's own numbers dropped in.
   ------------------------------------------------------------ */
function sequence(L, state) {
  const pileCount = { 'Under 20': 12, '20 – 50': 34, '50 – 150': 95, '150+': 220 }[state.quotePile] || 0
  const firstPush = Math.min(25, pileCount)
  const secondPush = Math.max(0, Math.min(50, pileCount) - firstPush)

  return [
    {
      when: 'Days 0 – 3',
      title: 'Kickoff and intake',
      body: `Forty-five minutes with you, not a delegate: what counts as a recovered booking, your hours, and the pricing rules that decide what we can answer on the spot. Then the short list — fleet, rate card, service area${pileCount ? `, and ${Math.min(50, pileCount)} of the quotes off that open pile` : ''}. No customer database on day one.`,
    },
    {
      when: 'Days 4 – 10',
      title: 'Live',
      body: `${BRAND.software} goes on your site against the rules you set, every inbound channel starts being tracked, and we run a test inquiry end to end before a real customer touches it. Live inside seven business days of the last thing we need, or the activation comes back.`,
    },
    {
      when: 'Days 11 – 30',
      title: 'The pile, first pass',
      body: firstPush
        ? `Your top ${firstPush} open quotes sorted by value and urgency, then three touches each. Replies tracked, reasons logged — including the ones you will not enjoy reading.`
        : 'Every new inquiry worked the day it lands, with the reason recorded on every one that dies.',
    },
    {
      when: 'Days 31 – 60',
      title: 'The pile, second pass',
      body: `${secondPush ? `The remaining ${secondPush} quotes worked, and ` : ''}the live flow is now the bigger pool. Gaps we keep hitting in the intake get fixed in the widget rather than absorbed by a person.`,
    },
    {
      when: 'Day 60',
      title: 'The honest gate',
      body: 'Two tests before anything else is sold to you: is your median response inside fifteen minutes and has it been for a month, and are you ahead on the numbers. If either is a no, we say so and nothing gets sold.',
    },
    {
      when: 'Days 61 – 90',
      title: 'The count',
      body: 'Booked revenue against what you paid, on the rules you signed at kickoff. That number decides what happens next. It is an arithmetic conversation, not a renewal one.',
    },
  ]
}

/* ------------------------------------------------------------
   buildSolution — the whole answer, assembled.
   ------------------------------------------------------------ */
export function buildSolution(L, state) {
  /* live leaks, biggest first, each with the engine that closes it */
  const active = L.ranked.map((leak) => ({
    ...leak,
    ...ENGINES[leak.id],
    id: leak.id,
    amount: leak.amount,
  }))

  /* what each door can actually close, in dollars. L.monthly is the
     plausibility-bounded total, but per-leak amounts are raw — so the
     software subset must be bounded too, or a clamped scan could show
     the cheaper door "recovering" more than the whole leak. */
  const softwareAmount = Math.min(
    active
      .filter((l) => SOFTWARE_CLOSES.includes(l.id))
      .reduce((sum, l) => sum + l.amount, 0),
    L.monthly,
  )
  const managedAmount = L.monthly
  const softwareGap = Math.max(0, managedAmount - softwareAmount)
  const uncovered = active.filter((l) => !SOFTWARE_CLOSES.includes(l.id))

  /* The fastest fix: the biggest leak that is live in week one.
     Chasing a pile pays more but cannot start until the intake
     stops refilling it — so week-one fixes win. */
  const fastest = active.find((l) => l.live === 'Week 1') || active[0] || null

  /* The build list: what this yard actually needs standing up,
     named as engines. Gated work is carried but flagged. */
  const build = active.map((l) => ({
    id: l.id,
    engine: l.engine,
    label: l.label,
    what: l.what,
    live: l.live,
    amount: l.amount,
    people: !!l.people,
    peopleNote: l.peopleNote || '',
    gated: !!l.gated,
    gatedNote: l.gatedNote || '',
  }))

  const paths = [
    {
      key: 'software',
      kind: 'You run it',
      name: `${BRAND.software} on your site`,
      you: 'Your team works the inquiries and the quotes.',
      us: 'We build your fleet, set it against your pricing rules, and keep it running.',
      closes: active.filter((l) => SOFTWARE_CLOSES.includes(l.id)).map((l) => l.label),
      leaves: uncovered.map((l) => l.label),
      recovers: softwareAmount,
      gap: softwareGap,
      guarantee: 'Live and taking real inquiries inside seven business days, or the setup fee comes back.',
      excludes: 'Nobody from our side calls your customers. That is the other door.',
    },
    {
      key: 'managed',
      kind: 'We run it',
      name: BRAND.managed,
      you: 'You approve the scripts and take twenty minutes a week.',
      us: 'Our closers work your missed calls and your quote pile for ninety days, calling as your yard, in your name.',
      closes: active.filter((l) => !l.gated).map((l) => l.label),
      leaves: active.filter((l) => l.gated).map((l) => l.label),
      recovers: managedAmount,
      gap: 0,
      guarantee: 'Live in seven business days. Every inquiry answered inside fifteen minutes during your hours, or that month is free. And if we do not book more than you paid across the ninety days, we work the next ninety free — on attribution rules signed at kickoff, before we make a single call.',
      excludes: 'Needs your fleet data, script approvals inside two days, your estimator turning quotes around in a day, and you personally on the weekly call. Not worth buying if nobody on your side will do those four.',
    },
  ]

  return {
    brand: BRAND,
    active,
    build,
    fastest,
    paths,
    softwareAmount,
    softwareGap,
    uncovered,
    sequence: sequence(L, state),
    read: read(L, state),
    /* 04-MYSTERY-CALL-SOP — the free real-world check, and the
       reason the call is worth taking. It runs BEFORE we talk,
       so the twenty minutes starts with evidence rather than
       with a pitch. */
    verification: {
      title: 'Before we talk, we check this against reality',
      body: `Everything above is built from what you told me, which makes it a model rather than a measurement. So the next step is not a sales call. It is three inbound calls to ${state.place?.name || 'your yard'} at different times of day, one timed quote request through your website, and a count of what came back. Scored out of ten: live answer, intake questions, contact captured, clear next step, response time stated, follow-up received.`,
      note: 'Simple inquiries only, no invented jobs, nobody\'s time wasted. If your counter scores eight or better, we will tell you that and there will be nothing to sell you.',
    },
    /* The one next step. No price on this page, by rule. */
    nextStep: {
      title: 'Then twenty minutes, and you get the number',
      body: 'We walk you through what we found calling your own yard, side by side with what you told us here. You will leave that call knowing what the gap is worth at your yard and what it would take to close it. If it turns out to be small, we will say so.',
      cta: 'Book the twenty minutes',
    },
  }
}
