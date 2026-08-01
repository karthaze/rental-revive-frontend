/* ============================================================
   THE ENRICHMENT CACHE + TIMEZONE DERIVATION
   ------------------------------------------------------------
   CO2: repeat scans of the same yard never re-pay. NFR4: the
   yard's timezone comes from its geometry, not from whoever's
   browser submitted the scan. The action-level cache flow is
   exercised with a stubbed global fetch standing in for Apify.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { t as makeT, BASE_ANSWERS } from '../test.helpers'
import { ENRICHMENT_TTL_MS, isFresh } from './cache'

let t: ReturnType<typeof makeT>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_772_000_000_000)
  t = makeT()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete process.env.APIFY_TOKEN
})

const saveArgs = (over: Record<string, unknown> = {}) => ({
  yard: {
    placeId: 'place_tz_1',
    manual: false,
    name: 'Discount Lift Rentals LLC',
    address: '7520 Eagle Pass St, Houston, TX',
    city: 'Houston',
    state: 'TX',
    lat: 29.77,
    lng: -95.28,
    /* what the browser guessed — must NOT win when geometry exists */
    timezone: 'Europe/Berlin',
    phone: '+19793836600',
    website: 'https://bestforkliftrentals.com',
    rating: 4.2,
    reviewCount: 5,
    openingHours: null,
    photoCount: 4,
    ...over,
  },
  answers: BASE_ANSWERS,
  radar: null,
  estimate: null,
})

describe('timezone from geometry (NFR4)', () => {
  test('coordinates beat the browser guess', async () => {
    const { yardId } = (await t.mutation(api.scans.saveScan, saveArgs())) as { yardId: Id<'yards'> }
    const yard = await t.run((ctx) => ctx.db.get(yardId))
    expect(yard?.timezone).toBe('America/Chicago') // Houston, not Berlin
  })

  test('a manual yard with no coordinates keeps the client fallback', async () => {
    const { yardId } = (await t.mutation(
      api.scans.saveScan,
      saveArgs({ placeId: '', manual: true, lat: null, lng: null, timezone: 'America/Denver' }),
    )) as { yardId: Id<'yards'> }
    const yard = await t.run((ctx) => ctx.db.get(yardId))
    expect(yard?.timezone).toBe('America/Denver')
  })
})

describe('the cache survives the scan flow (CO2)', () => {
  test('facets merge independently and saveScan does not clobber them', async () => {
    const now = Date.now()
    /* enrichment saw the yard first — a stub row appears */
    await t.mutation(internal.enrichment.cache.put, {
      placeId: 'place_tz_1',
      name: 'Discount Lift Rentals LLC',
      facet: 'reviews',
      value: { ok: true, total: 42, average: 4.4, posPct: 88, reviews: [] },
      now,
    })
    await t.mutation(internal.enrichment.cache.put, {
      placeId: 'place_tz_1',
      facet: 'crawl',
      value: { ok: true, measured: true, foundChat: false },
      now,
    })

    /* the owner finishes the scan later; listing data lands on the
       SAME row and the cache stays */
    const { yardId } = (await t.mutation(api.scans.saveScan, saveArgs())) as { yardId: Id<'yards'> }
    const yard = await t.run((ctx) => ctx.db.get(yardId))
    expect(yard?.name).toBe('Discount Lift Rentals LLC')
    expect(yard?.rating).toBe(4.2) // listing refreshed
    expect(yard?.enrichment?.reviews).toMatchObject({ total: 42 }) // cache intact
    expect(yard?.enrichment?.crawl).toMatchObject({ measured: true })

    const rows = await t.run(async (ctx) =>
      (await ctx.db.query('yards').collect()).filter((y) => y.placeId === 'place_tz_1'),
    )
    expect(rows).toHaveLength(1) // one yard, not a stub plus a real one
  })

  test('freshness is one TTL', () => {
    const now = 1_772_000_000_000
    expect(isFresh(now - ENRICHMENT_TTL_MS + 1000, now)).toBe(true)
    expect(isFresh(now - ENRICHMENT_TTL_MS - 1000, now)).toBe(false)
    expect(isFresh(null, now)).toBe(false)
  })
})

describe('the reviews action against a stubbed provider', () => {
  test('first call pays, second call is served from the cache', async () => {
    process.env.APIFY_TOKEN = 'apify_test_token'
    let providerCalls = 0
    vi.stubGlobal('fetch', async () => {
      providerCalls += 1
      return new Response(
        JSON.stringify([{ stars: 5, name: 'A', text: 'fast service' }, { stars: 4, name: 'B', text: 'good' }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    const first = await t.action(api.enrichment.reviews.fetch_, { placeId: 'place_cached_1' })
    expect(first.ok).toBe(true)
    expect(providerCalls).toBe(1)

    const second = await t.action(api.enrichment.reviews.fetch_, { placeId: 'place_cached_1' })
    expect(second).toMatchObject({ ok: true, total: 2 })
    expect(providerCalls).toBe(1) // CO2 — the repeat visit cost nothing
  })

  test('unconfigured backend says so — no fabricated aggregate (AD-16)', async () => {
    const res = await t.action(api.enrichment.reviews.fetch_, { placeId: 'p1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not configured/)
  })

  test('a provider failure is not cached', async () => {
    process.env.APIFY_TOKEN = 'apify_test_token'
    let providerCalls = 0
    vi.stubGlobal('fetch', async () => {
      providerCalls += 1
      return new Response('rate limited', { status: 429 })
    })
    const res = await t.action(api.enrichment.reviews.fetch_, { placeId: 'place_err_1' })
    expect(res.ok).toBe(false)

    /* a transient failure must not become a week of "no reviews" */
    const yard = await t.run(async (ctx) =>
      (await ctx.db.query('yards').collect()).find((y) => y.placeId === 'place_err_1'),
    )
    expect(yard?.enrichment?.reviews ?? null).toBeNull()
    expect(providerCalls).toBe(1)
  })
})
