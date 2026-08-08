/* ============================================================
   MEASURED → BANDS — AD-11, FR26, G2
   ------------------------------------------------------------
   The existing leak engine (../../../common/leaks.js) prices the leak
   from band STRINGS the owner tapped. This module is the single
   place measured reachability is translated onto that vocabulary,
   so the re-priced figure runs through the same arithmetic the
   owner already saw — one engine, two sets of inputs, before and
   after held as data.

   leaks.js is NOT modified and NOT imported here (core imports
   nothing outside core). The strings below must match its lookup
   tables byte-for-byte — the en-dashes are load-bearing — and the
   integration test feeds them through the real computeLeaks() to
   prove they are recognised.

   Tri-state discipline (AD-16, one layer up): a channel we did not
   measure maps to null, and null means "keep the owner's own
   answer", never "substitute a default". Attempts that resolved
   `undeliverable_ours` are excluded before anything here is
   called — our infrastructure failing is not his counter failing
   (AD-2), so it must not move his number.

   Every threshold in this file is [ASSUMPTION] — v1 judgment
   calls, to be re-cut when real distributions exist. The PRD
   explicitly prices the mapping as "cheap, preserves the rendered
   arithmetic" (addendum, Mechanism notes).
   ============================================================ */

/* The band vocabularies, exactly as leaks.js spells them. */
export const MISSED_BANDS = [
  'Almost none',
  '1 – 5 a week',
  '6 – 15 a week',
  '15+ a week',
] as const

export const SPEED_BANDS = [
  'Inside the hour',
  'Same day',
  'Next day',
  'Two days or more',
] as const

export const AFTER_HOURS_BANDS = [
  'Voicemail',
  'Nothing, it just rings',
  'Answering service',
  'Someone on call',
] as const

export type MissedBand = (typeof MISSED_BANDS)[number]
export type SpeedBand = (typeof SPEED_BANDS)[number]
export type AfterHoursBand = (typeof AFTER_HOURS_BANDS)[number]

/* What the verdict fold hands this module. Nulls mean unmeasured. */
export type MeasuredReachability = {
  phone: {
    valid: number // attempts where the yard had a real chance (AD-2 filtered)
    reachedHuman: number
    afterHours: 'human' | 'voicemail' | 'rang_out' | null
  } | null
  async: {
    valid: number // email+form attempts that were actually delivered
    replied: number // of those, answered by a human inside the window
    fastestReplyMs: number | null
  } | null
}

const HOUR = 60 * 60 * 1000

/** Share of probe calls that never reached a human → missed-call band.
    The probe measures a rate, not a weekly volume; the band midpoints
    in leaks.js carry the volume, and leaks.js caps the result against
    the owner's own inquiry count so a high band cannot price more
    missed rentals than actually reach the yard.

    NOTE: an earlier version of this comment claimed leaks.js
    "re-applies his own inquiry volume" to the midpoint. It never did —
    the missed-call leak was the one leak fully independent of volume.
    The cap added 2026-08-06 is what finally makes that true-ish, and
    it bounds rather than scales. Do not read this mapping as
    volume-aware.

    Thresholds are [ASSUMPTION]: 0 missed of N → the leak isn't the
    phone; 1 of 3 → the lightest real band; half → the middle; worse →
    the top. The band VOLUMES were re-cut 2026-08-06 against published
    contractor benchmarks (see leaks.js); these SHARE thresholds were
    not — a measured 1-in-3 miss rate still reads as the lightest real
    band, which is now a heavier weekly number than it used to be. */
export function measuredMissedCallsBand(
  phone: MeasuredReachability['phone'],
): MissedBand | null {
  if (!phone || phone.valid === 0) return null
  /* integer count first — `1 - 2/3` overshoots 1/3 in floating point */
  const missedShare = (phone.valid - phone.reachedHuman) / phone.valid
  if (missedShare <= 0) return 'Almost none'
  if (missedShare <= 1 / 3) return '1 – 5 a week'
  if (missedShare <= 1 / 2) return '6 – 15 a week'
  return '15+ a week'
}

/** Fastest measured human response to a written inquiry → quote-speed
    band. Silence for the whole window is 'Two days or more' — the run
    window is 48h, so that is literally what was observed, not a guess. */
export function measuredQuoteSpeedBand(
  async: MeasuredReachability['async'],
): SpeedBand | null {
  if (!async || async.valid === 0) return null
  if (async.replied === 0 || async.fastestReplyMs === null) return 'Two days or more'
  if (async.fastestReplyMs <= HOUR) return 'Inside the hour'
  if (async.fastestReplyMs <= 24 * HOUR) return 'Same day'
  if (async.fastestReplyMs <= 48 * HOUR) return 'Next day'
  return 'Two days or more'
}

/** The after-close attempt's outcome → after-hours coverage band.
    'human' maps to 'Someone on call' — an answering service is not
    distinguishable from staff on a disclosed call, and 'Someone on
    call' carries the LOWER leak weight, so ambiguity resolves in the
    yard's favour (the conservative direction the whole scan leans). */
export function measuredAfterHoursBand(
  phone: MeasuredReachability['phone'],
): AfterHoursBand | null {
  if (!phone || phone.afterHours === null) return null
  switch (phone.afterHours) {
    case 'human':
      return 'Someone on call'
    case 'voicemail':
      return 'Voicemail'
    case 'rang_out':
      return 'Nothing, it just rings'
  }
}

export type Substitution = {
  key: 'missedCalls' | 'quoteSpeed' | 'afterHours'
  from: string | null // what the owner self-reported
  to: string // what measurement replaced it with
}

/** Apply measurement over the owner's answers. Returns new answers
    plus the list of substitutions actually made — the verdict stores
    both sides so before/after is data (AD-11). Unmeasured channels
    leave the self-reported answer standing, and appear in no
    substitution row. */
export function substituteBands(
  selfReported: Record<string, unknown>,
  measured: MeasuredReachability,
): { answers: Record<string, unknown>; substitutions: Substitution[] } {
  const subs: Substitution[] = []
  const answers = { ...selfReported }

  const missed = measuredMissedCallsBand(measured.phone)
  if (missed !== null) {
    subs.push({ key: 'missedCalls', from: str(selfReported.missedCalls), to: missed })
    answers.missedCalls = missed
  }

  const speed = measuredQuoteSpeedBand(measured.async)
  if (speed !== null) {
    subs.push({ key: 'quoteSpeed', from: str(selfReported.quoteSpeed), to: speed })
    answers.quoteSpeed = speed
  }

  const after = measuredAfterHoursBand(measured.phone)
  if (after !== null) {
    subs.push({ key: 'afterHours', from: str(selfReported.afterHours), to: after })
    answers.afterHours = after
  }

  return { answers, substitutions: subs }
}

/* The owner answers missed calls on a 0–100 slider now, so a
   self-reported value may be a NUMBER. Render it in the same weekly
   vocabulary the bands use — otherwise the dashboard's before/after
   row shows a blank exactly where his own answer belongs, and the
   substitution reads as if it came from nowhere. */
const str = (x: unknown): string | null =>
  typeof x === 'string'
    ? x
    : typeof x === 'number' && Number.isFinite(x)
      ? x === 0
        ? 'Almost none'
        : `${x} a week`
      : null
