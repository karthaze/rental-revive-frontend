# RentalRevive — Site Architecture

Version: August 2026
Companion to [`design.md`](design.md). Source of truth for offer and language: `/QuickyQuotes/RentalRevive/`.

---

## The organising principle, borrowed from owner.com

Owner.com runs **235 URLs** and never feels like a brochure, because of one structural decision:

> **Navigation is grouped by the outcome the buyer wants, never by the feature's internal name — and every capability gets its own page underneath.**

Their four clusters are *Grow online discovery · Grow repeat orders · Grow online sales · Run your restaurant*. Not one of them is called "Features." The footer then repeats the identical grouping, so **the footer is the sitemap**.

We take the same shape. A yard owner does not want "Chat-to-Contract." He wants to stop losing the job to the yard across town. So the clusters are named in his words, and the engine names live one level down where they belong.

**Three rules carried from the doc set into this architecture:**

1. **One CTA per page.** [16 §2.7](../QuickyQuotes/RentalRevive/16-WEBSITE-AND-SCAN-PAGE-COPY-BRIEF.md) — "Two is none." Every page below names its single CTA.
2. **The scan page carries no service price.** The free diagnostic stops converting the moment it sits next to a price.
3. **Every capability page is also the AEO surface.** Specs and process as structured text, never as an image — the same reason the fleet catalogue exists.

---

## Navigation

```
RentalRevive                                    [ Run the free scan ]  ← the one persistent CTA

  The leak            Catch every inquiry     Quote faster        Win back what's yours     Run the yard
  ─────────           ───────────────────     ────────────        ─────────────────────     ────────────
  What's leaking      Never-Missed Counter    The 60-Second Quote  The dead quote pile      Your yard online
  How we find it      After-hours cover       Instant Reserve      The Comeback Engine      Live availability
  The Response Clock  The Voice Agent         Quote Required       Reviews that come back   Paperwork, signed
                      Every channel, caught   Your pricing rules   Your own list, worked    One page a month

  Company                     Resources
  ───────                     ─────────
  Our story                   Guides
  HeyDozr                     Case studies
  Founding partners           The Response Clock report
  Contact                     Downloads
```

**Why "The leak" is its own cluster.** The docs' single strongest insight is *"you cannot feel a leak you never metered."* That is not a feature, it is the thesis — and on a content-rich site it earns a cluster rather than a section.

---

## Full URL inventory

### Tier 0 — the spine (build first)

| URL | Job | Single CTA | Status |
|---|---|---|---|
| `/` | The whole argument in one scroll | Run the free scan | **rebuild** |
| `/scan` | The leak scan itself | *(the scan is the CTA)* | **rebuild** — currently `/onboard.html` |
| `/how-it-works` | Catch → work → your counter books → you count | Run the free scan | new |
| `/the-desk` | The system hub: all 16 engines, grouped | Run the free scan | new |
| `/case-studies` | Proof rail + founding-partner offer | Become a founding partner | new |
| `/heydozr` | The parent brand and what you keep afterwards | Run the free scan | new |
| `/founding-partners` | The cohort offer, terms, what they owe us | Apply | new |

### Tier 1 — capability pages, one per engine

Four clusters × four pages. Each is a real page with its own H1, its own FAQ block, and `Service` schema.

**Catch every inquiry**
| URL | What it is |
|---|---|
| `/catch/never-missed-counter` | Every call the counter can't get to, answered before the next yard picks up |
| `/catch/after-hours` | 6pm, Sunday, lunch rush — the hours the leak actually lives in |
| `/catch/voice-agent` | Picks up when nobody can. **Never prices a lift** — routes it. |
| `/catch/every-channel` | Phone, form, email, text, walk-in — one thread per customer |

**Quote faster**
| URL | What it is |
|---|---|
| `/quote/60-second-quote` | Job described → priced → approved → signed → booked |
| `/quote/instant-reserve` | Scalar equipment: dig depth, working height, transport width. Reserved without waiting on anyone. |
| `/quote/quote-required` | Cranes and lifting. Capacity comes off a load chart, so it goes to **your** estimator with the brief already built. |
| `/quote/pricing-rules` | Your ranges, your minimums, your thresholds. Nothing reaches a customer outside them. |

**Win back what's yours**
| URL | What it is |
|---|---|
| `/recover/dead-quotes` | The pile, worked to a yes, a no, or a logged reason |
| `/recover/comeback-engine` | Accounts that went quiet, revived in your name |
| `/recover/reviews` | Every happy renter asked, at the right moment |
| `/recover/your-list` | Seasonal offers and the "still need that trencher?" nudge |

**Run the yard**
| URL | What it is |
|---|---|
| `/run/yard-online` | A booking page showing what's actually open this week |
| `/run/live-availability` | Buffers, holds, no double-bookings |
| `/run/paperwork` | Quote → terms → contract → on the books, no trip to the counter |
| `/run/response-clock` | The number the whole engagement runs on |

### Tier 2 — segment pages (the SEO engine)

Eight pages, already backed by real data in [`common/segments.js`](common/segments.js) — each segment carries its own fleet list, ticket bands, customer noun and framing lines. This is the highest-leverage content on the site: it is programmatic, it is already written in the yard's own vocabulary, and it maps to how contractors actually search.

`/yards/cranes-lifting` · `/yards/earthmoving` · `/yards/aerial-access` · `/yards/compact-machinery` · `/yards/material-handling` · `/yards/road-concrete-compaction` · `/yards/power-climate-site-services` · `/yards/heavy-haul-specialty`

Each: the leak in that segment's language → the two tracks as they apply → segment-specific FAQ → run the scan.

### Tier 3 — the library

| Pattern | Notes |
|---|---|
| `/guides` + `/guides/[slug]` | The tips-and-tricks pillars from [12-CONTENT-STRATEGY §5.2](../QuickyQuotes/RentalRevive/12-CONTENT-STRATEGY.md): get found · get the call answered · get the quote out · get paid more · scale |
| `/case-studies/[slug]` | One per permissioned yard. Ships empty — see below. |
| `/response-clock-report` | The published mystery-call benchmark. **One activity, two outputs** — the calls we already run for outreach become the industry dataset. |
| `/downloads/[slug]` | Rate benchmark sheet, follow-up cadence template, the six questions |
| `/about`, `/contact`, `/privacy`, `/terms` | Standard |

**Total: 45 pages at full build**, of which 7 are the spine.

---

## The case-study rail, while we have no case studies

The docs are unambiguous: *"No invented wins"*, and the current `#proof` section is correctly hidden behind `display:none` with a comment explaining that **an empty trophy case tells a skeptical owner we have zero clients.**

So the rail ships **as an offer, not as an empty state.** Same `{components.peeking-carousel}` as owner.com's "Trusted by owners", same card geometry — but the cards are unfilled slots that read as scarcity rather than absence:

```
┌─────────────────────────┐  ┌─────────────────────────┐  ┌───────────
│  FOUNDING PARTNER · 01  │  │  FOUNDING PARTNER · 02  │  │  FOUNDING
│                         │  │                         │  │
│  This card is waiting   │  │  This card is waiting   │  │  This card
│  for a real number.     │  │  for a real number.     │  │  for a re
│                         │  │                         │  │
│  Three yards get the    │  │  [ Take this slot → ]   │  │  [ Take t
│  founding terms. Their  │  │                         │  │
│  numbers go here, with  │  │                         │  │
│  their permission.      │  │                         │  │
│                         │  │                         │  │
│  [ Take this slot → ]   │  │                         │  │
└─────────────────────────┘  └─────────────────────────┘  └───────────
```

- Card ground `{colors.surface-card}`, no photo, hairline `{colors.border-hairline}` — visibly a *slot*, not a broken card
- The stat positions stay in the layout, rendered as `—` placeholders, so the eye reads "a number goes here"
- As each yard signs, one grey card is replaced by a real `{components.testimonial-card}`. **The rail gets more credible on a schedule the owner can watch.**
- Slot count comes from the Founding Slot Ledger and must be true on the day — [14 §1.2](../QuickyQuotes/RentalRevive/14-SALES-OPERATIONS-SOP.md).

⚠️ **Perks for founding partners are a commercial decision, not a copy decision.** The doc set already defines the trade — activation waived, lifetime rate lock, in exchange for a filmed testimonial, a documented case study and reference calls. If we are adding a *discount* on top of that, it needs to be set deliberately and written into the annex, not invented on the page.

---

## Where HeyDozr sits

The doc set specifies **two sites** — `rentalrevive.com` books the Scan, `heydozr.com` explains the software and carries the machine-readable fleet catalogue. That stays true. But RentalRevive is *"by HeyDozr"*, and a prospect who never hears the parent brand cannot understand what he keeps at day 90.

So: **one page on this site, plus one line everywhere.**

- `/heydozr` — the software that stays running after the closers walk away. What it is, the two tracks, and what happens at day 90.
- The nav wordmark reads **RentalRevive** with `by HeyDozr` set small beneath in `{colors.ink-muted}`.
- The footer carries the brand line and a link out to `heydozr.com`.
- Every capability page that is actually software rather than labour ends on the same sentence: *this one keeps running after we leave.*

That answers the objection the sales script says closes skeptics — *"what happens when you walk away?"* — before it is asked.

---

## Build sequence

| Wave | Scope | Why here |
|---|---|---|
| **0 — stop the bleeding** | Purge the retired names and the $200 offer sitewide; strip pricing out of `plan.js` | Live prospects are being quoted killed offers today |
| **1 — the spine** | `/`, `/scan`, `/the-desk`, `/case-studies` with the founding rail | The four pages that carry the argument |
| **2 — the engines** | 16 capability pages | Turns a one-pager into a content site; each is an SEO surface |
| **3 — the segments** | 8 segment pages from `common/segments.js` | Highest SEO leverage, lowest writing cost — the data already exists |
| **4 — the library** | Guides, downloads, the Response Clock report | The 6–12 month compounding channel |

Waves 2 and 3 are where the "content-rich" character actually arrives. Wave 1 alone still looks like a one-pager, just a better one.

---

## Open decisions

1. **Is there a pricing page?** The docs forbid a service price next to the free diagnostic, and forbid it on the Scan page specifically. Owner.com has `/pricing` — but they sell software, and we sell a managed engagement. Recommendation: **no price page for the Desk**; the number is delivered live, and a `/what-it-costs` page explains the *model* (priced against a hire, not against software) without the figure.
2. **Do the three geographies get their own pages?** US / Australia / the Gulf currently exist only as a claim in a stat strip. If we want them for search, they need real pages, and each needs its own compliance and hours story.
3. **Typeface.** `design.md` §7 — pick before any copy is set. General Sans or Satoshi recommended.
4. **Founding-partner perks** beyond the documented trade — see above.
