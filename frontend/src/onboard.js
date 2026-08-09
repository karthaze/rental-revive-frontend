/* ============================================================
   RENTALREVIVE — THE LEAK SCAN
   ------------------------------------------------------------
   An agentic onboarding app: the desk looks your yard up, maps
   who you are renting against, prices what is leaking, and then
   — the part that matters — hands back an actual plan.

     1. SEARCH GATE   find the yard — US heavy machinery rental
                      only, custom dropdown, no widget
     2. LOCK-ON       map pin + Google footprint; the app
                      *confirms* the counter phone it found
                      rather than asking for it cold
     3. THE THREAD    one question at a time. The transcript
                      holds only conversation; every reply is
                      made in the DOCK, pinned to the bottom,
                      so the input never moves
     4. RADAR         iterative-radius competitor sweep on a
                      dark instrument map, live pins
     5. COOKING       the report assembles from the owner's
                      own data
     6. THE SOLUTION  biggest leak → fastest fix → the 60 day
                      sequence → two paths priced by what each
                      can actually close → recommendation
                      against a visible qualification gate
     7. THE CLOSE     "where should I send it?" — asked last

   The leak metrics appear in exactly ONE place: the estimate panel
   mounted in the right stage once the numbers act starts, and the
   ledger inside the report. They used to be rendered three times over.

   No Maps key? Every stage degrades to a manual path and the
   scan still completes end to end.
   ============================================================ */

/* onboard.css is linked from onboard.html's head so the first paint is
   already styled — importing it here reintroduces the FOUC flash */
import { SEGMENTS, segmentById } from '../../common/segments.js'
import { computeLeaks, money, ASSUMPTIONS } from '../../common/leaks.js'
import { buildSolution } from './onboard/plan.js'
import {
  loadMaps, mapsUp, searchYards, placeDetails, radarScan,
  MAP_STYLE, MAP_BACKDROP, isNationalChain,
} from './onboard/places.js'
import { auditWebsite } from './onboard/crawler.js'
import { fetchReviews } from './onboard/reviews.js'
import { captureHomepage } from './onboard/capture.js'
import { shouldFollow } from './onboard/follow.js'
import {
  classifyWebsite, websiteVerdict, scoreProfile, trackingVerdict,
} from '../../common/footprint.js'

/* ------------------------------------------------------------
   state
   ------------------------------------------------------------ */
const state = {
  /* target */
  place: null,          // lock-on payload from Places (or manual:true)
  phone: '',            // confirmed counter line
  website: '',          // typed by the owner when the listing carries none
  /* yard */
  segments: [], primary: '', segment: '', // .segment mirrors .primary for the leak engine
  fleet: [], fleetSize: '',
  /* digital footprint: { site, profile, audit } — see ../../common/footprint.js */
  footprint: null,
  /* market */
  radar: { competitors: [], radiusMi: 0, ranTag: '' },
  rivals: [], whyTheyWin: [],
  /* numbers */
  inquiries: '', channels: [], ticket: '', closeRate: null, team: '',
  /* reach — how the phone is made to ring. Intake only: the audit spec's
     leak model has no marketing input, so these never move the meter. */
  marketing: '', marketingChannels: [], marketingWorks: '',
  /* leaks */
  missedCalls: '', afterHours: '', quoteSpeed: '',
  quotePile: '', quietAccounts: '', outbound: '',
  /* the close */
  recipient: '', role: '', email: '',
}

const answeredSteps = new Set()
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

let thread, composer, railEl, stageRight
let stepIndex = 0
let editingId = null
let awaitingStep = null   // the step whose widget is live in the dock
let appStarted = false    // the shell boots once, however the gate was fired

/* The five acts survive only as `act:` tags on the steps below —
   they group the question graph, they are no longer drawn. */

/* small inline icon set */

const ICON = {
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  chevUp: '<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  phoneSm: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.5 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  frame: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 15l2.5-2.5L13 15l2-2 3 3"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><polyline points="21 3 21 9 15 9"/></svg>',
}

/* ---- reach ----
   The negative answer is a constant because two follow-ups skip on it —
   a yard that markets nothing is never asked which medium works. */
const NO_MARKETING = 'No, word of mouth and repeat accounts'

/* Operational mediums, the way a yard would name them —
   02-INDUSTRY-LANGUAGE-GUIDE §1: "avoid generic marketing terms". */
const MARKETING_MEDIA = [
  'Google Ads',
  'Google Business Profile & maps',
  'Website & search',
  'Facebook / Instagram',
  'Trade shows & associations',
  'Print, radio or billboards',
  'Direct mail or flyers',
  'A rep calling on contractors',
  'Email or texts to your account list',
]

/* the ones the owner is actively paying for — changes what the leak costs him */
const PAID_MEDIA = [
  'Google Ads', 'Facebook / Instagram', 'Print, radio or billboards',
  'Direct mail or flyers',
]

const NOTHING_WORKS = 'None of them, honestly'

const LEAK_ICONS = {
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.5 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  radar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="12" x2="18" y2="6"/></svg>',
}

/* ------------------------------------------------------------
   question graph
   ------------------------------------------------------------
   step: { id, act, prompt|stage, widget?, react?, structural?,
           skip?(state), hint? }
   - stage(row): auto-playing beat (lock-on, radar) — no widget
   - skip(state): step is passed over when true
   - hint: the mono line above the widget in the dock
   ------------------------------------------------------------ */
const STEPS = [
  /* ---------- ACT 1 · the yard ---------- */
  {
    id: 'lockon', act: 'yard', noPill: true,
    stage: (row) => lockonStage(row),
  },
  {
    id: 'reviews', act: 'yard', noPill: true,
    skip: (s) => !s.place || !s.place.reviewsList || s.place.reviewsList.length === 0,
    stage: (row) => reviewsStage(row),
  },
  {
    /* Google listings routinely omit the website, and the manual path
       never had one. Ask instead of shrugging: a typed address feeds
       the same capture + tag scan as a listed one, and "no website"
       becomes an answer the owner gave, not a gap we guessed at. */
    id: 'website', act: 'yard',
    skip: (s) => !s.place || classifyWebsite(s.place.website).kind !== 'none',
    prompt: () => state.place?.manual
      ? 'Does the yard have a website? Type the address, or say so if there isn’t one.'
      : 'Your Google listing shows no website. If the yard has one, type the address here, or tell me there isn’t one.',
    hint: 'yourcompany.com',
    widget: (s, commit) => textWidget({
      placeholder: 'yourcompany.com',
      value: s.website || '',
      allowEmpty: true, emptyLabel: 'We don’t have a website',
      validate: (v) => classifyWebsite(v).kind !== 'none' && /[a-z0-9][a-z0-9-]*\.[a-z]{2,}/i.test(v),
      commit: (v) => {
        const site = classifyWebsite(v)
        state.place.website = site.kind === 'none' ? '' : site.url
        commit(v.trim(), site.kind === 'none' ? 'No website' : site.host)
      },
    }),
    react: (s) => {
      const site = classifyWebsite(s.place?.website)
      if (site.kind === 'site') return `${site.host}, got it. Pulling up what your customers land on.`
      if (site.kind !== 'none') return `A ${site.platform} page, noted.`
      return 'No website, noted. That means every inquiry has exactly one door: the counter line. The rest of this scan prices what happens when that door does not open.'
    },
  },
  {
    /* The digital footprint: profile completeness, what the website
       field actually points at, and whether anything on the site is
       counting visitors. Runs with or without a website — "no website"
       is a finding, not a reason to skip. Manual yards join in once
       the step above gives them an address worth reading. */
    id: 'website_audit', act: 'yard', noPill: true,
    skip: (s) => !s.place || (s.place.manual && classifyWebsite(s.place.website).kind === 'none'),
    stage: (row) => auditStage(row),
  },
  {
    id: 'phone', act: 'yard',
    /* manual entry already typed the phone — don't re-ask */
    skip: (s) => !!(s.place?.manual && s.place.phone),
    prompt: () => state.place?.phone && !state.place?.manual
      ? `Google says the counter answers on [[${state.place.phone}]]. Is that the number that actually rings when a customer calls?`
      : 'What number rings at the counter when a customer calls?',
    hint: 'Confirm the counter line',
    widget: (s, commit) => phoneWidget(s, commit),
    react: () => 'Good. That line is exactly where the first leak usually hides. Hold that thought.',
  },
  {
    id: 'segments', act: 'yard', structural: true,
    prompt: () => [
      'Now, what kind of iron goes out your gate? Most yards are more than one thing, so tap everything you rent.',
    ],
    hint: 'Select every line you run',
    widget: (s, commit) => segmentGrid(s, commit),
    react: (s) => s.segments.length > 1
      ? `A ${s.segments.length}-line yard. That's more surface area for revenue, and more places for it to leak.`
      : segmentById(s.segments[0]).hook,
  },
  {
    id: 'primary', act: 'yard', structural: true,
    skip: (s) => s.segments.length < 2,
    prompt: () => 'Which of those pays the bills? I\'ll price the scan around it.',
    hint: 'Pick the primary line',
    widget: (s, commit) => bandSelect({
      options: s.segments.map((id) => segmentById(id).name),
      selected: s.primary ? segmentById(s.primary).name : '',
      commit: (label) => {
        const seg = SEGMENTS.find((x) => x.name === label)
        commit(seg.id, seg.name)
      },
    }),
    react: (s) => segmentById(s.primary).hook,
  },
  {
    id: 'fleet', act: 'yard',
    prompt: () => 'Down to the machines. Tap everything in the fleet. This feeds your report.',
    hint: 'Select all that apply',
    widget: (s, commit) => multiChips({
      options: fleetOptions(s),
      selected: s.fleet,
      cols: 2, /* machine lists run long — two columns keep them on screen */
      countNoun: 'lines',
      doneLabel: 'That’s the fleet',
      commit: (vals) => commit(vals, vals.length > 2 ? `${vals.slice(0, 2).join(', ')} +${vals.length - 2} more` : vals.join(', ') || 'Mixed fleet'),
    }),
  },
  {
    id: 'fleetSize', act: 'yard',
    prompt: () => 'And roughly how many units is that, all in?',
    hint: 'Ballpark is fine',
    widget: (s, commit) => bandSelect({
      options: ['1 – 10', '11 – 25', '26 – 60', '60+'],
      selected: s.fleetSize, commit,
    }),
    react: (s) => (s.fleetSize === '26 – 60' || s.fleetSize === '60+')
      ? 'That is real iron. Every day a unit sits, the leak is paying someone else’s note.'
      : 'Tight fleet, which means every single booking matters more, not less.',
  },

  /* ---------- ACT 2 · the market ---------- */
  {
    id: 'radar', act: 'market', noPill: true,
    skip: () => !mapsUp() || !state.place || state.place.manual,
    stage: (row) => radarStage(row),
  },
  {
    id: 'rivals', act: 'market',
    prompt: () => state.radar.competitors.length
      ? 'Which of these actually take jobs from you? Tap all that apply.'
      : 'Who takes jobs from you around here? Name the yards. Comma separated is fine.',
    hint: () => state.radar.competitors.length ? 'From your radius sweep' : 'Name them',
    widget: (s, commit) => s.radar.competitors.length
      ? rivalsWidget(s, commit)
      : textWidget({
          placeholder: 'e.g. United Rentals, Smith Crane, ACME Equipment',
          value: s.rivals.join(', '),
          allowEmpty: true, emptyLabel: 'Honestly, nobody worth naming',
          commit: (v) => {
            const list = v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8)
            commit(list, list.length ? list.join(', ') : 'No one named')
          },
        }),
    react: (s) => {
      const nats = s.rivals.filter((n) => isNationalChain(n)).length
      if (!s.rivals.length) return 'Then whatever is leaking, it isn’t leaking to a better yard. It’s leaking to whoever picks up the phone first.'
      return nats
        ? `${nats === s.rivals.length ? 'All' : nats} of those ${nats === 1 ? 'is a national branch' : 'are national branches'}. They don’t out-rent you, they out-answer you. Their phone picks up at midnight.`
        : 'Independents like you. Which means the fight is winnable. It comes down to who answers and who follows up.'
    },
  },
  {
    id: 'whyTheyWin', act: 'market',
    skip: (s) => !s.rivals.length,
    prompt: () => 'When one of them wins a job you wanted, why? Tap every reason that\'s true.',
    hint: 'Select all that apply',
    widget: (s, commit) => multiChips({
      options: ['They answer first', 'Lower price', 'Bigger fleet', 'Machine was available', 'Relationships', 'Closer to the job'],
      selected: s.whyTheyWin,
      countNoun: 'reasons',
      doneLabel: 'That’s why',
      commit: (vals) => commit(vals, vals.join(', ')),
    }),
    react: (s) => s.whyTheyWin.includes('They answer first')
      ? 'You said it yourself: they answer first. That is not a fleet problem or a price problem. That is the leak this scan prices.'
      : 'Notice what’s NOT on your list: nobody beats you on the iron itself. The gap is in the follow-through. Good news, because follow-through is fixable.',
  },

  /* ---------- ACT 3 · the numbers ---------- */
  {
    id: 'inquiries', act: 'numbers',
    prompt: () => [
      'Numbers time. Ballpark is fine. Tap any answer later to change it and the whole model re-runs.',
      'How many rental inquiries land in a normal month? Calls, forms, emails, walk-ins, all of it.',
    ],
    hint: 'Every door, added up',
    widget: (s, commit) => bandSelect({
      options: ['Under 25', '25 – 60', '60 – 120', '120+'],
      selected: s.inquiries, commit,
    }),
  },
  {
    id: 'channels', act: 'numbers',
    prompt: () => 'And how do they come in? Tap every channel that rings, pings or walks through the door.',
    hint: 'Select all that apply',
    widget: (s, commit) => multiChips({
      options: ['Phone calls', 'Website form', 'Email', 'Walk-ins', 'Text messages', 'Repeat accounts calling direct'],
      selected: s.channels,
      countNoun: 'channels',
      doneLabel: 'That’s all of them',
      commit: (vals) => commit(vals, vals.length > 2 ? `${vals.slice(0, 2).join(', ')} +${vals.length - 2}` : vals.join(', ')),
    }),
    react: (s) => s.channels.length >= 4
      ? `${s.channels.length} channels, one counter. Every extra door is another place a rental can slip out unnoticed.`
      : 'Few doors, easy to guard, as long as somebody is actually standing at them.',
  },

  /* ---------- ACT 3b · reach — what makes the phone ring ----------
     Three steps that collapse to one when the answer is no: a yard
     running nothing is never asked which medium, or which medium won. */
  {
    id: 'marketing', act: 'numbers',
    invalidates: ['marketingChannels', 'marketingWorks'],
    prompt: () => 'Now, are you actively marketing the yard, or does the work mostly find you?',
    hint: 'What makes the phone ring',
    widget: (s, commit) => bandSelect({
      options: ['Yes, running it consistently', 'On and off, when it goes quiet', NO_MARKETING],
      selected: s.marketing, commit,
    }),
    react: (s) => s.marketing === NO_MARKETING
      ? 'All of it earned, none of it bought. That is an asset, and it means every inquiry that does come in is harder to replace, because there is no second wave behind it.'
      : s.marketing === 'On and off, when it goes quiet'
        ? 'On and off is the usual rhythm: spend when the yard is quiet, stop when it fills up. Which puts the pressure on the counter exactly when it is least ready for it.'
        : 'Then you are already paying to make that phone ring. Which is what makes the next part expensive: what happens after it rings.',
  },
  {
    id: 'marketingChannels', act: 'numbers',
    /* which medium won is built from these picks — drop it if they change */
    invalidates: ['marketingWorks'],
    skip: (s) => s.marketing === NO_MARKETING,
    prompt: () => 'Which of these are you actually running? Tap all that apply.',
    hint: 'Select everything you run',
    widget: (s, commit) => multiChips({
      options: MARKETING_MEDIA,
      selected: s.marketingChannels,
      countNoun: 'running',
      doneLabel: 'That’s what we run',
      commit: (vals) => commit(vals, vals.length > 2
        ? `${vals.slice(0, 2).join(', ')} +${vals.length - 2} more`
        : vals.join(', ') || 'Nothing specific'),
    }),
    react: (s) => {
      const paid = s.marketingChannels.filter((m) => PAID_MEDIA.includes(m))
      if (!s.marketingChannels.length) return ''
      return paid.length
        ? `So you are paying for the phone to ring. Every call that rings out is that spend walking back out the gate, which is the first thing this scan prices.`
        : 'Earned reach rather than bought: the profile, the site, the relationships. It works, and it is slow to rebuild, so wasting what it brings in costs more than it looks.'
    },
  },
  {
    id: 'marketingWorks', act: 'numbers',
    skip: (s) => s.marketing === NO_MARKETING || !s.marketingChannels.length,
    prompt: (s) => s.marketingChannels.length === 1
      ? `And is ${s.marketingChannels[0]} actually bringing rental work in?`
      : 'Which one of those actually brings the work in? Pick the one that earns its keep.',
    hint: (s) => s.marketingChannels.length === 1 ? 'Is it earning its keep?' : 'The one that pays for itself',
    widget: (s, commit) => bandSelect({
      options: s.marketingChannels.length === 1
        ? ['Yes, it brings work in', 'Some, hard to tell', 'Not really']
        : [...s.marketingChannels, NOTHING_WORKS],
      selected: s.marketingWorks, commit,
    }),
    react: (s) => {
      const dud = s.marketingWorks === NOTHING_WORKS || s.marketingWorks === 'Not really'
      if (dud) return 'Then more of it is not the fix. Paying to make a phone ring that nobody gets to is the most expensive thing a yard can do, and it is exactly what the rest of this scan measures.'
      if (s.marketingWorks === 'Some, hard to tell') return 'Hard to tell usually means nobody is tracking what happened after the call. That gap is where the money hides, and it is the same gap this scan opens up.'
      return `${s.marketingWorks} earns its keep. Worth knowing, because the cheapest revenue in this scan is not more inquiries, it is the ones already reaching you.`
    },
  },

  {
    id: 'ticket', act: 'numbers',
    prompt: (s) => `What does an average ${segmentById(s.primary).job} run? Total invoice, not day rate.`,
    hint: 'Total invoice',
    /* Ranges plus an exact-invoice entry — the same shape as missed
       calls, because the same two owners exist: the one who thinks in
       brackets and the one who can read the number off last month's
       invoices. The ranges ARE the segment's own ticketBands, priced
       at their midpoints; ticket multiplies EVERY leak, so the exact
       entry matters most here. Both commit a NUMBER — a band label
       stored as a string would silently stop resolving if the owner
       later changed their primary segment. */
    widget: (s, commit) => {
      const seg = segmentById(s.primary)
      /* The ranges follow the IRON the yard actually ticked. Each
         fleet entry carries a [lo, hi] window into its segment's
         ticket bands (fleetBands, grounded in the 2026 rate pass) —
         so a yard renting carry decks and rigging gear sees the two
         low crane brackets, and only ticking crawlers or towers
         surfaces "$12,000+". Windows union across every ticked
         machine in every picked segment; the primary's version wins
         label collisions, everything sorts by midpoint. A machine
         with no window (or an edited flow with no fleet yet) falls
         back to its segment's full four bands — the options may
         narrow on good data, never on missing data. The custom box
         still takes any number, so a hidden bracket can never block
         a true answer. */
      const picked = (s.segments.length ? s.segments : [s.primary]).map(segmentById)
      const ordered = [seg, ...picked.filter((g) => g.id !== seg.id)]
      const unlocked = ordered.flatMap((g) => {
        const idx = new Set()
        for (const m of s.fleet) {
          const w = g.fleetBands?.[m]
          if (w) for (let i = w[0]; i <= w[1]; i++) idx.add(i)
        }
        return [...idx].map((i) => g.ticketBands[i])
      })
      const pool = unlocked.length ? unlocked : ordered.flatMap((g) => g.ticketBands)
      const bands = [...new Map(pool.map((b) => [b.label, b])).values()]
        .sort((a, b) => a.mid - b.mid)
      return bandsWithCustom({
        options: bands.map((b) => ({ label: b.label, value: b.mid })),
        selected: typeof s.ticket === 'number' ? s.ticket : undefined,
        customLabel: 'I know my exact number',
        customPlaceholder: 'Average total invoice in dollars',
        /* typed entries may exceed the top band — that is the point of
           the box — but not without limit: twice the derived ceiling
           of the DEAREST picked segment (≈ 3× its top band midpoint;
           $54,000 for cranes, $180,000 for heavy haul). The
           plausibility bound still guards the total downstream. */
        customMax: Math.max(...ordered.map((g) => ticketRange(g).max)) * 2,
        formatCustom: (v, capped) => `${money(v)}${capped ? '+' : ''} a ${seg.job}`,
        commit,
      })
    },
  },
  {
    id: 'closeRate', act: 'numbers',
    prompt: () => 'Out of every 10 quotes you send, how many turn into booked work?',
    hint: 'Drag to your number',
    widget: (s, commit) => sliderWidget({
      min: 1, max: 10,
      value: Math.round((s.closeRate ?? segmentById(s.primary).defaultClose) / 10),
      suffix: 'of 10',
      commit: (v) => commit(v * 10, `${v} of 10 book`),
    }),
    react: (s, L) =>
      `The meter is armed: ${money(L.ticket)} a ${segmentById(s.primary).job}, ${Math.round(L.close * 100)}% of quotes booking. From here, every answer prices a leak. Watch the meter beside the chat climb.`,
  },
  {
    id: 'team', act: 'numbers',
    prompt: () => 'Who\'s actually answering rental calls on a normal day?',
    hint: 'On a normal day',
    widget: (s, commit) => bandSelect({
      options: ['Just me', '2 – 3 at the counter', '4+ people', 'An answering service'],
      selected: s.team, commit,
    }),
    react: (s) => s.team === 'Just me'
      ? 'One pair of hands on the phone and a yard to run. Nobody catches everything alone. That’s not a criticism, it’s arithmetic.'
      : s.team === 'An answering service'
        ? 'A service catches the call. The question this scan answers is whether anyone turns those messages into bookings.'
        : 'A real counter team. The leak, if there is one, will be in the handoffs: lunch, shift change, 5:01pm.',
  },

  /* ---------- ACT 4 · the five leaks ---------- */
  {
    id: 'missedCalls', act: 'leaks',
    prompt: () => [
      'Leak one: the missed call.',
      'In a busy week, how many calls ring out? Lunch, after hours, everyone loading a truck.',
    ],
    hint: 'Leak 1 of 5 · missed calls',
    /* Ranges plus an exact-number entry. Nobody counts their missed
       calls, so ranges are the fast path — but the owner who checks
       a call log should not be rounded to a bucket. Ranges commit
       their midpoint as a NUMBER (the engine prices numbers at face
       value; no new strings enter the AD-11 vocabulary), and the top
       range exists because published benchmarks put a mid-size shop
       at 40–90 missed a week — the old "15+" ceiling collapsed every
       busy yard into one bucket. */
    widget: (s, commit) => bandsWithCustom({
      options: [
        { label: 'Almost none', value: 0 },
        { label: '1 – 5 a week', value: 3 },
        { label: '6 – 15 a week', value: 10 },
        { label: '16 – 40 a week', value: 26 },
        { label: 'More than 40', value: 55 },
      ],
      selected: typeof s.missedCalls === 'number' ? s.missedCalls : undefined,
      customLabel: 'I know my exact number',
      customPlaceholder: 'Calls a week',
      customMax: 150,
      suffix: 'a week',
      commit,
    }),
  },
  {
    id: 'afterHours', act: 'leaks',
    prompt: () => 'And when the counter closes, what happens to a call at 6pm?',
    hint: 'After hours',
    widget: (s, commit) => bandSelect({
      options: ['Voicemail', 'Nothing, it just rings', 'Answering service', 'Someone on call'],
      selected: s.afterHours, commit,
    }),
    react: (s, L) => {
      const leak = L.leaks.find((l) => l.id === 'calls')
      if (!leak || leak.amount <= 0) return 'Your phone is tight. That is rarer than you’d think. Most yards leak here first.'
      return `${segmentById(s.primary).frames.calls} On your numbers that’s ≈ ${money(leak.amount)} a month. It just hit the meter.`
    },
  },
  {
    id: 'quoteSpeed', act: 'leaks',
    prompt: (s) => [
      'Leak two: the slow quote.',
      `A ${segmentById(s.primary).customer} asks for a price. How long until a number is actually in his hands?`,
    ],
    hint: 'Leak 2 of 5 · response speed',
    widget: (s, commit) => bandSelect({
      options: ['Inside the hour', 'Same day', 'Next day', 'Two days or more'],
      selected: s.quoteSpeed, commit,
    }),
    react: (s, L) => {
      const leak = L.leaks.find((l) => l.id === 'speed')
      if (!leak || leak.amount <= 0) return 'Inside the hour is winning speed. Very few yards can say that.'
      return `${segmentById(s.primary).frames.quotes} Call it ≈ ${money(leak.amount)} a month lost to lag alone.`
    },
  },
  {
    id: 'quotePile', act: 'leaks',
    prompt: () => [
      'Leak three: the pile.',
      'Quotes you sent that never got a yes or a no: how many are sitting open right now?',
    ],
    hint: 'Leak 3 of 5 · the open pile',
    widget: (s, commit) => bandSelect({
      options: ['Under 20', '20 – 50', '50 – 150', '150+'],
      selected: s.quotePile, commit,
    }),
    react: (s, L) => {
      const leak = L.leaks.find((l) => l.id === 'pile')
      if (!leak || !leak.standing) return ''
      return `${segmentById(s.primary).frames.pile} Worked properly, that standing pile alone is worth ≈ ${money(leak.standing)}, before we count the new quotes going cold every month.`
    },
  },
  {
    id: 'quietAccounts', act: 'leaks',
    prompt: (s) => [
      'Leak four: the quiet account.',
      `${cap(segmentById(s.primary).customers)} who used to rent from you and just… stopped. No complaint, no goodbye. How many come to mind?`,
    ],
    hint: 'Leak 4 of 5 · lapsed accounts',
    widget: (s, commit) => bandSelect({
      options: ['Just a few', '10 – 25', '25 – 75', '75+'],
      selected: s.quietAccounts, commit,
    }),
    react: (s, L) => {
      const leak = L.leaks.find((l) => l.id === 'quiet')
      return leak && leak.amount > 0 ? segmentById(s.primary).frames.quiet : ''
    },
  },
  {
    id: 'outbound', act: 'leaks',
    prompt: (s) => [
      'Last leak: the job you never hear about.',
      `${projectExample(s)} Do you work local project activity before it calls you: permits, lettings, planned work?`,
    ],
    hint: 'Leak 5 of 5 · project intelligence',
    widget: (s, commit) => bandSelect({
      options: ['Yes, we work them', 'Now and then', 'No, we wait for the phone'],
      selected: s.outbound, commit,
    }),
    react: (s, L) => {
      const leak = L.leaks.find((l) => l.id === 'outbound')
      if (!leak || leak.amount <= 0) return 'Good. Most yards only ever react. Working the radius puts you a call ahead.'
      return segmentById(s.primary).frames.outbound
    },
  },
]

const cap = (str) => str.charAt(0).toUpperCase() + str.slice(1)

function projectExample(s) {
  const sig = segmentById(s.primary).signals
  return `${sig[0]}, ${sig[1].toLowerCase()}, ${sig[2].toLowerCase()}. All happening in your radius right now.`
}

/* union of every selected segment's fleet list, capped so the grid
   stays tappable */
function fleetOptions(s) {
  const per = s.segments.length > 1 ? 5 : 8
  const seen = new Set()
  const out = []
  for (const id of s.segments) {
    for (const item of segmentById(id).fleet.slice(0, per)) {
      if (!seen.has(item)) { seen.add(item); out.push(item) }
    }
  }
  return out.slice(0, 18)
}

/* ============================================================
   PHASE 1 — entry
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')
  const params = new URLSearchParams(location.search)
  /* a proof-load-test run outlives its tab (NFR1) — the report email
     and localStorage both carry ?run= links straight back to the board */
  const run = params.get('run')
  if (run) return bootProbeDashboard(app, run)
  const pid = params.get('pid')
  if (pid) return bootSplash(app, pid, params.get('n') || '')
  renderGate(app, params.get('q') || '')
})

/* return visit to a live or finished run: no gate, no questionnaire —
   just the board, in the same shell language as the scan */
async function bootProbeDashboard(app, runId) {
  document.title = 'Proof load test · RentalRevive'
  app.innerHTML = `
    <main class="stage">
      <header class="topbar">
        <a class="tb-logo" href="/"><img src="/img/logo.png" alt="RentalRevive" /></a>
        <span class="tb-target">Proof load test</span>
        <a class="tb-exit" href="/onboard.html">New scan</a>
      </header>
      <div class="dash-solo"><div class="dash-solo-inner" id="dashHost"></div></div>
    </main>`
  try {
    const { mountDashboard } = await import('./dashboard/index.js')
    await mountDashboard(document.getElementById('dashHost'), runId)
  } catch (e) {
    console.warn('dashboard unavailable', e)
    document.getElementById('dashHost').innerHTML =
      '<div class="probe-dash"><p class="pd-note">The probe backend isn’t reachable from this page. Your run is safe server-side. Try the link from your report email.</p></div>'
  }
}

/* landing hand-off: they already picked their yard over there */
function bootSplash(app, pid, name) {
  app.innerHTML = `
    <div class="splash">
      <img src="/img/logo.png" alt="RentalRevive" />
      <span class="gate-spin on"></span>
      <p>Locking on to <b>${esc(name || 'your yard')}</b>…</p>
    </div>`
  loadMaps().then(async (ok) => {
    const details = ok ? await placeDetails(pid) : null
    if (details) return enterApp(details) /* they chose it — no second-guessing */
    renderGate(app, name)
  })
}

function renderGate(app, prefill) {
  app.innerHTML = `
    <div class="gate-screen" id="gate">
      <div class="gate-bg" aria-hidden="true"></div>
      <header class="gate-top">
        <a class="gate-logo" href="/"><img src="/img/logo-light.png" alt="RentalRevive" /></a>
        <span class="gate-badge"><span class="star"></span>Free · 2 minutes · no forms</span>
      </header>
      <div class="gate-hero">
        <span class="gate-eyebrow"><i class="gate-live"></i>The rental revenue leak scan</span>
        <h1>Type your company.<br/><em>We’ll find the leak.</em></h1>
        <p class="gate-sub">Heavy machinery rental yards only, cranes to compactors. No sign-up, no email wall. Just your business name.</p>
        <div class="gate-search-wrap">
        <div class="gate-search" id="gateSearch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          <input id="gateInput" type="text" autocomplete="off" spellcheck="false"
                 placeholder="Search your rental company…"
                 role="combobox" aria-expanded="false" aria-controls="gateList" aria-label="Search your rental company" />
          <button class="gate-go" id="gateGo" type="button" aria-label="Start the scan">
            <span class="gate-spin" id="gateSpin" hidden></span>
            <svg class="gg-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="8 7 17 7 17 16"/></svg>
          </button>
        </div>
        <ul class="gate-list" id="gateList" role="listbox"></ul>
        </div>
        <div class="gate-trust">
          <span>Free 2-minute scan</span>
          <span>No forms, no sign-up</span>
          <span>Your leak priced live</span>
        </div>
        <p class="gate-alt" id="gateAlt">Can’t find it, or no Google listing? Type the yard’s name and hit <b>Enter</b>. The scan runs fine without Google.</p>
      </div>
      <footer class="gate-foot">
        <a href="/">← rentalrevive.com</a>
        <span>We look you up the way your customers do. Nothing is posted, nothing is public.</span>
      </footer>
    </div>`
  bootGate(prefill)
}

function bootGate(prefill) {
  const input = document.getElementById('gateInput')
  const list = document.getElementById('gateList')
  const spin = document.getElementById('gateSpin')
  const goBtn = document.getElementById('gateGo')
  const arrow = goBtn.querySelector('.gg-arrow')
  const alt = document.getElementById('gateAlt')

  let ready = false
  let rows = []
  let active = -1
  let lockBusy = false
  let timer = 0

  const mapsPromise = loadMaps().then((ok) => {
    ready = ok
    if (!ok) alt.innerHTML = 'Live search is offline right now. Type the yard’s name and hit <b>Enter</b>. The scan runs fine without Google.'
    return ok
  })

  input.focus()

  const paint = () => {
    list.innerHTML = ''
    input.setAttribute('aria-expanded', rows.length ? 'true' : 'false')
    rows.forEach((r, i) => {
      const isBlocked = r.kind === 'no'
      const li = el('li', 'gate-item' + (i === active ? ' active' : '') + (isBlocked ? ' blocked' : ''))
      li.setAttribute('role', 'option')
      li.innerHTML = `
        <span class="gi-pin">${ICON.pin}</span>
        <span class="gi-txt"><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></span>
        <i class="gi-tag ${r.kind}">${r.kind === 'yes' ? 'Equipment' : isBlocked ? 'Party / Events / Cars' : 'Unverified'}</i>`
      li.querySelector('.gi-pin svg')?.setAttribute('fill', 'none')
      li.querySelector('.gi-pin svg')?.setAttribute('stroke', 'currentColor')
      li.querySelector('.gi-pin svg')?.setAttribute('stroke-width', '2')
      if (!isBlocked) li.addEventListener('click', () => lock(r))
      list.appendChild(li)
    })
    if (rows.length) {
      const foot = el('li', 'gate-src')
      foot.textContent = 'Google Places live · heavy machinery rental yards only'
      list.appendChild(foot)
    }
    clampList()
  }

  /* the dropdown overlays the page, so its height must respect the
     viewport: at short windows (or high browser zoom) it used to run
     straight off the bottom of the screen */
  const clampList = () => {
    const top = list.getBoundingClientRect().top
    /* floor of ~1.5 rows: past that the window is shorter than any
       floor could honestly fix, and internal scroll takes over */
    list.style.maxHeight = Math.max(110, window.innerHeight - top - 16) + 'px'
  }
  window.addEventListener('resize', clampList)

  const search = async () => {
    const q = input.value.trim()
    if (q.length < 3) { rows = []; active = -1; paint(); return }
    spin.hidden = false
    arrow.style.display = 'none'
    await mapsPromise
    if (ready) {
      rows = await searchYards(q)
      active = rows.length ? 0 : -1
      paint()
    }
    spin.hidden = true
    arrow.style.display = ''
  }

  /* the escape hatch IS the same box: typed name + Enter, done */
  const manual = () => {
    const nm = input.value.trim()
    if (nm.length < 2) { input.focus(); return }
    enterApp({
      manual: true, placeId: '', lat: 0, lng: 0, rating: 0, reviews: 0,
      website: '', types: [], name: nm, city: '', state: '', address: '', phone: '',
    })
  }

  const go = () => { rows[active] ? lock(rows[active]) : manual() }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 180) })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, rows.length - 1); paint() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint() }
    else if (e.key === 'Enter') { e.preventDefault(); go() }
    else if (e.key === 'Escape') { rows = []; active = -1; paint() }
  })
  goBtn.addEventListener('click', go)

  async function lock(row) {
    if (lockBusy) return
    lockBusy = true
    list.innerHTML = `<li class="gate-item locking"><span class="gate-spin on"></span><span class="gi-txt"><b>Locking on to ${esc(row.name)}…</b><small>pulling the Google footprint</small></span></li>`
    const details = await placeDetails(row.placeId)
    if (!details) {
      lockBusy = false
      list.innerHTML = `<li class="gate-item err">Couldn’t pull that listing. Pick another result, or just hit <b>Enter</b> to run with the name alone.</li>`
      return
    }
    if (details.kind === 'no') {
      lockBusy = false
      list.innerHTML = `
        <li class="gate-item err">
          <span class="gi-txt"><b>${esc(details.name)}</b> reads like a different kind of rental business. This scan is built for heavy machinery yards.
          <small><button type="button" id="giAnyway">It IS a machinery yard · continue</button> · or pick another result</small></span>
        </li>`
      document.getElementById('giAnyway')?.addEventListener('click', () => enterApp(details))
      return
    }
    enterApp(details)
  }

  if (prefill) { input.value = prefill; search() }
}

/* ============================================================
   PHASE 2 — the app shell
   ------------------------------------------------------------
   Two panes, not three. The old right-hand HUD was one of three
   places the same five leak figures were rendered; it is gone —
   and so are the dock pill and the bottom sheet that replaced it.
   The meter now lives only in the estimate panel on the right
   stage, until the report renders the arithmetic.
   ============================================================ */
function enterApp(place) {
  /* the gate can fire twice — Enter on the manual path, or Enter racing the
     go button. Two shells meant two runners typing into two threads. */
  if (appStarted) return
  appStarted = true
  state.place = place
  if (place.phone) state.phone = place.phone

  document.getElementById('gate')?.classList.add('out')

  setTimeout(() => {
    const app = document.getElementById('app')
    app.innerHTML = `
      <main class="stage split-layout">
        <header class="topbar">
          <a class="tb-logo" href="/"><img src="/img/logo.png" alt="RentalRevive" /></a>
          <span class="tb-target" id="tbYard"></span>
          <a class="tb-exit" href="/">Exit</a>
          <span class="tb-progress" role="progressbar" aria-label="Scan progress"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="tbProgress">
            <i></i>
          </span>
        </header>

        <div class="stage-body">
          <div class="stage-left">
            <div class="thread-wrap" id="threadWrap">
              <div class="thread" id="thread" aria-live="polite"></div>
            </div>

            <div class="dock">
              <div class="dock-inner">
                <div class="composer" id="composer"></div>
              </div>
            </div>
          </div>
          <div class="stage-right" id="stageRight"></div>
        </div>
      </main>
    `
    thread = document.getElementById('thread')
    watchFollow(document.getElementById('threadWrap'))
    composer = document.getElementById('composer')
    railEl = document.getElementById('tbProgress')
    stageRight = document.getElementById('stageRight')

    document.getElementById('tbYard').textContent = place.name


    /* deep-linked segment (landing cards): pre-select, still confirmable */
    const pre = new URLSearchParams(location.search).get('segment')
    if (pre && SEGMENTS.some((sg) => sg.id === pre) && !state.segments.length) {
      state.segments = [pre]
    }

    renderRail()
    renderMeter()
    runStep(0)
  }, reduced ? 0 : 420)
}

/* ------------------------------------------------------------
   the estimate panel — the single home for the live metrics
   ------------------------------------------------------------
   Replaces the floating dock pill + bottom sheet (2026-08-06).
   Once the numbers act starts the right stage stops being a
   gallery and becomes the instrument: a dark panel that prices
   every answer as it lands. Same discipline as the sheet it
   replaces — the metrics live in exactly ONE place until the
   report renders the arithmetic.
   ------------------------------------------------------------ */
function mountEstimatePanel() {
  if (document.getElementById('estPanel')) return
  const card = el('section', 'est-panel')
  card.id = 'estPanel'
  card.setAttribute('aria-label', 'Live leak estimate')
  card.innerHTML = `
    <div class="est-head">
      <span class="lab">Leak meter · live</span>
      <b class="est-score" id="estScore">– / 25</b>
    </div>
    <div class="est-hero">
      <b id="estMoney">–</b>
      <span id="estAnnual">Arms once we have your average job value</span>
    </div>
    <div class="est-bar"><i id="estFill"></i></div>
    <div class="ledger" id="estLedger"></div>
    <p class="est-note" id="estNote">Every figure is an estimate built from your answers and deliberately conservative recovery rates. The full arithmetic lands in your report.</p>`
  stageRight.innerHTML = ''
  stageRight.appendChild(card)
  requestAnimationFrame(() => card.classList.add('in'))
  renderMeter()
}

/* ------------------------------------------------------------
   the runner
   ------------------------------------------------------------ */
async function runStep(index) {
  /* walk over what doesn't apply AND what is already answered, so the
     runner can be re-entered part-way (a dependency was invalidated) and
     still flow forward to the first open question instead of re-asking */
  while (index < STEPS.length
    && (STEPS[index].skip?.(state) || answeredSteps.has(STEPS[index].id))) index++
  if (index >= STEPS.length) return finale()
  stepIndex = index
  const step = STEPS[index]
  const row = rowFor(step)

  renderRail()

  /* the calculation phase begins — the stage becomes the instrument.
     Re-mounts after a structural edit replays the radar over it. */
  if (step.act === 'numbers' || step.act === 'leaks') mountEstimatePanel()

  if (step.stage) {
    await step.stage(row)
    answeredSteps.add(step.id)
    renderRail()
    return runStep(index + 1)
  }

  await botSay(row, step.prompt(state))
  mountWidget(row, step)
}

function rowFor(step) {
  let row = thread.querySelector(`.row[data-step="${step.id}"]`)
  if (row) return row
  row = el('div', 'row')
  row.dataset.step = step.id
  row.innerHTML = `<div class="row-bot"></div><div class="row-answer"></div><div class="row-react"></div>`
  thread.appendChild(row)
  return row
}

/* ------------------------------------------------------------
   mountWidget — into the DOCK, never into the transcript.
   ------------------------------------------------------------
   ONE commit per mount. Every widget hands its commit to a button,
   and a button can be clicked twice — bandSelect even waits 190ms
   before it fires. A second commit re-entered the runner, which
   typed the next question into a row that already held it. That
   was the stutter.
   ------------------------------------------------------------ */
function mountWidget(row, step) {
  const hint = typeof step.hint === 'function' ? step.hint(state) : step.hint
  const editing = editingId === step.id
  /* the question the dock owes an answer to — an edit borrows the dock
     from it, and has to hand it back */
  if (!editing) awaitingStep = step

  let committed = false
  const widget = step.widget(state, async (value, label) => {
    if (committed) return
    committed = true
    state[step.id] = value
    if (step.id === 'segments') {
      /* keep primary coherent with the multi-pick */
      if (value.length === 1) state.primary = value[0]
      else if (!value.includes(state.primary)) state.primary = ''
      state.segment = state.primary
    }
    if (step.id === 'primary') state.segment = value
    answeredSteps.add(step.id)

    clearComposer()
    attachAnswer(row, step, label)
    renderMeter()
    renderRail()

    if (editing) {
      editingId = null
      if (step.structural) return truncateAfter(step.id)

      /* the old reaction was narrated against the old answer — re-run it
         rather than leaving a line that now contradicts the transcript */
      const slot = row.querySelector('.row-react')
      if (slot) slot.innerHTML = ''
      if (step.react) {
        const line = step.react(state, computeLeaks(leakState()))
        if (line) await botReact(row, line)
      }

      /* Questions that hang off this one. Changing "are you marketing?" to
         no must not leave which-medium answers standing in the transcript;
         changing it to yes has to actually ask them. Re-entering the runner
         at the earliest dependent step does both — it asks whichever now
         apply and walks forward over everything already answered. */
      const deps = step.invalidates || []
      if (deps.length) {
        deps.forEach((id) => { if (answeredSteps.has(id)) resetStep(id) })
        clearVerdict()
        return runStep(STEPS.findIndex((st) => deps.includes(st.id)))
      }

      /* verdict already on screen? re-run it with the new numbers */
      if (document.getElementById('reveal') || document.getElementById('report')) return refreshVerdict()

      /* otherwise the question this edit interrupted is still unanswered —
         put it back in the dock instead of stranding the scan */
      if (awaitingStep && awaitingStep !== step) mountWidget(rowFor(awaitingStep), awaitingStep)
      return
    }

    awaitingStep = null
    if (step.react) {
      const line = step.react(state, computeLeaks(leakState()))
      if (line) await botReact(row, line)
    }
    runStep(STEPS.indexOf(step) + 1)
  })

  swapComposer(widget, hint)
}

/* the dock crossfade — content swaps in place, the dock never moves */
function swapComposer(node, hint) {
  const paint = () => {
    composer.classList.remove('swapping')
    composer.innerHTML = ''
    if (hint) {
      const h = el('div', 'composer-hint')
      h.textContent = hint
      composer.appendChild(h)
    }
    composer.appendChild(node)
    composer.scrollTop = 0
    scrollToEnd()
    focusFirst(node)
  }
  if (!composer.childElementCount || reduced) return paint()
  composer.classList.add('swapping')
  setTimeout(paint, 180)
}

function clearComposer() {
  composer.classList.remove('swapping')
  composer.innerHTML = ''
}

function attachAnswer(row, step, label) {
  const slot = row.querySelector('.row-answer')
  slot.innerHTML = ''
  if (step.noPill) return
  const pill = el('button', 'answer-pill')
  pill.type = 'button'
  pill.innerHTML = `<span class="ap-val">${esc(label)}</span><span class="ap-edit" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>`
  pill.setAttribute('aria-label', `Change answer: ${label}`)
  pill.addEventListener('click', () => {
    editingId = step.id
    row.classList.remove('answered-row')
    mountWidget(row, step)
    scrollToEnd()
  })
  slot.appendChild(pill)
}

const ARRAY_STEPS = ['fleet', 'rivals', 'whyTheyWin', 'channels', 'marketingChannels']

/* the one place that knows how to un-answer a step — both the structural
   truncate and the dependency drop reset through it */
function resetStep(id) {
  if (ARRAY_STEPS.includes(id)) state[id] = []
  else if (id === 'closeRate') state.closeRate = null
  else if (id === 'primary') { state.primary = state.segments.length === 1 ? state.segments[0] : ''; state.segment = state.primary }
  else if (id === 'radar') { /* keep cache; stage decides */ }
  else state[id] = ''
  answeredSteps.delete(id)
  thread.querySelector(`.row[data-step="${id}"]`)?.remove()
}

function truncateAfter(stepId) {
  const idx = STEPS.findIndex((st) => st.id === stepId)
  awaitingStep = null
  for (let i = idx + 1; i < STEPS.length; i++) resetStep(STEPS[i].id)
  clearVerdict()
  state._cooked = false /* structural change: the re-cook is earned */
  renderMeter()
  const react = thread.querySelector(`.row[data-step="${stepId}"] .row-react`)
  if (react) react.innerHTML = ''
  runStep(idx + 1)
}

function clearVerdict() {
  document.getElementById('reveal')?.remove()
  document.getElementById('solution')?.remove()
  document.getElementById('report')?.remove()
  thread.querySelector('.row[data-step="finale"]')?.remove()
  thread.querySelector('.row[data-step="close"]')?.remove()
}

function refreshVerdict() {
  clearVerdict()
  finale()
}

/* ------------------------------------------------------------
   bot output — smooth by construction
   ------------------------------------------------------------
   The old typewriter grew the bubble character by character:
   every tick reflowed the thread and fought the smooth scroll —
   that was the jitter. Now the bubble lands at its FINAL size in
   one frame (every word already occupies its space at opacity 0)
   and the words fade in on a stagger. Reads like typing, costs
   zero layout shifts. Click a bubble to reveal it instantly.
   ------------------------------------------------------------ */
async function botSay(row, lines) {
  const bot = row.querySelector('.row-bot')
  /* the runner can legitimately re-enter a step — an edit mid-question, a
     replayed stage. The prompt is already on screen; saying it a second
     time into the same row is the repeat the owner sees. */
  if (bot.querySelector('.bubble')) { scrollToEnd(); return }
  const list = Array.isArray(lines) ? lines : [lines]
  /* sleek functional processing beat */
  if (!bot.childElementCount) {
    await thinkBeat(bot, 1400)
  }
  for (const line of list) {
    await typeBubble(bot, line)
    if (!reduced) await wait(600)
  }
}

async function botReact(row, line) {
  await typeBubble(row.querySelector('.row-react'), line, 'react')
}

function thinkBeat(container, ms) {
  if (reduced) return Promise.resolve()
  const think = el('div', 'sys-think')
  think.innerHTML = `<span class="sys-spin"></span><span class="st-lab">Analyzing...</span>`
  container.appendChild(think)
  scrollToEnd()
  return new Promise((res) => setTimeout(() => { think.remove(); res() }, ms))
}

async function agentThinkLog(row, thoughtText, title = "Agent Reasoning") {
  // The user requested that the chat look "sleek" and these logs don't stick around.
  // We will just do a console log and a short wait for dramatic effect, but not pollute the chat DOM.
  console.log(`[${title}]: ${thoughtText}`);
  await thinkBeat(row.querySelector('.row-bot'), reduced ? 0 : 800);
}

function typeBubble(container, text, extra = '') {
  const bubble = el('div', `bubble ${extra}`.trim())
  if (reduced) {
    bubble.innerHTML = text.replace(/\[\[(.*?)\]\]/g, '<span class="hl">$1</span>')
    container.appendChild(bubble)
    scrollToEnd()
    return Promise.resolve()
  }

  // Safely split words but recombine any tokens wrapped in [[ ]] even if they have spaces
  const rawWords = String(text).split(' ')
  const words = []
  let inBracket = false
  let currentBracket = ''
  for (const w of rawWords) {
    if (!inBracket && w.includes('[[')) {
      if (w.includes(']]')) {
         words.push(w)
      } else {
         inBracket = true
         currentBracket = w
      }
    } else if (inBracket) {
      currentBracket += ' ' + w
      if (w.includes(']]')) {
         inBracket = false
         words.push(currentBracket)
      }
    } else {
      words.push(w)
    }
  }
  /* an unclosed [[ would otherwise swallow the tail of the line */
  if (inBracket) words.push(currentBracket)

  const step = Math.max(45, Math.min(110, Math.round(1800 / words.length)))
  bubble.innerHTML = words
    .map((w, i) => {
      const match = w.match(/^\[\[(.*?)\]\](.*)$/);
      if (match) {
        const tail = match[2]
          ? `<span class="w" style="animation-delay:${i * step}ms">${esc(match[2])}</span>`
          : ''
        return `<span class="w hl" style="animation-delay:${i * step}ms">${esc(match[1])}</span>${tail}`
      }
      return `<span class="w" style="animation-delay:${i * step}ms">${esc(w)}</span>`
    })
    .join(' ')
  container.appendChild(bubble)
  scrollToEnd()

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      bubble.classList.add('done')
      resolve()
    }
    bubble.addEventListener('click', finish, { once: true })
    setTimeout(finish, words.length * step + 220)
  })
}

/* ============================================================
   STAGES — the agentic beats, rendered as artifacts
   ============================================================ */
function artifact(label, live, icon) {
  const card = el('div', 'artifact')
  card.innerHTML = `<div class="art-head">
    ${icon ? `<img class="art-ic" src="${icon}" alt="" />` : ''}
    <span class="lab${live ? ' live' : ''}">${esc(label)}</span>
  </div>`
  return card
}

/* --- lock-on: map pin + Google footprint card --- */
async function lockonStage(row) {
  const p = state.place
  const art = stageRight

  await botSay(row, p.manual
    ? `${p.name}${p.city ? `, ${p.city}` : ''}. Noted. No listing needed, the scan works the same.`
    : `Found you. Let me pull up what your customers see…`)

  const card = artifact('Google footprint', false, '/google-business.png')
  card.insertAdjacentHTML('beforeend', `
    ${!p.manual && mapsUp() ? '<div class="lo-map" id="loMap"></div>' : ''}
    <div class="lo-card">
      <b class="lo-name">${esc(p.name)}</b>
      ${p.reviews
        ? `<span class="lo-stars">${starRow(p.rating)} <em>${p.rating}</em> · ${p.reviews} Google reviews</span>`
        : '<span class="lo-stars muted">No Google reviews on file</span>'}
      <small class="lo-meta">${strokeIcon(ICON.pin)} ${esc(p.address || [p.city, p.state].filter(Boolean).join(', '))}</small>
      ${p.phone ? `<small class="lo-meta">${strokeIcon(ICON.phoneSm)} ${esc(p.phone)}</small>` : ''}
      ${p.website ? `<small class="lo-meta">${strokeIcon(ICON.globe)} ${esc(domain(p.website))}</small>` : ''}
    </div>`)
  art.innerHTML = ''
  art.appendChild(card)
  scrollToEnd()

  if (!p.manual && mapsUp()) {
    const map = new google.maps.Map(document.getElementById('loMap'), {
      center: { lat: p.lat, lng: p.lng }, zoom: 12,
      disableDefaultUI: true, styles: MAP_STYLE, backgroundColor: MAP_BACKDROP,
    })
    new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng }, map,
      animation: reduced ? null : google.maps.Animation.DROP,
      icon: markerDot('#FF3B41', 10),
      title: p.name,
    })
  }

  await wait(reduced ? 0 : 700)
  if (!p.manual) {
    const line = p.reviews
      ? `${p.rating}★ across ${p.reviews} reviews. Your customers already trust the yard. This scan is about the ones who never got through.`
      : `Listing's a bit bare, but that's a different conversation. This scan is about the calls and quotes you never see.`
    await botReact(row, line)
  }
}

/* --- reviews: read the digital reputation --- */
function tagReviewIssues(text) {
  const t = text.toLowerCase()
  const issues = []
  if (/\b(broken|dirty|old|maintained|clean|repair|condition|down|failed|junk)\b/.test(t)) issues.push({ label: 'Equipment Quality', type: 'equipment' })
  if (/\b(out of stock|didn't have|available|inventory|shortage|missing)\b/.test(t)) issues.push({ label: 'Availability', type: 'availability' })
  if (/\b(late|slow|fast|on time|delay|wait|quick)\b/.test(t)) issues.push({ label: 'Speed & Delivery', type: 'speed' })
  if (/\b(expensive|cheap|fair|price|overcharged|fee|cost|billing|value)\b/.test(t)) issues.push({ label: 'Pricing', type: 'pricing' })
  if (/\b(rude|friendly|helpful|unprofessional|attitude|staff|customer service)\b/.test(t)) issues.push({ label: 'Service', type: 'service' })
  return issues
}

async function reviewsStage(row) {
  const p = state.place
  const art = stageRight
  let reviews = p.reviewsList || []
  let avg = p.rating || 0

  const card = artifact('What customers wrote', true)
  const dashWrap = el('div')
  const box = el('div', 'reviews-feed')
  card.appendChild(dashWrap)
  card.appendChild(box)
  art.innerHTML = ''
  art.appendChild(card)
  scrollToEnd()
  
  await agentThinkLog(row, "Initiating deep Google-Maps-reviews scrape via Apify...\nBypassing Places API 5-review cap.")

  const deep = await fetchReviews(p.placeId, p.website)
  if (deep.ok) {
    avg = deep.average
    reviews = deep.reviews.slice(0, 8) // show top 8 in feed
    dashWrap.innerHTML = `
      <div class="review-dash">
        <div class="rd-metrics">
          <div class="rd-stat">
            <span class="rd-val">${deep.total}</span>
            <span class="rd-lab">Scanned</span>
          </div>
          <div class="rd-stat">
            <span class="rd-val">${avg}</span>
            <span class="rd-lab">Rating</span>
          </div>
          <div class="rd-stat">
            <span class="rd-val">${deep.posPct}%</span>
            <span class="rd-lab">Positive</span>
          </div>
        </div>
        <div class="rd-stat">
          <span class="rd-lab">Sentiment Density</span>
          <div class="rd-bar-wrap">
            <div class="rd-bar" style="width: ${deep.posPct}%"></div>
          </div>
        </div>
      </div>
    `
    await agentThinkLog(row, `Deep scan complete.\nTotal: ${deep.total}\nPositive: ${deep.posPct}%\nAverage: ${avg}`)
  } else {
    await agentThinkLog(row, `Deep scan failed (${deep.error}).\nFalling back to top ${reviews.length} local reviews.`)
  }

  const CRIT = ['broken', 'dirty', 'old', 'late', 'slow', 'expensive', 'overcharged', 'rude', 'unprofessional', 'delay', 'failed', 'junk']
  const POS = ['clean', 'maintained', 'fast', 'on time', 'fair', 'helpful', 'friendly', 'quick', 'value']

  for (let i = 0; i < reviews.length; i++) {
    const rev = reviews[i]
    await wait(reduced ? 0 : 380)
    const item = el('div', 'rev-card')
    const issues = tagReviewIssues(rev.text || '')

    let body = esc(rev.text || '')
    CRIT.forEach((kw) => {
      body = body.replace(new RegExp(`\\b(${kw})\\b`, 'gi'), '<span class="kw-crit">$1</span>')
    })
    POS.forEach((kw) => {
      body = body.replace(new RegExp(`\\b(${kw})\\b`, 'gi'), '<span class="kw-pos">$1</span>')
    })

    item.innerHTML = `
      <div class="rc-head">
        <span class="rc-author">${esc(rev.author_name)}</span>
        <span class="rc-time">${esc(rev.relative_time_description)}</span>
      </div>
      <div class="rc-stars">${starRow(rev.rating)}</div>
      <p class="rc-body">${body}</p>
      ${issues.length ? `<div class="rc-tags">${issues.map((iss) => `<span class="rc-tag ${iss.type}">${iss.label}</span>`).join('')}</div>` : ''}`
    box.appendChild(item)
    requestAnimationFrame(() => item.classList.add('in'))
    scrollToEnd()
  }

  card.querySelector('.lab')?.classList.remove('live')
  await wait(reduced ? 0 : 700)
  await botReact(row, avg >= 4.5
    ? 'Strong word of mouth. Your iron and service are solid, so whatever you are losing, it is not on reputation.'
    : avg >= 4.0
      ? 'Solid reputation, but with a few dents. The market respects you, but there is room to tighten up.'
      : 'Your digital reputation is taking hits. That costs you quotes before the phone even rings.')
}

/* ============================================================
   DIGITAL FOOTPRINT — the card the owner stares at longest
   ------------------------------------------------------------
   Three panels, in the order an owner reads them:

     1. the Google Business Profile scorecard
     2. proof — the actual homepage a customer lands on, in a
        browser frame, or a plain statement of where the listing
        sends people when there is no website to photograph
     3. what, if anything, is measuring those visitors

   The proof panel used to hang a raw <img> in the card. Both
   screenshot services answer a cold URL with a placeholder tile
   while they render the page in the background, so the owner was
   shown a black square with somebody else's logo on it and told
   that was their website. It now holds a skeleton until a real
   capture lands, and says so plainly when none does — the same
   honesty rule the detection code runs on (../../common/footprint.js).
   ============================================================ */

/* Poll, then give up — never show the queue placeholder.
   The keyed screenshot service moved behind a Convex action (AD-13);
   this asks the server first and falls back to keyless mshots. The
   poll itself lives in onboard/capture.js, where it is tested. */
function mountCapture(shot, site, chip) {
  /* server capture: the Thum.io key lives in a Convex env var now.
     Returns null when unconfigured — the mshots path takes over.
     A throw here is caught by captureHomepage, same outcome. */
  const serverCapture = async () => {
    const { probeConfigured, getConvex, api } = await import('./dashboard/backend.js')
    if (!probeConfigured()) return null
    const convex = await getConvex()
    /* the place, for the server-side cache key — CO2. Read off the
       module state, which is why the chip setter below must not be
       called `state`: a local of that name shadows this lookup and
       silently strips placeId, defeating the cache. */
    const p = state.place || {}
    const res = await convex.action(api.enrichment.screenshot.capture, {
      url: site.url,
      placeId: p.placeId || undefined,
      name: p.name || undefined,
    })
    return res?.url || null
  }

  const img = el('img')
  img.alt = `Homepage of ${site.host}`
  img.referrerPolicy = 'no-referrer'
  img.decoding = 'async'
  shot.appendChild(img)

  /* the loaded width, or 0 — captureHomepage reads geometry to tell a
     real photograph from mshots' still-rendering placeholder tile */
  const measure = (src) => new Promise((resolve) => {
    const probe = new Image()
    probe.referrerPolicy = 'no-referrer'
    probe.onload = () => resolve(probe.naturalWidth)
    probe.onerror = () => resolve(0)
    probe.src = src
  })

  /* the chip is the card's one-word summary — it must not keep
     promising a live capture after the capture has failed */
  const setChip = (ok) => {
    if (!chip) return
    chip.textContent = ok ? 'Live capture' : 'No capture'
    chip.classList.toggle('ok', ok)
    chip.classList.toggle('gap', !ok)
  }

  let round = 0
  let running = false

  const run = async () => {
    if (running) return
    running = true
    round += 1
    shot.classList.remove('failed')
    if (round > 1) shot.classList.remove('ready')

    const res = await captureHomepage({ url: site.url, serverCapture, measure, wait })
    if (res.ok) {
      img.src = res.src
      shot.classList.add('ready')
      setChip(true)
    } else {
      shot.classList.add('failed')
      setChip(false)
    }
    running = false
  }

  run()
  return run
}

/* What a customer lands on — a capture when there is a site to shoot,
   and the verdict itself when the listing points somewhere else. */
function proofPanel(site) {
  const wrap = el('div', 'fp-panel fp-proof')
  const verdict = websiteVerdict(site)

  /* No section label in here — the card head names this panel now, and
     printing it twice was exactly the noise this split was meant to
     remove. The status chip is built here (mountCapture owns it) but
     returned for the caller to hang in the card head, where a status
     about the card's content belongs. */
  const chip = el('span', `fp-chip ${site.auditable ? 'ok' : 'gap'}`)
  chip.textContent = site.auditable
    ? 'Live capture' : site.kind === 'none' ? 'No website' : site.platform

  wrap.innerHTML = `
    <figure class="proof">
      <figcaption class="pr-bar">
        <span class="pr-dots"><i></i><i></i><i></i></span>
        <span class="pr-url">${site.host ? esc(site.host) : 'nothing in the website field'}</span>
        ${site.auditable ? `<button class="pr-redo" type="button" aria-label="Recapture homepage">${ICON.redo}</button>` : ''}
      </figcaption>
      <div class="pr-shot">
        ${site.auditable ? `
          <div class="pr-skel" aria-hidden="true">
            <span class="sk-hero"></span>
            <span class="sk-line"></span>
            <span class="sk-line short"></span>
            <span class="sk-tiles"><i></i><i></i><i></i></span>
          </div>
          <span class="pr-status">Photographing ${esc(site.host)}…</span>
          <div class="pr-fallback">
            <span class="pr-glyph">${ICON.frame}</span>
            <b>No capture this scan</b>
            <small>${esc(site.host)} did not answer the screenshotter, so there is nothing here to show you. Nothing is being claimed about the page either way.</small>
          </div>
        ` : `
          <div class="pr-state">
            <span class="pr-glyph">${site.kind === 'none' ? ICON.globe : ICON.link}</span>
            <b>${esc(verdict.headline)}</b>
            <small>${esc(verdict.body)}</small>
          </div>
        `}
      </div>
    </figure>`

  if (site.auditable) {
    const again = mountCapture(wrap.querySelector('.pr-shot'), site, chip)
    wrap.querySelector('.pr-redo')?.addEventListener('click', again)
  }
  /* moving the chip into the card head later keeps this same node, so
     mountCapture's reference to it stays live */
  return { wrap, chip }
}

/* --- digital footprint: profile, website, tracking --- */
async function auditStage(row) {
  const p = state.place
  const art = stageRight

  const site = classifyWebsite(p.website)
  const profile = scoreProfile(p)
  state.footprint = { site, profile, audit: null }

  /* Two cards, not one. The profile is a scorecard and the site is a
     photograph — two different kinds of evidence, and stacking them
     inside a single card buried the preview below the fold with no
     way to reach it. Each card carries its own .fp containment
     context so the panels inside re-flow to the CARD, not the
     viewport; the stage pane is half a screen wide. */
  const mkBody = (card) => { const b = el('div', 'fp'); card.appendChild(b); return b }

  /* --- 1. the Google Business Profile scorecard --- */
  const profileCard = artifact('Google Business Profile', false, '/google-business.png')
  const profileBody = mkBody(profileCard)
  const tone = profile.pct === null ? 'unknown'
    : profile.pct >= 85 ? 'good' : profile.pct >= 60 ? 'warn' : 'bad'
  const sheet = el('div', 'fp-panel fp-profile')
  sheet.innerHTML = `
    <div class="fp-head">
      <span class="fp-score ${tone}">
        <b>${profile.pct === null ? '–' : profile.pct}<i>%</i></b>
        <em>${profile.passed} of ${profile.measured} complete</em>
      </span>
    </div>
    <div class="fp-meter ${tone}"><i style="transform:scaleX(${(profile.pct === null ? 0 : profile.pct) / 100})"></i></div>
    <div class="fp-checks">
      ${profile.checks.map((c) => `
        <div class="fp-check ${c.ok === null ? 'unknown' : c.ok ? 'ok' : 'gap'}">
          <span class="fp-mark">${c.ok === null ? ICON.minus : c.ok ? ICON.check : ICON.cross}</span>
          <span class="fp-txt">
            <b>${esc(c.label)}</b>
            <small>${c.ok === null ? 'Not measured' : esc(c.value || 'Missing')}</small>
          </span>
        </div>`).join('')}
    </div>`
  profileBody.appendChild(sheet)

  /* --- 2. the website: what it looks like, and what is measuring it.
     Its own card, so the capture is never the thing that gets cut. --- */
  const siteCard = artifact(
    site.auditable ? 'What your customers land on' : 'Where your listing sends people', true)
  const siteBody = mkBody(siteCard)
  const proof = proofPanel(site)
  siteBody.appendChild(proof.wrap)
  siteCard.querySelector('.art-head').appendChild(proof.chip)

  /* --- 3. tracking, filled in once the crawl answers --- */
  const tagSlot = el('div')
  siteBody.appendChild(tagSlot)

  /* --- the crawl log, quiet and last --- */
  const log = el('div', 'fp-log')
  log.innerHTML = '<span class="fp-log-lab">Site crawl</span>'
  const box = el('div', 'fp-log-lines')
  log.appendChild(box)
  siteBody.appendChild(log)

  art.innerHTML = ''
  art.appendChild(profileCard)
  art.appendChild(siteCard)
  scrollToEnd()

  const feed = (line) => {
    const node = el('div', 'fp-log-line')
    node.textContent = line
    box.appendChild(node)
    requestAnimationFrame(() => node.classList.add('in'))
    scrollToEnd()
  }

  /* --- the crawl, only if the website field points at a website --- */
  let result = null
  if (site.auditable) {
    result = await auditWebsite(site.url, feed, { placeId: p.placeId, name: p.name })
    state.footprint.audit = result
  } else {
    feed(site.kind === 'none'
      ? '[No website on the Google profile, nothing to crawl]'
      : `[Google profile points at ${site.platform}, no site to crawl]`)
  }

  /* --- tracking rows --- */
  const tracking = trackingVerdict(result?.trackers)
  if (result?.trackers) {
    const t = Object.values(result.trackers.trackers)
    const live = t.filter((tr) => tr.detected).length
    const rows = el('div', 'fp-tags')
    rows.innerHTML = `
      <div class="fp-head">
        <span class="fp-lab">Marketing tags</span>
        <span class="fp-chip ${
          !result.trackers.measured ? '' : live ? 'ok' : 'gap'
        }">${
          !result.trackers.measured ? 'Not measured' : `${live} of ${t.length} live`
        }</span>
      </div>
      <div class="fp-taglist">
        ${t.map((tr) => `
          <div class="fp-tag ${tr.detected === null ? 'unknown' : tr.detected ? 'on' : 'off'}">
            <span class="ft-lab">${esc(tr.label)}</span>
            <span class="ft-val">${
              tr.detected === null ? 'Not measured' : tr.detected ? 'Detected' : 'Missing'
            }</span>
          </div>`).join('')}
      </div>`
    tagSlot.appendChild(rows)
  }

  siteCard.querySelector('.lab')?.classList.remove('live')
  await wait(reduced ? 0 : 600)

  /* --- what it means, said once each --- */
  if (site.kind !== 'site') {
    const v = websiteVerdict(site)
    await botReact(row, `${v.headline}. ${v.body}`)
  }

  if (profile.gaps.length >= 3) {
    await botReact(row, `Your Google profile is ${profile.pct}% filled in: ${profile.gaps.slice(0, 3).join(', ').toLowerCase()} ${profile.gaps.length > 3 ? 'and more are' : 'are'} missing. That is the page most of your customers see before they ever reach you.`)
  }

  if (result?.measured) {
    if (result.foundBooking) {
      await botReact(row, 'You already have some kind of online booking path. This scan is about the quotes that never make it that far.')
    } else if (result.foundChat) {
      await botReact(row, 'You have live chat, which is a start. Without a direct quote path you are still playing phone tag.')
    } else if (result.foundContact) {
      await botReact(row, 'There is a contact form on the site, but no live chat and no direct booking. Every inquiry through that form is somebody waiting on an email.')
    }
  } else if (site.auditable) {
    await botReact(row, 'I could not read your site this scan, so I am not going to tell you what is on it. The phone and the quote path are where the money is anyway.')
  }

  if (tracking.tone === 'bad' || tracking.tone === 'warn') {
    await botReact(row, `${tracking.headline}. ${tracking.body}`)
  }
}

/* --- radar: iterative sweep, live pins, real names --- */
async function radarStage(row) {
  const p = state.place
  const tag = state.segments.join(',') + '|' + p.placeId
  const art = stageRight
  if (!mapsUp() || !Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) {
    await agentThinkLog(row, "Geocoding failed or MAP_STYLE undefined.\nFallback to manual competitor entry.")
    await botSay(row, `I do not have a live map lock for ${p.name}, so we will name competitors manually instead.`)
    state.radar = { competitors: [], radiusMi: 0, ranTag: tag }
    return
  }

  /* re-entry after a structural edit with same inputs: replay from cache */
  const cached = state.radar.ranTag === tag && state.radar.ranTag !== ''

  await botSay(row, cached
    ? 'Same yard, same lines. Your radius scan still stands.'
    : `Hold on. Sweeping the radius around ${p.city || 'your yard'} for everyone renting against you…`)

  const card = artifact('Competitor radar', true)
  const box = el('div', 'radar')
  box.innerHTML = `
    <div class="rad-map-wrap">
      <div class="rad-map" id="radMap"></div>
      <span class="rad-sweep"></span>
      <span class="rad-ring"></span><span class="rad-ring r2"></span>
      <span class="rad-scope" id="radScope">SWEEP · – MI</span>
    </div>
    <div class="rad-stats">
      <span><b id="radN">0</b><i>yards found</i></span>
      <span><b id="radNat">0</b><i>national</i></span>
      <span><b id="radR">–</b><i>mile radius</i></span>
    </div>
    <div class="rad-list" id="radList"></div>`
  card.appendChild(box)
  art.innerHTML = ''
  art.appendChild(card)
  scrollToEnd()

  const map = new google.maps.Map(document.getElementById('radMap'), {
    center: { lat: p.lat, lng: p.lng }, zoom: 9,
    /* the final frame locks to the nearest cluster — cap the zoom so
       a lone next-door competitor cannot land us on a rooftop */
    maxZoom: 15,
    disableDefaultUI: true, styles: MAP_STYLE, backgroundColor: MAP_BACKDROP,
  })
  const selfMarker = new google.maps.Marker({
    position: { lat: p.lat, lng: p.lng }, map,
    icon: markerDot('#FF3B41', 10), title: p.name, zIndex: 99,
  })
  pinLabel(map, selfMarker, `<b>${esc(p.name)}</b><small>Your yard</small>`, 'self')

  let result
  if (cached) {
    result = { competitors: state.radar.competitors, radiusMi: state.radar.radiusMi }
    setScope(result.radiusMi)
  } else {
    result = await radarScan({
      map, self: p, segments: state.segments,
      onTier: (mi) => {
        setScope(mi)
        const rr = document.getElementById('radR')
        if (rr) rr.textContent = mi
      },
    })
    state.radar = { ...result, ranTag: tag }
  }

  const { competitors, radiusMi } = result
  document.getElementById('radR').textContent = radiusMi || '–'
  /* the sweep stays live while the pins land — killing it here made
     the most theatrical moment of the scan play out on a dead dish.
     The done state (sweep fade + LOCKED scope) waits for the loop. */

  /* pins + list, staggered */
  const listEl = document.getElementById('radList')
  const bounds = new google.maps.LatLngBounds()
  bounds.extend({ lat: p.lat, lng: p.lng })
  let shownN = 0, shownNat = 0

  for (let i = 0; i < competitors.length; i++) {
    const c = competitors[i]
    await wait(reduced ? 0 : Math.max(40, 170 - i * 10))
    const marker = new google.maps.Marker({
      position: { lat: c.lat, lng: c.lng }, map,
      animation: reduced ? null : google.maps.Animation.DROP,
      icon: markerDot(c.national ? '#FF8A8E' : '#46C46E', 7),
      title: c.name,
    })
    /* Labels and the final frame cover the yard + its FOUR nearest
       rivals (the list is distance-sorted). Six labels crowded the
       centre and fitting all 18 pins zoomed out to the whole metro —
       the locked frame should read at street level, where the fight
       actually is: with the nearest rivals at 1–2 miles this lands
       around zoom 13, streets visible, labels separated. Farther
       pins sit off-frame; the ledger below carries all of them. */
    if (i < 4) {
      pinLabel(map, marker,
        `<b>${esc(c.name)}</b><small>${c.national ? 'National branch' : 'Independent'} · ${c.distance.toFixed(1)} mi</small>`,
        c.national ? 'nat' : 'ind')
      bounds.extend({ lat: c.lat, lng: c.lng })
    }
    /* EVERY competitor gets a list row — the stat says "18 yards
       found" and the ledger below it must show all 18, not the top 8.
       The list scrolls past ~7 rows (CSS max-height); labels on the
       map itself stay capped at 6 so the pins remain readable. */
    const item = el('div', 'rad-item')
    item.innerHTML = `
      <div class="ri-main">
        <b class="ri-name">${esc(c.name)}</b>
        <div class="ri-metrics">
          ${c.rating ? `<span class="ri-stars">${starRow(c.rating)} <em>${c.rating}</em></span>` : '<span class="ri-unrated">Unrated</span>'}
          <span class="ri-dist">${c.distance.toFixed(1)} MI</span>
        </div>
      </div>
      <i class="ri-tag ${c.national ? 'nat' : 'ind'}">${c.national ? 'National' : 'Independent'}</i>`
    listEl.appendChild(item)
    requestAnimationFrame(() => item.classList.add('in'))
    /* keep the newest row in view while the sweep is landing them */
    if (i > 5) listEl.scrollTop = listEl.scrollHeight
    shownN++
    if (c.national) shownNat++
    tick('radN', shownN)
    if (c.national) tick('radNat', shownNat)
  }
  listEl.scrollTop = 0
  if (competitors.length) map.fitBounds(bounds, 56)
  box.classList.add('done')
  card.querySelector('.lab')?.classList.remove('live')
  setScope(radiusMi || 0, true)
  scrollToEnd()

  await wait(reduced ? 0 : 500)
  const best = state.radar.competitors.slice(0, 3).map(c => c.name).join(', ')
  await agentThinkLog(row, `Scan complete.\nRadius: ${state.radar.radiusMi} mi\nCompetitors found: ${state.radar.competitors.length}\nTop tier: ${best}`)
  const nats = competitors.filter((c) => c.national).length
  await botReact(row,
    competitors.length === 0
      ? `Quiet radius: no direct competitors surfaced inside ${radiusMi} miles. Every leak you have is pure loss, because there was nobody else to lose to.`
      : `${competitors.length} yards renting against you inside ${radiusMi} miles${nats ? `, and ${nats} ${nats === 1 ? 'is a national branch' : 'are national branches'}. The nationals answer at midnight. That's who picks up when you don't.` : '. All independents. This market is still winnable on hustle.'}`
  )
}

function setScope(mi, locked = false) {
  const scope = document.getElementById('radScope')
  if (scope) scope.textContent = locked ? `LOCKED · ${mi} MI` : `SWEEP · ${mi} MI`
}

/* pop a stat counter as it changes — the count-up is the radar's
   heartbeat, so each landing should be felt, not just written.
   WAAPI, not a CSS-class restart: eighteen landings arrive 40–170ms
   apart, and cancel-then-animate composes cleanly where the
   remove/reflow/re-add trick visibly stuttered. (The element is
   inline-block in CSS for the same reason — transform is a spec
   no-op on plain inline elements.) */
function tick(id, n) {
  const b = document.getElementById(id)
  if (!b) return
  b.textContent = n
  if (reduced || !b.animate) return
  b.getAnimations().forEach((a) => a.cancel())
  b.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.16)', color: '#E4262C', offset: 0.35 },
      { transform: 'scale(1)' },
    ],
    { duration: 320, easing: 'cubic-bezier(.22,.9,.35,1)' },
  )
}

function pinLabel(map, marker, content, tone = '') {
  if (!google.maps.InfoWindow) return null
  const info = new google.maps.InfoWindow({
    content: `<div class="rad-pin-label ${tone}">${content}</div>`,
    disableAutoPan: true,
  })
  info.open(map, marker)
  marker.addListener?.('click', () => info.open(map, marker))
  return info
}

/* ============================================================
   widgets
   ============================================================ */
function segmentGrid(s, commit) {
  const wrap = el('div', 'seg-wrap')
  const grid = el('div', 'seg-grid')
  const picked = new Set(s.segments)

  const done = el('button', 'btn-commit')
  done.type = 'button'

  const sync = () => {
    done.disabled = picked.size === 0
    done.textContent = picked.size === 0 ? 'Tap what you rent'
      : picked.size === 1 ? `Continue · ${segmentById([...picked][0]).short} →`
      : `Continue with ${picked.size} lines →`
  }

  SEGMENTS.forEach((seg, i) => {
    const card = el('button', 'seg-card')
    card.type = 'button'
    if (picked.has(seg.id)) card.classList.add('selected')
    card.innerHTML = `
      <span class="seg-ic">${seg.icon}</span>
      <span class="seg-name">${seg.name}</span>
      <span class="seg-blurb">${seg.blurb}</span>
      <span class="seg-check">${ICON.check}</span>
      <span class="seg-key">${i + 1}</span>`
    card.addEventListener('click', () => {
      picked.has(seg.id) ? picked.delete(seg.id) : picked.add(seg.id)
      card.classList.toggle('selected')
      sync()
    })
    grid.appendChild(card)
  })

  done.addEventListener('click', () => {
    const vals = SEGMENTS.filter((sg) => picked.has(sg.id)).map((sg) => sg.id)
    const label = vals.length > 2
      ? `${segmentById(vals[0]).short}, ${segmentById(vals[1]).short} +${vals.length - 2} more`
      : vals.map((id) => segmentById(id).short).join(' + ')
    commit(vals, label)
  })

  sync()
  wrap.appendChild(grid)
  wrap.appendChild(done)
  numberKeys(wrap, SEGMENTS.length, (i) => grid.children[i].click())
  return wrap
}

function bandSelect({ options, selected, commit }) {
  const wrap = el('div', 'band-group')
  options.forEach((opt, i) => {
    const b = el('button', 'band')
    b.type = 'button'
    if (selected === opt) b.classList.add('selected')
    b.innerHTML = `<span class="band-key">${i + 1}</span>${esc(opt)}`
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.band').forEach((x) => x.classList.remove('selected'))
      b.classList.add('selected')
      setTimeout(() => commit(opt, opt), reduced ? 0 : 190)
    })
    wrap.appendChild(b)
  })
  numberKeys(wrap, options.length, (i) => wrap.children[i].click())
  return wrap
}

function multiChips({ options, selected, doneLabel, countNoun, commit, cols }) {
  const wrap = el('div', 'chips-wrap')
  const group = el('div', 'chip-group' + (cols === 2 ? ' two-col' : ''))
  const picked = new Set(selected || [])

  const done = el('button', 'btn-commit')
  done.type = 'button'

  const sync = () => {
    done.disabled = picked.size === 0
    done.textContent = picked.size === 0
      ? 'Tap all that apply'
      : `${doneLabel || 'Done'} · ${picked.size} ${countNoun || 'picked'} →`
  }

  options.forEach((opt, i) => {
    const chip = el('button', 'chip')
    chip.type = 'button'
    if (picked.has(opt)) chip.classList.add('selected')
    chip.innerHTML = `<span class="chip-check">${ICON.check}</span><span class="chip-key">${i + 1}</span>${esc(opt)}`
    chip.addEventListener('click', () => {
      picked.has(opt) ? picked.delete(opt) : picked.add(opt)
      chip.classList.toggle('selected')
      sync()
    })
    group.appendChild(chip)
  })

  done.addEventListener('click', () => commit([...picked]))
  sync()
  wrap.appendChild(group)
  wrap.appendChild(done)
  numberKeys(wrap, options.length, (i) => group.children[i].click())
  return wrap
}

/* rivals: chips built from the radar's real names */
function rivalsWidget(s, commit) {
  const names = s.radar.competitors.slice(0, 8).map((c) => c.name)
  const wrap = el('div', 'chips-wrap')
  const group = el('div', 'chip-group')
  const picked = new Set(s.rivals)

  const done = el('button', 'btn-commit')
  done.type = 'button'
  const none = el('button', 'btn-ghostly')
  none.type = 'button'
  none.textContent = 'None of these, we mostly lose to no-shows'

  const sync = () => {
    done.disabled = picked.size === 0
    done.textContent = picked.size === 0 ? 'Tap the ones that hurt' : `These ${picked.size} →`
  }

  names.forEach((name) => {
    const chip = el('button', 'chip rival')
    chip.type = 'button'
    if (picked.has(name)) chip.classList.add('selected')
    chip.innerHTML = `<span class="chip-check">${ICON.check}</span>${esc(name)}${isNationalChain(name) ? ' <i class="chip-nat">NAT</i>' : ''}`
    chip.addEventListener('click', () => {
      picked.has(name) ? picked.delete(name) : picked.add(name)
      chip.classList.toggle('selected')
      sync()
    })
    group.appendChild(chip)
  })

  done.addEventListener('click', () => commit([...picked], [...picked].slice(0, 2).join(', ') + (picked.size > 2 ? ` +${picked.size - 2}` : '')))
  none.addEventListener('click', () => commit([], 'Nobody specific'))

  sync()
  wrap.appendChild(group)
  wrap.appendChild(done)
  wrap.appendChild(none)
  return wrap
}

function phoneWidget(s, commit) {
  const wrap = el('div', 'phone-wrap')
  if (s.place?.phone && !s.place?.manual) {
    const group = el('div', 'band-group')
    const yes = el('button', 'band')
    yes.type = 'button'
    yes.innerHTML = `<span class="band-key">1</span>Yes, that’s the counter line`
    const no = el('button', 'band')
    no.type = 'button'
    no.innerHTML = `<span class="band-key">2</span>It’s a different number`
    yes.addEventListener('click', () => commit(s.place.phone, s.place.phone))
    no.addEventListener('click', () => {
      wrap.innerHTML = ''
      wrap.appendChild(telForm(commit))
      focusFirst(wrap)
    })
    group.appendChild(yes); group.appendChild(no)
    wrap.appendChild(group)
    numberKeys(wrap, 2, (i) => (i === 0 ? yes : no).click())
  } else {
    wrap.appendChild(telForm(commit))
  }
  return wrap
}

function telForm(commit) {
  const form = el('form', 'text-wrap')
  form.noValidate = true
  const input = el('input', 'text-input')
  input.type = 'tel'
  input.placeholder = '(555) 123-4567'
  input.autocomplete = 'tel'
  input.maxLength = 20
  const go = el('button', 'btn-commit')
  go.type = 'submit'
  go.textContent = 'That’s the line'
  go.style.alignSelf = 'auto'
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const v = input.value.trim()
    if (v.replace(/\D/g, '').length >= 7) commit(v, v)
    else input.focus()
  })
  form.appendChild(input)
  form.appendChild(go)
  return form
}

function textWidget({ placeholder, value, commit, allowEmpty, emptyLabel, validate }) {
  const wrap = el('div', 'chips-wrap')
  const form = el('form', 'text-wrap')
  form.noValidate = true
  const input = el('input', 'text-input')
  input.type = 'text'
  input.placeholder = placeholder
  input.value = value || ''
  input.maxLength = 160
  const go = el('button', 'btn-commit')
  go.type = 'submit'
  go.textContent = 'Continue'
  go.style.alignSelf = 'auto'
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const v = input.value.trim()
    /* a caller-supplied validate gates non-empty commits — the empty
       path stays the emptyLabel button's job */
    if (v && validate && !validate(v)) {
      input.classList.add('bad')
      input.focus()
      return
    }
    if (v || allowEmpty) commit(v)
  })
  input.addEventListener('input', () => input.classList.remove('bad'))
  form.appendChild(input)
  form.appendChild(go)
  wrap.appendChild(form)
  if (allowEmpty && emptyLabel) {
    const skip = el('button', 'btn-ghostly')
    skip.type = 'button'
    skip.textContent = emptyLabel
    skip.addEventListener('click', () => commit(''))
    wrap.appendChild(skip)
  }
  return wrap
}

/* Band buttons plus an "exact number" escape hatch — the phoneWidget
   pattern. Ranges are the fast path (nobody counts their missed
   calls); the custom entry is for the owner who actually knows.
   Options carry {label, value}: the pill shows the label, the engine
   gets the NUMBER, so no new strings enter the AD-11 vocabulary. */
function bandsWithCustom({ options, selected, commit, customLabel, customPlaceholder, customMax, suffix, formatCustom }) {
  const wrap = el('div', 'phone-wrap')
  const group = el('div', 'band-group')
  options.forEach((opt, i) => {
    const b = el('button', 'band')
    b.type = 'button'
    if (selected === opt.value) b.classList.add('selected')
    b.innerHTML = `<span class="band-key">${i + 1}</span>${esc(opt.label)}`
    b.addEventListener('click', () => {
      group.querySelectorAll('.band').forEach((x) => x.classList.remove('selected'))
      b.classList.add('selected')
      setTimeout(() => commit(opt.value, opt.label), reduced ? 0 : 190)
    })
    group.appendChild(b)
  })
  const custom = el('button', 'band')
  custom.type = 'button'
  custom.innerHTML = `<span class="band-key">${options.length + 1}</span>${esc(customLabel)}`
  custom.addEventListener('click', () => {
    const form = el('form', 'text-wrap')
    form.noValidate = true
    const input = el('input', 'text-input')
    input.type = 'number'
    input.inputMode = 'numeric'
    input.min = 0
    input.max = customMax
    input.placeholder = customPlaceholder
    const go = el('button', 'btn-commit')
    go.type = 'submit'
    go.textContent = 'That’s the number'
    go.style.alignSelf = 'auto'
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const n = Math.round(Number(input.value))
      if (Number.isFinite(n) && n >= 0) {
        const v = Math.min(n, customMax)
        const capped = n >= customMax
        commit(v, formatCustom ? formatCustom(v, capped) : `${v}${capped ? '+' : ''} ${suffix}`)
      } else input.focus()
    })
    form.appendChild(input)
    form.appendChild(go)
    wrap.innerHTML = ''
    wrap.appendChild(form)
    focusFirst(wrap)
  })
  group.appendChild(custom)
  wrap.appendChild(group)
  numberKeys(wrap, options.length + 1, (i) =>
    (i < options.length ? group.children[i] : custom).click())
  return wrap
}

/* The ticket slider spans the segment's OWN economics: half the
   cheapest band midpoint up to half again above the dearest, in
   roughly a hundred readable steps. A crane yard drags $500–$27,000
   at $500 a notch; a tool counter drags $200–$9,000 at $100. Derived
   from ticketBands rather than declared separately, so a segment's
   economics stay defined in exactly one place (segments.js). */
function ticketRange(seg) {
  const mids = seg.ticketBands.map((b) => b.mid)
  const rawMin = mids[0] / 2
  const rawMax = mids[mids.length - 1] * 1.5
  const step = niceStep((rawMax - rawMin) / 100)
  return {
    min: Math.max(step, Math.round(rawMin / step) * step),
    max: Math.round(rawMax / step) * step,
    step,
  }
}

/* 1 / 2 / 5 × 10ⁿ — the increments a person reads without doing
   arithmetic. A $263 step is noise; $500 is a number. */
function niceStep(x) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, x))))
  const n = x / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
}

/* `format` lets a caller render the head differently at the extremes —
   a 0 that should read "None", or a top stop that is a floor, not a
   ceiling ("100+"). Defaults reproduce the original close-rate slider
   exactly, so that call site is unchanged. */
function sliderWidget({ min, max, step, value, suffix, commit, ariaLabel, doneLabel, format }) {
  const wrap = el('div', 'slider-wrap')
  const display = el('div', 'slider-val')
  const slider = el('input', 'slider')
  slider.type = 'range'
  slider.min = min; slider.max = max
  if (step) slider.step = step
  /* clamp: a stored answer from a different segment (the owner changed
     his primary line) can sit outside this segment's range entirely */
  slider.value = Math.min(max, Math.max(min, value))
  slider.setAttribute('aria-label', ariaLabel || 'Quotes that become booked work, out of ten')
  const paint = () => {
    const v = +slider.value
    const pct = ((v - min) / (max - min)) * 100
    slider.style.setProperty('--fill', pct + '%')
    display.innerHTML = format ? format(v, v === +max) : `${v}<em>${esc(suffix)}</em>`
    slider.setAttribute('aria-valuetext', display.textContent)
  }
  slider.addEventListener('input', paint)
  paint()
  const set = el('button', 'btn-commit')
  set.type = 'button'
  set.textContent = doneLabel || 'That’s about right'
  set.addEventListener('click', () => commit(+slider.value))
  wrap.appendChild(display)
  wrap.appendChild(slider)
  wrap.appendChild(set)
  return wrap
}

function numberKeys(wrap, count, pick) {
  wrap.tabIndex = -1
  wrap.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return
    const n = parseInt(e.key, 10)
    if (n >= 1 && n <= count) pick(n - 1)
  })
}

/* ============================================================
   METER + rail
   ============================================================ */
let shownMoney = 0
let moneyRaf = 0

function renderMeter() {
  if (!document.getElementById('estPanel')) return
  const L = computeLeaks(leakState())

  animateMoney(L.monthly, L.live)

  const annual = document.getElementById('estAnnual')
  if (annual) {
    annual.textContent = L.monthly > 0 ? `${money(L.annual)} a year`
      : L.live ? 'Armed, no leaks priced yet'
      : 'Arms once we have your average job value'
  }

  const score = document.getElementById('estScore')
  if (score) score.textContent = `${L.leakScore} / 25 · ${L.band.label}`

  const ledger = document.getElementById('estLedger')
  if (ledger) {
    ledger.innerHTML = ''
    L.leaks.forEach((leak) => {
      const row = el('div', 'ledger-row')
      if (!leak.answered) row.classList.add('pending')
      else if (leak.amount > 0) row.classList.add('hot')
      else row.classList.add('clear')
      row.innerHTML = `
        <span class="lr-ic">${LEAK_ICONS[leak.icon]}</span>
        <span class="lr-lab">${leak.label}</span>
        <span class="lr-val">${leak.answered ? (leak.amount > 0 ? money(leak.amount) : 'Clear') : '–'}</span>`
      ledger.appendChild(row)
    })
  }

  const fill = document.getElementById('estFill')
  if (fill) {
    setFill(fill, (L.leakScore / 25) * 100)
    fill.dataset.tone = L.band.tone
  }

  const note = document.getElementById('estNote')
  if (note && L.live) {
    /* when the plausibility bound bites, the rows above no longer sum
       to the hero — say so here, or the panel's own arithmetic looks
       broken to exactly the skeptic it exists to convince */
    note.innerHTML = L.clamped
      ? `The rows sum to <b>${money(L.rawMonthly)}</b>, capped at half the booked revenue your answers imply. The report shows that working in full.`
      : `Estimate, not a promise: <b>${money(L.ticket)}</b> average ${L.segment.job}, <b>${Math.round(L.close * 100)}%</b> close, conservative recovery rates. Full arithmetic in your report.`
  }
}

/* the leak engine keys off .segment — keep it fed with the primary */
function leakState() {
  state.segment = state.primary || state.segments[0] || ''
  return state
}

function animateMoney(target, live) {
  cancelAnimationFrame(moneyRaf)
  const fig = document.getElementById('estMoney')
  if (!fig) { shownMoney = target; return }
  const paint = (v) => {
    /* "$0" before the model is armed reads as "you have no leak", which is
       the opposite of true — it just means we have not asked yet. */
    fig.textContent = live ? money(v) : '–'
  }
  if (reduced || !live) { shownMoney = target; paint(target); return }
  const from = shownMoney
  if (Math.abs(target - from) < 1) { paint(target); return }
  const t0 = performance.now()
  const dur = 900
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    shownMoney = from + (target - from) * eased
    paint(shownMoney)
    if (p < 1) moneyRaf = requestAnimationFrame(tick)
  }
  moneyRaf = requestAnimationFrame(tick)
}

/* One hairline, not a five-segment stepper with five labels. The act
   names were duplicating the composer hint ("Leak 3 of 5 · the open
   pile") and the thread's own phase lines, which is exactly the kind of
   chrome that reads as filler. All the header owes you is how far in
   you are. */
function renderRail() {
  if (!railEl) return
  const visible = (st) => !st.skip || !st.skip(state)
  const steps = STEPS.filter(visible)
  const done = steps.filter((st) => answeredSteps.has(st.id)).length
  const pct = stepIndex >= STEPS.length ? 100
    : steps.length ? Math.round((done / steps.length) * 100) : 0
  setFill(railEl.firstElementChild, pct)
  railEl.setAttribute('aria-valuenow', String(pct))
  railEl.classList.toggle('complete', pct >= 100)
}

/* ============================================================
   FINALE — cooking, the number, THE SOLUTION, the report
   ============================================================ */
async function finale() {
  stepIndex = STEPS.length
  awaitingStep = null
  renderRail()
  clearComposer()
  thread.querySelector('.row[data-step="finale"]')?.remove()
  const L = computeLeaks(leakState())
  const S = buildSolution(L, state)
  if (!state._depth) state._depth = 'reveal'

  await cookingOverlay(L, S)

  /* --- the number, on its own. The per-leak breakdown does NOT
     get repeated here — it lives once, in the report ledger. --- */
  const reveal = el('div', 'reveal')
  reveal.id = 'reveal'
  reveal.innerHTML = `
    <span class="lab rev-sup">${esc(state.place?.name || 'Your yard')} · estimated recoverable</span>
    <div class="rev-fig" id="revFig">$0</div>
    <div class="rev-sub">a month in recoverable ${esc(L.segment.job)} revenue, from inquiries you already paid for, quotes you already sent, and accounts you already earned.
      <span class="rev-annual">${money(L.annual)} a year</span></div>
    ${L.pileStanding > 0 ? `<div class="rev-pile">And separately, a one-time <b>${money(L.pileStanding)}</b> sitting in the ${esc(state.quotePile)} open quotes on your shelf right now.</div>` : ''}
    <button class="btn-commit rev-cta" id="revNext" type="button">So what do I actually do about it?</button>
  `
  thread.appendChild(reveal)
  requestAnimationFrame(() => reveal.classList.add('in'))
  setTimeout(scrollToEnd, 80)
  countUp(document.getElementById('revFig'), L.monthly, 1600)

  /* The close is NOT asked here. It lives at the end of renderReport(),
     after the plan and the arithmetic — reveal → solution → report →
     close, gated by state._depth. An earlier revision put a send form
     directly under the reveal; that block survived a merge and broke
     this function outright. */

  document.getElementById('revNext').addEventListener('click', () => {
    document.getElementById('revNext').remove()
    state._depth = 'solution'
    renderSolution(L, S)
  })

  /* An edit after the plan was already on screen must not demote the
     owner back to the teaser. Re-open to whatever depth he had reached. */
  if (state._depth === 'solution' || state._depth === 'report') {
    document.getElementById('revNext')?.remove()
    renderSolution(L, S)
  }
}

/* --- cooking theater: every line is built from real data --- */
function cookingOverlay(L, S) {
  /* cook once — verdict refreshes after edits skip straight to numbers */
  if (state._cooked) return Promise.resolve()
  return new Promise((resolve) => {
    const p = state.place || {}
    const rad = state.radar
    const callLeak = L.leaks.find((l) => l.id === 'calls')
    const stages = [
      { ic: '◎', t: `Pinning ${p.name || 'your yard'} on the map` },
      p.reviews ? { ic: '★', t: `Reading your Google footprint: ${p.rating}★ across ${p.reviews} reviews` } : null,
      rad.ranTag ? { ic: '⦿', t: `Folding in the radius sweep: ${rad.competitors.length} competing yards in ${rad.radiusMi} mi` } : null,
      state.rivals.length ? { ic: '⚑', t: `Weighing the ${state.rivals.length} rival${state.rivals.length > 1 ? 's' : ''} you named` } : null,
      { ic: '◍', t: callLeak && callLeak.amount > 0 ? `Pricing the missed calls: ${money(callLeak.amount)} a month` : 'Checking the phone line: running clean' },
      L.pileStanding > 0 ? { ic: '▤', t: `Valuing the standing quote pile: ${money(L.pileStanding)} on the shelf` } : null,
      { ic: '∑', t: 'Running the conservative recovery math' },
      S.fastest ? { ic: '⚡', t: `Picking the fastest fix: ${S.fastest.engine}` } : null,
      { ic: '⌘', t: `Sequencing the ninety days` },
    ].filter(Boolean)

    const cook = el('div', 'cook')
    cook.innerHTML = `
      <div class="cook-inner">
        <span class="cook-brand"><span class="star"></span>RENTALREVIVE <em>by HeyDozr</em></span>
        <h2 class="cook-title">Building your recovery plan.</h2>
        <div class="cook-list">
          ${stages.map((s, i) => `
            <div class="cook-row" data-i="${i}">
              <span class="cr-ic">${s.ic}</span>
              <span class="cr-txt">${esc(s.t)}</span>
              <span class="cr-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            </div>`).join('')}
        </div>
        <div class="cook-bar"><i id="cookFill"></i></div>
        <button class="cook-skip" type="button" id="cookSkip">skip →</button>
      </div>`
    document.body.appendChild(cook)
    requestAnimationFrame(() => cook.classList.add('in'))

    const beat = reduced ? 0 : 580
    let idx = 0
    let skipped = false
    const fill = cook.querySelector('#cookFill')

    const tickRow = () => {
      if (skipped) return
      const rows = cook.querySelectorAll('.cook-row')
      if (idx > 0) rows[idx - 1].classList.add('done')
      if (idx < rows.length) {
        rows[idx].classList.add('on')
        setFill(fill, ((idx + 1) / rows.length) * 100)
        idx++
        setTimeout(tickRow, beat)
      } else {
        finish()
      }
    }
    const finish = () => {
      if (skipped) return
      skipped = true
      state._cooked = true
      cook.classList.remove('in')
      setTimeout(() => { cook.remove(); resolve() }, reduced ? 0 : 450)
    }
    cook.querySelector('#cookSkip').addEventListener('click', finish)
    setTimeout(tickRow, reduced ? 0 : 300)
    /* hard cap so the overlay can never wedge the flow */
    setTimeout(finish, beat * (stages.length + 2) + 1500)
  })
}

/* ============================================================
   THE SOLUTION
   ------------------------------------------------------------
   03-MISSED-RENTAL-AUDIT §4: biggest leak, monthly opportunity,
   FASTEST FIX, recommended offer, next step. §7–§8: the close
   is two paths, never yes/no.
   ============================================================ */
/* A low-urgency read picks neither door — we say so rather than
   highlighting one out of habit. 03-MISSED-RENTAL-AUDIT §6 band 1. */
function isPickedPath(p, S) {
  return p.key === S.read.key
}

function renderSolution(L, S) {
  const sol = el('div', 'solution')
  sol.id = 'solution'

  sol.innerHTML = `
    <div class="sol-head">
      <span class="lab">The plan</span>
      <h2>Here is what actually closes it.</h2>
      <p>Five leaks, but they do not all get fixed the same way, in the same week, or by the same people. This is the order that pays first, and what each door can genuinely close, measured against your own numbers.</p>
    </div>

    ${S.fastest ? `
    <div class="sol-fastest">
      <span class="lab panel-lab">Fastest fix</span>
      <div class="sf-head">
        <h3>${esc(S.fastest.engine)}</h3>
        <span class="sf-when">Live in ${esc(S.fastest.live.toLowerCase())}</span>
      </div>
      <p>${esc(S.fastest.what)}</p>
      <div class="sf-worth">
        <b>${money(S.fastest.amount)}</b>
        <span>a month. The ${esc(S.fastest.label.toLowerCase())} leak, closed by this one change alone.</span>
      </div>
    </div>` : ''}

    <div class="panel">
      <span class="lab panel-lab">What happens, and when</span>
      <div class="seq">
        ${S.sequence.map((s) => `
          <div class="seq-row">
            <span class="seq-when">${esc(s.when)}</span>
            <div class="seq-body">
              <h4>${esc(s.title)}</h4>
              <p>${esc(s.body)}</p>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <div class="panel">
      <span class="lab panel-lab">What your yard needs standing up</span>
      <div class="seq">
        ${S.build.map((b) => `
          <div class="seq-row">
            <span class="seq-when">${esc(b.live)}</span>
            <div class="seq-body">
              <h4>${esc(b.engine)}</h4>
              <p>${esc(b.what)}</p>
              ${b.gated
                ? `<p class="sv-note">${esc(b.gatedNote)}</p>`
                : b.people ? `<p class="sv-note">${esc(b.peopleNote)}</p>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>

    <div class="sol-head" style="padding-top:8px">
      <span class="lab">Two ways to run it</span>
      <h2>Your team, or ours.</h2>
      <p>Not a yes or a no, a choice of who does the work. The honest difference is which of your leaks each door is actually able to close.</p>
    </div>

    <div class="sol-paths">
      ${S.paths.map((p) => `
        <div class="path${isPickedPath(p, S) ? ' pick' : ''}">
          <span class="path-tag">${esc(p.kind)}${isPickedPath(p, S) ? ' · the fit on your answers' : ''}</span>
          <h3>${esc(p.name)}</h3>
          <div class="path-recovers">
            <b>${money(p.recovers)}</b>
            <span>of your ${money(L.monthly)} monthly leak</span>
          </div>
          ${p.gap > 0 ? `<p class="path-gap">Leaves ${money(p.gap)} a month still leaking: ${esc(p.leaves.join(', ').toLowerCase())} ${p.leaves.length > 1 ? 'are' : 'is'} not in scope.</p>` : ''}
          <div class="path-list">
            ${p.closes.map((c) => `<div class="yes">${ICON.check}<span>${esc(c)}</span></div>`).join('')}
            ${p.leaves.map((c) => `<div class="no">${ICON.minus}<span>${esc(c)}</span></div>`).join('')}
          </div>
          <p class="path-who">${esc(p.you)} ${esc(p.us)}</p>
          <p class="path-fine">${esc(p.guarantee)}</p>
        </div>`).join('')}
    </div>

    <div class="sol-rec">
      <span class="lab panel-lab">The honest read on your answers</span>
      <h3>${esc(S.read.headline)}</h3>
      <p>${esc(S.read.why)}</p>
      <p class="rec-next">${esc(S.read.next)}</p>
    </div>

    <div class="sol-verify">
      <span class="lab panel-lab">Next step</span>
      <h3>${esc(S.verification.title)}</h3>
      <p>${esc(S.verification.body)}</p>
      <p class="sv-note">${esc(S.verification.note)}</p>
    </div>

    <div class="sol-verify">
      <span class="lab panel-lab">And then</span>
      <h3>${esc(S.nextStep.title)}</h3>
      <p>${esc(S.nextStep.body)}</p>
    </div>

    <button class="btn-commit rev-cta" id="solNext" type="button" style="align-self:center">Show me the arithmetic behind all this</button>
  `
  thread.appendChild(sol)
  requestAnimationFrame(() => sol.classList.add('in'))
  setTimeout(scrollToEnd, 60)

  document.getElementById('solNext').addEventListener('click', () => {
    document.getElementById('solNext').remove()
    state._depth = 'report'
    renderReport(L, S)
  })

  if (state._depth === 'report') {
    document.getElementById('solNext')?.remove()
    renderReport(L, S)
  }
}

/* The reach answers, as one sentence for the report's market panel.
   "What works" is a medium name when several are running and a yes/no
   verdict when only one is — the two do not read the same way, so this
   is built here rather than nested into the template. */
function reachSummary() {
  if (!state.marketing) return ''
  if (state.marketing === NO_MARKETING) {
    return 'Making the phone ring: nothing paid for, word of mouth and repeat accounts.'
  }
  const media = esc(state.marketingChannels.join(', ') || 'not specified')
  const w = state.marketingWorks
  let verdict = ''
  if (w && state.marketingChannels.length === 1) {
    verdict = w === 'Not really' ? ' By your own account it is not bringing work in.'
      : w === 'Some, hard to tell' ? ' Whether it brings work in is hard to tell. Nothing tracks what happened after the call.'
      : ' It brings work in.'
  } else if (w) {
    verdict = w === NOTHING_WORKS
      ? ' None of it brings work in by your own account, which is why the recovery below starts with the inquiries already reaching you.'
      : ` Earning its keep: <b>${esc(w)}</b>.`
  }
  return `Making the phone ring: ${media}.${verdict}`
}

/* ============================================================
   REPORT — the arithmetic, and the ledger's one home
   ============================================================ */
async function renderReport(L, S) {
  const report = el('div', 'report report-doc')
  report.id = 'report'
  /* every priced leak carries its documented fix into the report */
  const fixOf = Object.fromEntries(S.active.map((f) => [f.id, f]))
  const dominant = L.dominant
  const p = state.place || {}
  const rad = state.radar
  const reachLine = reachSummary()

  report.innerHTML = `
    <div class="rep-head">
      <span class="lab">Revenue leak scan · the arithmetic</span>
      <button type="button" class="rep-download" id="repDl">Download PDF</button>
      <h2>${esc(p.name || 'Your yard')}: every number, and where it came from.</h2>
      <p class="rep-meta">${esc(state.segments.map((id) => segmentById(id).short).join(' + '))} · ${esc(state.fleetSize || '')} units · ${esc(state.inquiries || '')} inquiries a month${p.city ? ` · ${esc(p.city)}${p.state ? ', ' + esc(p.state) : ''}` : ''}</p>
    </div>

    <div class="panel rep-verdict" data-tone="${L.band.tone}">
      <div class="rv-score">
        <b>${L.leakScore}<small>/25</small></b>
        <span>${esc(L.band.label)}</span>
      </div>
      <div class="rv-total">
        <span class="lab">Estimated recoverable revenue</span>
        <b>${money(L.monthly)} / mo</b>
        <small>${money(L.annual)} a year${L.pileStanding > 0 ? ` · plus ${money(L.pileStanding)} in the standing pile` : ''}</small>
      </div>
    </div>

    ${rad.ranTag || state.rivals.length || state.marketing ? `
    <div class="panel rep-market">
      <span class="lab panel-lab">Your market</span>
      <p>${rad.ranTag
        ? `<b>${rad.competitors.length}</b> yards renting against you inside <b>${rad.radiusMi} mi</b>${rad.competitors.filter((c) => c.national).length ? `, <b>${rad.competitors.filter((c) => c.national).length}</b> national` : ''}.`
        : ''}
      ${state.rivals.length ? ` You lose jobs to: <b>${esc(state.rivals.join(', '))}</b>.` : ''}
      ${state.whyTheyWin.length ? ` Why they win: ${esc(state.whyTheyWin.join(', ').toLowerCase())}.` : ''}</p>
      ${reachLine ? `<p>${reachLine}</p>` : ''}
    </div>` : ''}

    ${dominant ? `
    <div class="rep-dominant">
      <span class="lab panel-lab">Your biggest leak</span>
      <h3>${esc(dominant.label)}: ≈ ${money(dominant.amount)} a month</h3>
      <p>${esc(dominant.note)}</p>
    </div>` : ''}

    <div class="panel rep-table">
      <div class="rt-head"><span>Leak</span><span>The math</span><span>/ month</span></div>
      ${L.leaks.map((l) => `
        <div class="rt-row ${l.amount > 0 ? 'hot' : 'clear'}">
          <span class="rt-lab">${LEAK_ICONS[l.icon]} ${l.label}</span>
          <span class="rt-math">${esc(l.formula)}${l.id === 'pile' && l.standing ? `<em>Standing pile: ${esc(l.standingFormula)} = ${money(l.standing)} one-time</em>` : ''}${fixOf[l.id] ? `<em class="rt-fix"><b>The fix: ${esc(fixOf[l.id].fix)}, live ${esc(fixOf[l.id].live)}.</b> ${esc(fixOf[l.id].what)}${!fixOf[l.id].self ? ' Managed path only.' : ''}</em>` : ''}</span>
          <span class="rt-val">${l.amount > 0 ? money(l.amount) : '–'}</span>
        </div>`).join('')}
      ${L.clamped ? `
        <div class="rt-row clear">
          <span class="rt-lab">Plausibility bound</span>
          <span class="rt-math">The five leaks sum to ${money(L.rawMonthly)}, but your own answers imply ≈ ${money(L.impliedMonthly)}/mo in booked work (${L.quotes % 1 ? L.quotes.toFixed(1) : L.quotes} quotes × ${Math.round(L.close * 100)}% booked × ${money(L.ticket)}), and we will not claim you are leaking more than half of what you book. Past that line the honest reading is noisy answers, not more money.</span>
          <span class="rt-val">− ${money(L.rawMonthly - L.monthly)}</span>
        </div>` : ''}
    </div>

    <div class="panel rep-paths">
      <span class="lab panel-lab">The two ways to close it</span>
      ${S.paths.map((pt) => `
        <div class="rp-path${isPickedPath(pt, S) ? ' pick' : ''}">
          <div class="rp-top"><b>${esc(pt.kind)} · ${esc(pt.name)}</b></div>
          <p>Closes ${pt.closes.join(', ').toLowerCase() || 'nothing yet'} · recovers ≈ ${money(pt.recovers)}/mo${pt.leaves.length ? ` · leaves ${pt.leaves.join(', ').toLowerCase()} open` : ' · leaves nothing open'}.</p>
        </div>`).join('')}
    </div>

    <p class="rep-assume">Recovery assumptions, held deliberately low: ${Math.round(ASSUMPTIONS.reachable * 100)}% of missed callers still reachable, ${Math.round(ASSUMPTIONS.winnable * 100)}% of lag-lost quotes winnable, ${Math.round(ASSUMPTIONS.revivable * 100)}% of a cold pile revivable, ${Math.round(ASSUMPTIONS.reactivated * 100)}% of quiet accounts reactivated. The total is additionally capped at half the booked revenue your own answers imply. We will never claim you leak more than half of what you book. Leak score is the 0–25 scale from our own audit spec. Think a number is off? Tap any answer in the transcript and the whole model re-runs, plan included.</p>
  `
  /* the stage's final act: the instrument gives way to the document.
     The chat keeps the conversation; the right panel IS the report —
     and the same DOM prints as the PDF. */
  stageRight.innerHTML = ''
  stageRight.appendChild(report)
  requestAnimationFrame(() => report.classList.add('in'))
  document.getElementById('repDl')?.addEventListener('click', () => window.print())
  setTimeout(scrollToEnd, 80)

  /* --- the proof gate: measurement, offered only after the owner has
     seen the arithmetic (FR1). Renders nothing when the probe backend
     is not configured — the scan stays exactly as it is today. --- */
  try {
    const { renderProofGate } = await import('./dashboard/gate.js')
    renderProofGate(thread, {
      state,
      buildScanPayload: () => buildProbeScanPayload(L),
      onActivated: async (runId) => {
        const { mountDashboard } = await import('./dashboard/index.js')
        await mountDashboard(thread, runId)
        setTimeout(scrollToEnd, 120)
      },
    })
  } catch (e) {
    /* the gate failing to load must never take the report down */
    console.warn('proof gate unavailable', e)
  }

  /* --- the close: asked like a person would ask it, in the dock --- */
  const row = el('div', 'row')
  row.dataset.step = 'close'
  row.innerHTML = `<div class="row-bot"></div>`
  thread.appendChild(row)
  await botSay(row, [
    'That’s the scan. Your full report is on the right: every leak, the arithmetic behind it, the fix for each one, and both paths. Download PDF puts it in your hands.',
    'Where should I send it? And who should it be addressed to?',
  ])
  swapComposer(sendForm(L, S), 'Where to send the report')
  scrollToEnd()
}

function sendForm(L, S) {
  const p = state.place || {}
  const form = el('form', 'send-form')
  form.noValidate = true
  form.innerHTML = `
    <div class="sf-grid">
      <label class="sf-field">
        <span>Address it to</span>
        <input type="text" name="recipient" placeholder="First name" required maxlength="40" autocomplete="given-name" value="${esc(state.recipient)}" />
      </label>
      <label class="sf-field">
        <span>Your role at ${esc(p.name || 'the yard')}</span>
        <div class="sf-roles">
          ${['Owner', 'GM / Ops', 'Rental manager', 'Dispatcher'].map((r) => `<button type="button" class="sf-role${state.role === r ? ' on' : ''}" data-role="${r}">${r}</button>`).join('')}
        </div>
      </label>
      <label class="sf-field">
        <span>Send it to</span>
        <input type="email" name="email" placeholder="you@${esc(domain(p.website) || 'yourcompany.com')}" required maxlength="80" autocomplete="email" value="${esc(state.email)}" />
      </label>
    </div>
    <button class="btn-commit sf-send" type="submit">Send my report →</button>
    <p class="sf-fine">One page, your numbers, the arithmetic shown. Then we run the real-world check against ${esc(p.name || 'your yard')} (three calls at different times, one timed quote request, scored out of 10) and reply within 48 hours. No cost, no obligation, and if your counter scores well we will say so.</p>
  `

  form.querySelectorAll('.sf-role').forEach((b) => {
    b.addEventListener('click', () => {
      form.querySelectorAll('.sf-role').forEach((x) => x.classList.remove('on'))
      b.classList.add('on')
      state.role = b.dataset.role
    })
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!form.reportValidity()) return
    state.recipient = form.recipient.value.trim()
    state.email = form.email.value.trim()

    const endpoint = import.meta.env.VITE_AUDIT_ENDPOINT
    const button = form.querySelector('.sf-send')
    let status = form.querySelector('[data-form-status]')
    if (!status) {
      status = el('p', 'sf-fine')
      status.dataset.formStatus = 'true'
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      form.append(status)
    }

    if (!endpoint) {
      status.textContent = 'The intake endpoint is not connected yet. Email the RentalRevive team directly and mention your scan score.'
      return
    }

    const original = button.textContent
    button.disabled = true
    button.textContent = 'Sending…'
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildPayload(L, S)),
      })
      if (!res.ok) throw new Error(`Scan submission failed: ${res.status}`)
      form.innerHTML = `<div class="rg-done" role="status">
        <b>On its way to ${esc(state.email)}, addressed to ${esc(state.recipient)}.</b>
        We’ll run the real-world check against ${esc(state.place?.name || 'your yard')} and reply within 48 hours. If your counter is airtight, you’ll hear that too.
        <span class="rg-actions">
          <button class="rep-print" type="button" onclick="window.print()">Save this page as PDF</button>
          <a class="rep-restart" href="/onboard.html">Scan another yard →</a>
        </span></div>`
    } catch (err) {
      console.error(err)
      status.textContent = 'That did not go through. Try again, or email the team directly so your numbers are not lost.'
      button.disabled = false
      button.textContent = original
    }
  })
  return form
}

/* What saveScan persists at activation (convex/scans.ts). Curated
   picks, not a state spread — the snapshot must stay serialisable and
   free of anything the leak engine does not read. */
function buildProbeScanPayload(L) {
  const p = state.place || {}
  return {
    yard: {
      placeId: p.placeId || '',
      manual: !!p.manual,
      name: p.name || 'Unknown yard',
      address: p.address ?? null,
      city: p.city ?? null,
      state: p.state ?? null,
      lat: Number.isFinite(p.lat) ? p.lat : null,
      lng: Number.isFinite(p.lng) ? p.lng : null,
      /* [ASSUMPTION] the owner activates from the yard's timezone —
         browser tz stands in until server-side enrichment derives it
         from geometry (AD-8 stores it per-run at activation). */
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      phone: p.phone ?? null,
      website: p.website ?? null,
      rating: p.rating ?? null,
      reviewCount: p.reviews ?? null,
      openingHours: p.openingHours ?? null,
      photoCount: p.photoCount ?? null,
    },
    answers: {
      segments: state.segments,
      primary: state.primary,
      segment: state.segment,
      fleet: state.fleet,
      fleetSize: state.fleetSize,
      inquiries: state.inquiries,
      channels: state.channels,
      ticket: state.ticket,
      closeRate: state.closeRate,
      team: state.team,
      missedCalls: state.missedCalls,
      afterHours: state.afterHours,
      quoteSpeed: state.quoteSpeed,
      quotePile: state.quotePile,
      quietAccounts: state.quietAccounts,
      outbound: state.outbound,
      rivals: state.rivals,
      whyTheyWin: state.whyTheyWin,
    },
    radar: state.radar?.ranTag
      ? {
          competitors: state.radar.competitors.map((c) => ({
            /* placeId rides along for the FR27 public-hours lookup —
               listings only, nobody is ever contacted (C6) */
            placeId: c.placeId ?? null,
            name: c.name,
            national: !!c.national,
            rating: c.rating ?? null,
          })),
          radiusMi: state.radar.radiusMi,
        }
      : null,
    estimate: {
      monthlyCents: Math.round(L.monthly * 100),
      annualCents: Math.round(L.annual * 100),
      leakScore: L.leakScore,
      band: L.band.key,
      dominantId: L.dominant?.id ?? null,
      pileStandingCents: Math.round(L.pileStanding * 100),
    },
  }
}

function buildPayload(L, S) {
  const p = state.place || {}
  return {
    source: 'leak-scan',
    recipient: state.recipient, role: state.role, email: state.email,
    company: p.name || '', phone: state.phone,
    place: p.manual ? { manual: true, name: p.name, city: p.city, state: p.state } : {
      placeId: p.placeId, name: p.name, address: p.address, city: p.city, state: p.state,
      rating: p.rating, reviews: p.reviews, website: p.website, lat: p.lat, lng: p.lng,
    },
    yard: {
      segments: state.segments, primary: state.primary,
      fleet: state.fleet, fleetSize: state.fleetSize, team: state.team,
    },
    /* the digital footprint, so the desk works the same picture the owner
       saw — tri-state throughout, `null` means we could not measure it */
    footprint: state.footprint ? {
      website: {
        kind: state.footprint.site.kind,
        platform: state.footprint.site.platform,
        host: state.footprint.site.host,
      },
      profile: {
        pct: state.footprint.profile.pct,
        passed: state.footprint.profile.passed,
        measured: state.footprint.profile.measured,
        gaps: state.footprint.profile.gaps,
      },
      quotePath: state.footprint.audit ? {
        measured: state.footprint.audit.measured,
        booking: state.footprint.audit.foundBooking,
        chat: state.footprint.audit.foundChat,
        contactForm: state.footprint.audit.foundContact,
      } : null,
      trackers: state.footprint.audit?.trackers?.measured
        ? Object.fromEntries(Object.entries(state.footprint.audit.trackers.trackers)
            .map(([k, v]) => [k, { detected: v.detected, id: v.id }]))
        : null,
    } : null,
    market: {
      radiusMi: state.radar.radiusMi,
      competitors: state.radar.competitors.map((c) => ({
        name: c.name, rating: c.rating, reviews: c.reviews,
        distance: +c.distance.toFixed(1), national: c.national,
      })),
      rivals: state.rivals, whyTheyWin: state.whyTheyWin,
    },
    numbers: {
      inquiries: state.inquiries, channels: state.channels,
      ticket: state.ticket, closeRate: state.closeRate,
    },
    /* intake context for the desk — deliberately not an input to the
       leak math (03-MISSED-RENTAL-AUDIT §5–§6 define that) */
    reach: {
      marketing: state.marketing,
      running: state.marketingChannels,
      bestPerformer: state.marketingWorks,
    },
    leaks: {
      missedCalls: state.missedCalls, afterHours: state.afterHours,
      quoteSpeed: state.quoteSpeed, quotePile: state.quotePile,
      quietAccounts: state.quietAccounts, outbound: state.outbound,
    },
    result: {
      monthly: Math.round(L.monthly), annual: Math.round(L.annual),
      leakScore: L.leakScore, band: L.band.key,
      dominant: L.dominant?.id || null,
      pileStanding: Math.round(L.pileStanding),
    },
    /* the plan, so whoever takes the call works the same answer the
       owner saw. No price is carried — the number is discussed live,
       per 16-WEBSITE-AND-SCAN-PAGE-COPY-BRIEF §1. */
    plan: {
      read: S.read.key,
      fastestFix: S.fastest?.engine || null,
      engines: S.build.filter((b) => !b.gated).map((b) => b.engine),
      gatedEngines: S.build.filter((b) => b.gated).map((b) => b.engine),
      softwareRecovers: Math.round(S.softwareAmount),
      softwareGap: Math.round(S.softwareGap),
    },
  }
}

/* ============================================================
   utilities
   ============================================================ */
function el(tag, cls) {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/* the shared icon markup is fill-less stroke art; lo-meta needs it inline */
function strokeIcon(svg) {
  return svg.replace('<svg ', '<svg fill="none" stroke="currentColor" stroke-width="1.7" ')
}

function domain(url) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return '' }
}

function starRow(rating) {
  const full = Math.round(rating)
  return `<i class="stars">${'★'.repeat(Math.min(5, full))}${'☆'.repeat(Math.max(0, 5 - full))}</i>`
}

function markerDot(color, scale) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale, fillColor: color, fillOpacity: 1,
    strokeColor: 'rgba(12,11,10,.85)', strokeWeight: 2.5,
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* Drive a progress fill. The fills are full-width and scaled, never
   grown — `width` is a layout property and animating it runs layout
   every frame, while scaleX rides the compositor. The tracks clip, so
   this paints identically. See the note above .tb-progress i. */
function setFill(elm, pct) {
  if (!elm) return
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  elm.style.transform = `scaleX(${clamped / 100})`
}


/* ------------------------------------------------------------
   scrollToEnd — one scroll per frame, and only if the reader
   is still following along.

   This is called from a dozen places in a single turn (bubble
   appended, widget mounted, artifact revealed, stage swapped).
   It used to fire `scrollTo({behavior:'smooth'})` on every one
   of them, and each call re-targeted a smooth scroll that was
   still animating — the browser restarts the easing every time,
   which is what read as jitter. Two rules fix it:

   1. Coalesce. Many calls in one frame collapse into one scroll.
   2. Do not fight the reader. If they have scrolled up to re-read
      an answer, yanking them to the bottom is the worst thing the
      thread can do. Stick to the bottom only while they are near
      it — the same rule every good chat log follows.
   ------------------------------------------------------------ */
let scrollQueued = false
let following = true      /* a fresh thread follows; the reader turns this off */
let selfScrollUntil = 0   /* while our own animation runs, ignore scroll events */

/* Read the follow state off plain 'scroll', not off wheel/touch/key.
   Gesture sniffing misses a whole input modality — dragging the
   scrollbar fires neither wheel nor touchmove, so a reader who
   dragged up would still get yanked, and one who dragged back to the
   bottom would never start following again. 'scroll' catches every
   modality; the only thing it needs is to not hear our own smooth
   scroll, which passes through the middle of the thread on its way
   down and would otherwise cancel itself. */
function watchFollow(wrap) {
  wrap.addEventListener('scroll', () => {
    if (performance.now() < selfScrollUntil) return
    following = shouldFollow(wrap)
  }, { passive: true })
}

function scrollToEnd() {
  if (scrollQueued) return
  scrollQueued = true
  requestAnimationFrame(() => {
    scrollQueued = false
    const wrap = document.getElementById('threadWrap')
    /* ALWAYS follow — product decision 2026-08-06: a new bot line
       pulls the thread down even if the owner had scrolled up.
       (The read-position guard this replaces lives in git history.) */
    if (!wrap) return
    /* long enough to cover the smooth scroll we are about to start */
    selfScrollUntil = performance.now() + 700
    wrap.scrollTo({ top: wrap.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  })
}

function focusFirst(widget) {
  const target = widget.querySelector('input[type="text"], input[type="email"], input[type="tel"]')
  if (target) setTimeout(() => target.focus({ preventScroll: true }), 120)
}

function countUp(elm, target, dur = 1500) {
  if (reduced) { elm.textContent = money(target); return }
  const t0 = performance.now()
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    elm.textContent = money(target * eased)
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
