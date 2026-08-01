/* ============================================================
   HOMEPAGE CAPTURE — the poll contract
   ------------------------------------------------------------
   Two bugs are locked down here.

   1. The mshots fallback used to append an incrementing `rr=`
      cache-buster to every attempt. `rr` is part of mshots' cache
      key, so each attempt asked for a brand-new, never-rendered
      capture instead of collecting the one it had already queued.
      The poll could never converge.

   2. Readiness was "the image decoded" (naturalWidth > 0). mshots
      answers a not-yet-rendered URL with a small placeholder tile,
      which decodes perfectly — so a converging poll would happily
      hand the owner somebody else's grey square and caption it
      their homepage. A capture requested at w=1400 comes back
      1280x900; the placeholder is 400x300.

   Everything here is injected — no network, no DOM.
   ============================================================ */
import { describe, test, expect } from 'vitest'
import { mshotUrl, captureHomepage, MIN_CAPTURE_WIDTH } from './capture.js'

const REAL = 1280        // a genuine mshots capture at w=1400
const PLACEHOLDER = 400  // the "still rendering" tile

/* a measure stub that records every URL it is asked for and answers
   with a caller-supplied natural width (0 = failed to load) */
function recorder(widthFor) {
  const asked = []
  return {
    asked,
    measure: async (src) => {
      asked.push(src)
      return widthFor(src, asked.length)
    },
  }
}

const noWait = () => {
  const delays = []
  return { delays, wait: async (ms) => { delays.push(ms) } }
}

const base = { url: 'https://example.com', serverCapture: async () => null }

describe('mshotUrl', () => {
  test('is byte-identical across calls for the same site — the cache key must be stable', () => {
    expect(mshotUrl('https://example.com')).toBe(mshotUrl('https://example.com'))
  })

  test('carries no cache-busting parameter', () => {
    expect(mshotUrl('https://example.com')).not.toMatch(/rr=/)
  })

  test('asks mshots for the site it was given', () => {
    expect(mshotUrl('https://example.com')).toContain(encodeURIComponent('https://example.com'))
  })
})

describe('captureHomepage — the poll', () => {
  test('polls the SAME url every attempt', async () => {
    const { asked, measure } = recorder(() => 0)
    const { wait } = noWait()

    await captureHomepage({ ...base, measure, wait, schedule: [0, 100, 200] })

    expect(asked.length).toBe(3)
    expect(new Set(asked).size).toBe(1)
  })

  test('stops polling the moment a real capture lands', async () => {
    const { asked, measure } = recorder((_src, n) => (n === 2 ? REAL : 0))
    const { wait } = noWait()

    const res = await captureHomepage({ ...base, measure, wait, schedule: [0, 100, 200, 300] })

    expect(res.ok).toBe(true)
    expect(asked.length).toBe(2)
  })

  test('waits between attempts, patiently enough for a cold render', async () => {
    const { measure } = recorder(() => 0)
    const { delays, wait } = noWait()

    await captureHomepage({ ...base, measure, wait })

    /* a cold mshots render routinely needs far longer than the 9s
       the old two-shot loop allowed */
    expect(delays.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(30000)
  })

  test('reports failure honestly when the schedule runs out', async () => {
    const { measure } = recorder(() => 0)
    const { wait } = noWait()

    const res = await captureHomepage({ ...base, measure, wait, schedule: [0, 100] })

    expect(res).toEqual({ ok: false })
  })
})

describe('captureHomepage — never shows a placeholder', () => {
  test('rejects the placeholder tile even though it decodes', async () => {
    const { measure } = recorder(() => PLACEHOLDER)
    const { wait } = noWait()

    const res = await captureHomepage({ ...base, measure, wait, schedule: [0, 100] })

    expect(res).toEqual({ ok: false })
  })

  test('keeps polling through placeholders and takes the real capture when it lands', async () => {
    const { asked, measure } = recorder((_src, n) => (n < 3 ? PLACEHOLDER : REAL))
    const { wait } = noWait()

    const res = await captureHomepage({ ...base, measure, wait, schedule: [0, 100, 200, 300] })

    expect(res).toEqual({ ok: true, src: mshotUrl('https://example.com') })
    expect(asked.length).toBe(3)
  })

  test('the threshold sits between the placeholder and a real capture', () => {
    expect(MIN_CAPTURE_WIDTH).toBeGreaterThan(PLACEHOLDER)
    expect(MIN_CAPTURE_WIDTH).toBeLessThanOrEqual(REAL)
  })
})

describe('captureHomepage — the server capture', () => {
  test('resolves with the server capture and never touches mshots', async () => {
    const { asked, measure } = recorder(() => REAL)
    const { wait } = noWait()

    const res = await captureHomepage({
      ...base,
      serverCapture: async () => 'https://cdn.convex/shot.png',
      measure,
      wait,
      schedule: [0, 100],
    })

    expect(res).toEqual({ ok: true, src: 'https://cdn.convex/shot.png' })
    expect(asked).toEqual(['https://cdn.convex/shot.png'])
  })

  /* the geometry guard is a mshots-queue defect, not a general one:
     the server action already validates content-type and size, so a
     narrow-but-genuine Thum.io capture must not be thrown away */
  test('accepts a narrow server capture — the guard is mshots-only', async () => {
    const { measure } = recorder(() => 640)
    const { wait } = noWait()

    const res = await captureHomepage({
      ...base,
      serverCapture: async () => 'https://cdn.convex/shot.png',
      measure,
      wait,
      schedule: [0],
    })

    expect(res).toEqual({ ok: true, src: 'https://cdn.convex/shot.png' })
  })

  test('falls back to mshots when the server has no key', async () => {
    const url = mshotUrl('https://example.com')
    const { measure } = recorder((src) => (src === url ? REAL : 0))
    const { wait } = noWait()

    const res = await captureHomepage({ ...base, measure, wait, schedule: [0] })

    expect(res).toEqual({ ok: true, src: url })
  })

  test('falls back to mshots when the server capture will not load', async () => {
    const url = mshotUrl('https://example.com')
    const { measure } = recorder((src) => (src === url ? REAL : 0))
    const { wait } = noWait()

    const res = await captureHomepage({
      ...base,
      serverCapture: async () => 'https://cdn.convex/rotted.png',
      measure,
      wait,
      schedule: [0],
    })

    expect(res).toEqual({ ok: true, src: url })
  })

  test('survives a server capture that throws', async () => {
    const { measure } = recorder(() => 0)
    const { wait } = noWait()

    const res = await captureHomepage({
      ...base,
      serverCapture: async () => { throw new Error('convex down') },
      measure,
      wait,
      schedule: [0],
    })

    expect(res).toEqual({ ok: false })
  })
})
