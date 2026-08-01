// Website audit — quote path + marketing tracking, server-side (AD-13).
//
// Two questions, one crawl:
//   1. can a customer get a price without picking up the phone?
//   2. is anything on this site counting or following visitors?
//
// The crawl itself runs in services/convex/enrichment/crawl.ts (Apify, raw HTML
// via saveHtml — a tracking tag is a script reference and a text-only
// crawl discards exactly that). Interpretation happens through the
// shared pure modules (enrich.js, footprint.js), so browser and server
// read markup through the same eyes.
//
// HONESTY RULE, unchanged: when the site cannot be read, every finding
// is `null` — never `false`. This module once shipped a simulateAudit()
// that fabricated findings when a token was missing, and the chat then
// told the owner we had scanned his site. VOLTBOT made and removed the
// same mistake (../../../../voltbot/CONTEXT.md). Neither codebase still
// fabricates findings; an unconfigured backend reports itself as exactly that.

import { detectTrackers } from '../../../common/footprint.js'

/** Every finding unknown. Used whenever we could not read the site. */
function unmeasured(reason) {
  return {
    ok: false,
    measured: false,
    error: reason,
    foundBooking: null,
    foundChat: null,
    foundContact: null,
    foundQuoteIntent: null,
    trackers: detectTrackers(null, null),
  }
}

export async function auditWebsite(targetUrl, progressCallback = () => {}, meta = {}) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return unmeasured('Missing url')
  }

  let host = targetUrl
  try { host = new URL(/^https?:/i.test(targetUrl) ? targetUrl : 'https://' + targetUrl).hostname } catch {}

  try {
    const { probeConfigured, getConvex, api } = await import('../dashboard/backend.js')
    if (!probeConfigured()) {
      progressCallback('[Crawler not configured — site audit skipped]')
      return unmeasured('Crawler not configured')
    }

    progressCallback(`[Fetching ${host}...]`)
    const convex = await getConvex()
    const result = await convex.action(api.enrichment.crawl.audit, {
      url: targetUrl,
      placeId: meta.placeId || undefined,
      name: meta.name || undefined,
    })

    if (!result?.measured) {
      progressCallback(`[${result?.error || 'Scan failed'}]`)
      return result ?? unmeasured('Audit failed')
    }
    progressCallback('[Parsing markup...]')
    progressCallback('[Scanning for tracking tags...]')
    return result
  } catch (e) {
    progressCallback('[Scan failed]')
    return unmeasured(e?.message || 'Audit failed')
  }
}
