/* FR27 — the hours arithmetic. The verdict's competitor context is
   public fact only; these tests pin what "fact" means: published
   periods in, minutes out, unpublished = unmeasured (AD-16). */
import { describe, expect, test } from 'vitest'
import {
  weeklyCoverage,
  weeklyOpenMinutes,
  minutesOpenWhileClosed,
  compareHours,
  SLOTS_PER_WEEK,
  type GooglePeriod,
} from './hours'

/* Mon–Fri 08:00–17:00, Google shape (day 0 = Sunday) */
const WEEKDAYS_8_TO_5: GooglePeriod[] = [1, 2, 3, 4, 5].map((day) => ({
  open: { day, time: '0800' },
  close: { day, time: '1700' },
}))

describe('weeklyCoverage', () => {
  test('a plain business week', () => {
    const cov = weeklyCoverage(WEEKDAYS_8_TO_5)!
    expect(weeklyOpenMinutes(cov)).toBe(5 * 9 * 60) // 45h
  })

  test('the JS-API {hours, minutes} shape parses too', () => {
    const cov = weeklyCoverage([
      { open: { day: 1, hours: 8, minutes: 0 }, close: { day: 1, hours: 17, minutes: 0 } },
    ])!
    expect(weeklyOpenMinutes(cov)).toBe(9 * 60)
  })

  test('24/7 is one open with no close', () => {
    const cov = weeklyCoverage([{ open: { day: 0, time: '0000' } }])!
    expect(cov.every(Boolean)).toBe(true)
    expect(weeklyOpenMinutes(cov)).toBe(SLOTS_PER_WEEK * 15)
  })

  test('overnight periods wrap the week boundary', () => {
    // Saturday 22:00 → Sunday 02:00
    const cov = weeklyCoverage([{ open: { day: 6, time: '2200' }, close: { day: 0, time: '0200' } }])!
    expect(weeklyOpenMinutes(cov)).toBe(4 * 60)
    expect(cov[0]).toBe(true) // Sunday 00:00 is covered
  })

  test('unpublished hours are unmeasured, never "closed all week" (AD-16)', () => {
    expect(weeklyCoverage(null)).toBeNull()
    expect(weeklyCoverage([])).toBeNull()
    expect(weeklyCoverage([{ open: null }])).toBeNull()
    expect(weeklyCoverage([{ open: { day: 9, time: '0800' } }])).toBeNull() // garbage day
  })
})

describe('minutesOpenWhileClosed — the FR27 punchline', () => {
  test('a 24/7 competitor against a business-week yard', () => {
    const yard = weeklyCoverage(WEEKDAYS_8_TO_5)!
    const comp = weeklyCoverage([{ open: { day: 0, time: '0000' } }])!
    // 168h week − 45h yard-open = 123h reachable-only-there
    expect(minutesOpenWhileClosed(yard, comp)).toBe(123 * 60)
  })

  test('identical hours leave no gap', () => {
    const yard = weeklyCoverage(WEEKDAYS_8_TO_5)!
    expect(minutesOpenWhileClosed(yard, yard)).toBe(0)
  })
})

describe('compareHours', () => {
  const SATURDAY_TOO: GooglePeriod[] = [
    ...WEEKDAYS_8_TO_5,
    { open: { day: 6, time: '0800' }, close: { day: 6, time: '1200' } },
  ]

  test('ranks by hours-while-you-closed and counts only meaningful gaps', () => {
    const r = compareHours(WEEKDAYS_8_TO_5, [
      { name: 'Same Hours Rentals', periods: WEEKDAYS_8_TO_5 },
      { name: 'Saturday Yard', periods: SATURDAY_TOO },
      { name: 'Always Open Co', national: true, periods: [{ open: { day: 0, time: '0000' } }] },
      { name: 'No Hours Listed', periods: null },
    ])
    expect(r.yardWeeklyHours).toBe(45)
    expect(r.measured).toBe(3)
    expect(r.unmeasured).toBe(1) // counted toward neither side
    expect(r.competitors[0].name).toBe('Always Open Co')
    expect(r.competitors[0].hoursWhileYouClosed).toBe(123)
    expect(r.competitors[1].name).toBe('Saturday Yard')
    expect(r.competitors[1].hoursWhileYouClosed).toBe(4)
    // Same Hours (0h gap) is not "open while you're closed"
    expect(r.openWhileYouClosedCount).toBe(2)
  })

  test('a yard with no published hours compares nothing — tri-state up the stack', () => {
    const r = compareHours(null, [{ name: 'X', periods: SATURDAY_TOO }])
    expect(r.yardWeeklyHours).toBeNull()
    expect(r.openWhileYouClosedCount).toBeNull()
    expect(r.competitors[0].hoursWhileYouClosed).toBeNull()
    expect(r.competitors[0].weeklyHours).toBe(49) // their fact still stands
  })
})
