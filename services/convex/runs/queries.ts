/* ============================================================
   DASHBOARD READS — FR24, FR29–FR33, C1–C3
   ------------------------------------------------------------
   The staff-protection constraints are enforced HERE, at the
   query layer, never left to the component (data-model §5):

   - no query returns a name field for whoever answered (C1)
   - no query returns an artifact flagged containsStaffVoice (C2)
   - failureReason never leaves the server — it is diagnosis of
     OUR failures and is not part of the owner's report

   The attempt log is returned in full, including the attempts
   that connected — visible generosity is the proof (FR24).
   ============================================================ */
import { v } from 'convex/values'
import { query } from '../_generated/server'
import { compareHours, type GooglePeriod } from '../core/hours'

export const runState = query({
  args: { runId: v.id('probeRuns') },
  handler: async (ctx, { runId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const run = await ctx.db.get(runId)
    if (!run) return null
    const consent = await ctx.db.get(run.consentId)
    /* The run belongs to whoever authorised it, and nobody else. */
    if (!consent || consent.clerkUserId !== identity.subject) return null

    const attempts = await ctx.db
      .query('probeAttempts')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .collect()

    const verdict = await ctx.db
      .query('verdicts')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .unique()

    /* the dashboard re-renders the estimate's own arithmetic with the
       measured substitutions applied — that needs the owner's answers
       and the frozen estimate. His data, behind his auth. */
    const scan = await ctx.db.get(run.scanId)
    const yard = scan ? await ctx.db.get(scan.yardId) : null

    /* FR27 — recomputed from stored public periods at read time, so
       there is no derived copy to drift. Null until the post-auth
       hours lookup lands (or forever, when unconfigured). */
    const radar = scan?.radar as
      | { competitors: { name: string; national?: boolean; periods?: unknown }[]; radiusMi: number }
      | null
    const withHours = radar?.competitors?.filter((c) => c.periods !== undefined) ?? []
    const competitorHours = withHours.length
      ? {
          radiusMi: radar!.radiusMi,
          swept: radar!.competitors.length,
          ...compareHours(
            (yard?.openingHours as { periods?: GooglePeriod[] } | null)?.periods ?? null,
            withHours as { name: string; national?: boolean; periods?: GooglePeriod[] | null }[],
          ),
        }
      : null

    return {
      yardName: yard?.name ?? null,
      answers: scan?.answers ?? null,
      estimate: scan?.estimate ?? null,
      competitorHours,
      run: {
        status: run.status,
        timezone: run.timezone,
        startedAt: run.startedAt,
        resolvedAt: run.resolvedAt,
        killedAt: run.killedAt,
        deadlineAt: run.deadlineAt,
        windowsUsed: run.windowsUsed,
      },
      revoked: consent.revokedAt !== null,
      /* FR24 — the full log, timestamps and all. failureReason is
         deliberately absent; NFR7's "not a finding about your
         business" rendering derives from the outcome value alone. */
      attempts: attempts
        .sort((a, b) => a.scheduledFor - b.scheduledFor)
        .map((a) => ({
          id: a._id,
          channel: a.channel,
          sequence: a.sequence,
          window: a.window,
          scheduledFor: a.scheduledFor,
          dispatchedAt: a.dispatchedAt,
          outcome: a.outcome,
          resolvedAt: a.resolvedAt,
          metrics: a.metrics,
          artifactIds: a.artifactIds,
        })),
      verdict,
    }
  },
})

/** Artifacts for one attempt, C2-filtered: staff-voice audio is stored
    but never served. A tombstoned row reports itself as expired so the
    report can say so instead of 404ing (AD-10). */
export const attemptArtifacts = query({
  args: { attemptId: v.id('probeAttempts') },
  handler: async (ctx, { attemptId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const attempt = await ctx.db.get(attemptId)
    if (!attempt) return []
    const run = await ctx.db.get(attempt.runId)
    if (!run) return []
    const consent = await ctx.db.get(run.consentId)
    if (!consent || consent.clerkUserId !== identity.subject) return []

    const rows = await ctx.db
      .query('artifacts')
      .withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
      .collect()

    const out = []
    for (const a of rows) {
      if (a.containsStaffVoice) continue // C2 — never surfaced
      out.push({
        id: a._id,
        kind: a.kind,
        contentType: a.contentType,
        expired: a.deletedAt !== null,
        url: a.deletedAt === null ? await ctx.storage.getUrl(a.storageId) : null,
      })
    }
    return out
  },
})
