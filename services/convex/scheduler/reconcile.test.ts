/* ============================================================
   RECONCILIATION SWEEP — AD-9
   ------------------------------------------------------------
   A dispatched call whose callbacks never arrived is resolved
   from the provider's own record — never re-dialled, and a
   completed call can never become a miss (NFR7).
   ============================================================ */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { t as makeT, seedPersona, seedYardAndScan, OWNER, TARGETS } from '../test.helpers'
import { zonedEpoch } from '../core/windows'
import { RECONCILE_GRACE_MS } from './reconcile'

const CHI = 'America/Chicago'
const ACTIVATION_AT = zonedEpoch(CHI, 2026, 3, 3, 10, 0)

let t: ReturnType<typeof makeT>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(ACTIVATION_AT)
  process.env.TWILIO_ACCOUNT_SID = 'ACtest'
  process.env.TWILIO_AUTH_TOKEN = 'tok'
  process.env.TWILIO_FROM_NUMBERS = '+15550001111'
  process.env.VAPI_SIP_ADDRESS = 'asst@sip.vapi.ai'
  process.env.CONVEX_SITE_URL = 'https://probe.example.convex.site'
  t = makeT()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBERS', 'VAPI_SIP_ADDRESS', 'CONVEX_SITE_URL']) {
    delete process.env[k]
  }
})

async function dispatchedPhoneAttempt(callSid: string) {
  const { scanId } = await t.run(async (ctx) => {
    await seedPersona(ctx)
    return seedYardAndScan(ctx)
  })
  const { runId } = (await t.withIdentity(OWNER).mutation(api.runs.activate.activate, {
    scanId,
    targets: { phone: TARGETS.phone, email: null, formUrl: null },
    disclosureVersion: 'v1-test',
  })) as { runId: Id<'probeRuns'> }
  const attempt = (await t.run((ctx) =>
    ctx.db
      .query('probeAttempts')
      .withIndex('by_run_channel', (q) => q.eq('runId', runId).eq('channel', 'phone'))
      .collect(),
  ))[0]
  await t.mutation(internal.runs.dispatch.markDispatched, {
    attemptId: attempt._id,
    at: Date.now(),
    providerRef: callSid,
  })
  return { runId, attemptId: attempt._id }
}

const twilioSays = (body: Record<string, string>, status = 200) =>
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }))

const getAttempt = (id: Id<'probeAttempts'>) => t.run((ctx) => ctx.db.get(id))
const pastGrace = () => vi.setSystemTime(Date.now() + RECONCILE_GRACE_MS + 5 * 60_000)

describe('the sweep resolves what the provider already knows', () => {
  test('a lost no-answer callback becomes no_response, retry included (FR9)', async () => {
    const { runId, attemptId } = await dispatchedPhoneAttempt('CA_lost_1')
    pastGrace()
    twilioSays({ status: 'no-answer' })
    await t.action(internal.scheduler.reconcile.sweepLostCallbacks, {})

    const attempt = await getAttempt(attemptId)
    expect(attempt!.outcome).toBe('no_response')
    /* the retry machinery fired exactly as if the webhook had landed */
    const phones = await t.run((ctx) =>
      ctx.db
        .query('probeAttempts')
        .withIndex('by_run_channel', (q) => q.eq('runId', runId).eq('channel', 'phone'))
        .collect(),
    )
    expect(phones).toHaveLength(2)
  })

  test('a completed call is a pickup — never a miss (NFR7)', async () => {
    const { attemptId } = await dispatchedPhoneAttempt('CA_lost_2')
    pastGrace()
    twilioSays({ status: 'completed', duration: '74' })
    await t.action(internal.scheduler.reconcile.sweepLostCallbacks, {})

    const attempt = await getAttempt(attemptId)
    expect(attempt!.outcome).toBe('responded')
    expect((attempt!.metrics as Record<string, unknown>).answeredBy).toBe('unknown')
  })

  test('a still-ringing call is left alone', async () => {
    const { attemptId } = await dispatchedPhoneAttempt('CA_live_1')
    pastGrace()
    twilioSays({ status: 'in-progress' })
    await t.action(internal.scheduler.reconcile.sweepLostCallbacks, {})
    expect((await getAttempt(attemptId))!.outcome).toBeNull()
  })

  test('inside the grace period nothing is touched', async () => {
    const { attemptId } = await dispatchedPhoneAttempt('CA_fresh_1')
    let providerCalls = 0
    vi.stubGlobal('fetch', async () => {
      providerCalls += 1
      return new Response(JSON.stringify({ status: 'no-answer' }), { status: 200 })
    })
    await t.action(internal.scheduler.reconcile.sweepLostCallbacks, {})
    expect(providerCalls).toBe(0)
    expect((await getAttempt(attemptId))!.outcome).toBeNull()
  })

  test('an unreachable provider resolves nothing — the deadline sweep backstops', async () => {
    const { attemptId } = await dispatchedPhoneAttempt('CA_err_1')
    pastGrace()
    twilioSays({ status: 'no-answer' }, 500)
    await t.action(internal.scheduler.reconcile.sweepLostCallbacks, {})
    expect((await getAttempt(attemptId))!.outcome).toBeNull()
  })
})
