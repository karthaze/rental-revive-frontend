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

describe('the emitted strings are the leak engine’s own vocabulary', () => {
  test('every missed-calls band moves the real engine', () => {
    for (const band of MISSED_BANDS.slice(1)) {
      const L = computeLeaks(state({ missedCalls: band }))
      const calls = L.leaks.find((l: { id: string }) => l.id === 'calls')
      expect(calls!.amount, band).toBeGreaterThan(0)
      expect(calls!.score, band).toBeGreaterThan(0)
    }
    // negative control: a string the engine does not know contributes nothing
    const junk = computeLeaks(state({ missedCalls: '1-3 a week' /* wrong dash */ }))
    expect(junk.leaks.find((l: { id: string }) => l.id === 'calls')!.amount).toBe(0)
  })

  test('every quote-speed band moves the real engine', () => {
    for (const band of SPEED_BANDS.slice(1)) {
      const L = computeLeaks(state({ quoteSpeed: band }))
      expect(L.leaks.find((l: { id: string }) => l.id === 'speed')!.amount, band).toBeGreaterThan(0)
    }
  })

  test('after-hours bands weight the call leak in the engine', () => {
    const base = state({ missedCalls: '4 – 10 a week' })
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
      '1 – 3 a week',
    )
    expect(measuredMissedCallsBand({ valid: 4, reachedHuman: 2, afterHours: null })).toBe(
      '4 – 10 a week',
    )
    expect(measuredMissedCallsBand({ valid: 4, reachedHuman: 1, afterHours: null })).toBe(
      '10+ a week',
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
    expect(answers.missedCalls).toBe('10+ a week')
    expect(answers.afterHours).toBe('Nothing, it just rings')
    expect(answers.quoteSpeed).toBe('Inside the hour') // untouched
    expect(substitutions.map((s) => s.key).sort()).toEqual(['afterHours', 'missedCalls'])
    expect(substitutions.find((s) => s.key === 'missedCalls')).toEqual({
      key: 'missedCalls',
      from: 'Almost none',
      to: '10+ a week',
    })
  })

  test('a fully unmeasured run substitutes nothing', () => {
    const self = { missedCalls: '1 – 3 a week' }
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
