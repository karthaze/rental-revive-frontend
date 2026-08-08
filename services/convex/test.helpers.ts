/// <reference types="vite/client" />
/* Shared convex-test setup. The glob excludes test files so they never
   register as Convex modules; _generated/*.js anchors the module root. */
import { convexTest } from 'convex-test'
import schema from './schema'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

export const modules = import.meta.glob([
  './**/*.ts',
  '!./**/*.test.ts',
  '!./test.helpers.ts',
  './_generated/*.js',
])

export const t = () => convexTest(schema, modules)

export const OWNER = { subject: 'user_owner_1' }

/* A cleared persona — activation refuses to run without one (C7). */
export async function seedPersona(ctx: MutationCtx): Promise<Id<'personas'>> {
  return ctx.db.insert('personas', {
    legalName: 'Full Circle Contractors LLC',
    jurisdiction: 'TX',
    domain: 'fullcirclecontractors.com',
    fromAddress: 'inquiries@fullcirclecontractors.com',
    replyDomain: 'reply.fullcirclecontractors.com',
    siteUrl: 'https://fullcirclecontractors.com',
    phone: '+15125550142',
    clearedAt: 1_700_000_000_000,
    retiredAt: null,
  })
}

export async function seedYardAndScan(
  ctx: MutationCtx,
  opts: { timezone?: string | null; answers?: Record<string, unknown> } = {},
): Promise<{ yardId: Id<'yards'>; scanId: Id<'scans'> }> {
  const yardId = await ctx.db.insert('yards', {
    placeId: 'place_test_1',
    manual: false,
    name: 'Discount Lift Rentals LLC',
    address: '7520 Eagle Pass St, Houston, TX',
    city: 'Houston',
    state: 'TX',
    lat: 29.77,
    lng: -95.28,
    timezone: opts.timezone === undefined ? 'America/Chicago' : opts.timezone,
    phone: '+19793836600',
    website: 'https://bestforkliftrentals.com',
    rating: 4.2,
    reviewCount: 5,
    openingHours: null,
    photoCount: 4,
    enrichment: null,
    enrichedAt: null,
  })
  const scanId = await ctx.db.insert('scans', {
    yardId,
    clerkUserId: null,
    answers: opts.answers ?? BASE_ANSWERS,
    radar: null,
    estimate: {
      monthlyCents: 1_234_500,
      annualCents: 14_814_000,
      leakScore: 16,
      band: 'high',
      dominantId: 'calls',
      pileStandingCents: 0,
    },
    completedAt: 1_700_000_000_000,
  })
  return { yardId, scanId }
}

/* A believable answered state for the leak engine — segment ids and
   band strings must be real ones from segments.js / leaks.js. */
export const BASE_ANSWERS: Record<string, unknown> = {
  segment: 'material', // Material Handling & Forklifts (segments.js:188)
  ticket: '$3,000 – $8,000',
  inquiries: '60 – 120',
  closeRate: 40,
  missedCalls: '1 – 5 a week',
  afterHours: 'Voicemail',
  quoteSpeed: 'Same day',
  quotePile: '20 – 50',
  quietAccounts: '10 – 25',
  outbound: 'Now and then',
  fleet: ['Warehouse forklifts (electric)', 'Rough terrain forklifts'],
}

export const TARGETS = {
  phone: '+19793836600',
  email: 'rentals@bestforkliftrentals.com',
  formUrl: 'https://bestforkliftrentals.com/contact',
}
