/* ============================================================
   RECONCILIATION — AD-9's other half
   ------------------------------------------------------------
   Convex actions are at-most-once and webhooks are best-effort:
   a call can be placed, Twilio's callback can be lost, and the
   attempt then sits open until the 48-hour deadline files it as
   OUR unknown. The AD-9 rule for that state is explicit — an
   attempt with a providerRef and no outcome is *reconciled by
   querying the provider*, never re-dispatched.

   This sweep does exactly that for the phone channel: pending
   attempts that dispatched more than a grace period ago are
   looked up by CallSid, and the provider's own record resolves
   them through the same status mapping the webhook uses. A call
   Twilio says completed is a pickup, and a pickup can never
   become a miss (NFR7) — it files `responded` with answeredBy
   'unknown', the same rule the deadline sweep applies.

   Async channels need no reconciliation: email resolves on
   inbound events with the delivery precondition guarding the
   sweep, and the form worker retries its callback with backoff.

   A provider we cannot reach right now resolves nothing — the
   attempt stays open and the deadline sweep remains the honest
   backstop.
   ============================================================ */
import { v } from 'convex/values'
import { internalAction, internalQuery } from '../_generated/server'
import { internal } from '../_generated/api'
import { resolveTwilioStatus, twilioConfigFromEnv } from '../adapters/phone/twilio'

/* A callback normally lands within seconds of the 45s ring timeout;
   ten minutes of silence after dispatch means it is not coming. */
export const RECONCILE_GRACE_MS = 10 * 60 * 1000

/* Twilio statuses that mean the call is still genuinely in progress —
   reconciliation leaves those alone. */
const STILL_LIVE = new Set(['queued', 'initiated', 'ringing', 'in-progress'])

export const pendingPhoneAttempts = internalQuery({
  args: { cutoff: v.number() },
  handler: async (ctx, { cutoff }) => {
    const open = await ctx.db
      .query('probeAttempts')
      .withIndex('by_pending', (q) => q.eq('outcome', null).lt('scheduledFor', cutoff))
      .collect()
    return open.filter(
      (a) =>
        a.channel === 'phone' &&
        a.providerRef !== null &&
        a.dispatchedAt !== null &&
        a.dispatchedAt < cutoff,
    )
  },
})

export const sweepLostCallbacks = internalAction({
  args: {},
  handler: async (ctx) => {
    const cfg = twilioConfigFromEnv()
    if (!cfg) return // nothing was ever dialled without config

    const now = Date.now()
    const pending = await ctx.runQuery(internal.scheduler.reconcile.pendingPhoneAttempts, {
      cutoff: now - RECONCILE_GRACE_MS,
    })

    for (const attempt of pending) {
      let call: { status?: string; duration?: string } | null = null
      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Calls/${attempt.providerRef}.json`,
          { headers: { Authorization: 'Basic ' + btoa(`${cfg.accountSid}:${cfg.authToken}`) } },
        )
        if (!res.ok) continue // provider unreachable → the deadline sweep backstops
        call = (await res.json()) as { status?: string; duration?: string }
      } catch {
        continue
      }

      const status = call?.status ?? ''
      if (!status || STILL_LIVE.has(status)) continue

      if (status === 'completed') {
        /* the call connected and ended, and the classification report
           never arrived — a pickup can never be filed as a miss */
        await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
          attemptId: attempt._id,
          outcome: 'responded',
          metrics: { answeredBy: 'unknown', durationSec: Number(call?.duration ?? '0') },
          failureReason: 'reconciled from provider; classification report never arrived',
          now: Date.now(),
        })
      } else {
        /* the same translation the webhook path uses (NFR7 defaults
           included: an unexplained failure is ours, never theirs) */
        const resolution = resolveTwilioStatus({ CallStatus: status })
        if (resolution.outcome === null) continue
        await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
          attemptId: attempt._id,
          outcome: resolution.outcome,
          metrics: resolution.metrics,
          failureReason: resolution.reason ?? 'reconciled from provider record',
          now: Date.now(),
        })
      }

      await ctx.runMutation(internal.runs.auditLog.record, {
        runId: attempt.runId,
        type: 'attempt_reconciled',
        actor: 'cron',
        detail: { attemptId: attempt._id, providerStatus: status },
      })
    }
  },
})
