/* ============================================================
   THE VERDICT FOLD — FR23–FR26, FR33, FR35
   ------------------------------------------------------------
   Pure derivation from the append-only attempt log to the
   numbers the verdict leads with: counts and times, never a
   grade (NG1). The fold is total — any subset of attempts
   produces a verdict, which is what lets FR33 render a partial
   one when a run dies half-measured.

   The AD-2 split is enforced here as arithmetic:
   `undeliverable_ours` lands in its own count, feeds no band,
   and never inflates `noResponse`. Same for `aborted` — a
   killed attempt measured nothing.
   ============================================================ */
import { entersRepricing, type Outcome } from './outcome'
import type { MeasuredReachability } from './bands'

/* The slice of an attempt row the fold reads. Structural, so the
   fold can be fed rows from the DB or fixtures from a test without
   importing generated types into core. */
export type AttemptSlice = {
  channel: 'phone' | 'email' | 'form'
  window: 'business' | 'lunch' | 'after_hours' | 'alt_day' | null
  outcome: Outcome | null
  dispatchedAt: number | null
  metrics: {
    /* phone */
    answeredBy?: 'human' | 'voicemail' | 'unknown'
    msToAnswer?: number
    /* email + form */
    msToFirstReply?: number
    replyClass?: 'human' | 'autoresponder' | 'bounce' | 'none'
  } | null
}

export type VerdictCounts = {
  dispatched: number
  reachedHuman: number
  noResponse: number
  unreachableOurs: number
}

export type VerdictFold = {
  counts: VerdictCounts
  fastestResponseMs: number | null
  measured: MeasuredReachability
  /* FR33 — true when any channel produced zero usable measurements */
  partial: boolean
  /* FR35 — the alerting-bias note applies once a disclosed call has
     gone out while async clocks were still running */
  biasNote: boolean
}

/** `responded` means a human dealt with it — the phone adapter resolves
    voicemail as `no_response` + `answeredBy: 'voicemail'`, because a
    machine answering is precisely the yard not responding. That
    convention is what keeps this fold channel-blind on the finding
    side (AD-1). */
export function foldVerdict(attempts: AttemptSlice[]): VerdictFold {
  const dispatched = attempts.filter((a) => a.dispatchedAt !== null)

  const counts: VerdictCounts = {
    dispatched: dispatched.length,
    reachedHuman: dispatched.filter((a) => a.outcome === 'responded').length,
    noResponse: dispatched.filter((a) => a.outcome === 'no_response').length,
    unreachableOurs: dispatched.filter((a) => a.outcome === 'undeliverable_ours').length,
  }

  /* fastest human response across every channel that got one */
  const times: number[] = []
  for (const a of dispatched) {
    if (a.outcome !== 'responded' || !a.metrics) continue
    if (typeof a.metrics.msToAnswer === 'number') times.push(a.metrics.msToAnswer)
    if (typeof a.metrics.msToFirstReply === 'number') times.push(a.metrics.msToFirstReply)
  }
  const fastestResponseMs = times.length ? Math.min(...times) : null

  /* --- the measured shape the AD-11 mapping consumes --- */
  const phoneValid = dispatched.filter(
    (a) => a.channel === 'phone' && a.outcome !== null && entersRepricing(a.outcome),
  )
  const afterHoursAttempt = phoneValid.find((a) => a.window === 'after_hours')
  const phone: MeasuredReachability['phone'] = phoneValid.length
    ? {
        valid: phoneValid.length,
        reachedHuman: phoneValid.filter((a) => a.outcome === 'responded').length,
        afterHours: afterHoursAttempt
          ? afterHoursAttempt.outcome === 'responded'
            ? 'human'
            : afterHoursAttempt.metrics?.answeredBy === 'voicemail'
              ? 'voicemail'
              : 'rang_out'
          : null,
      }
    : null

  const asyncValid = dispatched.filter(
    (a) => a.channel !== 'phone' && a.outcome !== null && entersRepricing(a.outcome),
  )
  const asyncReplied = asyncValid.filter((a) => a.outcome === 'responded')
  const replyTimes = asyncReplied
    .map((a) => a.metrics?.msToFirstReply)
    .filter((x): x is number => typeof x === 'number')
  const async: MeasuredReachability['async'] = asyncValid.length
    ? {
        valid: asyncValid.length,
        replied: asyncReplied.length,
        fastestReplyMs: replyTimes.length ? Math.min(...replyTimes) : null,
      }
    : null

  /* FR33 — a channel that was attempted but yielded nothing usable,
     or never attempted at all, makes the verdict partial. */
  const channels: AttemptSlice['channel'][] = ['phone', 'email', 'form']
  const usable = (c: AttemptSlice['channel']) =>
    dispatched.some((a) => a.channel === c && a.outcome !== null && entersRepricing(a.outcome))
  const partial = !channels.every(usable)

  const phoneWentOut = dispatched.some((a) => a.channel === 'phone')
  const biasNote = phoneWentOut && asyncValid.length > 0

  return { counts, fastestResponseMs, measured: { phone, async }, partial, biasNote }
}
