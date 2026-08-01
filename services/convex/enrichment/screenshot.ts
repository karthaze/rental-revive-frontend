/* ============================================================
   HOMEPAGE CAPTURE — server-side (AD-13), cached (CO2)
   ------------------------------------------------------------
   Thum.io waits for the page itself, so one request is the
   answer — and the key stays server-side. The image is copied
   into Convex storage so the cache serves our bytes, not a
   provider URL that can rot (the AD-10 habit, applied to the
   pre-auth side).

   No key → { url: null } and the client falls back to the
   keyless WordPress mshots path it already knows how to drive
   honestly (skeleton until a real capture, never a placeholder
   tile). Nothing here fabricates a capture.
   ============================================================ */
import { v } from 'convex/values'
import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { isFresh } from './cache'

export const capture = action({
  args: {
    url: v.string(),
    placeId: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const now = Date.now()

    if (args.placeId) {
      const cached = await ctx.runQuery(internal.enrichment.cache.byPlaceId, {
        placeId: args.placeId,
      })
      if (cached?.enrichment?.screenshotId && isFresh(cached.enrichedAt, now)) {
        const url = await ctx.storage.getUrl(cached.enrichment.screenshotId)
        if (url) return { url }
      }
    }

    const key = process.env.THUM_IO_KEY
    if (!key) return { url: null }

    let target = args.url
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target

    let blob: Blob
    try {
      const res = await fetch(
        `https://image.thum.io/get/auth/${key}/width/1400/crop/900/wait/4/noanimate/${target}`,
      )
      if (!res.ok) return { url: null }
      blob = await res.blob()
      if (!blob.size || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
        return { url: null }
      }
    } catch {
      return { url: null }
    }

    const storageId = await ctx.storage.store(blob)
    if (args.placeId) {
      await ctx.runMutation(internal.enrichment.cache.put, {
        placeId: args.placeId,
        name: args.name,
        facet: 'screenshotId',
        value: storageId,
        now,
      })
    }
    return { url: await ctx.storage.getUrl(storageId) }
  },
})
