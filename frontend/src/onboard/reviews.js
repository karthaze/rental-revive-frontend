// Deep Google-review pull — now genuinely server-side (AD-13).
//
// Google's Places API caps the `reviews` field at 5. The Convex action
// at services/convex/enrichment/reviews.ts fetches a representative sample
// (~150) via Apify so the report shows a real aggregate instead of
// extrapolating from 5 — and the Apify token lives in a Convex env
// var, not in this bundle. (An earlier version of this file inlined
// the token behind a comment claiming otherwise; AD-13 exists because
// of that.)
//
// Repeat scans of the same yard hit the placeId cache and cost
// nothing (CO2). Unconfigured backend → { ok:false } and the scan
// falls back to the honest 5-review Places sample it already renders.

export async function fetchReviews(placeId, url) {
  if (!placeId && !url) return { ok: false, error: 'No placeId or Maps URL provided' }
  try {
    const { probeConfigured, getConvex, api } = await import('../dashboard/backend.js')
    if (!probeConfigured()) return { ok: false, error: 'Enrichment backend not configured' }
    const convex = await getConvex()
    return await convex.action(api.enrichment.reviews.fetch_, {
      placeId: placeId || '',
      mapsUrl: url && /google\.[^/]+\/maps/i.test(url) ? url : null,
    })
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}
