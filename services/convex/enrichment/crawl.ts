/* ============================================================
   WEBSITE CRAWL — server-side (AD-13), cached (CO2)
   ------------------------------------------------------------
   Raw HTML is requested (saveHtml) because the tracking scan
   lives or dies on script references; interpretation happens
   through the same pure modules the SPA uses — enrich.js for
   the quote path, footprint.js for the trackers — so there is
   exactly one reading of a yard's markup in the codebase.

   The honesty rule carries over verbatim from crawler.js:
   when we cannot read the site, every finding is null, never
   false. This module used to have a client-side twin that
   fabricated results when the token was missing; that class of
   bug is why unmeasured() exists (AD-16).
   ============================================================ */
import { v } from 'convex/values'
import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { analyzeQuotePath } from '../../../common/enrich.js'
import { detectTrackers } from '../../../common/footprint.js'
import { isFresh } from './cache'

const ACTOR = 'apify~website-content-crawler'
const MAX_HTML = 2_000_000 // brooklinen.com is 1.6MB; 400k truncated away a real pixel config

/** Every finding unknown — used whenever the site could not be read. */
const unmeasured = (reason: string) => ({
  ok: false,
  measured: false,
  error: reason,
  foundBooking: null,
  foundChat: null,
  foundContact: null,
  foundQuoteIntent: null,
  trackers: detectTrackers(null, null),
})

export const audit = action({
  args: {
    url: v.string(),
    placeId: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const now = Date.now()

    if (args.placeId) {
      const cached = await ctx.runQuery(internal.enrichment.cache.byPlaceId, {
        placeId: args.placeId,
      })
      if (cached?.enrichment?.crawl && isFresh(cached.enrichedAt, now)) {
        return cached.enrichment.crawl
      }
    }

    const token = process.env.APIFY_TOKEN

    let targetUrl = args.url
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl

    let result
    if (!token) {
      /* No Apify: a direct server-side fetch of the homepage. One page
         instead of three and no JS rendering, but the tag signatures
         (Facebook Pixel, GTM, GA4, Ads) are script references in the
         served head — exactly what a plain fetch returns. The honesty
         rule holds: any failure is unmeasured, never a clean bill. */
      try {
        const res = await fetch(targetUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RentalRevive scan)' },
        })
        if (!res.ok) return unmeasured(`Site answered HTTP ${res.status}`)
        const html = (await res.text()).slice(0, MAX_HTML)
        if (!/<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html)) {
          return unmeasured('Site returned no readable page')
        }
        const text = html
          .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
        result = {
          ok: true,
          measured: true,
          ...analyzeQuotePath(html, text),
          trackers: detectTrackers(html, null),
        }
      } catch (e) {
        return unmeasured(e instanceof Error ? e.message : 'Audit failed')
      }
      if (args.placeId) {
        await ctx.runMutation(internal.enrichment.cache.put, {
          placeId: args.placeId,
          name: args.name,
          website: args.url,
          facet: 'crawl',
          value: result,
          now,
        })
      }
      return result
    }

    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url: targetUrl }],
            maxCrawlPages: 3,
            crawlerType: 'cheerio',
            saveHtml: true, // the tracking scan lives or dies on this flag
          }),
        },
      )
      if (!res.ok) return unmeasured(`Apify HTTP ${res.status}`)

      const data = (await res.json()) as { html?: string; text?: string }[]
      if (!Array.isArray(data) || data.length === 0) return unmeasured('No content found')

      const html = data.map((i) => i.html || '').join('\n').slice(0, MAX_HTML)
      const text = data.map((i) => i.text || '').join(' ')

      result = {
        ok: true,
        measured: true,
        ...analyzeQuotePath(html || null, text),
        trackers: detectTrackers(html || null, null),
      }
    } catch (e) {
      return unmeasured(e instanceof Error ? e.message : 'Audit failed')
    }

    if (result.ok && args.placeId) {
      await ctx.runMutation(internal.enrichment.cache.put, {
        placeId: args.placeId,
        name: args.name,
        website: args.url,
        facet: 'crawl',
        value: result,
        now,
      })
    }
    return result
  },
})
