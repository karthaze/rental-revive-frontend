/* ============================================================
   THE KILL SWITCH — FR5, NFR3
   ------------------------------------------------------------
   Single click, halts everything: the consent is revoked, the
   run is marked killed, and every in-flight attempt is aborted.
   No scheduler bookkeeping is needed — any already-scheduled
   execution re-checks revocation at fire time and stands down
   before touching a provider (dispatch.ts), which is the
   server-side enforcement NFR3 demands.

   A killed run still gets its verdict (FR33): whatever landed
   before the kill is real measurement and renders as a partial
   result. Nothing dead-ends.
   ============================================================ */
import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { applyResolution, generateVerdict } from './resolve'

export const killRun = mutation({
  args: { runId: v.id('probeRuns') },
  handler: async (ctx, { runId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('authentication required')

    const run = await ctx.db.get(runId)
    if (!run) throw new Error('run not found')

    const consent = await ctx.db.get(run.consentId)
    if (!consent) throw new Error('consent artifact missing')
    /* Only the granter can revoke — the kill switch is his, not ours. */
    if (consent.clerkUserId !== identity.subject) {
      throw new Error('only the authorising owner can kill this run')
    }

    if (run.status !== 'active') return // idempotent: already over

    const now = Date.now()
    await ctx.db.patch(run.consentId, { revokedAt: now })
    await ctx.db.patch(runId, { status: 'killed', killedAt: now })

    /* Abort everything still in flight. Attempts already resolved are
       untouched — the log is append-only and the past really happened. */
    const attempts = await ctx.db
      .query('probeAttempts')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .collect()
    for (const attempt of attempts) {
      if (attempt.outcome === null) {
        await applyResolution(ctx, attempt, {
          outcome: 'aborted',
          failureReason: 'kill switch',
          now,
        })
      }
    }

    await ctx.db.insert('auditEvents', {
      runId,
      type: 'kill_switch',
      actor: identity.subject,
      detail: { attemptsAborted: attempts.filter((a) => a.outcome === null).length },
      at: now,
    })

    /* FR33 — partial verdict from whatever landed. */
    const after = await ctx.db
      .query('probeAttempts')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .collect()
    await generateVerdict(ctx, { ...run, status: 'killed', killedAt: now }, after, now)
  },
})
