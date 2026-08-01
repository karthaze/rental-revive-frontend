# RentalRevive — Project Context

Read this first in any new session. It's the standing memory of what
RentalRevive is, what's been built, why it looks the way it does, and
where to pick up. Update it as the project moves — don't let it go stale.

Status: PRs #1–#8 merged. Current work is on the local branch
`restructure/product-first`.

**Continuing the Revive Agent build? Read `SESSION.md`** — it carries
the build state, the invariants that live in code, the verification
commands, the deployment checklist, and the ordered next steps.
This file stays the standing product memory; SESSION.md is the
pick-up-here doc.

**The founder's source docs are now IN THE REPO at `../business/`**
(14 files, ~2,100 lines). Read them before writing anything
customer-facing or changing an offer — earlier sessions worked from
memory of them and got the offer ladder wrong (see §1). That directory
is confidential commercial material — do not quote or reproduce it in
anything customer-facing or public.

---

## 1. The business (from the founder's docs)

RentalRevive is a **managed revenue recovery service for independent US
heavy machinery rental companies** — a self-managed low-ticket starter
system feeding a managed done-for-you desk. Originally scoped to crane
rental only; broadened to all heavy machinery rental during this build
(see §3).

**Core rule, said explicitly in the source docs and binding on all
copy:** sell recovered rental conversations and booked revenue — never
"AI", "bots", "leads", "automation", or "software". See the language
guide in §8 before writing anything customer-facing.

### The four revenue leaks (the whole pitch is built on these)
1. **Missed calls** — lunch, after hours, yard chaos, phone rings out.
2. **Slow quotes** — a contractor needs a budgetary number fast; doesn't get one.
3. **Unworked quotes** — sent, then nobody chases them to a yes or a no.
4. **No outbound** — the yard reacts to inbound instead of working local
   project intelligence (permits, lettings) ahead of the phone ringing.

### The offer ladder — CORRECTED 2026-07-28, read this carefully

The real ladder, verbatim from `../business/README.md`
("Current offer ladder") and `00-BUSINESS-PLAN` §5:

| Stage | Offer | Price |
|---|---|---|
| Free | Rental Revenue Leak Scan | $0 |
| One-time downsell | **Revenue Leak Audit Pack** | $297 one-time |
| Self-managed | **Crane Pipeline Starter** | $397 activation + $197/mo |
| Core | **60 Day Crane Revenue Recovery Sprint** | $2,000/mo × 2 months |
| Premium | **Full Revenue Desk** | $5,000–$6,000/mo |

**`07-RESCUE-AND-DESK-AGREEMENTS` §2 explicitly RETIRES the names
"Yard Dog" and "Rescue offer".** An earlier session invented a
Rescue / Quote Recovery Pilot / Desk / Yard Dog ladder (with a
"$0 to start, $200 per rental" mechanic that appears nowhere in the
docs), shipped it to `index.html`, and this file previously asserted
it was the source of truth. It was not. The docs are.

- The **scan** (`frontend/src/onboard/plan.js`) is now on the correct ladder.
- **`index.html` still shows the retired names and the invented
  pricing.** That is a known, unfixed divergence — the landing copy is
  built around mechanics that do not exist. Fixing it is a real piece
  of work, not a find-and-replace, and it needs the founder's call.

One deliberate liberty: the docs are crane-only, but the product was
broadened to 8 machinery segments at the user's request. So
`offerNames()` in `plan.js` drops the word "Crane" from the two offers
carrying it unless the yard's primary line actually is cranes.

### ICP / qualification (source: 01-ICP-AND-LIST-BUILDING)
Independent US machinery rental companies, 1–5 locations, $3M+ revenue,
visible commercial/industrial demand in their metro. Scored 0–100 across
fleet relevance, commercial demand, website quote leakage, response
pain, purchasing power, contact path. Avoid national chains and
single-machine owner-operators.

### Full source doc index — all committed at `../business/`
1. `00-BUSINESS-PLAN.md` — thesis, offer ladder, 90-day plan, risks.
   **§9 = the Full Revenue Desk qualification gate** (need ≥3 of 6).
2. `01-ICP-AND-LIST-BUILDING.md` — ICP, scoring model, list sources
3. `02-INDUSTRY-LANGUAGE-GUIDE.md` — **do/don't say** vocabulary (§8 below)
4. `03-MISSED-RENTAL-AUDIT.md` — **the spec for the scan itself.**
   §4 = the five required outputs, §5 = leak scoring 0–25 and its four
   bands, §6 = the `opportunities × close × avg job value` formula,
   §7–§8 = the two-path close. If you change the scan's ending, this
   is the file you are implementing.
5. `04-MYSTERY-CALL-SOP.md` — the free real-world check, scored /10
6. `05-OUTREACH-SEQUENCES.md` — Loom, email, LinkedIn, call scripts
7. `06-SALES-CALL-SCRIPT-AND-OBJECTIONS.md` — §2 step 4 is the two-path close
8. `07-RESCUE-AND-DESK-AGREEMENTS.md` — offer names in agreements,
   guarantees, data-trust rules, the QuickyQuotes disclaimer
9. `08-SPRINT-DELIVERY-SOP.md` — **the 60-day delivery timeline** the
   solution screen renders, plus the 3-touch follow-up sequence
10. `09-PIPELINE-KPI-TRACKER.md`, `10-CASE-STUDY-TEMPLATE.md`
11. `11-LOW-TICKET-DOWNSELL-PIPELINE-STARTER.md` — the starter in full.
    **§10 included / §11 excluded is load-bearing** — it is what decides
    which leaks the self-managed path can actually close.

`README.md` is the index for this folder — start there if you need the
current offer ladder or a reading order rather than a specific file. There
is no single concatenated file; the numbered files above are the source
of truth.

---

## 2. What "building this" means, concretely

Two things exist in this repo, both live:

1. **The marketing site** (`frontend/index.html`, `frontend/src/style.css`,
   `frontend/src/main.js`) — predates the scan, crane/equipment-rental
   themed. **Currently out of sync with the real offer ladder — see §1
   and §10.**
2. **The Leak Scan** (`frontend/onboard.html`, `frontend/src/onboard.js`,
   `frontend/src/onboard.css`, `frontend/src/onboard/*.js` for the
   frontend-only modules, `common/*.js` for the modules shared with the
   Convex backend) — the onboarding/lead-gen app. This is the main
   deliverable and where nearly all the interesting logic lives.

The ask has evolved across four rounds. Read them in order — each one
changed the shape of the thing, and the corrections are the useful part:

**Round 1** — "build an interactive onboarding for 8 segments of heavy
machinery rental, not crane-only, feel like voltbot but not theatrical,
interactive, questions chronological." → built a 9-question one-at-a-
time chat diagnostic with a live leak meter (`5a38127`'s parent commit,
superseded by round 2).

**Round 2** — "take the workflow agentic logic from voltbot — search
only heavy machinery in USA, pin competitors, ask team/phone, email
last, quotation-cooking vibes, MCQ not single-select." → rebuilt as a
full agentic app: search gate → lock-on → multi-select MCQs → competitor
radar → cooking overlay → reveal → report → send-form close. This is
`5a38127`.

**Round 3** — "the opening form looks bad, chat is jittery, launch from
landing not a cold form, business-name-only search, actually study
voltbot before rebuilding, believably good not hypothetical." + mid-turn:
"reimagine the landing page too, take inspiration from owner.com." →
rebuilt the gate to voltbot's actual visual scale (blurred hero photo,
92px search box), fixed the typing animation's root cause (see §6),
wired the landing hero's email capture into the same business search,
and rebuilt the landing hero/steps/stats section around owner.com's
centered product-forward layout. This is `5eacea4` + `5751e21`.

**Round 4** (PR #3) — "high-end minimalist, liquid glass industrial like
Apple / Palantir / owner.com; consolidate the metric cards, they repeat;
**the final reveal reveals nothing, it just repeats that leak card — I
want it to finally craft a solution, take inputs from the business
plan**; the map colours look washed out and blend into the background;
fix the chat reply at one spot; the leak dropdown should slide up from
the bottom; when options are selected it looks ugly, make it feel like a
conversational agent helping them." Then, in follow-ups: *"the left
panel looks shit"* → rail replaced by a top header; *"less is more,
declutter the unwanted elements which looks ai slop, mostly on header"*
→ header cut to four elements (§6).

Round 4 is where the founder's source docs were finally found (on the
`claude/new-session-jscibw` branch) and committed. That changed the work
substantially: the ending stopped being a restated diagnosis and became
`plan.js` (§5b), and the offer ladder was corrected (§1).

**Standing bar for any new round: "believably good, not hypothetical."**
Approximations have been rejected three times now — on voltbot fidelity,
on the reveal that revealed nothing, and on header chrome that read as
filler. Two habits that follow from that:

- If the ask references voltbot, read `../voltbot/frontend/src/App.jsx` and
  `../voltbot/frontend/src/App.css` yourself rather than working from this file.
- If the ask touches an offer, a price, a guarantee or any
  customer-facing claim, read the relevant file in `../business/`
  first. Every documented mistake in this project traces to working
  from memory of those docs instead of the docs.

---

## 3. The eight segments

Heavy machinery rental was split into 8 segments so the scan can speak
each trade's language instead of generic "equipment rental" copy. Full
definitions — fleet lists, ticket bands, intake fields, project signals,
leak framing per segment — live in `common/segments.js` (353 lines),
don't summarize from memory, read it:

1. **Cranes & Lifting** — mobile cranes, boom trucks, crawlers, rigging. Highest ticket, slowest quote path.
2. **Earthmoving & Excavation** — excavators, dozers, loaders. Weekly/monthly dry rental.
3. **Aerial & Access** — scissor/boom lifts, telehandlers. High volume, low ticket, throughput leak.
4. **Compact & Small Machinery** — skid steers, mini-excavators, tool rental. Day rates, phone-as-counter.
5. **Material Handling & Forklifts** — industrial accounts, long-term contracts, service attached.
6. **Road, Concrete & Compaction** — pavers, rollers, concrete pumps. Bid/DOT-lettings driven, seasonal.
7. **Power, Climate & Site Services** — generators, light towers, temp HVAC. 24/7 emergency demand.
8. **Heavy Haul, Rigging & Specialty** — machinery moving, plant relocations. Highest ticket, lowest volume, project-based.

Each segment object has: `fleet[]`, `ticketBands[]` (label + dollar
midpoint), `defaultClose`, `intake[]`, `signals[]` (local project types
to reference), `hook` (one-line pitch), and `frames{calls,quotes,pile,
quiet,outbound}` (segment-specific leak narration used by the chat).

The scan supports **multi-segment yards** (a company can pick more than
one) with a "which pays the bills" primary-segment follow-up that only
appears when >1 is picked. Machine/fleet options are a de-duplicated
union of the picked segments' fleet lists.

---

## 4. Architecture map

All paths below are relative to `rentalrevive/` (this project's own root —
the repo root has no `package.json`; `cd` into `rentalrevive/` first).
The split that matters: `common/` holds the modules the Convex backend
also imports unmodified; `frontend/src/onboard/` holds the modules only
the browser app uses. Nothing in `frontend/` is imported by
`services/convex/`, and nothing in `common/` imports anything from
`frontend/` — that's the whole point of the split.

```
package.json             this project's own manifest (dev/build/test/typecheck scripts)
vite.config.js           multi-page build: main, privacy, terms, onboard — at the
                         project root, a SIBLING of frontend/, common/ and
                         services/, not inside frontend/
vitest.config.mts        test runner config (edge-runtime env, convex-test inlined)
convex.json              Convex project config

frontend/
  index.html             landing page — hero, leaks, control panel, segments,
                         how-it-works, quote demo, offer ladder, FAQ, audit form
  onboard.html           the scan's HTML shell — just <div id="app">, everything
                         else is rendered by onboard.js
  src/
    main.js              landing: scroll-reveal, nav, the hero yard-search box
                         (wired to onboard/places.js), the money-leak "rig"
                         control panel, FAQ accordion, audit form submit
    style.css            landing design system — tokens at :root, then components.
                         "Sleekness model: Lenny's Product Pass" per the header
                         comment. Warm palette, Plus Jakarta Sans, one red pill CTA.
    onboard.js            THE SCAN. 2823 lines — large, read the file rather
                         than trust a figure here. Gate/splash → app shell → question
                         graph runner → stage renderers (lock-on, reviews,
                         footprint, radar, cooking) → finale (reveal → SOLUTION →
                         report → send form).
                         Read the top-of-file comment block before editing.
    onboard.css           the scan's design system — "liquid glass, industrial".
                         Independent of style.css (separate Vite entries, see
                         vite.config.js). TWO-PANE shell since 07a71dd/83f7a72:
                         stage-left = thread + dock, stage-right = the artifact
                         pane the stages render into. The old single-column note
                         in §6 predates that change.
    onboard/
      places.js             Google Places integration: US-only rental classifier,
                         custom autocomplete, place details (lock-on), iterative-
                         radius competitor radar, national-chain detection, DARK
                         graphite map skin (MAP_STYLE + MAP_BACKDROP). Every
                         function degrades to a safe empty/false with no Maps
                         key — see §7.
      plan.js                THE SOLUTION ENGINE. Per-leak fixes mapped to documented
                         mechanisms, which leaks each path can actually close (and
                         so what each leaves leaking), the 60-day sequence, the
                         desk qualification gate, the recommendation. This is where
                         the business docs are encoded. See §5b.
      crawler.js             Apify website-content-crawler wrapper. Requests
                         saveHtml because a tracking tag is a script reference and
                         a text-only crawl discards it. Chat/booking detection is
                         vendor script signatures, not keywords.
      reviews.js             Apify google-maps-reviews-scraper wrapper — ~150 reviews
                         so the report shows a real aggregate instead of
                         extrapolating from the 5 the Places API returns.
      capture.js, follow.js  small helpers for the footprint screenshot capture
                         and the marketing-channel follow-up question.
  public/                 static assets (favicon, equipment/segment imagery)

common/                   shared with the Convex backend — imported unmodified
                         by both `frontend/` and `services/convex/`. Nothing
                         here imports anything from `frontend/`.
  segments.js              the 8-segment taxonomy (§3)
  leaks.js                 the leak math engine — conservative formulas, leak score
                         /25 with the doc's own four bands. See §5. It no longer
                         recommends an offer; that moved to plan.js. Imported by
                         `services/convex/runs/resolve.ts` (AD-11) so the SPA and
                         the backend re-price off one engine.
  footprint.js             THE DIGITAL FOOTPRINT (§7b). Pure functions, no network:
                         classifyWebsite() resolves what Google's website field
                         actually points at; scoreProfile() is the 9-check GBP
                         completeness card; detectTrackers() finds Facebook Pixel,
                         GTM, GA4, Google Ads and retired UA over raw markup.
                         EVERYTHING here is tri-state — read §7b before editing.
  enrich.js                shared interpretation of provider output (reviews,
                         crawl) — the one reading both the browser and the
                         Convex enrichment actions use.

services/convex/         the Revive Agent backend (§12) — schema, core,
                         adapters, runs, scheduler, http.ts. See §12 for the
                         full breakdown.
services/form-probe/     stateless Playwright container (AD-12) + Dockerfile.

../docs/planning/         planning artifacts (§12): the Revive Agent PRD and the
                         architecture spine + data model. Not shipped code.
../voltbot/                a SEPARATE product — VØLTBOT, a fitness-industry audit
                         tool (React/Vite/Convex), vendored as a design
                         reference (it doesn't build in this repo). Originally
                         "studied but never imported"; that is no longer true.
                         `frontend/src/onboard/crawler.js` and `reviews.js` were
                         adapted from it (4cd7f64), and `common/footprint.js`
                         ports its buildListingChecks() GBP scorecard
                         (`../voltbot/frontend/src/App.jsx:2249`) with thresholds
                         re-cut for machinery yards. Its CONTEXT.md is thorough —
                         and `../voltbot/CONTEXT.md:205` records the fabrication
                         bug that §7b exists to prevent.
../business/               the founder's confidential commercial docs (§1) —
                         not shipped code, not referenced by any import.
```

### The scan's phase model (inside `frontend/src/onboard.js`)
```
ENTRY
 ├─ ?pid=<placeId>&n=<name>  → bootSplash() → placeDetails() → enterApp()
 │                              (landing hand-off, no gate shown at all)
 └─ direct visit              → renderGate() → bootGate()
                                 (search box; Enter with no pick = manual)
      ↓
APP SHELL (enterApp) — TWO-PANE. stage-left = thread + dock, stage-right =
the artifact pane the stages render into (see §6; the old single-column
note there predates 07a71dd/83f7a72).
  stage = topbar / thread (transcript only) / dock.
  topbar = logo · the yard being scanned · Exit · a progress hairline.
  The 5 ACTS are gone from the UI; they survive only as `act:` tags
  grouping the step graph.
  dock  = #composer (the current question's widget) + meter strip.
  The meter strip opens a bottom SHEET (buildSheet/setSheet) — the one
  and only home for the live leak metrics.
      ↓
QUESTION GRAPH (STEPS[], runner = runStep()) — acts: yard → market → numbers → leaks → verdict
 ├─ 'lockon' stage    — map pin + GBP card, phone CONFIRMED not asked cold
 ├─ 'reviews' stage   — deep review pull (Apify), sentiment density, keyword
 │                      highlighting. Skipped when Places returned no reviews.
 ├─ 'website_audit'   — THE DIGITAL FOOTPRINT (§7b): GBP completeness card,
 │   stage               website-field classification, marketing tags, screenshot.
 │                      Skipped only for manual (non-Google) yards — a yard with
 │                      NO website still runs it, because that is a finding.
 ├─ segments (multi)  — 8-card grid, multi-select
 ├─ primary           — skipped if only 1 segment picked
 ├─ fleet (multi)
 ├─ fleetSize
 ├─ 'radar' stage     — competitor sweep, skipped if no Maps/manual entry
 ├─ rivals (multi)    — chips from REAL radar names, or free-text if no radar
 ├─ whyTheyWin (multi)
 ├─ inquiries, channels (multi)
 ├─ marketing         — "are you actively marketing the yard?" 3 bands
 ├─ marketingChannels — 9 mediums, multi; SKIPPED if the answer was no
 ├─ marketingWorks    — which medium earns its keep. Options are built from
 │                       his own picks + "none of them"; when only ONE medium
 │                       is running the question becomes "is it working?"
 │                       instead. Skipped if no marketing / no medium picked.
 ├─ ticket, closeRate, team
 ├─ missedCalls, afterHours, quoteSpeed, quotePile, quietAccounts, outbound
      ↓
FINALE (finale())
 ├─ cookingOverlay()  — "QuickyQuotes" full-screen assembly theater, built from
 │                       the OWNER'S OWN DATA (not generic loading copy)
 ├─ reveal            — THE NUMBER ONLY. No per-leak bars: that breakdown used
 │                       to be repeated here and it was the clutter complaint.
 ├─ renderSolution()  — the answer. See §5b.
 ├─ renderReport()    — the arithmetic + the ledger's one home, THEN:
 └─ sendForm()        — "where should I send it / who's it addressed to" —
                          asked LAST, on purpose (see §2 round 2 ask)
```

Every answer is stored in a flat `state` object and re-editable: click
any answer-pill (the pencil is the whole affordance — there is no "Edit"
label) to reopen that step's widget. Editing a `structural` step
(segment) truncates and re-asks everything downstream. Editing a
non-structural step after the report exists calls `refreshVerdict()`
which re-cooks nothing (cooks once, `state._cooked` guard) but
re-renders reveal+report+send with fresh math.

**Three step-graph mechanisms worth knowing before you add a question:**

- `skip(state)` — the step is passed over. Cheap, and the only thing
  needed when a question simply does not apply.
- `structural: true` — an edit wipes and re-asks **everything**
  downstream (`truncateAfter`). Right for `segments`, far too blunt for
  anything else: it would throw away the five leak answers.
- `invalidates: [ids]` — an edit drops just those answers (state, row,
  `answeredSteps`) and re-enters the runner at the earliest of them.
  Use this for a local dependency. `marketing` invalidates its two
  follow-ups, `marketingChannels` invalidates `marketingWorks`.

That last one works because **`runStep` walks over steps that are
already answered** as well as skipped ones, so re-entering the graph
part-way asks only what is actually open and then flows forward to the
finale. Don't remove that condition — the dependency drop, and any
future partial re-ask, depends on it.

`resetStep(id)` is the single place that knows how to un-answer a step
(arrays back to `[]`, `closeRate` to null, `primary` recomputed from
`segments`, the radar cache deliberately kept). Both `truncateAfter` and
the `invalidates` drop go through it — if you add an array-valued step,
add its id to `ARRAY_STEPS` or an edit will leave a string where a list
belongs.

**The reach block is intake, not math.** `03-MISSED-RENTAL-AUDIT` §5–§6
define the leak score and the recovery formula, and marketing is not an
input to either. The answers go into the payload under `reach` and into
one sentence in the report's market panel (`reachSummary()`) — they must
never move the meter. Verified: the monthly figure is identical whether
the owner markets heavily or not at all.

---

## 5. The leak math (`common/leaks.js`)

Every number shown to the owner comes with the arithmetic that produced
it, rendered as a readable string in the report table. This is
deliberate — per `02-INDUSTRY-LANGUAGE-GUIDE`, the buyer has been
burned by agencies selling vague "leads" before; an unauditable number
reads as a sales trick.

Five leaks, each scored 0–5 (25 total, per `03-MISSED-RENTAL-AUDIT`'s
leak-scoring table):
1. Missed calls — `missed/wk × 4.33 × after-hours-weight × reachable% × close% × ticket`
2. Slow quotes — `quotes/mo × lag-loss% × winnable% × ticket`
3. Quotes going cold — monthly flow leak + a separate one-time "standing
   pile" number (what's sitting on the shelf today)
4. Quiet accounts — `lapsed × reactivated% × ticket ÷ 12`
5. No outbound — `missed local projects/mo × close% × ticket`

`ASSUMPTIONS` (the only invented numbers, held deliberately low and
printed in the report): reachable 45%, winnable 50%, revivable 8%,
reactivated 12%, quoteRate 80%.

Bands now use `03-MISSED-RENTAL-AUDIT` §5's own four readings: ≤7 low
urgency, ≤14 starter fit, ≤20 managed sprint fit, 21–25 desk candidate.
`recommendOffer()` was **deleted** from this file — offer selection is
`plan.js`'s job now.

---

## 5b. The solution engine (`frontend/src/onboard/plan.js`)

The scan used to end by showing the leak twice — a reveal with bars, then
a table with the same five numbers. The user's words: *"nothing
significant is revealed actually, it just repeats that leak card."*
Correct. A diagnosis is not an answer.

`buildSolution(L, state)` produces the five outputs
`03-MISSED-RENTAL-AUDIT` §4 actually specifies, plus §7–§8's two-path
close:

1. **Biggest leak** — already ranked by the leak engine.
2. **Monthly opportunity** — already computed.
3. **Fastest fix** — the biggest leak whose fix is live in week one.
   Chasing a pile pays more, but it cannot start until intake stops
   refilling it, so week-one fixes win the tiebreak.
4. **Recommended offer** — leak-score band, then the desk gate.
5. **Next step** — the `04-MYSTERY-CALL-SOP` real-world check.

**The load-bearing idea, and the thing not to break:** `FIXES[].self`
records whether the self-managed starter can close each leak. It is not
a judgement call — `11-LOW-TICKET-DOWNSELL` §11 excludes *human quote
follow up*, *missed call management* and *customer reactivation*, so
three of the five leaks are structurally uncloseable on the cheap path.
That lets the UI say, in the owner's own dollars: this path recovers
$X of your $Y, and leaves $Z still leaking, and here is exactly which
leaks those are. It is a real decision aid rather than a sales device,
and it is why `00-BUSINESS-PLAN` §15.1 ("do not discount the managed
sprint — downsell instead") can be honoured without hand-waving.

The **desk gate** renders `00-BUSINESS-PLAN` §9's six criteria against
the owner's answers, met and unmet both shown, ≥3 required. A score of
21+ with a failing gate recommends the sprint and *says why* — the docs
are explicit that the desk is only sold after a sprint proves the number
(`08-SPRINT-DELIVERY-SOP` §9).

The **60-day sequence** is `08-SPRINT-DELIVERY-SOP` §3 with the owner's
pile count dropped into it.

Doc citations live in code comments **only** — never in customer-facing
strings. One leaked into the UI during this build ("00-BUSINESS-PLAN §12
is blunt that…") and was caught in visual review. Check for that.

---

## 6. Design decisions worth knowing before you touch the UI

**The design language is "liquid glass, industrial"** (2026-07-28
redesign, references: Apple, Palantir, owner.com). Three rules, stated
at the top of `onboard.css` and worth keeping:

1. *No hard borders.* Depth is layered shadow (tight contact + wide
   ambient) plus a light top edge. The `--sh-1..4` ladder exists for
   this. A 1px line is only ever a divider **inside** a surface.
2. *Glass needs something to refract.* `body::before` paints a warm
   ambient mesh; translucent panels pick colour up off it. Remove the
   mesh and every blurred panel turns grey.
3. *The data is the brightest thing.* Chrome recedes into muted mono
   labels (`.lab`, `--mono`); figures get the weight and tracking.

**The header is four things. Keep it that way.** `logo · the yard being
scanned · Exit · one hairline of progress` — and nothing else.

It got there in two cuts. First a 250px left rail was removed (*"the
left panel looks shit"*): it spent a quarter of the width on three small
things and sat beside the glass panels as a slab. Its contents moved
into a two-row header. Then that header was cut down again (*"less is
more, declutter the unwanted elements which looks ai slop, mostly on
header"*), and the second cut is the instructive one. What went, and
why:

- **The agent badge** — a mark sitting inches from the actual logo. Two
  brand marks in one row.
- **"RentalRevive Desk"** — the wordmark spelled out next to the
  wordmark.
- **The live status line** ("● WAITING ON YOU", "● TYPING") — the single
  sloppiest element. The thread already shows typing dots; a second,
  permanent status readout is decoration pretending to be telemetry.
  `setStatus()` and its plumbing were deleted, not hidden.
- **"● LOCKED ON" + the rating** — a label and a pulsing dot to
  introduce a business name, plus a star rating already sitting in the
  lock-on card below.
- **The five-segment stepper with five mono labels** — duplicated both
  the composer hint ("Leak 3 of 5 · the open pile") and the thread's own
  phase lines. Now one hairline along the header's bottom edge, red
  while running, green at 100%.

The test that catches this class of thing: for each element, name what
the user learns from it that nothing else on screen already tells them.
Three of the five above failed outright and two were duplicates.

**The reply is docked, and that is the whole point.** Question widgets
render into `#composer` at the bottom of the stage, never inline in the
transcript. Before this, every answered step left a dead options grid
behind it and the input jumped down the page on each turn — the "when
multiple prompts come and the option is selected it's actually looking
ugly" complaint. The transcript now holds only conversation: bot
bubbles, artifacts, and the owner's answers as right-aligned pills that
reopen that step in the dock when clicked. `swapComposer()` crossfades
between questions so the dock itself never moves.

**Metrics appear exactly twice, by design.** The live meter (dock strip
→ bottom sheet) and the report's math table. There used to be three
renderings of the same five figures — right-hand HUD, reveal bars,
report table — which is what "consolidate the metric cards, avoid
repetition and clutter" was about. The right-hand HUD pane is gone
entirely; the shell is two panes now. **Do not add a third.**

**`.thread` has 88px of bottom padding on purpose.** The dock casts a
64px fade scrim upward. With less padding the last bubble lands inside
the scrim after every auto-scroll and reads as half-erased.

**Chat jitter (fixed, don't reintroduce it).** The first typewriter
implementation grew the bubble character-by-character, reflowing the
thread on every tick and fighting the smooth-scroll — that was the
"jittery" complaint. The fix in `typeBubble()` (onboard.js) renders the
bubble at its **final size in one frame** — every word already occupies
its layout space at `opacity:0` — then fades words in on a stagger via
CSS `animation-delay`. Reads as typing, zero reflows. Never go back to
incremental `textContent +=` typing.

**The gate is a search box, not a form.** Round 3 explicitly rejected
asking for name/email/phone/city before the scan starts. The ONLY input
on the gate is the business-name search. The manual fallback (no Maps
key, or no listing found) is the same box: type the name, hit Enter.
Phone is asked in-thread and pre-filled from Places data as a
yes/no confirm, not a cold text field, when available.

**Landing hero has no email capture anymore.** It was replaced with the
same business search (`#yardSearch` in index.html, wired in
`main.js`). Picking a suggestion navigates to
`/onboard.html?pid=<id>&n=<name>` which shows a one-second lock-on
splash and skips the gate entirely — no re-typing on the next page.

**Visual scale is "voltbot, actually" not "voltbot, vibes."** Round 3's
correction was specific: study `../voltbot/frontend/src/App.jsx` (`SearchBox`,
`Typewriter`, `loadScript`) and `../voltbot/frontend/src/App.css` (`.search-shell`,
`.search-box`, `.suggestions`, `.hero h1`) before rebuilding, then
better it. The gate's 92px search box, blurred hero-photo backdrop with
a directional light wash, and 72px suggestion rows all trace directly to
those voltbot measurements, restyled to RentalRevive's warm-paper/red
palette instead of voltbot's dark/gold one.

**Landing redesign takes owner.com's architecture, not its palette.**
Centered hero (not split hero/photo grid), the product UI itself as the
hero visual instead of a stock photo, an honest dark stat-strip under
the hero (real offer mechanics: $0 to start, $200/rental, 48hr audit —
never invented customer results), and numbered 3-step how-it-works
cards. Brand colors, type, and copy voice stayed RentalRevive's own.

**Never fabricate results or stats.** Per `README.md`'s existing rule
and reinforced throughout: the hero demo panel, the sample-audit card,
etc. are all explicitly labeled "illustrative" / "demo math only." No
invented client outcomes anywhere on the site.

---

## 7. Google Places integration (`frontend/src/onboard/places.js`)

- **Classifier** (`classifyRental`) — regex allow-list of real heavy-
  machinery terms + hard-block list of adjacent rental verticals (cars,
  party/event, storage, property, moving, RV, tuxedo, baby rentals,
  restaurants, schools, churches / worship, etc). Returns
  `'yes' | 'no' | 'maybe'`, but the autocomplete dropdown only displays
  `'yes'` results. Manual Enter is the escape hatch for real yards Google
  labels too generically. An E2E run caught "Party Time Rentals"
  slipping through on a keyword search — the negative list was tightened
  to standalone `'party'`/`'bounce'`/`'karaoke'` tokens as a result. If
  you extend this list, re-run the E2E (§9) — it's the regression net.
- **Search** — custom `AutocompleteService` call (not Google's stock
  widget), restricted to `country:us`, `types:['establishment']`,
  classified and sorted, capped at 7.
  As of 2026-07-28, autocomplete classification must use the business
  name and returned place types, not the full prediction description.
  The full description includes city/street text, which caused false
  crane tags for unrelated businesses located in places named "Crane."
  Opaque `maybe` predictions are not shown in the dropdown; users can
  still press Enter to run the manual path for real yards Google labels
  too generically. Search also runs a fallback autocomplete query with
  `" equipment rental"` appended when the user's input does not already
  include a rent/rental word, which recovers listings like "Texas First
  Rentals" that Google sometimes hides on the bare business-name query.
  If the user's input itself contains a hard-blocked vertical such as
  "church", the fallback is skipped so a search like "church crane tx"
  does not surface unrelated equipment yards.
- **Autocomplete tags** — `rentalTag()` labels accepted suggestions with
  a more specific operator-facing tag instead of "Unverified": Crane
  rental, Heavy equipment rental, Aerial rental, Earthmoving rental,
  Forklift rental, Tool rental, Power rental, Roadwork rental, Site
  services, Equipment dealer, or Rental yard. `crane service` is an
  accepted positive phrase and tags as Crane rental. Known brand/name
  support includes Texas First Rentals and similar heavy-rental yards.
  Avoid broad rules like `\w+ rentals?`; that let in false positives such
  as baby rentals.
- **Rental-adjacent categories** — after the 2026-07-28 autocomplete
  tuning, support hardware/tool/rental-adjacent searches without opening
  the floodgates: positive language includes Equipment rental agency,
  Hardware store, Tool store, Crane service, equipment rental, tool
  rental, construction/contractor/industrial/machinery rental, crane,
  lift, forklift, construction equipment supplier, equipment supplier,
  material handling equipment, generator rental, temporary power, pump
  rental, compressor rental, trench safety / trench shoring, scaffolding,
  concrete/asphalt/road equipment, traffic-control / barricade rental,
  portable restroom, storage container, office trailer, machinery dealer,
  equipment dealer and tractor dealer phrases. `hardware_store` and
  `home_goods_store` are treated as supporting Google API types when the
  user's query has rental/equipment/tool/hardware intent. Do not treat
  broad `store`, `point_of_interest`, or `establishment` as sufficient on
  their own; that previously admitted irrelevant service businesses.
  Hidden fallback autocomplete queries now include equipment rental,
  heavy equipment rental, construction equipment rental, tool rental,
  hardware store equipment rental, crane service/rental, aerial/boom lift
  rental, forklift rental, generator rental, compressor rental, pump
  rental, trench shoring rental, scaffolding rental, concrete equipment
  rental, traffic-control rental and storage-container rental variants.
  Note: Google Places legacy JS returns broad API types; richer Google
  Business Profile category labels like "Equipment rental agency" are not
  reliably exposed in autocomplete. This is why the local taxonomy and
  fallback queries are load-bearing.
- **Lock-on** — `placeDetails()` pulls rating, reviews, address, phone,
  website, city/state via `getDetails`.
- **Radar** — `radarScan()` sweeps `nearbySearch` at 24km then widens to
  50km (the API's ceiling) if fewer than 8 competitors found. Keywords
  rotate per the picked segments (`SEGMENT_KEYWORDS`). Tags national
  chains via a ~40-name list (`isNationalChain`).
- **No-key / no-listing degrade path is load-bearing, not an
  afterthought** — `loadMaps()` resolves `false` (never rejects) when
  `VITE_GOOGLE_MAPS_KEY` is unset, and every consumer checks `mapsUp()`
  before touching `google.maps`. The whole scan must complete end-to-end
  with zero Maps key — this is tested (§9).
- **Maps key alias**: as of 2026-07-28, `loadMaps()` accepts either
  `VITE_GOOGLE_MAPS_KEY` (RentalRevive's documented name) or
  `VITE_MAPS_API_KEY` (VØLTBOT parity). If autocomplete appears dead,
  check that one of those browser env vars is present in the Vite build.
- **Map skin is DARK now** (`MAP_STYLE` + `MAP_BACKDROP`, 2026-07-28).
  It used to be cream-on-cream to match the warm paper palette, and the
  user's read was exact: *"the map colors look washed out, it blends
  with the background, nothing realistically happening."* The map
  dissolved into the page and the pins had nothing to sit against.
  Now: graphite base, roads lifted just enough to read as a grid, water
  cold and dark, and the whole colour budget spent on markers — self
  `#FF3B41`, national `#FF8A8E`, independent `#46C46E`. The radar also
  has a real rotating sweep arm (`.rad-sweep`, a conic gradient) rather
  than only expanding rings. If you re-skin, keep the map darker than
  the page or the pins stop reading.
- **Radar fallback**: `radarScan()` still starts with the iterative
  nearbySearch sweep, but when rural/sparse markets return too few yards
  it now does a small textSearch fallback around the locked city/state.
  Competitor pins render visible inline labels for the yard plus the
  first few rivals, so a working scan looks pinned rather than like
  anonymous map dots.
- **Live autocomplete regressions checked 2026-07-28** — with the
  copied VØLTBOT Maps key in root `.env.local`: `texas first rental`
  returns Texas First Rentals locations tagged Heavy equipment rental;
  `church crane tx` returns no suggestions; `crane service` returns
  actual crane-service businesses tagged Crane rental; `hardware store`
  returns hardware/tool-store candidates tagged Tool rental; `tool store`
  returns tool/rental-center candidates; `forklift rental`, `generator
  rental`, `aerial lift rental`, and `trench shoring rental` surface
  relevant rental/service businesses; `baby rental` returns no
  suggestions. Re-test these exact queries after touching
  `frontend/src/onboard/places.js`.

---

## 7b. The digital footprint (`common/footprint.js`)

Three questions about how a yard shows up online, answered from data the
scan already pays for. Added 2026-07-29.

**1. What the `website` field actually points at.** `classifyWebsite()`
resolves it to `site` · `social` · `linkhub` · `marketplace` · `none`. This
matters more than it sounds: a yard whose Google profile links a Facebook
page **has no quote path at all** — the customer must message and wait,
there is no form, no after-hours route, and nothing instrumentable. That is
a finding, so the `website_audit` stage no longer skips when the field is
empty or social. It used to (`skip: !s.place.website`), which meant the
worst-off yards got the least scrutiny.

**2. GBP completeness.** `scoreProfile()` runs nine checks — name, address,
phone, website, opening hours, categories, photos, rating, review volume —
and reports a percentage of *measured* checks. Ported from voltbot's
`buildListingChecks()` with thresholds re-cut in `PROFILE_THRESHOLDS`
(10 photos, 25 reviews, 4.0 rating). The originals were gym numbers (50
reviews, 4.2 stars); scoring an industrial yard on them manufactures a
failing grade. **These thresholds are guesses** pending a real metro sweep.

`placeDetails()` now requests `opening_hours` and `photos` for this. Both
sit inside Places SKU tiers that call already pays for, so neither adds a
billing tier. `opening_hours` is also what the competitor-hours comparison
in the Revive Agent PRD depends on.

**3. Marketing tags.** `detectTrackers()` finds Facebook Pixel, Google Tag
Manager, GA4, Google Ads conversion and retired Universal Analytics, with
the tag id where present, over raw markup. This is why `crawler.js` sets
`saveHtml: true` — a tag is a script reference, and the text-extraction
crawl it used before discarded exactly that. The framing to keep: the
finding is not that pixels are virtuous, it is that a yard with no
analytics and no retargeting **cannot see its own leak**, which is why it
has to take a stranger's word for it.

### The rule: tri-state, and `null` is not `false`

Every signal in this module is `true`, `false`, or `null`. `null` means we
could not look, renders as **"Not measured"**, and counts toward neither
side of the completeness score.

This is not fussiness. Two products have now shipped the opposite bug:

- Voltbot had a fallback injecting `facebookPixel: detected: true` and
  removed it (`../voltbot/CONTEXT.md:205`).
- This codebase's `crawler.js` had a `simulateAudit()` returning a
  hardcoded "no booking, no chat, has a contact form" whenever
  `VITE_APIFY_TOKEN` was unset — and the chat then told the owner
  *"I scanned your site."* A fabricated claim about the customer's own
  business, in a product whose entire pitch is auditable numbers. Removed
  2026-07-29.

**If you add a signal here, it is tri-state or it does not ship.** When the
crawl fails, say so; do not guess on the owner's behalf.

---

## 8. Copy rules (from `02-INDUSTRY-LANGUAGE-GUIDE`)

Binding on any new customer-facing copy in either the landing page or
the scan:

The full table, verbatim from `02-INDUSTRY-LANGUAGE-GUIDE` §1:

| Never say | Say instead |
|---|---|
| AI chatbot | Quote intake assistant |
| Lead scraper | Local project intelligence |
| Automation | Follow-up workflow |
| Funnel | Quote path |
| SaaS | Self-managed starter system |
| Appointment setter | Rental conversation starter |
| Customer acquisition | More qualified rental conversations |
| Website redesign | Fleet page and quote path improvement |

**QuickyQuotes** (§3) — never "instant final quote", "AI prices every
lift", "automated engineering", "guaranteed exact quote", "no human
needed". Say: preliminary estimate, budgetary range, rental-team-ready
quote brief, complex lift routed to manual review, owner-approved
pricing rules, faster first response.

**Project Radar** (§4) — never "scraped leads", "guaranteed customers",
"fresh buyers ready to book", "we will get you 25 hot leads". Say: local
project signals, construction project intelligence, filtered
opportunities, permit and project activity, outreach starting points.

`07-RESCUE-AND-DESK-AGREEMENTS` §11 requires this disclaimer on every
preliminary estimate the product ever shows a customer: *non-binding
budgetary estimate based on information provided; final pricing subject
to equipment availability, jobsite access, ground conditions, lift
radius, permits, rigging, travel, engineering and final approval by the
rental company.* Not yet surfaced anywhere in the UI — the scan does not
quote, but anything that does must carry it.

And the rule that governs all of it, stated at the top of every source
doc: **sell recovered rental conversations and booked revenue — never
AI, bots, websites or software.**

---

## 9. Verification method (repeat this pattern for future changes)

Working directory for every command in this section: `rentalrevive/`
(the repo root has no `package.json`).

**2026-07-29 — the finale bug, and how it was caught.** `finale()` called
`thread.appendChild(report)` where the element it had just built was named
`reveal`; `report` was undefined in that scope, so the function threw a
ReferenceError and the scan rendered *nothing* after the cooking overlay —
no number, no plan, no report, no send form. It arrived in merge commit
`3ae6fa0` ("accept theirs for conflicts") along with a duplicate send-form
block from a pre-`ed1fb8c` revision, and `npx vite build` passed the whole
time because a ReferenceError is a runtime event.

It was caught by *driving the app*, not by reading it. The pattern worth
repeating — a headless Chromium run against `vite preview`, `reducedMotion:
'reduce'` to zero out the typewriter and every `wait()`, answering whatever
widget the dock presents by inspecting `#composer`, then asserting each
finale stage appears in turn:

```js
// launch with the preinstalled browser; do NOT run `playwright install`
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
// and always attach these two, or a thrown error looks like a timeout:
page.on('pageerror', ...); page.on('console', ...)
```

Both passes should be run after touching the finale: worst-band answers
(exercises the fastest-fix branch and the desk recommendation) and
best-band answers (all leaks zero, `S.fastest` null, audit-pack
recommendation). Then click an answer pill and confirm `refreshVerdict()`
leaves exactly one `#reveal` / `#solution` / `#report` / `.send-form`.
`ERR_CONNECTION_RESET` on Google Fonts is expected in a sandbox and is not
a code error.



No Playwright is installed as a project devDependency. Rebuild the
harness in the scratchpad each session — it is two files, `stub.js`
(the deterministic `google.maps` stub) and `e2e.js` (the driver):

```bash
# scratchpad, not in the repo
cd /tmp/claude-0/-home-user-quotes/<session>/scratchpad
npm init -y && npm i playwright-core   # chromium is pre-installed at
                                          # /opt/pw-browsers/chromium — never
                                          # run `playwright install`
```

Two things get verified on every UI change:
1. `npm run build` (from `rentalrevive/`) — must stay clean.
2. A headless E2E script (`e2e.js` in that scratchpad). Two passes: one
   with `window.google.maps.*` stubbed for a deterministic run, one with
   the stub removed for the no-Maps fallback. It drives: search →
   classified suggestions → lock-on → phone confirm → multi-select
   segments/fleet → radar → rivals from real names → the five leaks →
   cooking → reveal → solution → report → send-form → edit-an-answer →
   mobile viewport. Selectors target `#composer` for widgets, since the
   reply lives in the dock now, not the transcript.

   **Known gap:** the landing→scan hand-off (`?pid=…` → `bootSplash()`)
   is not covered by either pass. If you touch that entry path, add a
   third pass rather than assuming it still works.

Screenshot key moments with Playwright and `Read` them back — this
caught the H1 wrapping to 3 lines and the classifier gap that shipped in
round 2, and in the 2026-07-28 redesign it caught the last bubble
sitting inside the dock's fade scrim, a malformed "4 of 3 criteria met"
count, and an internal doc citation leaking into customer copy. **None
of those three were visible from a green build.** Don't skip visual
review.

Two environment notes for the E2E:
- `fonts.googleapis.com` is blocked by the sandbox proxy, so screenshots
  render in a fallback font and one `ERR_CONNECTION_RESET` always
  appears. Filter it, or you will chase a non-bug. Judge layout, colour
  and spacing from the shots — not exact type rendering.
- The Maps stub only needs the surface `places.js` actually touches:
  `Map`, `Marker`, `InfoWindow`, `LatLngBounds`, `LatLng`, `SymbolPath`,
  `Animation`, and `places.{AutocompleteService, AutocompleteSessionToken,
  PlacesService, PlacesServiceStatus}`. `loadMaps()` resolves true if
  `window.google.maps.places` already exists, so injecting the stub via
  `addInitScript` is enough. There is a haversine fallback for distance
  when `geometry` is absent, so the stub can skip it.

The E2E must also assert the two things unit tests cannot: that editing
an answer after the plan exists **moves the verdict number**, and that
the solution **re-renders at the depth the owner had reached** rather
than demoting him back to the teaser reveal.

### 9b. The chat-repeat class of bug — assert against it every time

The 2026-07-29 pass fixed a round of glitches that all shared one shape:
**the runner got entered twice, and the transcript said everything
twice.** They shipped in `b0bb324` and were invisible to the build.

Four invariants now hold the flow together. If you touch `runStep`,
`mountWidget`, `botSay` or any widget, re-check them:

1. **One commit per widget mount** — `mountWidget` latches `committed`.
   Every widget hands its commit to a button, and a button can be
   clicked twice; `bandSelect` even waits 190ms before firing, which is
   a wide-open window. `multiChips` had literally registered its `done`
   handler twice, so a *single* click double-committed.
2. **`botSay` is idempotent per row** — it returns early if the row
   already holds a `.bubble`. Re-entering a step must never re-type its
   prompt.
3. **`enterApp` boots once** (`appStarted`). Enter pressed twice at the
   gate used to build two shells and run two runners into two threads.
4. **An edit borrows the dock and hands it back** — `awaitingStep`
   tracks the question whose widget is live. Committing an edit while a
   later question was pending used to clear the composer and never
   remount it: the scan stranded with an empty dock, dead forever.

Also fixed in the same pass: `finale()` appended an undefined `report`
(a `ReferenceError` that killed the entire ending — no reveal, no
solution, no report) and carried a stray duplicate of the report's
closing ask, so the owner was asked where to send it twice and got a
second send-form wired to `sendForm(L)` without `S`, which would have
thrown inside `buildPayload`.

The E2E driver for this: walk the whole no-Maps path clicking every
widget, then read back
`[...document.querySelectorAll('.row')].map(r => [...r.querySelectorAll('.bubble')].map(b => b.innerText))`
and assert **no line appears twice**. Run it a second time
double-clicking every commit control. Both passes must end with
`#reveal`, `#solution`, `#report` present and exactly one `.send-form`.
Before trusting the assertion, confirm it is sensitive — run it against
the previous commit and watch it fail.

Preview server gotcha: `(nohup npx vite preview --port 4173 &)` in a
plain `Bash` call gets killed when the tool call returns. Use
`Bash(..., run_in_background: true)` for the preview server specifically.

---

## 10. Deploy checklist (not done — needs a human)

1. **`VITE_GOOGLE_MAPS_KEY`** — Maps JavaScript API + Places API enabled,
   HTTP-referrer-restricted to the production domain. Without it the
   whole app still works (manual path) but with no autocomplete/lock-on/
   radar.
2. **`VITE_AUDIT_ENDPOINT`** — the scan's send-form and the landing
   page's audit form both POST JSON here. Currently shows a graceful
   "not connected yet" message with no endpoint set.
2b/2c/2d. ~~`VITE_APIFY_TOKEN` / `VITE_THUM_IO_KEY` deploy requirements~~ —
   **RESOLVED 2026-07-30 (AD-13):** these must NOT be set as `VITE_`
   variables. Deep review pull and site crawl now run server-side via
   Convex actions (`services/convex/enrichment/{reviews,crawl}.ts`) behind
   `APIFY_TOKEN` / `THUM_IO_KEY` (plain Convex env vars, set with `npx
   convex env set`), not client-visible `VITE_` names. See §11's Open
   threads entry below and `RUNNING.md` ("Never set these as `VITE_*`
   variables") for the live checklist and the token-rotation warning — if
   a bundle containing either old `VITE_` secret was ever published,
   rotate both tokens; deleting the variable does not un-publish it.
   Only the Maps key belongs client-side, because it is referrer-restricted
   and quota-capped.
3. **Reconcile `index.html` with the real offer ladder** (see §1). The
   landing page still sells Yard Dog / the Rescue / the Quote Recovery
   Pilot at prices that exist in no document, while the scan now ends on
   the Starter / Sprint / Desk ladder the docs specify. A prospect can
   currently see both. This needs the founder's decision, not a
   find-and-replace, because the landing copy is built around the
   invented "$0 to start, $200 per rental" mechanic.
4. Real-search pass against live Places data once the key is live — the
   classifier and radar keyword lists were tuned against a stubbed
   dataset; real yard names are messier.
5. README.md's pre-existing checklist (contact/legal details, image
   licensing, logo, domain) still applies — never worked on.
6. The `../business/` docs are now committed to a public-by-default
   repo. They contain pricing, margins, scripts and objection handling.
   Worth a decision on whether they belong in the repo or in a private
   one before this ships.

---

## 11. If you're a fresh session picking this up

Working directory for every command below: `rentalrevive/` (the repo
root has no `package.json` — each product owns its own).

1. Read this file fully (you just did).
2. `git log --oneline -12` and skim the commit bodies — they carry
   reasoning that didn't make it here.
3. **Before touching anything customer-facing, read the relevant file in
   `../business/`.** Not this file's summary of it. Every recorded
   mistake in this project — the invented offer ladder, the scan that
   ended without an answer — came from working off a summary. §1 and
   §5b exist because of it.
4. Re-read the current `frontend/src/onboard.js` / `frontend/src/onboard.css` /
   `frontend/index.html` before editing. This doc drifts; the code doesn't.
5. If the ask references voltbot, go read `../voltbot/frontend/src/App.jsx` and
   `../voltbot/frontend/src/App.css` yourself.
6. Verify visually, not just with a green build (§9). Three defects in
   round 4 were invisible to the build and obvious in a screenshot.
7. Keep this file updated when you make a decision future-you would want
   to know about — including the ones that turned out wrong, and why.
   A running log, not a snapshot.

### Open threads, most useful first
- ~~`VITE_APIFY_TOKEN` / `VITE_THUM_IO_KEY` in the client bundle~~ —
  **RESOLVED 2026-07-30 (AD-13):** enrichment moved behind Convex
  actions (`services/convex/enrichment/`); the `VITE_` secrets are deleted from
  the code. **Still rotate both keys** if any bundle containing them
  was ever deployed — deletion does not un-publish them.
- **The leak model has no upper sanity bound.** Driving the scan with the
  worst band at every question produced **$468,293/month — $5.6M/year**
  recoverable. The arithmetic is internally consistent (165 inquiries ×
  top crane ticket × the five leaks compounding), but no independent yard
  believes it is leaking $5.6M a year, and a number nobody believes reads
  as exactly the sales trick §5 says the shown arithmetic exists to avoid.
  Worth a clamp — total leak as a plausible share of implied revenue —
  before this is put in front of anyone.
- **`index.html` vs the real offer ladder** (§1, §10.3) — the landing
  page and the scan currently sell different things. Needs the
  founder's call.
- **`PROFILE_THRESHOLDS` are guesses** (§7b) — photos/reviews/rating bars
  were picked by feel, not from a distribution.
- **The declutter pass only covered the header.** The same test in §6
  would flag the keyboard-shortcut number chips on the option cards and
  the unicode glyphs in the cooking overlay.
- **Landing→scan hand-off is untested** (§9). `bootSplash()` calls
  `enterApp()` on its own path, which now shares the `appStarted` latch
  with the gate — worth covering when that third pass gets written.
- **Re-entrancy invariants are unenforced by anything but review** (§9b).
  They are four one-line guards; a careless refactor drops one and the
  transcript starts stuttering again.
- **Nothing is deployed.** No Maps key, no audit endpoint (§10).

---

## 12. The Revive Agent (foundation built 2026-07-30 — providers not wired)

Added 2026-07-29 as planning; the backend foundation now EXISTS at
`services/convex/`. What is real:

- `services/convex/schema.ts` — all 9 tables from `data-model.md`, real
  validators, every index. The AD-2 outcome enum is closed in code.
- `services/convex/core/` — pure, dependency-free: `outcome.ts` (the
  ours-vs-theirs vocabulary), `windows.ts` (yard-local window
  arithmetic, FR10 caps, FR9 retry placement, DST-safe via Intl),
  `bands.ts` (the single AD-11 measured→band conversion; strings match
  `leaks.js` byte-for-byte, en-dashes included), `verdict.ts` (the FR23
  fold).
- `services/convex/ports/probe.ts` — the AD-1 Probe port. `services/convex/runs/` —
  activation (consent artifact, async-first per AD-15, phone at T+60s),
  the AD-7 dispatch chokepoint, append-only resolution + retries, the
  kill switch, owner-scoped queries with C2 enforced at the query
  layer. `services/convex/scheduler/retention.ts` + `reconcile.ts` +
  `crons.ts` — retention, deadline, and callback-reconciliation (AD-9)
  sweeps — three, not two. `services/convex/scans.ts` — the SPA→backend
  intake seam.
- The verdict re-prices by importing the SPA's own `computeLeaks()`
  from `common/leaks.js`, unmodified — one engine, two input sets.
- 167 tests across 16 files (`npm test`, vitest + convex-test) hold the invariants:
  no probe without live consent, append-only attempts, window caps,
  band recognition through the real engine, kill-then-stand-down,
  no-adapter → honest `aborted` with zero fabricated measurement.
  `npm run typecheck` covers `services/convex/` (SPA stays plain JS).

**Phone channel built 2026-07-30:** `services/convex/adapters/phone/` —
Twilio originates via REST (no SDK), TwiML bridges straight into the
Vapi assistant's SIP endpoint with NO AMD gate (AD-3/AD-4), the
attempt id rides as the X-RR-Attempt SIP header and comes back in
Vapi's report variableValues (correlation verified against provider
docs; exact JSON paths [ASSUMPTION] until a live report). Status
callbacks are the sole ring-timing source; unexplained call failures
default to `undeliverable_ours` — never the yard's miss (NFR7).
Webhook edge at `services/convex/http.ts` (Convex requires the router there,
not the spine's `convex/http/` dir): /webhooks/twilio/voice, …/status,
/webhooks/vapi — all signature-verified (X-Twilio-Signature HMAC-SHA1
tested against Twilio's documented vector; x-vapi-secret constant-time
compared). Caller pool rotates by attempt sequence (NFR5,
TWILIO_FROM_NUMBERS). Recordings copy into Convex storage via
`runs/artifacts.ts`; human-call audio flagged containsStaffVoice (C2).
Env needed to go live: TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBERS,
VAPI_SIP_ADDRESS, VAPI_WEBHOOK_SECRET. The Vapi assistant itself
(FR12 disclosure script, FR13 two questions, FR14 voicemail message,
structuredData: answeredBy/lineCorrect/afterHoursCovered) is
configured in Vapi's dashboard, not in this repo.

**Email + form channels built 2026-07-30:**
`services/convex/adapters/email/postmark.ts` — sent as the persona row
(AD-14), Reply-To `probe+<attemptId>@replyDomain` so Postmark's
MailboxHash correlates replies structurally; RFC-3834 + subject
heuristics keep autoresponders from stopping the clock; hard bounce
= their dead address, every other bounce/spam-complaint = ours.
FR19 debrief sends on run resolution (`runs/debrief.ts`), skips
loudly into auditEvents when unconfigured, never on killed runs
(revoked consent = no more contact). FR18 follow-ups and the
debrief stamp are the ONE sanctioned post-terminal metric write
(`recordEmailFacts`). `services/convex/adapters/form/worker.ts` +
`services/form-probe/` (stateless Playwright container, AD-12,
HMAC-SHA256 both directions): form fills the persona identity with
`probe+<attemptId>@` as contact email, so form replies resolve
through the SAME Postmark inbound pipeline. Captcha =
`blocked_by_target` (yard's friction), Cloudflare challenge =
`undeliverable_ours` — never blurred. Broken/missing form =
`undeliverable_theirs`, the FR22 headline. Screenshots ride base64
in the signed callback (documented deviation from AD-12's
upload-URL letter) and land as artifacts under consent retention.
**Deadline sweep now enforces the NFR7 precondition:** "no
response" is only filed when delivery is a recorded fact (pickup /
delivered event / accepted submission); an answered-but-unclassified
call files `responded`, and anything unconfirmed files
`undeliverable_ours`. Env to go live: POSTMARK_SERVER_TOKEN,
POSTMARK_WEBHOOK_SECRET, FORM_WORKER_URL, FORM_WORKER_SECRET (the
worker needs PROBE_SECRET = same value).

**Dashboard + proof gate built 2026-07-30** (`frontend/src/dashboard/`,
plain JS like the rest of the SPA): `backend.js` boots Convex
(`convex/browser`, dynamic import) + Clerk (CDN, domain derived from
the publishable key) and degrades to null exactly like `loadMaps()` —
with no `VITE_CONVEX_URL` at build time, Vite folds `probeConfigured()`
to a constant `false` and dead-code-eliminates everything behind it.
This is a **build-time exclusion, not a runtime no-op**: building with
the var unset and reading `dist/assets/` shows `gate-*.js` shrunk to 114
bytes in its entirety (`renderProofGate` reduced to `return null`) and
`backend-*.js` with `probeConfigured` folded to `()=>!1` and no
`import('convex/browser')` call left in it; `index-*.js` (containing
`runState`) is the only one that still carries real logic. Practical
consequence: inspecting the built bundle reveals missing Convex config
immediately — the gate code is simply not there.
`gate.js` is the FR1–FR4 activation moment: full FR3 disclosure list
(targets, attempt counts, windows, recording + 30-day retention,
staff-not-warned, hours-not-people, persona name), versioned
disclosure copy (`DISCLOSURE_VERSION`), Clerk sign-in → `saveScan` →
`activate`, then swaps in the live board; `?run=<id>` deep-links
back (also in localStorage `rr_probe_run`). `view.js` is PURE
(runState in, DOM out — every state screenshot-verified from
fixtures): live call hero with climbing ring count (FR29), honest
attempt log (FR24/FR30) where `undeliverable_ours` renders as our
row, never a finding (NFR7), verdict as counts/times/money with the
before→after re-price and substitution table (FR23/FR26),
partial/killed states (FR5/FR33). The measured headline figure is
verdict.repriced from the SERVER — a client-side recompute was
caught in review as a second source of truth and removed (AD-11).
`index.js` owns the subscription, 1s repaint only while a call is
live, kill round-trip, artifact loading (C2-filtered server-side).
Gate mounts in `renderReport()` after the arithmetic; browser tz
stands in for yard tz at saveScan [ASSUMPTION until enrichment].
Client env: VITE_CONVEX_URL, VITE_CLERK_PUBLISHABLE_KEY (+ Clerk
needs a "convex" JWT template and the issuer set in Convex auth).

**Enrichment moved server-side 2026-07-30 (AD-13):**
`services/convex/enrichment/` — `reviews.ts` (Apify deep pull), `crawl.ts`
(saveHtml crawl; interpretation via the shared pure modules
`common/enrich.js` + `footprint.js`, so browser and server read
markup through one set of eyes), `screenshot.ts` (Thum.io, image
copied into Convex storage), all cached on the yards row by placeId
with a 7-day TTL (CO2; only successes cache — a transient provider
failure must not become a week of "no reviews"). Client modules
`reviews.js`/`crawler.js`/`mountCapture` are thin action callers that
degrade honestly when `VITE_CONVEX_URL` is unset; the keyless mshots
screenshot fallback stays client-side. `saveScan` now derives the
yard's timezone from lat/lng via `tz-lookup` — geometry beats the
browser guess (NFR4); the browser tz remains the fallback for manual
yards only. Server env: `APIFY_TOKEN`, `THUM_IO_KEY`.

**FR27 + AD-9 built 2026-07-31:** competitor-hours comparison
(`core/hours.ts` pure coverage math; `enrichment/competitors.ts`
Places Details at activation, `GOOGLE_MAPS_SERVER_KEY`, max 6 lookups;
comparison recomputed in `runState`, rendered in the dashboard verdict
— public listings only, C6 permanent) and the reconciliation sweep
(`scheduler/reconcile.ts`, 15-min cron: lost phone callbacks resolved
from Twilio's own record, never re-dialled; completed = pickup = never
a miss). `scans.getScan` now refuses everyone but the claiming owner
once a scan is claimed. The Vapi assistant's full config contract is
`docs/vapi-assistant.md`.

**Not built yet / needs a human:** CO1/CO3 (deferring paid enrichment
past the average-ticket question is a visible flow change — founder's
call), the leak model's upper sanity clamp (changes customer-facing
numbers — founder's call), the landing-page offer-ladder divergence
(§1), live end-to-end (needs a deployment + provider accounts), and
the three §6-of-SESSION.md blockers (retention number, legal read,
persona clearance). Unconfigured channels still resolve `aborted`
with a diagnosis; nothing simulates. `services/convex/_generated/` is the untyped bootstrap
(generated offline); the first real `npx convex dev` upgrades it.
`RETENTION_DAYS_DEFAULT = 30` in `runs/activate.ts` is [ASSUMPTION]
pending PRD Q1.

The scan as it stands prices the leak from bands the owner taps himself, so
every figure traces back to a guess he made and dies to one sentence: *"I
made those numbers up."* The Revive Agent replaces the guess with a
measurement — after the owner authenticates and authorises it, real
inquiries run against his own counter and the leak model re-runs on
observed inputs. Framing is domain-native: every crane in the yard carries
a **proof load test** certificate; nobody proof-tests the phone.

Artifacts, in reading order:

```
../docs/planning/planning-artifacts/
  prds/prd-quotes-2026-07-29/
    prd.md          41 FRs, 7 NFRs, consent + staff-protection constraints,
                    unit economics (~$0.42-0.96 per completed scan)
    addendum.md     provider cost model, rejected alternatives, copy fragments
    .memlog.md      every decision, with reasons
  architecture/architecture-quotes-2026-07-29/
    ARCHITECTURE-SPINE.md   16 ADs, conventions, stack, diagrams, source tree
    data-model.md           9 Convex tables, indexes, retention chain
    .memlog.md
```

The five decisions most likely to be undone by someone who hasn't read the
docs:

1. **No score.** Output is counts, timestamps and money — never X/10. A
   grade invites an argument about the rubric; a fact does not.
2. **Phone calls disclose themselves on answer.** Which means intake
   quality is deliberately *not* measured — once disclosed, the person
   performs, and grading that is theatre. Only pre-answer facts (rang out,
   rings, voicemail, invalid) enter the report. Async channels (email,
   form) defer disclosure to a debrief, because nobody is waiting and an
   inquiry marked "audit" makes the timer meaningless.
3. **The report indicts the hour, not the human.** No names, no staff
   audio, statements as unattributed pattern. This protects delivery, not
   just feelings — the sprint needs those same people to approve scripts
   and take escalations, and staff who were ambushed kill an
   implementation quietly.
4. **Competitors are never probed.** Urgency comes from public opening-hours
   comparison instead. Calling third parties under false pretences with no
   consent converts a diagnostic into a liability.
5. **"They didn't respond" and "we couldn't get through" are different
   findings** (NFR7, and AD-2 in the spine). A spam-labelled number, a
   cold sending domain, a challenged datacenter IP — each would have us
   hand the owner "proof" that is actually our fault. This is the same
   principle as §7b's tri-state rule, one layer up.

Still blocking, and neither is an engineering call: the recording retention
window (the consent copy cannot be written without a number) and a legal
read on owner-consented recorded AI calls per state.
