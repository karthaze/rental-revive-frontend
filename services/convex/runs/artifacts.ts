/* ============================================================
   ARTIFACT INGESTION — AD-10, NFR6, C2, FR25
   ------------------------------------------------------------
   Recordings are COPIED into Convex storage at ingestion; the
   provider URL is fetched once and never stored as canonical —
   a retention promise enforced against someone else's CDN is
   not a promise. Every row carries retainUntil computed from
   the retentionDays snapshotted on the consent at grant time,
   so a later policy change cannot stretch old artifacts.

   containsStaffVoice is decided by the ADAPTER that saw the
   call (a human conversation → true) and enforced at the query
   layer (runs/queries.ts) — stored, never served (C2).
   ============================================================ */
import { v } from 'convex/values'
import { internalAction, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'

const artifactKind = v.union(
  v.literal('call_recording'),
  v.literal('call_transcript'),
  v.literal('voicemail_recording'),
  v.literal('email_body'),
  v.literal('form_screenshot_before'),
  v.literal('form_screenshot_after'),
)

export const insertArtifact = internalMutation({
  args: {
    attemptId: v.id('probeAttempts'),
    kind: artifactKind,
    storageId: v.id('_storage'),
    contentType: v.string(),
    bytes: v.number(),
    containsStaffVoice: v.boolean(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId)
    if (!attempt) throw new Error('attempt not found')
    const run = await ctx.db.get(attempt.runId)
    const consent = run ? await ctx.db.get(run.consentId) : null
    if (!consent) throw new Error('no consent for artifact — retention undefined')

    const artifactId = await ctx.db.insert('artifacts', {
      attemptId: args.attemptId,
      kind: args.kind,
      storageId: args.storageId,
      contentType: args.contentType,
      bytes: args.bytes,
      containsStaffVoice: args.containsStaffVoice,
      retainUntil: args.now + consent.retentionDays * 24 * 3600 * 1000,
      deletedAt: null,
    })
    await ctx.db.patch(args.attemptId, {
      artifactIds: [...attempt.artifactIds, artifactId],
    })
    return artifactId
  },
})

/** Fetch a provider artifact once, copy it in, tombstone nothing.
    A failed fetch is logged and dropped — an artifact is evidence,
    and evidence we could not retrieve is simply absent, never
    substituted. */
export const ingestArtifact = internalAction({
  args: {
    attemptId: v.id('probeAttempts'),
    kind: artifactKind,
    url: v.string(),
    containsStaffVoice: v.boolean(),
  },
  handler: async (ctx, args): Promise<any> => {
    let res: Response
    try {
      res = await fetch(args.url)
    } catch {
      return null
    }
    if (!res.ok) return null
    const blob = await res.blob()
    const storageId = await ctx.storage.store(blob)
    return ctx.runMutation(internal.runs.artifacts.insertArtifact, {
      attemptId: args.attemptId,
      kind: args.kind,
      storageId,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      bytes: blob.size,
      containsStaffVoice: args.containsStaffVoice,
      now: Date.now(),
    })
  },
})
