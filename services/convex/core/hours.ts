/* ============================================================
   OPENING-HOURS COVERAGE — FR27, C6
   ------------------------------------------------------------
   The competitor context in the verdict is PUBLIC FACT ONLY:
   published opening hours, compared against the yard's own. No
   competitor is ever called, emailed or form-tested (C6 —
   permanent). What this module computes is the specific loss
   behind the abstract miss: the hours each week when a customer
   can reach a competitor's counter but not the yard's.

   Input is Google's `periods` shape, from either API surface:
   REST Details gives  { open: {day, time:'0800'}, close: {...} }
   and the JS API adds { hours, minutes } variants. day 0=Sunday.
   A 24/7 listing is a single open period with no close.

   Tri-state as always (AD-16): a listing with no published
   periods measures as null, never as "closed all week".

   Resolution is 15-minute slots — 672 per week — which is finer
   than any published schedule and keeps the bitmap trivial.
   ============================================================ */

export type GooglePeriod = {
  open?: { day?: number; time?: string; hours?: number; minutes?: number } | null
  close?: { day?: number; time?: string; hours?: number; minutes?: number } | null
}

export const SLOTS_PER_DAY = 96 // 15-minute resolution
export const SLOTS_PER_WEEK = 7 * SLOTS_PER_DAY
const MINUTES_PER_SLOT = 15

const slotOf = (p: { day?: number; time?: string; hours?: number; minutes?: number }): number | null => {
  const day = p.day
  if (typeof day !== 'number' || day < 0 || day > 6) return null
  let h: number, m: number
  if (typeof p.time === 'string' && /^\d{4}$/.test(p.time)) {
    h = Number(p.time.slice(0, 2))
    m = Number(p.time.slice(2))
  } else if (typeof p.hours === 'number') {
    h = p.hours
    m = p.minutes ?? 0
  } else {
    return null
  }
  if (h > 24 || m > 59) return null
  return day * SLOTS_PER_DAY + Math.floor((h * 60 + m) / MINUTES_PER_SLOT)
}

/** Published periods → a week-long open/closed bitmap, or null when
    nothing was published (AD-16 — unpublished is unmeasured). */
export function weeklyCoverage(periods: GooglePeriod[] | null | undefined): boolean[] | null {
  if (!Array.isArray(periods) || periods.length === 0) return null
  const cov = new Array<boolean>(SLOTS_PER_WEEK).fill(false)
  let sawValid = false

  for (const period of periods) {
    if (!period?.open) continue
    const start = slotOf(period.open)
    if (start === null) continue
    sawValid = true

    if (!period.close) {
      /* Google's 24/7 convention: one open, no close */
      cov.fill(true)
      return cov
    }
    const end = slotOf(period.close)
    if (end === null) continue

    /* overnight periods wrap the week boundary */
    if (end > start) {
      for (let s = start; s < end; s++) cov[s] = true
    } else {
      for (let s = start; s < SLOTS_PER_WEEK; s++) cov[s] = true
      for (let s = 0; s < end; s++) cov[s] = true
    }
  }
  return sawValid ? cov : null
}

export const weeklyOpenMinutes = (cov: boolean[]): number =>
  cov.filter(Boolean).length * MINUTES_PER_SLOT

/** Minutes per week the competitor is reachable while the yard is not
    — the FR27 punchline, as arithmetic. */
export function minutesOpenWhileClosed(yard: boolean[], competitor: boolean[]): number {
  let slots = 0
  for (let s = 0; s < SLOTS_PER_WEEK; s++) if (competitor[s] && !yard[s]) slots++
  return slots * MINUTES_PER_SLOT
}

export type HoursComparison = {
  yardWeeklyHours: number | null
  measured: number // competitors whose hours were published & parseable
  unmeasured: number // competitors with no published hours — counted nowhere
  competitors: {
    name: string
    national: boolean
    weeklyHours: number
    /* hours/week this competitor's counter is reachable while the
       yard's is closed; null when the yard's own hours are unknown */
    hoursWhileYouClosed: number | null
  }[]
  /* competitors with a meaningful gap (> 1h/week) — the headline count */
  openWhileYouClosedCount: number | null
}

/** The verdict-side fold. Pure; recomputed at read time from stored
    periods so there is no derived copy to drift. */
export function compareHours(
  yardPeriods: GooglePeriod[] | null | undefined,
  competitors: { name: string; national?: boolean; periods?: GooglePeriod[] | null }[],
): HoursComparison {
  const yardCov = weeklyCoverage(yardPeriods)
  const rows: HoursComparison['competitors'] = []
  let unmeasured = 0

  for (const c of competitors) {
    const cov = weeklyCoverage(c.periods)
    if (!cov) {
      unmeasured++
      continue
    }
    rows.push({
      name: c.name,
      national: !!c.national,
      weeklyHours: Math.round(weeklyOpenMinutes(cov) / 60),
      hoursWhileYouClosed: yardCov
        ? Math.round((minutesOpenWhileClosed(yardCov, cov) / 60) * 10) / 10
        : null,
    })
  }
  rows.sort((a, b) => (b.hoursWhileYouClosed ?? 0) - (a.hoursWhileYouClosed ?? 0))

  return {
    yardWeeklyHours: yardCov ? Math.round(weeklyOpenMinutes(yardCov) / 60) : null,
    measured: rows.length,
    unmeasured,
    competitors: rows,
    openWhileYouClosedCount: yardCov
      ? rows.filter((r) => (r.hoursWhileYouClosed ?? 0) > 1).length
      : null,
  }
}
