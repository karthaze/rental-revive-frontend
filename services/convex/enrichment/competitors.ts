/* ============================================================
   COMPETITOR HOURS — FR27, C6, CO3
   ------------------------------------------------------------
   Fired at activation, never before: this is paid enrichment,
   and activation is maximum demonstrated intent (CO3). It reads
   PUBLIC listings only — published opening hours via Places
   Details — and never contacts anyone (C6, permanent).

   Raw periods are stored on the scan's radar competitors; the
   comparison itself is recomputed at read time by core/hours,
   so there is no derived copy to drift. No key → an audit row
   and nothing else; the verdict simply renders no hours panel.

   Config: GOOGLE_MAPS_SERVER_KEY — a SERVER key (IP-restricted,
   Places Details enabled), distinct from the browser Maps key.
   ============================================================ */
import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { internal } from '../_generated/api'

/* CO5 discipline: the radius sweep can hold dozens of yards; six
   Details calls bound the cost at ~$0.10 while covering everyone the
   dashboard would ever show. */
const MAX_COMPETITORS = 6

type RadarCompetitor = {
  placeId?: string
  name: string
  national?: boolean
  periods?: unknown
}

export const loadRadar = internalQuery({
  args: { scanId: v.id('scans') },
  handler: async (ctx, { scanId }) => {
    const scan = await ctx.db.get(scanId)
    return scan?.radar ?? null
  },
})

export const storeRadarHours = internalMutation({
  args: {
    scanId: v.id('scans'),
    hoursByPlaceId: v.record(v.string(), v.any()),
  },
  handler: async (ctx, { scanId, hoursByPlaceId }) => {
    const scan = await ctx.db.get(scanId)
    if (!scan?.radar) return
    const competitors = (scan.radar.competitors as RadarCompetitor[]).map((c) =>
      c.placeId && hoursByPlaceId[c.placeId] !== undefined
        ? { ...c, periods: hoursByPlaceId[c.placeId] }
        : c,
    )
    await ctx.db.patch(scanId, { radar: { ...scan.radar, competitors } })
  },
})

export const fetchHours = internalAction({
  args: { scanId: v.id('scans') },
  handler: async (ctx, { scanId }) => {
    const key = process.env.GOOGLE_MAPS_SERVER_KEY
    if (!key) {
      await ctx.runMutation(internal.runs.auditLog.record, {
        runId: null,
        type: 'competitor_hours_skipped',
        actor: 'system',
        detail: { scanId, reason: 'GOOGLE_MAPS_SERVER_KEY not configured' },
      })
      return
    }

    const radar = await ctx.runQuery(internal.enrichment.competitors.loadRadar, { scanId })
    if (!radar) return
    const targets = (radar.competitors as RadarCompetitor[])
      .filter((c) => c.placeId && c.periods === undefined)
      .slice(0, MAX_COMPETITORS)
    if (!targets.length) return

    const hoursByPlaceId: Record<string, unknown> = {}
    for (const c of targets) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
            c.placeId!,
          )}&fields=opening_hours&key=${key}`,
        )
        if (!res.ok) continue
        const data = (await res.json()) as {
          status?: string
          result?: { opening_hours?: { periods?: unknown[] } }
        }
        /* published periods, or null = we looked and the listing
           publishes none. Absent entirely = we never got an answer,
           and the competitor stays unmeasured (AD-16). */
        if (data.status === 'OK') {
          hoursByPlaceId[c.placeId!] = data.result?.opening_hours?.periods ?? null
        }
      } catch {
        /* one dead lookup must not sink the rest */
      }
    }

    if (Object.keys(hoursByPlaceId).length) {
      await ctx.runMutation(internal.enrichment.competitors.storeRadarHours, {
        scanId,
        hoursByPlaceId,
      })
    }
  },
})
