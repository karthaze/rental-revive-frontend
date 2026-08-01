/* ============================================================
   RESOLUTION — AD-6, FR9, FR23–FR26, FR33
   ------------------------------------------------------------
   Attempts are append-only: a row gains its terminal fields
   exactly once, and a second resolution is an error, not an
   update. Retries are NEW rows placed by core/windows and
   created through the chokepoint — history is never overwritten
   by its latest status (the "we called four times" evidence FR24
   renders is this table read in order).

   When the last attempt lands, the run resolves and the verdict
   is generated: counts folded from the log, measured values
   mapped onto the existing band vocabulary at the single AD-11
   conversion point, and the re-priced figure produced by the
   SAME leak engine the owner already saw — computeLeaks() is
   imported from the SPA untouched, because a second engine means
   two sets of numbers that will diverge.
   ============================================================ */
import { v } from 'convex/values'
import { internalMutation, internalQuery } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { outcome as outcomeValidator } from '../schema'
import { placeRetry } from '../core/windows'
import { foldVerdict, type AttemptSlice } from '../core/verdict'
import { substituteBands } from '../core/bands'
import { requestAttempt, DispatchRefused } from './dispatch'
// The one leak engine (AD-11). Plain JS, pure, bundled from the SPA —
// untyped on purpose: rewriting it in TS would be the second engine.
import { computeLeaks } from '../../../common/leaks.js'

/** Terminal-field write, shared by webhook resolution and the kill
    switch. Enforces append-only (AD-6) and nothing else. */
export async function applyResolution(
  ctx: MutationCtx,
  attempt: Doc<'probeAttempts'>,
  args: {
    outcome: Doc<'probeAttempts'>['outcome'] & {}
    metrics?: Record<string, unknown>
    failureReason?: string
    now: number
  },
): Promise<void> {
  if (attempt.outcome !== null) {
    throw new Error(
      `attempt ${attempt._id} already resolved (${attempt.outcome}) — attempts are append-only (AD-6)`,
    )
  }
  await ctx.db.patch(attempt._id, {
    outcome: args.outcome,
    resolvedAt: args.now,
    metrics: { ...(attempt.metrics ?? {}), ...(args.metrics ?? {}) },
    failureReason: args.failureReason ?? null,
  })
  await ctx.db.insert('auditEvents', {
    runId: attempt.runId,
    type: 'attempt_resolved',
    actor: 'system',
    detail: { attemptId: attempt._id, channel: attempt.channel, outcome: args.outcome },
    at: args.now,
  })
}

/** Webhook lookup — the hot path for every inbound provider callback
    (data-model: by_provider_ref). */
export const attemptByProviderRef = internalQuery({
  args: { providerRef: v.string() },
  handler: async (ctx, { providerRef }) => {
    return ctx.db
      .query('probeAttempts')
      .withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef))
      .unique()
  },
})

export const getAttempt = internalQuery({
  args: { attemptId: v.id('probeAttempts') },
  handler: (ctx, { attemptId }) => ctx.db.get(attemptId),
})

/** Interim progress: an event advanced the attempt without finishing
    it (a ringing callback, an answer). Metrics accrue; the outcome
    stays null and AD-6's one-terminal-write rule is untouched. */
export const recordInterim = internalMutation({
  args: { attemptId: v.id('probeAttempts'), metrics: v.any() },
  handler: async (ctx, { attemptId, metrics }) => {
    const attempt = await ctx.db.get(attemptId)
    if (!attempt) return
    if (attempt.outcome !== null) return // terminal rows never change
    await ctx.db.patch(attemptId, {
      metrics: { ...(attempt.metrics ?? {}), ...(metrics as Record<string, unknown>) },
    })
  },
})

/** The one sanctioned post-terminal write, and it is narrow: FR18
    measures "whether a second follow-up ever came" and FR19 stamps
    the debrief — both facts that can only arrive AFTER the attempt
    resolved at first human reply. Outcome, resolvedAt and every other
    metric stay immutable (AD-6); this touches exactly two keys. */
export const recordEmailFacts = internalMutation({
  args: {
    attemptId: v.id('probeAttempts'),
    followUp: v.optional(v.boolean()),
    debriefSentAt: v.optional(v.number()),
  },
  handler: async (ctx, { attemptId, followUp, debriefSentAt }) => {
    const attempt = await ctx.db.get(attemptId)
    if (!attempt || attempt.channel === 'phone') return
    const metrics = { ...((attempt.metrics ?? {}) as Record<string, unknown>) }
    if (followUp) {
      metrics.followUpCount = ((metrics.followUpCount as number) ?? 0) + 1
    }
    if (debriefSentAt !== undefined) metrics.debriefSentAt = debriefSentAt
    await ctx.db.patch(attemptId, { metrics })
  },
})

export const resolveAttempt = internalMutation({
  args: {
    attemptId: v.id('probeAttempts'),
    outcome: outcomeValidator,
    metrics: v.optional(v.any()),
    failureReason: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId)
    if (!attempt) throw new Error('attempt not found')
    await applyResolution(ctx, attempt, {
      outcome: args.outcome,
      metrics: args.metrics as Record<string, unknown> | undefined,
      failureReason: args.failureReason,
      now: args.now,
    })

    const run = await ctx.db.get(attempt.runId)
    if (!run || run.status !== 'active') return

    /* FR9 — a phone attempt that did not reach a human earns a retry
       in a window this run has not used, until FR10's caps or the
       deadline say stop. `aborted` never retries: it measured nothing
       and its cause (kill, missing adapter) will still be there. */
    if (attempt.channel === 'phone' && args.outcome !== 'responded' && args.outcome !== 'aborted') {
      const phoneAttempts = await ctx.db
        .query('probeAttempts')
        .withIndex('by_run_channel', (q) => q.eq('runId', run._id).eq('channel', 'phone'))
        .collect()
      const placement = placeRetry({
        now: args.now,
        tz: run.timezone,
        windowsUsed: run.windowsUsed,
        priorAttemptsAt: phoneAttempts.map((a) => a.scheduledFor),
      })
      if (placement && placement.scheduledFor <= run.deadlineAt) {
        try {
          await requestAttempt(ctx, {
            runId: run._id,
            channel: 'phone',
            window: placement.window,
            scheduledFor: placement.scheduledFor,
            now: args.now,
          })
        } catch (e) {
          /* A refused retry (cap raced, consent just revoked) is a
             normal end state, not an error. */
          if (!(e instanceof DispatchRefused)) throw e
        }
      }
    }

    await maybeResolveRun(ctx, run._id, args.now)
  },
})

/** The run resolves when every attempt in the log is terminal — a
    freshly scheduled retry keeps it open by existing unresolved. */
export async function maybeResolveRun(
  ctx: MutationCtx,
  runId: Id<'probeRuns'>,
  now: number,
): Promise<void> {
  const run = await ctx.db.get(runId)
  if (!run || run.status !== 'active') return
  const attempts = await ctx.db
    .query('probeAttempts')
    .withIndex('by_run', (q) => q.eq('runId', runId))
    .collect()
  if (attempts.length === 0 || attempts.some((a) => a.outcome === null)) return

  await ctx.db.patch(runId, { status: 'resolved', resolvedAt: now })
  await generateVerdict(ctx, { ...run, status: 'resolved' }, attempts, now)

  /* FR19 — the deferred disclosure. When the measurement closes, each
     async inquiry that actually went out gets its debrief. Killed runs
     never reach here: revoked consent means no further contact. */
  for (const a of attempts) {
    if (a.channel === 'email' && a.dispatchedAt !== null && a.outcome !== 'aborted') {
      await ctx.scheduler.runAfter(0, internal.runs.debrief.sendDebrief, {
        attemptId: a._id,
      })
    }
  }
}

/** FR33 — generated from whatever landed, even after a kill. Nothing
    dead-ends. */
export async function generateVerdict(
  ctx: MutationCtx,
  run: Doc<'probeRuns'>,
  attempts: Doc<'probeAttempts'>[],
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query('verdicts')
    .withIndex('by_run', (q) => q.eq('runId', run._id))
    .unique()
  if (existing) return // one verdict per run; kill-then-sweep must not double-write

  const scan = await ctx.db.get(run.scanId)
  const answers = (scan?.answers ?? {}) as Record<string, unknown>

  const fold = foldVerdict(attempts as unknown as AttemptSlice[])
  const { answers: substituted, substitutions } = substituteBands(answers, fold.measured)

  /* Re-price only when measurement actually replaced an input —
     an unmeasured run re-priced from untouched answers would render
     a fake "before/after" where both sides are the same guess. */
  let repriced: Doc<'verdicts'>['repriced'] = null
  if (substitutions.length > 0) {
    const L = computeLeaks(substituted)
    repriced = {
      monthlyCents: Math.round(L.monthly * 100),
      annualCents: Math.round(L.annual * 100),
      leakScore: L.leakScore,
      band: L.band.key,
    }
  }

  await ctx.db.insert('verdicts', {
    runId: run._id,
    counts: fold.counts,
    fastestResponseMs: fold.fastestResponseMs,
    selfReported: {
      missedCalls: answers.missedCalls ?? null,
      quoteSpeed: answers.quoteSpeed ?? null,
      afterHours: answers.afterHours ?? null,
    },
    measured: { ...fold.measured, substitutions },
    repriced,
    biasNote: fold.biasNote,
    partial: fold.partial,
    generatedAt: now,
  })
  await ctx.db.insert('auditEvents', {
    runId: run._id,
    type: 'verdict_generated',
    actor: 'system',
    detail: { partial: fold.partial, substitutions: substitutions.length },
    at: now,
  })
}
