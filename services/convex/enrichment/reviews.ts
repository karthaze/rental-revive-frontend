/* ============================================================
   DEEP REVIEW PULL — server-side (AD-13), cached (CO2)
   ------------------------------------------------------------
   The Apify token used to ship in the browser bundle behind a
   comment claiming it never reached the browser. It lives here
   now, in a Convex env var, and the client gets the aggregate.

   Unconfigured or failed pulls return { ok:false, error } and
   the scan renders its existing honest fallback — the 5-review
   Places sample. Nothing is simulated (AD-16).
   ============================================================ */
import { v } from 'convex/values'
import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { aggregateReviews, mapsUrlFor } from '../../../common/enrich.js'
import { isFresh } from './cache'

const ACTOR = 'compass~google-maps-reviews-scraper'
const MAX_REVIEWS = 150

export const fetch_ = action({
  args: {
    placeId: v.string(),
    name: v.optional(v.string()),
    website: v.optional(v.union(v.string(), v.null())),
    mapsUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<any> => {
    const now = Date.now()

    const cached = await ctx.runQuery(internal.enrichment.cache.byPlaceId, {
      placeId: args.placeId,
    })
    if (cached?.enrichment?.reviews && isFresh(cached.enrichedAt, now)) {
      return cached.enrichment.reviews
    }

    const token = process.env.APIFY_TOKEN
    if (!token) return { ok: false, error: 'Reviews enrichment not configured' }

    const startUrl = mapsUrlFor(args.placeId, args.mapsUrl ?? null)
    if (!startUrl) return { ok: false, error: 'No placeId or Maps URL provided' }

    let result
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url: startUrl }],
            maxReviews: MAX_REVIEWS,
            reviewsSort: 'newest',
            language: 'en',
          }),
        },
      )
      if (!res.ok) return { ok: false, error: `Apify HTTP ${res.status}` }
      result = aggregateReviews(await res.json())
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }

    /* only successful pulls are worth caching — a transient provider
       failure must not become a week of "no reviews" */
    if (result.ok && args.placeId) {
      await ctx.runMutation(internal.enrichment.cache.put, {
        placeId: args.placeId,
        name: args.name,
        website: args.website ?? undefined,
        facet: 'reviews',
        value: result,
        now,
      })
    }
    return result
  },
})
