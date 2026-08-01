/* Window arithmetic — FR7–FR10, NFR4. Everything yard-local, and the
   assertions read local wall-clock via the same Intl path the code
   uses, so a platform tz-data change breaks tests, not yards. */
import { describe, expect, test } from 'vitest'
import {
  localMinutes,
  localDayKey,
  zonedEpoch,
  windowOf,
  nextSlotInWindow,
  nextCallableSlot,
  placeFirstAttempt,
  placeRetry,
  MIN_GAP_MS,
  MAX_ATTEMPTS,
} from './windows'

const CHI = 'America/Chicago'

describe('local time plumbing', () => {
  test('zonedEpoch round-trips wall-clock time', () => {
    const at = zonedEpoch(CHI, 2026, 3, 3, 9, 30) // 09:30 CST
    expect(localMinutes(at, CHI)).toBe(9 * 60 + 30)
    expect(localDayKey(at, CHI)).toBe('2026-03-03')
  })

  test('round-trips across the spring-forward boundary', () => {
    // DST starts 2026-03-08 in the US; the day after must still resolve
    const before = zonedEpoch(CHI, 2026, 3, 7, 9, 0)
    const after = zonedEpoch(CHI, 2026, 3, 9, 9, 0)
    expect(localMinutes(before, CHI)).toBe(9 * 60)
    expect(localMinutes(after, CHI)).toBe(9 * 60)
    // wall-clock distance is 48h but absolute distance is 47h — DST happened
    expect(after - before).toBe(47 * 3600 * 1000)
  })
})

describe('window classification (FR7)', () => {
  const cases: [number, number, string | null][] = [
    [7, 59, null], // before 08:00 — FR10
    [8, 0, 'business'],
    [11, 59, 'business'],
    [12, 0, 'lunch'],
    [13, 29, 'lunch'],
    [13, 30, 'business'],
    [17, 29, 'business'],
    [17, 30, 'after_hours'],
    [19, 59, 'after_hours'],
    [20, 0, null], // 20:00 cap — FR10
  ]
  test.each(cases)('%i:%i → %s', (h, m, want) => {
    expect(windowOf(zonedEpoch(CHI, 2026, 3, 3, h, m), CHI)).toBe(want)
  })
})

describe('first attempt (FR8 vs FR10)', () => {
  test('fires at T+60s while the owner is watching', () => {
    const activated = zonedEpoch(CHI, 2026, 3, 3, 10, 0)
    const p = placeFirstAttempt(activated, CHI)
    expect(p.scheduledFor).toBe(activated + 60_000)
    expect(p.window).toBe('business')
  })

  test('an evening activation waits for 08:00 — FR10 beats FR8', () => {
    const activated = zonedEpoch(CHI, 2026, 3, 3, 21, 15)
    const p = placeFirstAttempt(activated, CHI)
    expect(localMinutes(p.scheduledFor, CHI)).toBe(8 * 60)
    expect(localDayKey(p.scheduledFor, CHI)).toBe('2026-03-04')
  })

  test('a 05:00 activation waits for the same morning', () => {
    const activated = zonedEpoch(CHI, 2026, 3, 3, 5, 0)
    const p = placeFirstAttempt(activated, CHI)
    expect(localMinutes(p.scheduledFor, CHI)).toBe(8 * 60)
    expect(localDayKey(p.scheduledFor, CHI)).toBe('2026-03-03')
  })
})

describe('retry placement (FR9, FR10)', () => {
  test('prefers the soonest unused window, ≥90min after the last attempt', () => {
    const first = zonedEpoch(CHI, 2026, 3, 3, 9, 1)
    const now = zonedEpoch(CHI, 2026, 3, 3, 9, 4)
    const p = placeRetry({
      now,
      tz: CHI,
      windowsUsed: ['business'],
      priorAttemptsAt: [first],
    })!
    expect(p.window).toBe('lunch') // 12:00 beats 17:30
    expect(localMinutes(p.scheduledFor, CHI)).toBe(12 * 60)
    expect(p.scheduledFor - first).toBeGreaterThanOrEqual(MIN_GAP_MS)
  })

  test('spacing pushes a slot forward inside a window', () => {
    const first = zonedEpoch(CHI, 2026, 3, 3, 11, 30)
    const p = placeRetry({
      now: first + 60_000,
      tz: CHI,
      windowsUsed: ['business'],
      priorAttemptsAt: [first],
    })!
    // 90 min after 11:30 is 13:00 — inside lunch, so it fires at 13:00,
    // not at the window's noon start
    expect(p.window).toBe('lunch')
    expect(localMinutes(p.scheduledFor, CHI)).toBe(13 * 60)
  })

  test('all base windows burned → alt_day on an unused calendar day (FR9)', () => {
    const day = (h: number) => zonedEpoch(CHI, 2026, 3, 3, h, 0)
    const p = placeRetry({
      now: day(19),
      tz: CHI,
      windowsUsed: ['business', 'lunch', 'after_hours'],
      priorAttemptsAt: [day(9), day(12), day(18)],
    })!
    expect(p.window).toBe('alt_day')
    expect(localDayKey(p.scheduledFor, CHI)).toBe('2026-03-04')
    expect(localMinutes(p.scheduledFor, CHI)).toBeGreaterThanOrEqual(8 * 60)
  })

  test('the cap is the cap (FR10)', () => {
    const day = (h: number) => zonedEpoch(CHI, 2026, 3, 3, h, 0)
    const p = placeRetry({
      now: day(19),
      tz: CHI,
      windowsUsed: ['business', 'lunch', 'after_hours', 'alt_day'],
      priorAttemptsAt: [day(9), day(12), day(15), day(18)],
    })
    expect(p).toBeNull()
    expect(MAX_ATTEMPTS).toBe(4)
  })
})

describe('slot search primitives', () => {
  test('nextSlotInWindow rolls to tomorrow when today is spent', () => {
    const evening = zonedEpoch(CHI, 2026, 3, 3, 19, 45)
    const slot = nextSlotInWindow('lunch', evening, CHI)
    expect(localDayKey(slot, CHI)).toBe('2026-03-04')
    expect(localMinutes(slot, CHI)).toBe(12 * 60)
  })

  test('nextCallableSlot is identity inside the day, next-08:00 outside', () => {
    const inside = zonedEpoch(CHI, 2026, 3, 3, 14, 0)
    expect(nextCallableSlot(inside, CHI)).toBe(inside)
    const late = zonedEpoch(CHI, 2026, 3, 3, 23, 0)
    expect(localMinutes(nextCallableSlot(late, CHI), CHI)).toBe(8 * 60)
    expect(localDayKey(nextCallableSlot(late, CHI), CHI)).toBe('2026-03-04')
  })
})
