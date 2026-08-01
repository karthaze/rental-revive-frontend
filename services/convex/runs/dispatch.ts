/* ============================================================
   THE DISPATCH CHOKEPOINT — AD-7, AD-9, NFR3
   ------------------------------------------------------------
   Every probe attempt in the system is created HERE and nowhere
   else. A second dispatch path added later — a re-run button, an
   admin tool, a test harness — that skips the consent check is
   the one failure that turns this product into a liability, so
   the rule is structural: adapters are only ever invoked by the
   executor below, and the executor only ever runs against an
   attempt row this chokepoint wrote.

   Order of operations, and why it is load-bearing (AD-9):
   the attempt row is written BEFORE any external I/O, and its id
   is the provider's idempotency key. Convex actions are at-most-
   once; a crash between "row written" and "provider confirmed"
   leaves a row with no providerRef, which the reconciliation
   sweep can find — the reverse (I/O first) leaves an untracked
   phone call, which nothing can find.
   ============================================================ */
import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { Window } from '../core/windows'
import type { Channel, ProbeAdapter } from '../ports/probe'
import { makePhoneAdapter, twilioConfigFromEnv } from '../adapters/phone/twilio'
import { makeEmailAdapter, postmarkConfigFromEnv } from '../adapters/email/postmark'
import { makeFormAdapter, formWorkerConfigFromEnv } from '../adapters/form/worker'

/* FR10 (phone) / FR16 (one email) / FR20 (one form submission).
   CO5: unbounded retry logic is where a $1 scan becomes a $10 one. */
export const ATTEMPT_CAPS: Record<Channel, number> = {
  phone: 4,
  email: 1,
  form: 1,
}

/* ------------------------------------------------------------
   The adapter registry. An adapter exists only when its provider
   config does: with nothing configured, an attempt resolves
   `aborted` with a diagnosis — it never pretends, and it never
   fabricates a measurement (the AD-16 rule, one layer up).
   Email and form register here when their phases land and
   nothing else changes.
   ------------------------------------------------------------ */
export const adapterFor = (channel: Channel): ProbeAdapter | null => {
  if (channel === 'phone') {
    const cfg = twilioConfigFromEnv()
    return cfg ? makePhoneAdapter(cfg) : null
  }
  if (channel === 'email') {
    const cfg = postmarkConfigFromEnv()
    return cfg ? makeEmailAdapter(cfg) : null
  }
  if (channel === 'form') {
    const cfg = formWorkerConfigFromEnv()
    return cfg ? makeFormAdapter(cfg) : null
  }
  return null
}

export class DispatchRefused extends Error {}

/** THE chokepoint. Plain function so activation (same transaction)
    and the scheduled retry path share one implementation — both are
    requests to this function, never dispatches of their own (AD-7). */
export async function requestAttempt(
  ctx: MutationCtx,
  args: {
    runId: Id<'probeRuns'>
    channel: Channel
    window: Window | null
    scheduledFor: number
    now: number
  },
): Promise<Id<'probeAttempts'>> {
  const run = await ctx.db.get(args.runId)
  if (!run) throw new DispatchRefused('run not found')
  if (run.status !== 'active') throw new DispatchRefused(`run is ${run.status}`)

  /* NFR3 — no probe without a live consent artifact. */
  const consent = await ctx.db.get(run.consentId)
  if (!consent) throw new DispatchRefused('no consent artifact for run')
  if (consent.revokedAt !== null) throw new DispatchRefused('consent revoked')

  /* The target comes from the consent row and ONLY the consent row —
     the yard listing can drift after the grant; what he authorised
     cannot (FR4). */
  const target =
    args.channel === 'phone' ? consent.targets.phone
    : args.channel === 'email' ? consent.targets.email
    : consent.targets.formUrl
  if (!target) throw new DispatchRefused(`no consented ${args.channel} target`)

  /* AD-14 — async probes send as a real, name-cleared entity or not
     at all. */
  if (args.channel !== 'phone') {
    const persona = await ctx.db.get(consent.personaId)
    if (!persona || persona.clearedAt === null) {
      throw new DispatchRefused('persona not cleared for async probes')
    }
  }

  /* Caps, counted from the append-only log itself — the projection on
     the run is convenience, never authority (AD-6). */
  const prior = await ctx.db
    .query('probeAttempts')
    .withIndex('by_run_channel', (q) =>
      q.eq('runId', args.runId).eq('channel', args.channel),
    )
    .collect()
  if (prior.length >= ATTEMPT_CAPS[args.channel]) {
    throw new DispatchRefused(`${args.channel} attempt cap reached`)
  }

  /* The row, before any I/O (AD-9). */
  const attemptId = await ctx.db.insert('probeAttempts', {
    runId: args.runId,
    channel: args.channel,
    sequence: prior.length + 1,
    window: args.window,
    scheduledFor: args.scheduledFor,
    dispatchedAt: null,
    providerRef: null,
    outcome: null,
    resolvedAt: null,
    metrics: {},
    artifactIds: [],
    personaId: args.channel === 'phone' ? null : consent.personaId,
    failureReason: null,
  })

  /* Projection upkeep. */
  await ctx.db.patch(args.runId, {
    attemptCounts: {
      ...run.attemptCounts,
      [args.channel]: run.attemptCounts[args.channel] + 1,
    },
    windowsUsed:
      args.window && !run.windowsUsed.includes(args.window)
        ? [...run.windowsUsed, args.window]
        : run.windowsUsed,
  })

  await ctx.db.insert('auditEvents', {
    runId: args.runId,
    type: 'attempt_requested',
    actor: 'system',
    detail: { attemptId, channel: args.channel, window: args.window, scheduledFor: args.scheduledFor },
    at: args.now,
  })

  await ctx.scheduler.runAt(args.scheduledFor, internal.runs.dispatch.executeAttempt, {
    attemptId,
  })
  return attemptId
}

/* ------------------------------------------------------------
   Execution — the only caller of adapters.
   ------------------------------------------------------------ */

export const loadForExecute = internalQuery({
  args: { attemptId: v.id('probeAttempts') },
  handler: async (ctx, { attemptId }) => {
    const attempt = await ctx.db.get(attemptId)
    if (!attempt) return null
    const run = await ctx.db.get(attempt.runId)
    if (!run) return null
    const consent = await ctx.db.get(run.consentId)
    if (!consent) return null
    const scan = await ctx.db.get(run.scanId)
    const yard = scan ? await ctx.db.get(scan.yardId) : null
    const persona = attempt.personaId ? await ctx.db.get(attempt.personaId) : null
    return { attempt, run, consent, persona, yard, scan }
  },
})

export const markDispatched = internalMutation({
  args: {
    attemptId: v.id('probeAttempts'),
    at: v.number(),
    providerRef: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { attemptId, at, providerRef }) => {
    await ctx.db.patch(attemptId, { dispatchedAt: at, providerRef })
  },
})

/** Scheduled by the chokepoint; re-verifies consent at fire time —
    the kill switch (FR5) needs no scheduler bookkeeping because every
    execution re-checks revocation before touching a provider. */
export const executeAttempt = internalAction({
  args: { attemptId: v.id('probeAttempts') },
  handler: async (ctx, { attemptId }) => {
    const loaded = await ctx.runQuery(internal.runs.dispatch.loadForExecute, { attemptId })
    if (!loaded) return
    const { attempt, run, consent, persona, yard, scan } = loaded

    /* Idempotency (AD-9): a resolved or already-dispatched attempt is
       never re-fired. Reconciliation of dispatched-but-unresolved
       attempts queries the provider; it does not re-dial. */
    if (attempt.outcome !== null || attempt.dispatchedAt !== null) return

    const now = Date.now()

    /* Kill switch / revocation, enforced at the moment of truth. */
    if (consent.revokedAt !== null || run.status !== 'active') {
      await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
        attemptId,
        outcome: 'aborted',
        failureReason: 'consent revoked or run no longer active at execution',
        now,
      })
      return
    }

    const adapter = adapterFor(attempt.channel)
    if (!adapter) {
      /* No provider wired for this channel. Say so and stop — never
         simulate. Two products shipped that bug; not a third time
         (AD-16, voltbot/CONTEXT.md:205). */
      await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
        attemptId,
        outcome: 'aborted',
        failureReason: `no ${attempt.channel} adapter configured`,
        now,
      })
      return
    }

    const target =
      attempt.channel === 'phone' ? consent.targets.phone
      : attempt.channel === 'email' ? consent.targets.email
      : consent.targets.formUrl
    if (!target) return // structurally impossible past the chokepoint

    await ctx.runMutation(internal.runs.dispatch.markDispatched, {
      attemptId,
      at: now,
      providerRef: null,
    })

    const result = await adapter
      .dispatch({
        attemptId,
        runId: attempt.runId,
        channel: attempt.channel,
        sequence: attempt.sequence,
        target,
        persona:
          persona && attempt.channel !== 'phone'
            ? {
                legalName: persona.legalName,
                fromAddress: persona.fromAddress,
                replyDomain: persona.replyDomain,
                siteUrl: persona.siteUrl,
                phone: persona.phone,
              }
            : null,
        machineLines: (scan?.answers as { fleet?: string[] } | null)?.fleet ?? [],
        yardName: yard?.name ?? '',
      })
      /* Adapters must not throw across the port; if one does anyway,
         the attempt aborts — logged, never silently retried. */
      .catch((e: unknown) => ({
        ok: false as const,
        outcome: 'aborted' as const,
        reason: `adapter threw: ${e instanceof Error ? e.message : String(e)}`,
      }))

    if (result.ok) {
      await ctx.runMutation(internal.runs.dispatch.markDispatched, {
        attemptId,
        at: now,
        providerRef: result.providerRef,
      })
    } else {
      await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
        attemptId,
        outcome: result.outcome,
        failureReason: result.reason,
        now: Date.now(),
      })
    }
  },
})
