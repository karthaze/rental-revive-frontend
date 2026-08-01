# SESSION — continue the Revive Agent build

Handoff for a fresh chat. `CONTEXT.md` is the standing project memory
(business, offer ladder, the scan, design rules) — **read it first**.
This file is narrower: it is the state of the *Revive Agent build* and
what to do next.

Written 2026-07-30; updated 2026-07-31 (AD-13 enrichment, FR27 hours,
AD-9 reconciliation).

---

## 0. Where things stand

| | |
|---|---|
| PR | **#8** — https://github.com/EPYCD/quotes/pull/8 (merged) |
| Tests | `npm test` → **167 passing**, 16 files |
| Types | `npm run typecheck` → clean |
| Build | `npm run build` → clean (SPA untouched by backend work) |

PR #8 is merged into `main`. Current work is on the local branch
`restructure/product-first`.

Commits this session, oldest first:

```
978f5de  Rebuild the digital footprint card: scorecard, proof frame, quiet log
11014b6  Build the Revive Agent foundation: schema, core, chokepoint, tests
57aa148  Wire the phone probe: Twilio dials, Vapi classifies, edge verifies
36ab45d  Wire the async probes: Postmark email, form worker, NFR7 at the sweep
355f42c  Build the proof gate and the live dashboard
d584bc6  Add SESSION.md — the pick-up-here doc
e596e56  Move enrichment server-side (AD-13) and derive yard timezone (NFR4)
(next)   FR27 competitor hours + AD-9 reconciliation + getScan guard
```

The planning artifacts these implement:

```
../docs/planning/planning-artifacts/prds/prd-quotes-2026-07-29/prd.md          41 FRs, 7 NFRs, C1-C8
../docs/planning/planning-artifacts/prds/prd-quotes-2026-07-29/addendum.md     costs, rejected alts, copy
../docs/planning/planning-artifacts/architecture/architecture-quotes-2026-07-29/ARCHITECTURE-SPINE.md   16 ADs
../docs/planning/planning-artifacts/architecture/architecture-quotes-2026-07-29/data-model.md           9 tables
```

Code comments cite FR/AD/C numbers throughout. When you change
something, re-read the requirement it cites — the comments are the map
back to the docs.

---

## 1. What exists (map of the build)

```
services/convex/
  schema.ts              9 tables, real validators, every index from data-model.md
  core/                  PURE — imports nothing outside core/
    outcome.ts           the closed AD-2 vocabulary + isYardFinding / entersRepricing
    windows.ts           yard-local window math (Intl), FR10 caps, FR9 retry placement
    bands.ts             THE AD-11 conversion: measured -> leaks.js band strings
    verdict.ts           the FR23 fold: counts, fastest, measured shape, partial, bias
  ports/probe.ts         the AD-1 Probe port — dispatch() / resolve(), nothing else
  adapters/
    phone/twilio.ts      REST dial, caller rotation (NFR5), status -> AD-2, bridge TwiML
    phone/vapi.ts        end-of-call report -> outcome, C2 staff-voice flagging
    phone/signature.ts   X-Twilio-Signature HMAC-SHA1 + constant-time compare
    email/postmark.ts    persona send, delivery/bounce -> AD-2, inbound classification, debrief copy
    form/worker.ts       signed job to the worker, worker result -> AD-2
  runs/
    activate.ts          FR4 consent artifact, AD-15 async-first, FR8 phone at T+60s
    dispatch.ts          THE AD-7 chokepoint + the adapter registry + executor
    resolve.ts           AD-6 append-only resolution, FR9 retries, verdict generation
    kill.ts              FR5 kill switch
    queries.ts           owner-scoped reads; C1/C2 enforced HERE, not in components
    artifacts.ts         AD-10 copy-in + retainUntil
    debrief.ts           FR19 deferred disclosure
    auditLog.ts          audit rows from action contexts
  scheduler/retention.ts retention sweep + deadline sweep (NFR7 precondition lives here)
  scheduler/reconcile.ts callback reconciliation sweep (AD-9)
  http.ts                ALL webhooks (Convex requires the router at this path)
  crons.ts               the three sweeps
  test.helpers.ts        convexTest setup + fixtures

frontend/src/dashboard/  plain JS, like the rest of the SPA
  backend.js             Convex + Clerk boot, degrades to null unconfigured
  gate.js                FR1-FR6 proof gate + DISCLOSURE_VERSION
  view.js                PURE render — runState in, DOM out (all states)
  index.js               subscription, 1s repaint while live, kill, artifacts

services/form-probe/      stateless Playwright container (AD-12) + Dockerfile
```

Hooks into the existing scan (`frontend/src/onboard.js`):

- `renderReport()` dynamically imports `dashboard/gate.js` and mounts
  the gate **after** the arithmetic (FR1). Failure to load is caught —
  the report must never go down with it.
- `buildProbeScanPayload(L)` builds the `saveScan` argument.
- `bootProbeDashboard()` handles `?run=<id>` deep links at DOMContentLoaded.

---

## 2. Invariants that live in code — do not "simplify" these

These are the ones a careless refactor breaks silently.

1. **`undeliverable_ours` is never a finding** (AD-2 / NFR7). Our
   carrier trouble, spam-foldering, or a challenged datacenter IP must
   never be reported as the yard's failure. It has its own count, its
   own muted dashboard row, and it never enters re-pricing.
2. **The deadline sweep requires a delivery precondition.** "No
   response" may only be filed once delivery is a *recorded fact* — a
   ring, a Postmark `Delivery` event, an accepted form submission.
   Anything else files `undeliverable_ours`. (`scheduler/retention.ts`)
3. **One dispatch path** (AD-7). Every attempt is created by
   `requestAttempt()` in `runs/dispatch.ts`, which asserts live consent,
   target-matches-consent, cleared persona, and caps — and writes the
   row *before* any external I/O (AD-9). No adapter may be called from
   anywhere else.
4. **Attempts are append-only** (AD-6). A row gains terminal fields
   once; a second resolution throws. Retries are new rows. The single
   sanctioned exception is `recordEmailFacts` (FR18 follow-up count,
   FR19 debrief stamp), which touches exactly two metric keys.
5. **One leak engine** (AD-11). `common/leaks.js` is imported
   unmodified by `runs/resolve.ts`. The band strings in `core/bands.ts`
   must match its lookup tables byte-for-byte — **the en-dashes are
   load-bearing** (`'1 – 3 a week'`, not `'1-3 a week'`). Tests feed
   them through the real engine so this cannot drift.
   The dashboard renders `verdict.repriced` **from the server** — a
   client-side recompute was caught in review as a second source of
   the headline number and removed.
6. **No adapter, no measurement** (AD-16). An unconfigured channel
   resolves `aborted` with a diagnosis. Never simulate. Two products
   have already shipped the opposite bug (`../voltbot/CONTEXT.md:205`, and this
   repo's deleted `simulateAudit()`).
7. **C1/C2 are query-layer** — `runs/queries.ts` filters
   `containsStaffVoice` and never returns `failureReason`. A report
   query that could return staff audio is a bug, not a styling issue.
8. **No provider secret client-side** (AD-13). Only `VITE_CONVEX_URL`
   and `VITE_CLERK_PUBLISHABLE_KEY` are public. The old
   `VITE_APIFY_TOKEN` / `VITE_THUM_IO_KEY` leak is CLOSED — enrichment
   runs in `services/convex/enrichment/` behind `APIFY_TOKEN` / `THUM_IO_KEY`
   server env vars, and no provider endpoint appears in either build.
   Rotate both keys if a bundle containing them was ever deployed.
9. **A claimed scan is the owner's.** `scans.getScan` returns null to
   anyone but the claiming identity once `clerkUserId` is set —
   unguessable ids are not an access policy. Anonymous scans stay
   readable (the pre-auth flow needs them).
10. **Enrichment interpretation is shared, provider calls are not.**
   `common/enrich.js` + `footprint.js` are the one reading of
   provider output, imported by both the SPA and the Convex actions.
   The cache (yards row, per placeId, 7-day TTL) stores successes
   only — a transient provider failure must never become a week of
   "no reviews".

---

## 3. How to verify (exact commands)

Working directory for every command below: `rentalrevive/`.

```bash
npm test                 # vitest + convex-test, 167 tests
npm run typecheck        # tsc over services/convex/ only; SPA stays plain JS
npm run build             # unconfigured build — gate compiled OUT:
                          # probeConfigured() is folded to false at build time,
                          # so Vite dead-code-eliminates the gate. dist/assets/
                          # gate-*.js is 114 bytes (renderProofGate -> return
                          # null); backend-*.js folds probeConfigured to ()=>!1
                          # with no import('convex/browser') left. Inspecting
                          # dist/ reveals missing config immediately.

# configured build (proves the gate + dashboard chunk in)
VITE_CONVEX_URL=https://example.convex.cloud \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk \
  npm run build
```

**Convex codegen without a deployment** (this environment has no Convex
project; the command errors on the network step *after* writing the
files, which is fine):

```bash
CONVEX_SELF_HOSTED_URL=http://localhost CONVEX_SELF_HOSTED_ADMIN_KEY=x \
  npx convex codegen --typecheck disable
```

`services/convex/_generated/` is committed and is the **untyped bootstrap**
(`api` is `AnyApi`). `dataModel.d.ts` is fully schema-aware. The first
real `npx convex dev` regenerates typed api bindings — expect a few new
type errors in tests where `api.*` returns were cast by hand.

**Visual verification** (how every dashboard state was checked without a
deployment — repeat this pattern, it works):

```bash
# 1. static file server rooted at / (scratchpad/serve.mjs in the last session)
# 2. an HTML harness that <link>s frontend/src/onboard.css and imports the pure
#    renderer with fixture data
# 3. playwright, pointed at the preinstalled browser:
#    chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
#    (do NOT run `playwright install`)
```
`file://` will not work — ES module imports need http.

---

## 4. Not built yet — in the order I would do them

### ~~4a. AD-13: enrichment server-side~~ — DONE 2026-07-30
`services/convex/enrichment/{cache,reviews,crawl,screenshot}.ts`; shared pure
interpretation in `common/enrich.js`; VITE_ secrets deleted (no
provider endpoint appears in either build — verified by grep over
dist). placeId cache on the yards row, 7-day TTL, successes only.
Server env: `APIFY_TOKEN`, `THUM_IO_KEY`. **Rotate both keys if a
bundle containing them was ever deployed.** CO1/CO3 (moving WHEN
enrichment fires — post-auth / past the ticket question) is a
deliberate leftover: it changes the scan's visible flow and needs the
founder's call.

### ~~4b. Yard timezone from geometry~~ — DONE 2026-07-30
`saveScan` derives tz from lat/lng via `tz-lookup` (pure JS, no
provider); geometry beats the browser guess, browser tz survives only
for manual yards with no coordinates. Tested: Houston coords +
Berlin-browser → America/Chicago.

### ~~4c. FR27 competitor hours~~ — DONE 2026-07-31
`services/convex/core/hours.ts` (pure coverage math over Google periods, 15-min
slots, overnight + 24/7 handled, unpublished = unmeasured) +
`services/convex/enrichment/competitors.ts` (Places Details at activation per
CO3, max 6 lookups, `GOOGLE_MAPS_SERVER_KEY` env — unconfigured skips
into the audit log). Raw periods stored on scans.radar; the comparison
is recomputed in `runState` at read time (no derived copy to drift);
`view.js::hoursPanel` renders it under the verdict. C6 holds: public
listings only, nobody contacted.

### 4c-bis. AD-9 reconciliation — DONE 2026-07-31
`services/convex/scheduler/reconcile.ts` + a 15-min cron: pending phone
attempts (by_pending index) whose callbacks never arrived are looked
up at Twilio by CallSid after a 10-min grace and resolved through the
webhook's own status mapping. `completed` files `responded` +
answeredBy 'unknown' — a pickup can never become a miss (NFR7).
Provider unreachable → untouched; the deadline sweep backstops.
Async channels deliberately excluded (email has the delivery
precondition; the form worker retries its callback).

### 4d. The Vapi assistant
Not code in this repo — configured in Vapi's dashboard. **The full
spec is now `docs/vapi-assistant.md`**: FR12 opening script, the two
FR13 questions, the FR14 voicemail message, the structuredData
contract, server-URL/secret setup, and the X-RR-Attempt
verify-on-first-live-call note.

### 4e. Live end-to-end
Nothing has run against real providers. Everything is proven at the
HTTP boundary with real signatures and fixtures.

---

## 5. Deployment checklist

**Convex env vars** (server-side, `npx convex env set`):

```
TWILIO_ACCOUNT_SID       ACxxxx
TWILIO_AUTH_TOKEN        also the webhook signature key
TWILIO_FROM_NUMBERS      comma-separated E.164 pool (NFR5 rotation)
VAPI_SIP_ADDRESS         assistant-id@sip.vapi.ai
VAPI_WEBHOOK_SECRET      compared constant-time against x-vapi-secret
POSTMARK_SERVER_TOKEN
POSTMARK_WEBHOOK_SECRET  passed as ?secret= on the webhook URLs
APIFY_TOKEN              deep reviews + website crawl (enrichment)
THUM_IO_KEY              homepage capture (optional — mshots fallback)
GOOGLE_MAPS_SERVER_KEY   FR27 competitor hours (optional — panel absent without it)
FORM_WORKER_URL          https://<worker>/jobs
FORM_WORKER_SECRET       == the worker's PROBE_SECRET
CONVEX_SITE_URL          provided by Convex
```

**Client env** (`.env.local`, public by design):
`VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`.

**Clerk**: magic link enabled (PRD Q5), a JWT template named `convex`,
and the Clerk issuer configured in Convex's auth settings.

**Webhook URLs to register:**

```
Twilio  (set automatically per-call by the adapter)
        <site>/webhooks/twilio/voice?attemptId=…
        <site>/webhooks/twilio/status?attemptId=…
Vapi    <site>/webhooks/vapi                        header x-vapi-secret
Postmark <site>/webhooks/postmark/events?secret=…   delivery + bounce + spam
         <site>/webhooks/postmark/inbound?secret=…  inbound parse on the persona reply domain
Worker  <site>/webhooks/form-probe                  (the adapter passes this to the worker)
```

**Worker**: `services/form-probe/` → Fly.io or Cloud Run, `PROBE_SECRET`
set, one instance is plenty.

---

## 6. Blockers that are not engineering calls

- **PRD Q1 — the recording retention window.** Currently 30 days,
  `[ASSUMPTION]`, in **two places that must stay in sync**:
  `services/convex/runs/activate.ts::RETENTION_DAYS_DEFAULT` and
  `frontend/src/dashboard/gate.js::RETENTION_DAYS` (C4 requires the number on the
  consent screen). Changing it must not touch already-granted consents —
  `retentionDays` is snapshotted per consent on purpose.
- **PRD Q2 — legal read on owner-consented recorded AI calls, per
  state.** Blocker for any non-pilot launch.
- **PRD Q6 / C7 — the async persona must be a real registered entity we
  own**, name-cleared against state registries, USPTO and general search,
  with a working site, phone and address. Working name: *Full Circle
  Contractors*, which is currently hardcoded in the gate's disclosure
  copy and seeded in test fixtures. `personas.clearedAt = null` blocks
  dispatch by design — so nothing can send under an uncleared name.

---

## 7. Traps this session hit (so you don't re-hit them)

- **`convex-test` module glob.** `test.helpers.ts` must glob
  `./_generated/*.js` or convexTest throws "Could not find the
  _generated directory". Test files are excluded from the glob so they
  don't register as Convex modules.
- **`vitest.config.mts`** — edge-runtime environment, `convex-test`
  inlined. Tests live next to their subject as `*.test.ts`.
- **`process.env` in Convex** needs `"types": ["node"]` in
  `services/convex/tsconfig.json`. The runtime is still a V8 isolate — don't
  reach for other Node APIs.
- **Float precision in band thresholds.** `1 - 2/3` overshoots `1/3`;
  `core/bands.ts` does integer arithmetic first for exactly this reason.
- **`aspect-ratio` + `max-height`** on a block element makes the *width*
  shrink to satisfy the ratio. `.pr-shot` sets `width:100%` to stop it.
- **CSS specificity**: `.pr-skel span` (0,1,1) beats `.sk-tiles` (0,1,0).
  Scope child overrides.
- **The footprint card's `<img>` has no `src` until a capture loads** —
  the design hook flags it as a broken image every run. It is
  intentional (the frame shows a skeleton until `.ready`); leave it.
- Outbound network is proxied; `s.wordpress.com` mshots returns 403 from
  this environment, so screenshot behaviour can't be probed with curl here.

---

## 8. If you are picking this up cold

1. Read `CONTEXT.md` (the product) — especially §1 offer ladder, §5/§5b
   the leak and solution engines, §6 design rules, §7b the tri-state rule.
2. Skim `ARCHITECTURE-SPINE.md`'s 16 ADs. They are short and every one
   is enforced somewhere in `services/convex/`.
3. Run `npm test` — it should be 167 green (16 files) before you touch anything.
4. Start with §4a (AD-13). It is the one item that is *blocking a public
   deploy* rather than adding surface.
