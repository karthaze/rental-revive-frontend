/* AD-11 — the measured→band mapping, proven against the REAL leak
   engine. The strings this module emits must be recognised by
   computeLeaks()'s lookup tables byte-for-byte (en-dashes included);
   feeding them through the actual engine is the only test that
   cannot drift. leaks.js itself is untouched. */
import { describe, expect, test } from 'vitest'
import {
  MISSED_BANDS,
  SPEED_BANDS,
  AFTER_HOURS_BANDS,
  measuredMissedCallsBand,
  measuredQuoteSpeedBand,
  measuredAfterHoursBand,
  substituteBands,
} from './bands'
// the one engine (AD-11) — plain JS from the SPA
import { computeLeaks } from '../../../common/leaks.js'
import { SEGMENTS } from '../../../common/segments.js'

/* fleetBands drives which ticket brackets the scan offers — keyed by
   the fleet strings byte-for-byte. A typo'd or orphaned key fails
   SILENTLY (the widget falls back to the full band list), so the
   contract has to fail loudly here instead. */
describe('fleetBands: every line of iron prices somewhere', () => {
  test('every fleet entry has a valid [lo, hi] window', () => {
    for (const seg of SEGMENTS) {
      for (const m of seg.fleet) {
        const w = (seg as { fleetBands: Record<string, [number, number]> }).fleetBands[m]
        expect(w, `${seg.id} · "${m}" has no band window`).toBeDefined()
        const [lo, hi] = w
        expect(lo, `${seg.id} · ${m}`).toBeGreaterThanOrEqual(0)
        expect(hi, `${seg.id} · ${m}`).toBeLessThanOrEqual(seg.ticketBands.length - 1)
        expect(lo, `${seg.id} · ${m}`).toBeLessThanOrEqual(hi)
      }
      /* and no orphan keys — a renamed fleet string must not leave a
         stale window behind */
      for (const k of Object.keys((seg as { fleetBands: Record<string, unknown> }).fleetBands)) {
        expect(seg.fleet, `${seg.id} · orphan fleetBands key "${k}"`).toContain(k)
      }
    }
  })

  test('every segment can still surface its top and bottom band', () => {
    /* the windows partition the ladder — some machine must unlock the
       cheapest bracket and some machine the dearest, or a bracket is
       dead weight nobody can ever see */
    for (const seg of SEGMENTS) {
      const fb = (seg as { fleetBands: Record<string, [number, number]> }).fleetBands
      const windows = Object.values(fb)
      expect(windows.some(([lo]) => lo === 0), `${seg.id} · no machine unlocks band 0`).toBe(true)
      expect(
        windows.some(([, hi]) => hi === seg.ticketBands.length - 1),
        `${seg.id} · no machine unlocks the top band`,
      ).toBe(true)
    }
  })
})

const HOUR = 3600_000

const state = (over: Record<string, unknown>) => ({
  segment: 'material',
  ticket: '$3,000 – $8,000',
  inquiries: '60 – 120',
  closeRate: 40,
  missedCalls: 'Almost none',
  afterHours: 'Voicemail',
  quoteSpeed: 'Inside the hour',
  quotePile: null,
  quietAccounts: null,
  outbound: null,
  ...over,
})

/* The owner answers missed calls on a 0–100 slider (a NUMBER); the
   probe substitutes a band STRING. Both shapes reach the same engine,
   so the seam between them is where a regression would hide. */
describe('missed calls: slider numbers and probe bands price together', () => {
  const calls = (over: Record<string, unknown>) =>
    computeLeaks(state(over)).leaks.find((l: { id: string }) => l.id === 'calls')!

  test('a number prices, and prices monotonically', () => {
    const a = calls({ missedCalls: 2 })
    const b = calls({ missedCalls: 8 })
    const c = calls({ missedCalls: 40 })
    expect(a.amount).toBeGreaterThan(0)
    expect(b.amount).toBeGreaterThan(a.amount)
    expect(c.amount).toBeGreaterThan(b.amount)
  })

  test('slider 0 is an ANSWER, not an unanswered question', () => {
    const zero = calls({ missedCalls: 0 })
    expect(zero.amount).toBe(0)
    expect(zero.score).toBe(0)
    /* the regression this guards: `!!0` would render the leak as
       never asked, and the report would show it as an open question */
    expect(zero.answered).toBe(true)
  })

  test('an untouched question is still unanswered', () => {
    expect(calls({ missedCalls: '' }).answered).toBe(false)
  })

  test('numeric score thresholds meet the band boundaries exactly', () => {
    // 1–5 → 2, 6–15 → 4, 16+ → 5, mirroring MISSED_BANDS
    expect(calls({ missedCalls: 5 }).score).toBe(calls({ missedCalls: '1 – 5 a week' }).score)
    expect(calls({ missedCalls: 15 }).score).toBe(calls({ missedCalls: '6 – 15 a week' }).score)
    expect(calls({ missedCalls: 60 }).score).toBe(calls({ missedCalls: '15+ a week' }).score)
  })

  test('a band string still prices after the slider landed (probe path)', () => {
    for (const band of MISSED_BANDS.slice(1)) {
      expect(calls({ missedCalls: band }).amount, band).toBeGreaterThan(0)
    }
  })

  test('the volume bound caps at the yard’s own inquiry flow', () => {
    /* 'Under 25' → 18 inquiries/mo. 100 a week is 433/mo raw, so the
       cap must bind and the arithmetic must say so. */
    const capped = calls({ missedCalls: 100, inquiries: 'Under 25' })
    const uncapped = calls({ missedCalls: 100, inquiries: '120+' })
    expect(capped.amount).toBeLessThan(uncapped.amount)
    expect(capped.formula).toContain('capped')
    /* a small yard cannot be priced on more missed rentals than reach it */
    expect(capped.formula).toContain('18 inquiries')
  })

  test('nonsense numbers contribute nothing', () => {
    expect(calls({ missedCalls: -5 }).amount).toBe(0)
    expect(calls({ missedCalls: NaN }).amount).toBe(0)
  })

  test('a numeric self-report survives into the substitution row', () => {
    const { substitutions } = substituteBands(
      { missedCalls: 12 },
      { phone: { valid: 3, reachedHuman: 0, afterHours: null }, async: null },
    )
    const row = substitutions.find((s) => s.key === 'missedCalls')!
    /* not null — the dashboard renders `from`, and a blank there reads
       as if the substitution came from nowhere */
    expect(row.from).toBe('12 a week')
    expect(row.to).toBe('15+ a week')
  })
})

/* Ticket is a slider too, and it multiplies EVERY leak — so a wrong
   shape here misprices the whole model, not one row. */
describe('ticket: slider numbers and band labels price together', () => {
  const total = (over: Record<string, unknown>) => computeLeaks(state(over)).monthly

  test('a number prices, and scales the whole model linearly', () => {
    const a = total({ ticket: 4000, missedCalls: 8 })
    const b = total({ ticket: 8000, missedCalls: 8 })
    expect(a).toBeGreaterThan(0)
    expect(b / a).toBeCloseTo(2, 5)
  })

  test('the band label still resolves to its segment midpoint', () => {
    // material segment: '$3,000 – $8,000' → 5,200
    expect(total({ ticket: '$3,000 – $8,000', missedCalls: 8 }))
      .toBeCloseTo(total({ ticket: 5200, missedCalls: 8 }), 5)
  })

  test('no ticket means no money model at all', () => {
    /* `live` keys off ticket > 0. A guessed fallback here would price
       the entire scan off a number the owner never gave. */
    for (const bad of ['', null, undefined, 0, -100, NaN]) {
      expect(total({ ticket: bad, missedCalls: 20, quotePile: '50 – 150' }), String(bad)).toBe(0)
    }
  })

  test('an unrecognised label does not silently fall back', () => {
    expect(total({ ticket: '$999 – $1', missedCalls: 8 })).toBe(0)
  })
})

/* The plausibility bound: the five leaks compound against the same
   flow, and with the worst answer everywhere the sum exceeds what the
   yard's own answers imply it books. The total is capped at half the
   implied booked revenue — and the cap must be visible bookkeeping,
   never a silent shrink. */
describe('the plausibility bound on the total', () => {
  test('a normal scan is untouched', () => {
    const L = computeLeaks(state({ missedCalls: 3, quotePile: '20 – 50', quietAccounts: '10 – 25' }))
    expect(L.clamped).toBe(false)
    expect(L.monthly).toBe(L.rawMonthly)
  })

  test('worst-case answers clamp to half the implied bookings', () => {
    const L = computeLeaks(state({
      ticket: '$8,000+',            // material top band, 13,000
      inquiries: '120+',
      missedCalls: 150,
      afterHours: 'Nothing, it just rings',
      quoteSpeed: 'Two days or more',
      quotePile: '150+',
      quietAccounts: '75+',
      outbound: 'No, we wait for the phone',
    }))
    expect(L.clamped).toBe(true)
    expect(L.rawMonthly).toBeGreaterThan(L.monthly)
    expect(L.monthly).toBeCloseTo(L.impliedMonthly * 0.5, 5)
    expect(L.annual).toBeCloseTo(L.monthly * 12, 5)
    /* the ledger must reconcile: rows − bound line = headline */
    const rows = L.leaks.reduce((s: number, l: { amount: number }) => s + l.amount, 0)
    expect(rows - (L.rawMonthly - L.monthly)).toBeCloseTo(L.monthly, 5)
  })

  test('no inquiry answer means no revenue base, means no clamp', () => {
    /* the early meter climb must never be zeroed by a bound that has
       nothing to bound against */
    const L = computeLeaks(state({ inquiries: null, missedCalls: 150 }))
    expect(L.impliedMonthly).toBe(0)
    expect(L.clamped).toBe(false)
    expect(L.monthly).toBe(L.rawMonthly)
    expect(L.monthly).toBeGreaterThan(0)
  })

  test('the leak score is not clamped — urgency is not money', () => {
    const worst = state({
      inquiries: 'Under 25', ticket: '$8,000+', missedCalls: 150,
      quoteSpeed: 'Two days or more', quotePile: '150+',
      quietAccounts: '75+', outbound: 'No, we wait for the phone',
      afterHours: 'Nothing, it just rings',
    })
    const L = computeLeaks(worst)
    expect(L.clamped).toBe(true)
    expect(L.leakScore).toBeGreaterThanOrEqual(20)
  })
})

describe('the emitted strings are the leak engine’s own vocabulary', () => {
  test('every missed-calls band moves the real engine', () => {
    for (const band of MISSED_BANDS.slice(1)) {
      const L = computeLeaks(state({ missedCalls: band }))
      const calls = L.leaks.find((l: { id: string }) => l.id === 'calls')
      expect(calls!.amount, band).toBeGreaterThan(0)
      expect(calls!.score, band).toBeGreaterThan(0)
    }
    // negative control: a string the engine does not know contributes nothing
    const junk = computeLeaks(state({ missedCalls: '1-5 a week' /* wrong dash */ }))
    expect(junk.leaks.find((l: { id: string }) => l.id === 'calls')!.amount).toBe(0)
  })

  test('every quote-speed band moves the real engine', () => {
    for (const band of SPEED_BANDS.slice(1)) {
      const L = computeLeaks(state({ quoteSpeed: band }))
      expect(L.leaks.find((l: { id: string }) => l.id === 'speed')!.amount, band).toBeGreaterThan(0)
    }
  })

  test('after-hours bands weight the call leak in the engine', () => {
    const base = state({ missedCalls: '6 – 15 a week' })
    const rings = computeLeaks({ ...base, afterHours: 'Nothing, it just rings' })
    const covered = computeLeaks({ ...base, afterHours: 'Someone on call' })
    const call = (L: { leaks: { id: string; amount: number }[] }) =>
      L.leaks.find((l) => l.id === 'calls')!.amount
    expect(call(rings)).toBeGreaterThan(call(covered))
    expect(AFTER_HOURS_BANDS).toContain('Nothing, it just rings')
  })
})

describe('phone → missed-calls band', () => {
  test('null when unmeasured — tri-state holds one layer up (AD-16)', () => {
    expect(measuredMissedCallsBand(null)).toBeNull()
    expect(measuredMissedCallsBand({ valid: 0, reachedHuman: 0, afterHours: null })).toBeNull()
  })
  test('all answered → the leak is not the phone', () => {
    expect(measuredMissedCallsBand({ valid: 3, reachedHuman: 3, afterHours: null })).toBe(
      'Almost none',
    )
  })
  test('shares map to escalating bands', () => {
    expect(measuredMissedCallsBand({ valid: 3, reachedHuman: 2, afterHours: null })).toBe(
      '1 – 5 a week',
    )
    expect(measuredMissedCallsBand({ valid: 4, reachedHuman: 2, afterHours: null })).toBe(
      '6 – 15 a week',
    )
    expect(measuredMissedCallsBand({ valid: 4, reachedHuman: 1, afterHours: null })).toBe(
      '15+ a week',
    )
  })
})

describe('async → quote-speed band', () => {
  test('null when nothing was delivered', () => {
    expect(measuredQuoteSpeedBand(null)).toBeNull()
    expect(measuredQuoteSpeedBand({ valid: 0, replied: 0, fastestReplyMs: null })).toBeNull()
  })
  test('silence for the whole window is Two days or more — observed, not guessed', () => {
    expect(measuredQuoteSpeedBand({ valid: 2, replied: 0, fastestReplyMs: null })).toBe(
      'Two days or more',
    )
  })
  test('reply times map to the engine’s bands', () => {
    const at = (ms: number) => measuredQuoteSpeedBand({ valid: 2, replied: 1, fastestReplyMs: ms })
    expect(at(20 * 60_000)).toBe('Inside the hour')
    expect(at(5 * HOUR)).toBe('Same day')
    expect(at(31 * HOUR)).toBe('Next day') // the PRD's own 31-hour example
    expect(at(49 * HOUR)).toBe('Two days or more')
  })
})

describe('after-hours attempt → coverage band', () => {
  test('ambiguity resolves in the yard’s favour', () => {
    // a human answering after close could be staff or a service; the
    // mapping picks the band with the LOWER leak weight
    expect(measuredAfterHoursBand({ valid: 1, reachedHuman: 1, afterHours: 'human' })).toBe(
      'Someone on call',
    )
    expect(measuredAfterHoursBand({ valid: 1, reachedHuman: 0, afterHours: 'voicemail' })).toBe(
      'Voicemail',
    )
    expect(measuredAfterHoursBand({ valid: 1, reachedHuman: 0, afterHours: 'rang_out' })).toBe(
      'Nothing, it just rings',
    )
    expect(measuredAfterHoursBand({ valid: 1, reachedHuman: 0, afterHours: null })).toBeNull()
  })
})

describe('substitution — the before/after held as data', () => {
  test('replaces only what was measured; the rest keeps his answer', () => {
    const self = { missedCalls: 'Almost none', quoteSpeed: 'Inside the hour', afterHours: 'Someone on call', ticket: '$3,000 – $8,000' }
    const { answers, substitutions } = substituteBands(self, {
      phone: { valid: 3, reachedHuman: 1, afterHours: 'rang_out' },
      async: null, // email/form never measured — his quoteSpeed answer stands
    })
    expect(answers.missedCalls).toBe('15+ a week')
    expect(answers.afterHours).toBe('Nothing, it just rings')
    expect(answers.quoteSpeed).toBe('Inside the hour') // untouched
    expect(substitutions.map((s) => s.key).sort()).toEqual(['afterHours', 'missedCalls'])
    expect(substitutions.find((s) => s.key === 'missedCalls')).toEqual({
      key: 'missedCalls',
      from: 'Almost none',
      to: '15+ a week',
    })
  })

  test('a fully unmeasured run substitutes nothing', () => {
    const self = { missedCalls: '1 – 5 a week' }
    const { answers, substitutions } = substituteBands(self, { phone: null, async: null })
    expect(substitutions).toEqual([])
    expect(answers).toEqual(self)
  })

  test('measured inputs re-price through the untouched engine (FR26)', () => {
    const self = state({ missedCalls: 'Almost none', quoteSpeed: 'Inside the hour' })
    const before = computeLeaks(self)
    const { answers } = substituteBands(self, {
      phone: { valid: 4, reachedHuman: 1, afterHours: 'rang_out' },
      async: { valid: 2, replied: 1, fastestReplyMs: 31 * HOUR },
    })
    const after = computeLeaks(answers)
    // the same arithmetic, worse inputs, bigger number — and both runs
    // came from the same function, so there is no second engine to drift
    expect(after.monthly).toBeGreaterThan(before.monthly)
    expect(after.leakScore).toBeGreaterThan(before.leakScore)
  })
})
