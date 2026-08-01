/* ============================================================
   REVIVE AGENT — SCHEMA
   ------------------------------------------------------------
   Field-level source of truth:
   _bmad-output/planning-artifacts/architecture/architecture-quotes-2026-07-29/data-model.md

   Conventions (spine "Consistency Conventions"):
   - plural camelCase tables, one noun each
   - epoch millis UTC for every timestamp; yard-local rendering
     derives from probeRuns.timezone (AD-8), never stored strings
   - integer cents for money
   - the AD-2 outcome enum, closed — adding a member is a spine
     change, not an implementation detail
   ============================================================ */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/* AD-2 — the closed outcome vocabulary. `undeliverable_ours` exists so
   our own delivery failure is never reported as the yard's failure
   (NFR7). Core logic that needs to reason about these imports the
   mirror constants in core/outcome.ts; this union is the storage law. */
export const outcome = v.union(
  v.literal('responded'),
  v.literal('no_response'),
  v.literal('undeliverable_ours'),
  v.literal('undeliverable_theirs'),
  v.literal('blocked_by_target'),
  v.literal('aborted'),
)

/* `chat` is reserved in the spine but unimplemented; it is deliberately
   absent here so nothing can write it before an adapter exists. */
export const channel = v.union(
  v.literal('phone'),
  v.literal('email'),
  v.literal('form'),
)

/* FR9/AD-8 — attempt windows, yard-local. `alt_day` is the fourth
   attempt's "different day" placement. */
export const probeWindow = v.union(
  v.literal('business'),
  v.literal('lunch'),
  v.literal('after_hours'),
  v.literal('alt_day'),
)

/* Tri-state per AD-16: true = found with evidence, false = looked and
   absent, null = could not look. Never collapse null into false. */
const tri = v.union(v.boolean(), v.null())

/* The pre-auth digital footprint (FR36–FR41), shaped exactly as
   ../../common/footprint.js produces it. */
const footprint = v.object({
  website: v.object({
    kind: v.union(
      v.literal('site'),
      v.literal('social'),
      v.literal('linkhub'),
      v.literal('marketplace'),
      v.literal('none'),
    ),
    platform: v.string(),
    host: v.string(),
  }),
  profile: v.object({
    pct: v.union(v.number(), v.null()),
    passed: v.number(),
    measured: v.number(),
    gaps: v.array(v.string()),
  }),
  quotePath: v.union(
    v.object({ measured: tri, booking: tri, chat: tri, contactForm: tri }),
    v.null(),
  ),
  /* null as a whole = the crawl returned no markup; an object whose
     members are null = we looked and the signatures did not match.
     The distinction is load-bearing (data-model.md, AD-16). */
  trackers: v.union(
    v.record(
      v.string(),
      v.object({ detected: tri, id: v.union(v.string(), v.null()) }),
    ),
    v.null(),
  ),
})

export default defineSchema({
  /* ---------------------------------------------------------
     yards — the enrichment cache, one row per Google placeId.
     Exists so a re-scan never re-pays for Places/Apify (CO2).
     --------------------------------------------------------- */
  yards: defineTable({
    placeId: v.string(), // '' for manual-entry yards
    manual: v.boolean(),
    name: v.string(),
    address: v.union(v.string(), v.null()),
    city: v.union(v.string(), v.null()),
    state: v.union(v.string(), v.null()),
    lat: v.union(v.number(), v.null()),
    lng: v.union(v.number(), v.null()),
    /* IANA, derived once from geometry. Source of truth for AD-8. */
    timezone: v.union(v.string(), v.null()),
    /* Google-listed number — NOT the consented dial target, which
       lives on consents.targets and is what the dispatcher checks. */
    phone: v.union(v.string(), v.null()),
    website: v.union(v.string(), v.null()),
    rating: v.union(v.number(), v.null()),
    reviewCount: v.union(v.number(), v.null()),
    openingHours: v.union(v.any(), v.null()), // public hours, FR27 comparison
    photoCount: v.union(v.number(), v.null()), // null, not 0 (AD-16)
    enrichment: v.union(
      v.object({
        reviews: v.union(v.any(), v.null()),
        crawl: v.union(v.any(), v.null()),
        screenshotId: v.union(v.id('_storage'), v.null()),
        footprint: v.union(footprint, v.null()),
      }),
      v.null(),
    ),
    enrichedAt: v.union(v.number(), v.null()),
  }).index('by_placeId', ['placeId']),

  /* ---------------------------------------------------------
     scans — one questionnaire run. Anonymous by design; gains
     a clerkUserId only at activation.
     --------------------------------------------------------- */
  scans: defineTable({
    yardId: v.id('yards'),
    clerkUserId: v.union(v.string(), v.null()),
    /* Opaque snapshot of the chat-flow state object. Read whole,
       never normalised — a second schema would drift (data-model.md). */
    answers: v.any(),
    radar: v.union(
      v.object({ competitors: v.array(v.any()), radiusMi: v.number() }),
      v.null(),
    ),
    /* Frozen at activation so before/after is data, not recomputation
       (AD-11). */
    estimate: v.union(
      v.object({
        monthlyCents: v.number(),
        annualCents: v.number(),
        leakScore: v.number(),
        band: v.string(),
        dominantId: v.union(v.string(), v.null()),
        pileStandingCents: v.number(),
      }),
      v.null(),
    ),
    completedAt: v.union(v.number(), v.null()),
  })
    .index('by_user', ['clerkUserId'])
    .index('by_yard', ['yardId']),

  /* ---------------------------------------------------------
     personas — the async-probe identity (AD-14, C7). A row, not
     a constant, so a failed name clearance is a data change.
     --------------------------------------------------------- */
  personas: defineTable({
    legalName: v.string(),
    jurisdiction: v.string(),
    domain: v.string(),
    fromAddress: v.string(),
    replyDomain: v.string(), // probe+<runId>@… correlation
    siteUrl: v.string(),
    phone: v.string(),
    clearedAt: v.union(v.number(), v.null()), // null BLOCKS dispatch (AD-7)
    retiredAt: v.union(v.number(), v.null()), // set, never deleted
  }).index('by_active', ['retiredAt']),

  /* ---------------------------------------------------------
     consents — the legal basis for every probe (FR4, NFR3).
     Written once; the only edit ever made is revocation.
     --------------------------------------------------------- */
  consents: defineTable({
    scanId: v.id('scans'),
    clerkUserId: v.string(),
    /* The exact strings consented to. The dispatcher compares against
       THESE, not against yards — the listing can drift, consent can't. */
    targets: v.object({
      phone: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      formUrl: v.union(v.string(), v.null()),
    }),
    personaId: v.id('personas'),
    disclosureVersion: v.string(),
    /* Snapshotted from policy at grant time — a later policy change
       cannot retroactively extend retention (data-model retention §1). */
    retentionDays: v.number(),
    grantedAt: v.number(),
    revokedAt: v.union(v.number(), v.null()), // kill switch (FR5)
    ipAddress: v.union(v.string(), v.null()),
    userAgent: v.union(v.string(), v.null()),
  })
    .index('by_scan', ['scanId'])
    .index('by_user', ['clerkUserId']),

  /* ---------------------------------------------------------
     probeRuns — one authorised cycle. `status` is a projection
     of the attempts (AD-6), cached for queries, never authority.
     --------------------------------------------------------- */
  probeRuns: defineTable({
    scanId: v.id('scans'),
    consentId: v.id('consents'),
    timezone: v.string(), // copied at activation; ALL window math reads this
    status: v.union(
      v.literal('active'),
      v.literal('resolved'),
      v.literal('killed'),
      v.literal('expired'),
    ),
    windowsUsed: v.array(probeWindow),
    attemptCounts: v.object({
      phone: v.number(),
      email: v.number(),
      form: v.number(),
    }),
    startedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
    killedAt: v.union(v.number(), v.null()),
    deadlineAt: v.number(), // hard end of the measurement window
  })
    .index('by_scan', ['scanId'])
    .index('by_status_deadline', ['status', 'deadlineAt']),

  /* ---------------------------------------------------------
     probeAttempts — the append-only heart (AD-6). One row per
     dispatch; retries are NEW rows. A row gains terminal fields
     once and is otherwise immutable.
     --------------------------------------------------------- */
  probeAttempts: defineTable({
    runId: v.id('probeRuns'),
    channel,
    sequence: v.number(), // 1-based per channel; renders the FR24 log
    window: v.union(probeWindow, v.null()), // null for async channels
    scheduledFor: v.number(),
    /* Written before external I/O (AD-9). Null with a past
       scheduledFor = a lost dispatch to reconcile, never re-fire. */
    dispatchedAt: v.union(v.number(), v.null()),
    providerRef: v.union(v.string(), v.null()), // the idempotency key
    outcome: v.union(outcome, v.null()), // null while in flight
    resolvedAt: v.union(v.number(), v.null()),
    /* Channel-specific measurements (AD-1). Shape is enforced by the
       adapter that writes it — a top-level union would push channel
       branching into core, which AD-1 forbids. */
    metrics: v.any(),
    artifactIds: v.array(v.id('artifacts')),
    personaId: v.union(v.id('personas'), v.null()), // async attempts (AD-14)
    /* Diagnosis for undeliverable_ours / aborted. Never rendered
       to the owner. */
    failureReason: v.union(v.string(), v.null()),
  })
    .index('by_run', ['runId'])
    .index('by_run_channel', ['runId', 'channel'])
    .index('by_provider_ref', ['providerRef']) // webhook hot path
    .index('by_pending', ['outcome', 'scheduledFor']), // reconciliation sweep

  /* ---------------------------------------------------------
     artifacts — recordings/screenshots, copied into Convex
     storage (AD-10). Provider URLs are never canonical.
     --------------------------------------------------------- */
  artifacts: defineTable({
    attemptId: v.id('probeAttempts'),
    kind: v.union(
      v.literal('call_recording'),
      v.literal('call_transcript'),
      v.literal('voicemail_recording'),
      v.literal('email_body'),
      v.literal('form_screenshot_before'),
      v.literal('form_screenshot_after'),
    ),
    storageId: v.id('_storage'),
    contentType: v.string(),
    bytes: v.number(),
    /* Blocks surfacing through report queries (C2) — checked at the
       query layer, never left to the component. */
    containsStaffVoice: v.boolean(),
    retainUntil: v.number(), // createdAt + consents.retentionDays
    deletedAt: v.union(v.number(), v.null()), // tombstone, report says "expired"
  })
    .index('by_attempt', ['attemptId'])
    .index('by_retainUntil', ['retainUntil']),

  /* ---------------------------------------------------------
     verdicts — one per resolved run (FR23–FR26, FR33).
     --------------------------------------------------------- */
  verdicts: defineTable({
    runId: v.id('probeRuns'),
    counts: v.object({
      dispatched: v.number(),
      reachedHuman: v.number(),
      noResponse: v.number(),
      unreachableOurs: v.number(),
    }),
    fastestResponseMs: v.union(v.number(), v.null()),
    selfReported: v.any(), // original bands, copied from scans.estimate inputs
    measured: v.any(), // the AD-11 substitutes
    repriced: v.union(
      v.object({
        monthlyCents: v.number(),
        annualCents: v.number(),
        leakScore: v.number(),
        band: v.string(),
      }),
      v.null(),
    ),
    biasNote: v.boolean(), // FR35 alerting-bias disclosure applies
    partial: v.boolean(), // FR33 — resolved without all channels landing
    generatedAt: v.number(),
  }).index('by_run', ['runId']),

  /* ---------------------------------------------------------
     auditEvents — append-only record of everything that is not
     an attempt: consent granted/revoked, kill, retention sweep,
     persona change, admin override (NFR2).
     --------------------------------------------------------- */
  auditEvents: defineTable({
    runId: v.union(v.id('probeRuns'), v.null()), // null = account-level
    type: v.string(),
    actor: v.string(), // Clerk subject, 'system', or 'cron'
    detail: v.any(),
    at: v.number(),
  })
    .index('by_run', ['runId'])
    .index('by_at', ['at']),
})
