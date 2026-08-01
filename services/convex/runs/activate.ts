/* ============================================================
   ACTIVATION — FR1–FR6, FR8, FR34, AD-8, AD-14, AD-15
   ------------------------------------------------------------
   The consent grant and the run start are one transaction: the
   consent artifact is written first, the run references it, and
   every attempt row traces back through the run to the exact
   targets and disclosure text the owner authorised (FR4).

   Probe order is the measurement design (FR34/AD-15): the async
   inquiries dispatch NOW, before the first disclosed phone call
   alerts the counter — their clocks must start while the yard is
   still cold. The phone attempt fires at ~T+60s (FR8), while the
   owner is watching the dashboard, unless yard-local caps push
   it to the next morning (FR10 wins over FR8).
   ============================================================ */
import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { internal } from '../_generated/api'
import { placeFirstAttempt } from '../core/windows'
import { requestAttempt } from './dispatch'

/* [ASSUMPTION] pending PRD Q1 — the number the consent screen promises.
   Snapshotted onto the consent row at grant time so a later policy
   change cannot retroactively extend retention (data-model, retention
   chain §1). Change the default here; never edit granted consents. */
export const RETENTION_DAYS_DEFAULT = 30

/* PRD §NFR1 — a run spans up to 48 hours across scheduled attempts. */
export const RUN_WINDOW_MS = 48 * 60 * 60 * 1000

export const activate = mutation({
  args: {
    scanId: v.id('scans'),
    /* The exact strings being consented to (FR3/FR4). Phone is
       required — the counter line confirmed in the chat flow is the
       dial target, treated as required input, not optional colour
       (FR6). */
    targets: v.object({
      phone: v.string(),
      email: v.union(v.string(), v.null()),
      formUrl: v.union(v.string(), v.null()),
    }),
    disclosureVersion: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    /* FR2 — activation is authenticated or it does not happen. */
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('authentication required to authorise a probe (FR2)')

    const scan = await ctx.db.get(args.scanId)
    if (!scan) throw new Error('scan not found')

    const yard = await ctx.db.get(scan.yardId)
    if (!yard) throw new Error('yard not found')
    /* AD-8/NFR4 — the timezone is resolved once, here, and stored on
       the run. No timezone, no run: window arithmetic in a guessed
       zone is a call at 11pm to someone's cell. */
    if (!yard.timezone) {
      throw new Error('yard has no resolved timezone — enrichment must supply it before activation')
    }

    /* AD-14 — the persona the owner is being told about (FR3) must be
       a live, name-cleared entity at grant time. */
    const persona = (
      await ctx.db
        .query('personas')
        .withIndex('by_active', (q) => q.eq('retiredAt', null))
        .collect()
    ).find((p) => p.clearedAt !== null)
    if (!persona) {
      throw new Error('no cleared async-probe persona on record — activation blocked (C7)')
    }

    const now = Date.now()

    /* FR4 — the consent artifact. This row is the legal basis for
       every probe the run will ever make. */
    const consentId = await ctx.db.insert('consents', {
      scanId: args.scanId,
      clerkUserId: identity.subject,
      targets: args.targets,
      personaId: persona._id,
      disclosureVersion: args.disclosureVersion,
      retentionDays: RETENTION_DAYS_DEFAULT,
      grantedAt: now,
      revokedAt: null,
      ipAddress: args.ipAddress ?? null,
      userAgent: args.userAgent ?? null,
    })

    /* The scan gains its identity at activation — it was anonymous
       until now by design. The estimate is already frozen on the row
       (AD-11: before/after is data, not recomputation). */
    await ctx.db.patch(args.scanId, { clerkUserId: identity.subject })

    const runId = await ctx.db.insert('probeRuns', {
      scanId: args.scanId,
      consentId,
      timezone: yard.timezone,
      status: 'active',
      windowsUsed: [],
      attemptCounts: { phone: 0, email: 0, form: 0 },
      startedAt: now,
      resolvedAt: null,
      killedAt: null,
      deadlineAt: now + RUN_WINDOW_MS,
    })

    await ctx.db.insert('auditEvents', {
      runId,
      type: 'consent_granted',
      actor: identity.subject,
      detail: {
        consentId,
        disclosureVersion: args.disclosureVersion,
        personaId: persona._id,
        targets: args.targets,
      },
      at: now,
    })

    /* AD-15 — async clocks start first, before the disclosed call
       alerts the counter. */
    if (args.targets.email) {
      await requestAttempt(ctx, {
        runId,
        channel: 'email',
        window: null,
        scheduledFor: now,
        now,
      })
    }
    if (args.targets.formUrl) {
      await requestAttempt(ctx, {
        runId,
        channel: 'form',
        window: null,
        scheduledFor: now,
        now,
      })
    }

    /* FR8 — the first call, while he is watching. */
    const first = placeFirstAttempt(now, yard.timezone)
    await requestAttempt(ctx, {
      runId,
      channel: 'phone',
      window: first.window,
      scheduledFor: first.scheduledFor,
      now,
    })

    /* FR27/CO3 — competitor hours are paid enrichment, gated behind
       maximum demonstrated intent: an authorised run. Public listings
       only; nobody is ever contacted (C6). */
    await ctx.scheduler.runAfter(0, internal.enrichment.competitors.fetchHours, {
      scanId: args.scanId,
    })

    return { runId, consentId, firstCallAt: first.scheduledFor }
  },
})
