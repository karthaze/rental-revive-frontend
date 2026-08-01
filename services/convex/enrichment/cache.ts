/* ============================================================
   THE ENRICHMENT CACHE — CO2, over the yards table
   ------------------------------------------------------------
   Two visitors scanning the same yard, or one visitor
   re-scanning, must not re-pay for Apify and screenshot calls.
   The yards row IS the cache (data-model: "the enrichment
   cache"); enrichment merges into yards.enrichment keyed by
   placeId, and saveScan later patches listing fields onto the
   same row without touching the cache.

   Freshness is one TTL for the whole enrichment object —
   listing data and site markup age at the same rough rate and
   two clocks would double the sweep logic for nothing.
   ============================================================ */
import { v } from 'convex/values'
import { internalMutation, internalQuery } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'

/* [ASSUMPTION] — CO2 says "a sane TTL"; a week keeps re-scans free
   while a changed website still gets re-read soon enough. */
export const ENRICHMENT_TTL_MS = 7 * 24 * 3600 * 1000

export const isFresh = (enrichedAt: number | null, now: number): boolean =>
  enrichedAt !== null && now - enrichedAt < ENRICHMENT_TTL_MS

export const byPlaceId = internalQuery({
  args: { placeId: v.string() },
  handler: async (ctx, { placeId }) => {
    if (!placeId) return null
    return ctx.db
      .query('yards')
      .withIndex('by_placeId', (q) => q.eq('placeId', placeId))
      .unique()
  },
})

/** Merge one enrichment facet into the yard row, creating a minimal
    row when the yard has never been seen. Facets merge independently
    so a reviews pull does not clobber a cached crawl. */
export const put = internalMutation({
  args: {
    placeId: v.string(),
    name: v.optional(v.string()),
    website: v.optional(v.union(v.string(), v.null())),
    facet: v.union(v.literal('reviews'), v.literal('crawl'), v.literal('screenshotId')),
    value: v.any(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('yards')
      .withIndex('by_placeId', (q) => q.eq('placeId', args.placeId))
      .unique()

    const merge = (prev: Doc<'yards'>['enrichment']) => ({
      reviews: prev?.reviews ?? null,
      crawl: prev?.crawl ?? null,
      screenshotId: prev?.screenshotId ?? null,
      footprint: prev?.footprint ?? null,
      [args.facet]: args.value,
    })

    if (existing) {
      await ctx.db.patch(existing._id, {
        enrichment: merge(existing.enrichment),
        enrichedAt: args.now,
      })
      return existing._id
    }
    /* first sight of this yard: a stub row the later saveScan patch
       fills with real listing data */
    return ctx.db.insert('yards', {
      placeId: args.placeId,
      manual: false,
      name: args.name ?? '',
      address: null,
      city: null,
      state: null,
      lat: null,
      lng: null,
      timezone: null,
      phone: null,
      website: args.website ?? null,
      rating: null,
      reviewCount: null,
      openingHours: null,
      photoCount: null,
      enrichment: merge(null),
      enrichedAt: args.now,
    })
  },
})
