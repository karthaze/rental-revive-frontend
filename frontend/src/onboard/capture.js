/* ============================================================
   HOMEPAGE CAPTURE — the poll, isolated and injectable
   ------------------------------------------------------------
   Split out of onboard.js's mountCapture so the poll contract can
   be tested without a network or a DOM. Everything impure — the
   server action, image measuring, the clock — arrives as an
   argument; what lives HERE is only the decision of what to ask
   for, how long to keep asking, and what counts as an answer.
   Same discipline as enrich.js one file over.

   Two rules this file exists to enforce, both learned the hard way:

   1. ASK FOR THE SAME PICTURE TWICE. mshots is a render queue, not
      an image host. A cold URL answers 307 (queued) or 429
      (refused) and only becomes a JPEG once the render lands, so
      the only way to collect a capture is to poll one stable URL
      until it answers. `rr=`-style cache-busters are part of
      mshots' cache key — appending a fresh one per attempt asks
      for a brand-new render every time and the poll can never
      converge. Never add a varying parameter to this URL.

   2. A DECODED IMAGE IS NOT A CAPTURE. mshots answers a
      not-yet-rendered URL with a small placeholder tile, and that
      tile decodes perfectly. Readiness is therefore a question
      about geometry, not about whether onload fired: a real
      capture requested at w=1400 comes back 1280 wide, the
      placeholder 400. Anything short of MIN_CAPTURE_WIDTH is the
      queue talking, not the owner's homepage.

   The honesty rule of footprint.js applies unchanged — this
   resolves a capture that has been measured, or nothing at all.
   ============================================================ */

/* Delays before each successive attempt, in ms. Front-loaded, then
   easing off: a warm capture returns on the first ask, and a cold
   render gets ~43s of patience — the old two-shot loop gave up
   after 9s, well inside the time mshots needs to photograph a real
   yard's homepage. The skeleton holds the card meanwhile, so the
   owner sees "Photographing …", never a placeholder tile. */
const POLL_SCHEDULE = [0, 2500, 4000, 6000, 8000, 10000, 12000]

const CAPTURE_W = 1400
const CAPTURE_H = 900

/* Sits between the 400px placeholder tile and the 1280px mshots
   returns for a CAPTURE_W request. Widen the request and this stays
   valid; narrow it below ~800 and this needs revisiting. */
export const MIN_CAPTURE_WIDTH = 800

/** The keyless fallback capture URL. Stable by construction — the
    same site always yields the same string, which is what makes
    polling work. */
export function mshotUrl(url, { w = CAPTURE_W, h = CAPTURE_H } = {}) {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${w}&h=${h}`
}

/** Try the server capture first, then poll mshots until it answers
    with a real photograph or the schedule runs out.

    `measure(src)` must resolve the loaded image's natural width, or
    0 when it will not load.

    Resolves `{ ok: true, src }` with a URL that has been proven to
    decode at a plausible size, or `{ ok: false }` — never a maybe.
    The caller shows a capture only on ok, and says plainly that
    there is none otherwise; nothing here fabricates one. */
export async function captureHomepage({
  url,
  serverCapture,
  measure,
  wait,
  schedule = POLL_SCHEDULE,
  minWidth = MIN_CAPTURE_WIDTH,
}) {
  /* the keyed provider (Thum.io, behind Convex) waits for the page
     itself, so one request is the whole answer when it is
     configured. Unconfigured or failing, it yields nothing and the
     keyless path takes over — an absent backend is not an error.

     No geometry guard here: the queue-placeholder problem is
     mshots', and the action already checks content-type and size
     server-side. Throwing away a narrow-but-genuine capture would
     be its own dishonesty. */
  try {
    const served = await serverCapture()
    if (served && (await measure(served)) > 0) return { ok: true, src: served }
  } catch {
    /* fall through to mshots */
  }

  const shot = mshotUrl(url)
  for (const delay of schedule) {
    if (delay) await wait(delay)
    if ((await measure(shot)) >= minWidth) return { ok: true, src: shot }
  }
  return { ok: false }
}
