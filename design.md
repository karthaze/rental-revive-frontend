---
version: anydesign-1
name: Owner.com — reference system for the RentalRevive rebuild
source: https://www.owner.com (3 desktop screenshots + HTML/IA via WebFetch + sitemap.xml)
captured_at: 2026-08-09
description: |
  A warm, editorial SaaS surface built for small-business owners rather than for buyers of
  software. Near-black type on cream, one deep-green action colour, generous vertical
  silence, and page sections stacked as giant rounded slabs. The system's whole job is to
  make a dense, 235-page content library feel calm and unhurried — density is carried by
  structure, never by visual noise.

colors:
  surface: "#FFFFFF"
  surface-warm: "#FAF6F1"
  surface-card: "#F7F3EC"
  surface-mint: "#DAECD5"
  ink: "#1A1A1A"
  ink-muted: "#6E6E68"
  ink-body: "#4A4A46"
  action: "#1C4A2E"
  action-contrast: "#FFFFFF"
  nav-cta: "#161616"
  border-hairline: "#E3DDD4"
  overlay-image: "rgba(16,16,16,0.55)"

typography:
  display:
    fontFamily: "Aeonik, 'PP Neue Montreal', Inter, system-ui, sans-serif"
    fontSize: 54px
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: -0.025em
  h2:
    fontFamily: "Aeonik, 'PP Neue Montreal', Inter, system-ui, sans-serif"
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.015em
  claim:
    fontFamily: "Aeonik, 'PP Neue Montreal', Inter, system-ui, sans-serif"
    fontSize: 19px
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Aeonik, 'PP Neue Montreal', Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  stat:
    fontFamily: "Aeonik, 'PP Neue Montreal', Inter, system-ui, sans-serif"
    fontSize: 34px
    fontWeight: 600
    letterSpacing: -0.02em
  label:
    fontFamily: "Aeonik, 'PP Neue Montreal', Inter, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.4

spacing:
  base: 4px
  scale: [4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160]

rounded:
  sm: 12px
  md: 16px
  lg: 24px
  slab: 40px
  pill: 9999px

components:
  button-action:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-contrast}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 14px 28px
  button-nav-cta:
    backgroundColor: "{colors.nav-cta}"
    textColor: "{colors.action-contrast}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 14px 26px
  carousel-arrow:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: 14px
  testimonial-card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: 48px
  media-card:
    backgroundColor: "{colors.overlay-image}"
    textColor: "{colors.action-contrast}"
    rounded: "{rounded.md}"
    padding: 24px
  mint-cta-card:
    backgroundColor: "{colors.surface-mint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 28px
  belief-row:
    backgroundColor: "transparent"
    border: "1px solid {colors.border-hairline}"
    typography: "{typography.body}"
    padding: 32px 0
  stat-pair:
    textColor: "{colors.ink}"
    typography: "{typography.stat}"
    padding: 0
  stacked-section-slab:
    backgroundColor: "{colors.surface-warm}"
    rounded: "{rounded.slab}"
    padding: 160px 24px
  two-tone-heading:
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    padding: 0
  peeking-carousel:
    backgroundColor: "transparent"
    rounded: "{rounded.lg}"
    padding: 0
---

# Design Analysis — Owner.com

> Analysis generated with the `anydesign` skill.
> Date: 2026-08-09
> Analysis emphasis: reconstruction + design system

---

## Source

- **Source type**: combination — 3 desktop screenshots + HTML/IA via WebFetch + sitemap.xml
- **Path / URL**: `https://www.owner.com`
- **Capture method**: direct vision on screenshots (testimonial carousel, resources grid, beliefs section) + WebFetch for nav/footer/heading structure + sitemap.xml for the full URL inventory
- **Detected limitations**: WebFetch converts to markdown, so **no CSS custom properties, font files or literal hex values were recoverable**. Every colour below is vision-inferred from screenshots and carries ⚠️ medium confidence at best. Only desktop viewport captured. Hero and pricing sections not in the supplied frames.

---

## TL;DR

Warm editorial SaaS: near-black type on cream, one deep-green action colour, and page sections stacked as giant rounded slabs with 120–160px of vertical silence between them. The distinctive move is **structural density without visual density** — 235 URLs of content presented through repeating card grammars so calm the page never feels like a brochure. The single most portable idea for RentalRevive: **nav grouped by outcome, not by feature**, with one page per capability underneath.

---

## 1. Visual identity

### 1.1 Surface description

**Personality**: warm, plain-spoken, confident, unhurried, editorial

**Mood**: a well-made trade magazine that happens to sell software. Reassuring rather than exciting — nothing on the surface is trying to impress a CTO.

**Detectable stylistic references**: the Stripe/Linear editorial grid run through a warm palette instead of a cool one; card grammar closer to Airbnb than to a dev-tools site.

**Information density**: dense in *content volume*, minimal in *visual texture*. This split is the whole system.

**Implicit positioning**: an operator who is not a software buyer. Somebody who runs a physical business, reads on a phone between shifts, and is suspicious of anything that looks like an enterprise sales deck.

**Confidence**: ✅ high

### 1.2 Brand voice / Atmosphere

This design believes its reader has been sold to badly before. Every choice is a de-escalation. The palette is warm rather than cool because cool blue-grey is what the last four vendors used. Photography is of actual owners in actual rooms — bad lighting, real signage, no stock — because a person who has stood behind a counter can spot a stock photo in one glance and will discount everything around it. The green is dark and muted rather than bright, so the call to action reads as a door rather than a sales button.

The second belief is that **credibility is a volume problem, not a rhetoric problem**. Rather than argue that the product works, the site simply produces an enormous amount of specific, checkable material: 20 case studies with named owners and dollar figures, 76 blog posts, 11 guides, a page for every single capability. The reader is not persuaded, they are *out-evidenced*. This is why the design must be visually quiet — at this content volume, any decorative energy would compound into noise, and the whole strategy would collapse into the thing it is avoiding.

Third: the surface never claims sophistication the buyer doesn't want. There is no gradient mesh, no glassmorphism, no dark mode, no animated hero. The most technically ambitious element on the page is a faint topographic contour line in a card background. That restraint is not a lack of ambition — **it is the argument**. A restaurant owner is being told, visually, that this company spends its cleverness on the product rather than on its own website.

### 1.3 The "ONE brand thing"

- **The thing**: the **stacked rounded slab** — each page section is a full-bleed container with a ~40px top radius and its own warm background tone, so the page reads as a deck of overlapping cards rather than a continuous scroll.
- **Why it carries the brand**: it is what makes an extremely long, content-heavy page feel navigable. Each slab is a self-contained chapter with its own ground colour, so the reader always knows they have entered a new idea without needing a divider, a rule, or a heavier heading. Remove it and the page becomes an undifferentiated 12,000px scroll, and the content-volume strategy stops being readable.
- **How everything else supports it**: because the slab does the sectioning work, headings can stay one size, borders can stay hairline, and shadows can be absent almost everywhere. The system spends its structural budget in one place.
- **Where it appears (and where it doesn't)**: every marketing section on the marketing site. It does **not** appear inside cards (cards use the smaller `{rounded.lg}` / `{rounded.md}` scale) and would be wrong in any dense product UI.

*Confidence*: ✅ high — visible in two of three frames, with the rounded top edge clearly breaking against the preceding section.

---

## 2. Design System (tokens)

### 2.1 Colors

| Token | Hex | Role | Where it appears | Confidence |
|---|---|---|---|---|
| `surface` | `#FFFFFF` | Base | Nav bar, page ground | ✅ high |
| `surface-warm` | `#FAF6F1` | Section slab ground | Beliefs, guides sections | ⚠️ medium |
| `surface-card` | `#F7F3EC` | Card ground | Testimonial cards, carousel arrows | ⚠️ medium |
| `surface-mint` | `#DAECD5` | Soft accent panel | "Learn with Owner.com" CTA card | ⚠️ medium |
| `ink` | `#1A1A1A` | Primary text | Headings, quotes, stats | ✅ high |
| `ink-body` | `#4A4A46` | Body copy | Beliefs paragraphs | ⚠️ medium |
| `ink-muted` | `#6E6E68` | Secondary / attribution | Bylines, stat labels, de-emphasised heading half | ⚠️ medium |
| `action` | `#1C4A2E` | Primary action | "Learn more" buttons | ⚠️ medium — dark green read from two frames |
| `nav-cta` | `#161616` | Nav-level conversion CTA | "Get a free demo" pill | ✅ high |
| `border-hairline` | `#E3DDD4` | Dividers | Belief row separators | ⚠️ medium |
| `overlay-image` | `rgba(16,16,16,0.55)` | Legibility scrim | Bottom of media cards | ⚠️ medium |

**Two action colours coexist deliberately.** `{colors.nav-cta}` (#161616) is the near-black used for the single persistent conversion CTA; `{colors.action}` (#1C4A2E) is the green used for in-content actions. They never appear as alternatives to each other — the black one is always the demo, the green one is always "go read more."

No dark mode observed.

### 2.2 Typography

- **Detected family**: geometric grotesk in the Aeonik / PP Neue Montreal class — double-storey `a`, single-storey `g` with an open tail, geometric numerals *(confidence: ❓ low — no CSS recoverable; inferred from letterforms only)*
- **Suggested fallback**: `Inter, system-ui, sans-serif`. If licensing a face, Aeonik is the closest commercial match; **General Sans** or **Satoshi** (Fontshare, free) are the closest free substitutes and both carry the same geometric-with-warmth character.

**Observed scale:**

| Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `display` | 54px | 600 | 1.08 | Section titles ("Trusted by owners") |
| `h2` | 30px | 600 | 1.25 | Card quotes |
| `stat` | 34px | 600 | 1.1 | Dollar figures |
| `claim` | 19px | 600 | 1.35 | Belief left-column claims, media card titles |
| `body` | 16px | 400 | 1.55 | Belief paragraphs |
| `label` | 15px | 400 | 1.4 | Bylines, stat labels, buttons |

**Notable tracking**: −0.025em on `{typography.display}`, −0.015em on `{typography.h2}`. Body is untracked.

**Weight ceiling is 600.** No 700 or 800 anywhere in the captured frames, including on 54px display type — the size does the emphasis, not the weight.

### 2.3 Spacing

- **Inferred base unit**: 4px
- **Observable multiples**: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160
- **Section padding**: 120–160px vertical — the single largest value in the system and the main reason the density reads as calm
- **Card padding**: 48px on the testimonial card, 24–28px on smaller cards
- **Consistency**: ⚠️ medium — measured from screenshots, not from CSS

### 2.4 Radii

- `{rounded.sm}` 12px — small chips, inline media
- `{rounded.md}` 16px — media cards, mint CTA card
- `{rounded.lg}` 24px — testimonial cards, photography inside cards
- `{rounded.slab}` 40px — section containers (top corners only)
- `{rounded.pill}` 9999px — all buttons and the carousel arrows

**Three radius scales coexist and the rule is by element class, not by taste:** buttons are always pill, cards are always 16–24px, sections are always 40px. Never mix across classes.

### 2.5 Elevation system

The system is **deliberately near-flat**. Only two levels observed:

| Level | Name | Treatment | Use |
|---|---|---|---|
| 0 | Flat | No shadow, no border; separation by background tone alone | Section slabs, cards, belief rows |
| 1 | Hairline | `1px solid {colors.border-hairline}` | Belief row dividers only |

There is no drop shadow anywhere in the three captured frames. **Depth is done entirely by surface tone.** Do not add a shadow scale when extending this system.

#### Decorative depth (non-functional)

- **Polarity by warmth, not by darkness**: consecutive slabs step between `{colors.surface}` (#FFFFFF) → `{colors.surface-warm}` (#FAF6F1) → `{colors.surface-card}` (#F7F3EC). The steps are tiny — 3–5% — which is why the page reads as one material rather than as alternating bands.
- **Topographic contour lines**: faint concentric curves in the testimonial card background, roughly 2–3% contrast against the card ground. Barely perceptible and entirely decorative. ⚠️ medium confidence.
- **Image scrim**: a bottom-anchored dark gradient on photographic cards for white-text legibility.

### 2.6 Borders

- Base colour: `{colors.border-hairline}` (#E3DDD4) — a *warm* grey, not a neutral one
- Thickness: 1px, used sparingly (row dividers only)
- Focus states: not captured

### 2.7 Accessibility quick-check

Approximate ratios on the inferred values:

- `{colors.ink}` (#1A1A1A) on `{colors.surface-warm}` (#FAF6F1): **≈15.9:1** — AAA ✅
- `{colors.ink-body}` (#4A4A46) on `{colors.surface-warm}`: **≈8.6:1** — AAA ✅
- `{colors.ink-muted}` (#6E6E68) on `{colors.surface-card}` (#F7F3EC): **≈4.9:1** — AA ✅, AAA ✗ (fine at the 15–16px it is used at, but do not take this token below 15px)
- `{colors.action-contrast}` (#FFFFFF) on `{colors.action}` (#1C4A2E): **≈9.8:1** — AAA ✅

Ratios are computed on vision-inferred hex values, so treat them as indicative. Re-run once real values are sampled.

---

## 3. Components Inventory

### 3.1 Generic components

#### button-action
*Action button.*
- **Variants**: solid green (in-content). Label pattern is always `Verb more ›` with a small chevron.
- **Size**: ~48px tall, `padding: 14px 28px`
- **Radius**: `{rounded.pill}`
- **States captured**: default only
- **Confidence**: ✅ high

#### button-nav-cta
*Persistent conversion CTA.*
- **Variants**: one, near-black
- **Behaviour**: fixed in the nav at all scroll positions; the only CTA that never changes label ("Get a free demo")
- **Confidence**: ✅ high

#### carousel-arrow
*Carousel control.*
- Circular, `{colors.surface-card}` ground, dark glyph, ~44px, positioned **top-right of the section**, not overlaid on the cards
- **Confidence**: ✅ high

#### testimonial-card
*Quote + proof card, the unit the carousel scrolls.*
- `{colors.surface-card}` ground, `{rounded.lg}`, 48px padding, faint topographic contour pattern in the background
- Copy column ~45% (quote → byline → `{components.button-action}` → stats pinned to the bottom), media ~55%
- **Confidence**: ✅ high

#### media-card
*Photographic content card.*
- Photo fills the card; dark bottom scrim; white `{typography.claim}` title bottom-left; optional white circular play button for video
- Two sizes: feature (~55% width, ~560px tall) and standard (~half that height)
- **Confidence**: ✅ high

#### mint-cta-card
*Soft accent CTA.*
- `{colors.surface-mint}` ground, dark title + muted subtitle, circular white arrow button right-aligned
- Used once per grid as the "and here's the whole library" escape hatch
- **Confidence**: ✅ high

#### stat-pair
*Proof figure.*
- Big `{typography.stat}` number over a small `{typography.label}` caption; 2–3 sit side by side at the bottom of a `{components.testimonial-card}`
- Always a *delta or absolute dollar figure* (`+$72,000`, `$19,000`, `+300%`), never a percentage of satisfaction
- **Confidence**: ✅ high

### 3.2 Signature components

#### stacked-section-slab
*The brand device.*
- **What it is**: full-bleed section container, `{rounded.slab}` on the top two corners, own background tone, 120–160px vertical padding.
- **Why it's signature**: it replaces every divider, rule and section-heading-weight-change in the system. See §1.3.
- **Composition**: `border-radius: 40px 40px 0 0` + background tone step + huge vertical padding. Nothing else.
- **Where it appears**: every marketing section.
- **Confidence**: ✅ high

#### two-tone-heading
*Emphasis without bold.*
- **What it is**: a heading whose second half drops to `{colors.ink-muted}` — "**Trusted by** owners", where "owners" is grey.
- **Why it's signature**: it does emphasis without bold, colour or size change, which is what lets the weight ceiling stay at 600. A generic system would bold the important word; this one *un-bolds the unimportant one*.
- **Composition**: `<h2>Trusted by <span class="muted">owners</span></h2>`
- **Confidence**: ✅ high

#### belief-row
*Claim / exposition split.*
- **What it is**: a hairline-separated row with a short bold claim in a narrow left column (~32%) and two paragraphs of plain exposition in a wide right column (~68%).
- **Why it's signature**: it is an editorial definition list, not a feature card. There is no icon, no border, no background — which is what makes a *values* section read as sincere rather than as marketing. The signed founder photograph in the opposite column completes the device.
- **Where it appears**: values/positioning sections only. Never for product features.
- **Confidence**: ✅ high

#### peeking-carousel
*Scroll affordance by clipping.*
- **What it is**: a horizontal card rail where the adjacent cards are visibly clipped by the viewport edge on **both** sides.
- **Why it's signature**: the clip is the affordance. There are no dots, no counter, and the arrows sit far away in the section header — the only thing telling you it scrolls is that you can see it is already mid-scroll.
- **Confidence**: ✅ high

---

## 4. Layout & Composition

### 4.1 Grid & containers

- **Container max-width**: ~1180–1280px, centred, with ~24px gutters ⚠️ medium
- **Full-bleed exception**: the carousel rail breaks the container so cards can bleed off both edges
- **Vertical rhythm**: 120–160px between section slabs; 48px between a heading and its content
- **Hierarchy**: established almost entirely by *size and surface tone*, never by colour saturation

### 4.2 Composition patterns

1. **Section header + far-right controls** — heading left, carousel arrows right, on one baseline
2. **Asymmetric bento** — one tall feature card (~55%) beside a 2-up stack plus a full-width accent card
3. **Editorial two-column** — big heading + portrait left, hairline-separated rows right
4. **Card with embedded media** — copy left ~45%, photo/video right ~55%, stats pinned to the bottom of the copy column
5. **Outcome-grouped nav** — four labelled clusters, 4–5 links each (see §5)

### 4.3 Responsive behavior

#### Breakpoints

Only desktop material was captured — breakpoints below are ❓ low confidence and inferred from container behaviour.

| Name | Width | Key changes (inferred) |
|---|---|---|
| Mobile | < 640px | Nav → hamburger; bento → 1-up; carousel keeps peek, one card per view; belief rows stack claim over body |
| Tablet | 640–1023px | Bento → 2-up; testimonial card stacks copy over media |
| Desktop | 1024–1279px | Full layouts |
| Wide | ≥ 1280px | Content caps; gutters absorb the remainder; carousel still bleeds |

Recommend `python scripts/capture_site.py https://www.owner.com --viewports desktop,tablet,mobile` before implementing.

#### Touch targets

- Buttons ~48px tall ✅
- Carousel arrows ~44px ✅ (at the WCAG threshold, not above it)

#### Collapsing strategy

- **Slab radius should not scale down on mobile** — it is the brand device, and at 40px on a 375px viewport it still reads correctly
- **Section padding must scale** — 160px desktop → ~72px mobile, or the page becomes unusable

### 4.4 Image behavior

- **Owner portraits**: real photography in real premises, 4:3 to 3:2, `{rounded.lg}`, never cut out, never on a gradient. This is a brand rule, not a layout one.
- **Media card imagery**: fills the card, dark bottom scrim for white text
- **Founder portrait**: `{rounded.lg}`, desaturated background, paired with a hand-drawn signature stroke in `{colors.ink}`
- **Icons**: near-absent. Only chevrons and a play triangle appear in the captured frames — a notable and deliberate omission for a SaaS site.

---

## 5. Reconstruction Notes

### The IA is the most valuable extract

From `sitemap.xml`: **235 URLs**, including 20 case studies, 76 blog posts, 11 resource guides and 6 downloads. The nav groups capabilities under **four outcome-named clusters** — *Grow online discovery · Grow repeat orders · Grow online sales · Run your restaurant* — with 4–5 pages under each, and the footer repeats those exact groupings verbatim.

The transferable rule: **one page per capability, clustered by the outcome the buyer wants, never by the feature's internal name.** The footer is the sitemap.

### Suggested stack

**Vanilla CSS with custom properties**, matching the existing RentalRevive `frontend/src/style.css`. The system is flat, has no component library signature, and needs no framework — three radius scales, two elevation levels and eleven colours will express the entire thing. Multi-page in Vite via `rollupOptions.input`.

### Quick wins

- Palette + type scale + the 40px slab gets ~80% of the look in a day
- The two-tone heading is one CSS class and immediately reads as "designed"
- Section padding at 120–160px does more work than any other single value

### Tricky bits

- **The typeface is unidentified.** Get this decided before writing copy — General Sans or Satoshi are the free substitutes.
- **The peeking carousel** needs `scroll-snap` plus negative container margins to bleed correctly at both edges; it is the one non-trivial layout in the system.
- **The warm-tone steps are only 3–5% apart.** They will disappear on a poorly calibrated monitor and must be checked on real hardware, not in a screenshot.
- **Photography is a hard dependency.** This system without real owner photography collapses into a plain white page — see §6.

### Implicit states to define

Not captured — decide before implementing: button hover/active, visible focus ring, carousel disabled-arrow state, card hover, form input error, and every empty state (which matters here, because the case-study rail ships empty).

### Confidence map

| Layer | Confidence | Why |
|---|---|---|
| Identity | ✅ high | Three rich frames plus full IA |
| Information architecture | ✅ high | Read directly from sitemap.xml and nav/footer |
| Colors | ⚠️ medium | Vision-inferred; no CSS recoverable via WebFetch |
| Typography scale | ⚠️ medium | Sizes measured from screenshots |
| Typography family | ❓ low | Letterform inference only |
| Spacing | ⚠️ medium | Measured, not read |
| Components | ✅ high | Each observed at full size |
| Layout / responsive | ❓ low | Desktop only |

---

## 6. Do's and Don'ts

### Do

- **Use `{rounded.slab}` (40px) top corners on every marketing section**, with a background-tone step against the previous section. This is the brand device — see §1.3.
- **Keep the weight ceiling at 600.** Emphasis comes from size (`{typography.display}` at 54px) and from the two-tone heading, never from 700+.
- **Step surface tones by 3–5% only** — `{colors.surface}` → `{colors.surface-warm}` → `{colors.surface-card}`. Bigger jumps turn a calm page into a striped one.
- **Reserve `{colors.nav-cta}` (#161616) for the single persistent demo CTA** and `{colors.action}` (#1C4A2E) for in-content "read more" actions. They are not interchangeable.
- **Put proof figures in `{components.stat-pair}` as absolute dollars or deltas** — `+$72,000`, not "98% satisfaction."
- **Group navigation by the outcome the buyer wants**, 4–5 pages per cluster, and repeat the identical grouping in the footer.
- **Use real photography of real operators in real premises.** Bad lighting is a feature.

### Don't

- **Don't add a shadow scale.** The system has exactly two elevation levels and depth is done by surface tone. A drop shadow anywhere immediately reads as a different brand.
- **Don't mix radius scales within an element class.** Buttons are always `{rounded.pill}`, cards always 16–24px, sections always 40px.
- **Don't introduce a bright accent.** The green is dark and muted on purpose; a saturated CTA colour would undo the de-escalation the whole palette is performing.
- **Don't use stock photography or illustration.** It is the single fastest way to break this system, because the content-volume credibility strategy depends on everything looking checkable.
- **Don't add feature icons.** Their absence is deliberate — the captured frames contain only chevrons and a play triangle.
- **Don't bold the important word in a heading.** Grey out the unimportant one instead (§3.2, two-tone heading).
- **Don't put dividers between sections.** The slab and the tone step already did it; a rule on top reads as distrust of the device.

---

## 7. Open Questions

- **What is the typeface?** Letterform inference only. Needs either a licence decision or a substitute chosen (General Sans / Satoshi recommended) before copy is set.
- **Exact hex values.** WebFetch strips CSS. Sampling the live stylesheet or running `python scripts/extract_css_vars.py https://www.owner.com` would upgrade the whole colour table from ⚠️ to ✅.
- **Hero and pricing sections were not captured** — the two most conversion-critical layouts on the site are missing from this analysis.
- **Responsive behaviour is entirely inferred.** Only desktop frames supplied.
- **Interaction states** — hover, focus, active, disabled — none observed.
- **Is the topographic contour pattern used anywhere besides the testimonial card?** Only one instance seen.

---

## 8. Companion files

- [x] `design-tokens.json` — structured tokens in W3C DTCG format
- [ ] `design-a11y.md` — not generated; contrast figures in §2.7 are computed on inferred values and would give false precision as a standalone report
- [ ] `design-screenshot.png` — user-supplied frames, not written to disk

---

*Reference system for the RentalRevive multi-page rebuild. Paired with `SITEMAP.md` for the information architecture.*

---

## Addendum — the playful layer (2026-08-10)

Reference: colinandsamir.com/creator-startup. Their formula, measured in the
browser: one grotesk family (Neue Haas, wt 500), flat surfaces with zero
shadows, ONE loud accent (#F6E921) used at every scale from check-chip to a
viewport-wide cropped wordmark, real photos, hand annotations, and designed
number moments. We ported the moves, not the palette — red stays the voltage.

New pieces (all in `style.css` under `HUMAN PASS`):

| Piece | Class | Rule of use |
|---|---|---|
| Marker annotation | `.hand-note` (Caveat 22px, red, −1.5°) | One per page, next to the primary action |
| Scribble ellipse | `.circled` + inline SVG | H1 only, around the payoff words |
| Marker underline | `.mku` (data-URI stroke) | One phrase per section, single word preferred — it repeats per line-box if the phrase wraps |
| Survey brackets | `.hero-demo::before/::after` | Dashed red corners on the hero photo only |
| Inspection stamp | `.stamp` (bordered, rotated ±1°) | Product-track badges; louder cousin of `.eyebrow` |
| Dark checklist slab | `.dslab` / `.ds-list` | Char card, red check chips, ghost outline index |
| Ghost numeral | `.cohort-ghost`, `.ds-no`, `.g-no` | Outline type (`-webkit-text-stroke`), never filled |
| Tilted photo | `.tc-photo` + `.tilt-l/.tilt-r` | 6px white border, Caveat caption chip, ±1.7° max |
| Cropped wordmark | `.foot-mega` | Footer end only, red, translateY(22%), clipped by footer overflow |

Dark bands are now structural, not decorative: stat strip → cohort (`--char`
ground, `--red-glow:#FF564F` for accents on dark — pure `--red` vibrates on
char) → footer. Caveat is annotation-only; body and display stay Plus Jakarta
Sans. All rotations flatten under `prefers-reduced-motion`.

Nav panels: the 16-link mega grid is retired. Panels are ≤480px, anchored to
their trigger (the two right-most groups right-anchor so no panel can leave
the viewport), and `white-space:normal` — the clipped-dropdown bug was
`.nav-links a{white-space:nowrap}` leaking into panel rows; the selector is
now `.nav-links > a`.

### Motion layer (2026-08-10)

Machinery does the animating, nothing else does. The truck hauls the install
across the steps route once per visit (`.steps-route.in .route-truck`), the
excavator's arm digs on a 3.8s loop at the leak line, the cohort hook sways
±2.2°, the hero toasts pop in staggered (missed call, then caught-and-booked)
and idle-bob, the stat numerals count up once, and segment icons wiggle on
hover. Every animation is disabled or pre-settled under
`prefers-reduced-motion`. Gauge needles rotate via the SVG `rotate(deg cx cy)`
attribute, never CSS transforms — CSS `transform-origin` resolved against the
wrong box and pivoted the needle around the dial centre.

The canvas behind the page is two-tone
(`html{background:linear-gradient(...)}`) so rubber-band overscroll shows
cream above the hero and charcoal below the footer instead of bare white.
