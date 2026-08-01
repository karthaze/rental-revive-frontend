/* ============================================================
   WINDOW ARITHMETIC — AD-8, FR7–FR10, NFR4
   ------------------------------------------------------------
   Everything here is yard-local. The IANA timezone is resolved
   once at activation and stored on the run; every function in
   this module takes it as an argument and nothing ever re-derives
   it. A 20:00 cap applied in the wrong timezone is a call at 11pm
   to someone's cell — NFR4 calls that out by name.

   The callable day is partitioned into three windows:

     business     08:00–12:00 and 13:30–17:30
     lunch        12:00–13:30
     after_hours  17:30–20:00

   FR7 wants attempts spread across business hours, a lunch
   window, and after close; FR10 caps everything at 08:00–20:00,
   max 4 attempts, 90 minutes apart. FR9's fourth attempt goes to
   `alt_day`: a calendar day no prior attempt used — "different
   window" at the day level, which is why alt_day is a member of
   the window enum rather than a flag.

   No Date.now() in this module — callers pass `now`, which keeps
   every function replayable in tests and in reconciliation.

   All local⇄epoch conversion goes through Intl, so DST shifts are
   handled by the platform, not by us. During a spring-forward gap
   the two-pass estimate lands on the shifted wall-clock time,
   which for scheduling purposes is the correct answer: the slot
   fires at the moment the wall clock first shows a valid time.
   ============================================================ */

export type BaseWindow = 'business' | 'lunch' | 'after_hours'
export type Window = BaseWindow | 'alt_day'

export const MAX_ATTEMPTS = 4 // FR10
export const MIN_GAP_MS = 90 * 60 * 1000 // FR10
export const FIRST_ATTEMPT_DELAY_MS = 60 * 1000 // FR8 — while he is watching

const DAY_START_MIN = 8 * 60 // FR10 — never before 08:00 local
const DAY_END_MIN = 20 * 60 // FR10 — never after 20:00 local

/* The partition. `business` has two segments because lunch splits it. */
const SEGMENTS: { window: BaseWindow; start: number; end: number }[] = [
  { window: 'business', start: 8 * 60, end: 12 * 60 },
  { window: 'lunch', start: 12 * 60, end: 13 * 60 + 30 },
  { window: 'business', start: 13 * 60 + 30, end: 17 * 60 + 30 },
  { window: 'after_hours', start: 17 * 60 + 30, end: DAY_END_MIN },
]

export const BASE_WINDOWS: BaseWindow[] = ['business', 'lunch', 'after_hours']

/* ------------------------------------------------------------
   local time plumbing
   ------------------------------------------------------------ */

type Parts = { y: number; mo: number; d: number; h: number; mi: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>()
const fmt = (tz: string): Intl.DateTimeFormat => {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}

/** Wall-clock parts of an instant, in the yard's zone. */
export function localParts(epochMs: number, tz: string): Parts {
  const out: Record<string, number> = {}
  for (const p of fmt(tz).formatToParts(epochMs)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    y: out.year,
    mo: out.month,
    d: out.day,
    /* Intl renders midnight as 24 in some ICU builds */
    h: out.hour === 24 ? 0 : out.hour,
    mi: out.minute,
  }
}

/** Minutes past local midnight. */
export const localMinutes = (epochMs: number, tz: string): number => {
  const p = localParts(epochMs, tz)
  return p.h * 60 + p.mi
}

/** 'YYYY-MM-DD' in yard-local time — the alt_day day-identity key. */
export const localDayKey = (epochMs: number, tz: string): string => {
  const p = localParts(epochMs, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}

/** The instant whose wall clock in `tz` reads the given local time.
    Two-pass offset estimation; converges everywhere except inside a
    DST gap, where it lands on the shifted (valid) wall time. */
export function zonedEpoch(
  tz: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): number {
  const wanted = Date.UTC(y, mo - 1, d, h, mi)
  let epoch = wanted
  for (let i = 0; i < 2; i++) {
    const p = localParts(epoch, tz)
    const shows = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)
    epoch += wanted - shows
  }
  return epoch
}

/* Calendar-day shift, timezone-free by construction. */
const shiftDay = (p: Parts, days: number): Parts => {
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d + days))
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: 0, mi: 0 }
}

/* ------------------------------------------------------------
   classification and placement
   ------------------------------------------------------------ */

/** Which window an instant falls in, or null outside 08:00–20:00. */
export function windowOf(epochMs: number, tz: string): BaseWindow | null {
  const m = localMinutes(epochMs, tz)
  const seg = SEGMENTS.find((s) => m >= s.start && m < s.end)
  return seg ? seg.window : null
}

/** Earliest instant ≥ `after` that falls inside the named window,
    scanning forward day by day. */
export function nextSlotInWindow(
  window: BaseWindow,
  after: number,
  tz: string,
): number {
  const segs = SEGMENTS.filter((s) => s.window === window)
  const today = localParts(after, tz)
  for (let offset = 0; offset < 8; offset++) {
    const day = shiftDay(today, offset)
    const candidates = segs
      .map((s) => {
        const start = zonedEpoch(tz, day.y, day.mo, day.d, Math.floor(s.start / 60), s.start % 60)
        const end = zonedEpoch(tz, day.y, day.mo, day.d, Math.floor(s.end / 60), s.end % 60)
        return end <= after ? null : Math.max(start, after)
      })
      .filter((x): x is number => x !== null)
    if (candidates.length) return Math.min(...candidates)
  }
  /* Eight days without the window occurring cannot happen with the
     static partition above; guard anyway. */
  throw new Error(`no ${window} slot found within 8 days`)
}

/** Earliest callable instant ≥ `after` — any window (FR10 clamp). */
export function nextCallableSlot(after: number, tz: string): number {
  const m = localMinutes(after, tz)
  if (m >= DAY_START_MIN && m < DAY_END_MIN) return after
  const p = localParts(after, tz)
  const day = m < DAY_START_MIN ? p : shiftDay(p, 1)
  return zonedEpoch(tz, day.y, day.mo, day.d, DAY_START_MIN / 60, 0)
}

export type Placement = { window: Window; scheduledFor: number }

/** FR8: the first attempt fires at activation + 60s — the owner is
    watching the dashboard and this is the conversion moment — unless
    that lands outside 08:00–20:00 local, in which case FR10 wins and
    it waits for the next morning. */
export function placeFirstAttempt(activatedAt: number, tz: string): Placement {
  const at = nextCallableSlot(activatedAt + FIRST_ATTEMPT_DELAY_MS, tz)
  return { window: windowOf(at, tz) ?? 'business', scheduledFor: at }
}

/** FR9/FR10 retry placement. Returns null when the attempt budget is
    spent. Prefers the soonest slot among windows this run has not
    used; when all three base windows are used, the fourth attempt
    goes to a calendar day no prior attempt touched (`alt_day`). */
export function placeRetry(args: {
  now: number
  tz: string
  windowsUsed: Window[]
  priorAttemptsAt: number[] // dispatch/schedule times of every prior attempt
}): Placement | null {
  const { now, tz, windowsUsed, priorAttemptsAt } = args
  if (priorAttemptsAt.length >= MAX_ATTEMPTS) return null // FR10 cap

  const lastAt = priorAttemptsAt.length ? Math.max(...priorAttemptsAt) : now
  const earliest = Math.max(now, lastAt + MIN_GAP_MS) // FR10 spacing

  const unused = BASE_WINDOWS.filter((w) => !windowsUsed.includes(w))
  if (unused.length) {
    const placed = unused
      .map((w) => ({ window: w as Window, scheduledFor: nextSlotInWindow(w, earliest, tz) }))
      .sort((a, b) => a.scheduledFor - b.scheduledFor)[0]
    return placed
  }

  /* FR9 — every base window burned: a different DAY is the different
     window. First callable moment on a local calendar day no prior
     attempt used. */
  const usedDays = new Set(priorAttemptsAt.map((t) => localDayKey(t, tz)))
  let at = nextCallableSlot(earliest, tz)
  for (let i = 0; i < 8; i++) {
    const key = localDayKey(at, tz)
    if (!usedDays.has(key)) return { window: 'alt_day', scheduledFor: at }
    const p = shiftDay(localParts(at, tz), 1)
    at = zonedEpoch(tz, p.y, p.mo, p.d, DAY_START_MIN / 60, 0)
  }
  return null
}
