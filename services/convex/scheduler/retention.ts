/* ============================================================
   SWEEPS — AD-10 (retention), FR33/NFR1 (deadlines)
   ------------------------------------------------------------
   Two cron-driven mutations:

   1. sweepArtifacts — the retention promise, enforced by us.
      Every artifact carries its own retainUntil, computed at
      write time from the retentionDays snapshotted on the
      consent. The sweep deletes the blob, tombstones the row
      (so the report says "expired" instead of 404ing), and logs
      an audit event. One indexed scan, no joins.

   2. sweepDeadlines — a run that reaches its 48-hour deadline
      resolves with what it has. An async attempt that was
      dispatched and never answered is `no_response` — that IS
      the measurement (FR18: "whether any response arrived
      inside the window"). An attempt that never dispatched
      measures nothing and aborts.
   ============================================================ */
import { internalMutation } from '../_generated/server'
import { applyResolution, maybeResolveRun } from '../runs/resolve'

export const sweepArtifacts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query('artifacts')
      .withIndex('by_retainUntil', (q) => q.lte('retainUntil', now))
      .collect()
    for (const artifact of due) {
      if (artifact.deletedAt !== null) continue // already tombstoned
      await ctx.storage.delete(artifact.storageId)
      await ctx.db.patch(artifact._id, { deletedAt: now })
      const attempt = await ctx.db.get(artifact.attemptId)
      await ctx.db.insert('auditEvents', {
        runId: attempt?.runId ?? null,
        type: 'artifact_expired',
        actor: 'cron',
        detail: { artifactId: artifact._id, kind: artifact.kind },
        at: now,
      })
    }
  },
})

export const sweepDeadlines = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const overdue = await ctx.db
      .query('probeRuns')
      .withIndex('by_status_deadline', (q) => q.eq('status', 'active').lte('deadlineAt', now))
      .collect()

    for (const run of overdue) {
      const attempts = await ctx.db
        .query('probeAttempts')
        .withIndex('by_run', (q) => q.eq('runId', run._id))
        .collect()

      for (const attempt of attempts) {
        if (attempt.outcome !== null) continue
        if (attempt.dispatchedAt === null) {
          /* Never went out — measured nothing, and says so. */
          await applyResolution(ctx, attempt, {
            outcome: 'aborted',
            failureReason: 'deadline passed before dispatch',
            now,
          })
          continue
        }
        /* NFR7's precondition, applied at the last gate: "no response"
           may only be filed once DELIVERY is a recorded fact — a
           pickup for phone, a delivery event for email, a confirmed
           submission for the form. An attempt that went out but was
           never confirmed delivered is OUR unknown, not the yard's
           silence. */
        const m = (attempt.metrics ?? {}) as Record<string, unknown>
        if (typeof m.answeredAt === 'number') {
          /* the phone was answered but the classification never came
             back — a pickup can never be filed as a miss */
          await applyResolution(ctx, attempt, {
            outcome: 'responded',
            metrics: { answeredBy: 'unknown' },
            failureReason: 'classification report never arrived; answered per telephony',
            now,
          })
        } else if (
          typeof m.ringStartedAt === 'number' || // it rang — delivery confirmed
          m.deliveryStatus === 'delivered' || // Postmark said delivered
          m.submissionSucceeded === true // the form took the submission
        ) {
          await applyResolution(ctx, attempt, { outcome: 'no_response', now })
        } else {
          await applyResolution(ctx, attempt, {
            outcome: 'undeliverable_ours',
            failureReason: 'no delivery confirmation before deadline (NFR7)',
            now,
          })
        }
      }
      /* All attempts are terminal now, so this resolves the run and
         generates the (possibly partial) verdict. */
      await maybeResolveRun(ctx, run._id, now)
    }
  },
})
