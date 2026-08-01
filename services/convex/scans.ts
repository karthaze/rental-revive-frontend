/* ============================================================
   SCAN INTAKE — the seam between the existing SPA and the probe
   ------------------------------------------------------------
   The chat flow runs anonymous and client-side, exactly as it
   does today. When the owner reaches the proof-load-test gate,
   the SPA persists the finished scan here — yard, answers,
   radar, frozen estimate — and activation (runs/activate.ts)
   picks it up by id. A scan exists before any identity does;
   it gains a clerkUserId only if activation happens (data-model,
   scans).

   The yard row doubles as the enrichment cache (CO2): keyed by
   placeId so a re-scan of the same yard never re-pays for
   Places/Apify. Manual yards (no Google listing) always insert.
   ============================================================ */
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import tzLookup from 'tz-lookup'

export const saveScan = mutation({
  args: {
    yard: v.object({
      placeId: v.string(),
      manual: v.boolean(),
      name: v.string(),
      address: v.union(v.string(), v.null()),
      city: v.union(v.string(), v.null()),
      state: v.union(v.string(), v.null()),
      lat: v.union(v.number(), v.null()),
      lng: v.union(v.number(), v.null()),
      timezone: v.union(v.string(), v.null()),
      phone: v.union(v.string(), v.null()),
      website: v.union(v.string(), v.null()),
      rating: v.union(v.number(), v.null()),
      reviewCount: v.union(v.number(), v.null()),
      openingHours: v.union(v.any(), v.null()),
      photoCount: v.union(v.number(), v.null()),
    }),
    answers: v.any(),
    radar: v.union(
      v.object({ competitors: v.array(v.any()), radiusMi: v.number() }),
      v.null(),
    ),
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
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    /* NFR4/AD-8 — the yard's timezone comes from its GEOMETRY, not
       from whoever's browser happened to submit the scan. The client
       still sends its own zone as a fallback for manual yards with no
       coordinates; when we have lat/lng, the lookup wins. A 20:00
       window cap in the wrong zone is a call at 11pm to someone's
       cell — this is where that bug dies. */
    const yard = { ...args.yard }
    if (yard.lat !== null && yard.lng !== null) {
      try {
        yard.timezone = tzLookup(yard.lat, yard.lng)
      } catch {
        /* out-of-range coordinates: keep the client fallback */
      }
    }

    /* CO2 — one yard row per placeId; manual yards have no stable key
       and always insert. */
    let yardId = null
    if (!args.yard.manual && args.yard.placeId) {
      const existing = await ctx.db
        .query('yards')
        .withIndex('by_placeId', (q) => q.eq('placeId', args.yard.placeId))
        .unique()
      if (existing) {
        /* Listing data refreshes; the enrichment cache stays. */
        await ctx.db.patch(existing._id, { ...yard })
        yardId = existing._id
      }
    }
    if (!yardId) {
      yardId = await ctx.db.insert('yards', {
        ...yard,
        enrichment: null,
        enrichedAt: null,
      })
    }

    const scanId = await ctx.db.insert('scans', {
      yardId,
      clerkUserId: null, // anonymous until activation, by design
      answers: args.answers,
      radar: args.radar,
      estimate: args.estimate,
      completedAt: now,
    })

    return { scanId, yardId }
  },
})

export const getScan = query({
  args: { scanId: v.id('scans') },
  handler: async (ctx, { scanId }) => {
    const scan = await ctx.db.get(scanId)
    if (!scan) return null
    /* A scan is anonymous until activation claims it; once claimed it
       is the owner's data and nobody else's. Unguessable ids are not
       an access policy. */
    if (scan.clerkUserId !== null) {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || identity.subject !== scan.clerkUserId) return null
    }
    const yard = await ctx.db.get(scan.yardId)
    return { scan, yard }
  },
})
