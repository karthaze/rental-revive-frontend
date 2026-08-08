// Website audit — quote path + marketing tracking, server-side (AD-13).
//
// Two questions, one crawl:
//   1. can a customer get a price without picking up the phone?
//   2. is anything on this site counting or following visitors?
//
// The crawl itself runs in services/convex/enrichment/crawl.ts (Apify, raw HTML
// via saveHtml — a tracking tag is a script reference and a text-only
// crawl discards exactly that). Without a backend, fetchsite.js reads
// the same HTML through keyless public CORS mirrors instead — no token
// to leak, so AD-13's reason for going server-side does not bar it.
// Interpretation happens through the shared pure modules (enrich.js,
// footprint.js) either way, so browser and server read markup through
// the same eyes.
//
// HONESTY RULE, unchanged: when the site cannot be read, every finding
// is `null` — never `false`. This module once shipped a simulateAudit()
// that fabricated findings when a token was missing, and the chat then
// told the owner we had scanned his site. VOLTBOT made and removed the
// same mistake (../../../../voltbot/CONTEXT.md). Neither codebase still
// fabricates findings; an unconfigured backend reports itself as exactly that.

import { detectTrackers } from '../../../common/footprint.js'
import { fetchSiteHtml, buildAudit } from './fetchsite.js'

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
      return mirrorAudit(targetUrl, host, progressCallback)
    }

    progressCallback(`[Fetching ${host}...]`)
    const convex = await getConvex()
    const result = await convex.action(api.enrichment.crawl.audit, {
      url: targetUrl,
      placeId: meta.placeId || undefined,
      name: meta.name || undefined,
    })

    if (!result?.measured) {
      /* the backend exists but could not crawl — the mirror path reads
         the same HTML keylessly before we give up on the audit */
      return mirrorAudit(targetUrl, host, progressCallback, result?.error)
    }
    progressCallback('[Parsing markup...]')
    progressCallback('[Scanning for tracking tags...]')
    return result
  } catch (e) {
    return mirrorAudit(targetUrl, host, progressCallback, e?.message)
  }
}

/* The keyless fallback: same HTML, same interpreters (fetchsite.js),
   no backend and no token. Failure still reports unmeasured — the
   honesty rule above survives every path through this file. */
async function mirrorAudit(targetUrl, host, progressCallback, upstreamError) {
  const url = /^https?:/i.test(targetUrl) ? targetUrl : 'https://' + targetUrl
  progressCallback(`[Fetching ${host}...]`)
  const got = await fetchSiteHtml(url)
  if (!got) {
    progressCallback(`[${upstreamError || 'Site unreachable this scan'}, audit skipped]`)
    return unmeasured(upstreamError || 'Site unreachable this scan')
  }
  progressCallback('[Parsing markup...]')
  progressCallback('[Scanning for tracking tags...]')
  const result = buildAudit(got.html)
  return result ?? unmeasured('Site unreadable this scan')
}
