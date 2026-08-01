/* ============================================================
   PHONE PROBE, END TO END THROUGH THE WEBHOOK EDGE
   ------------------------------------------------------------
   Real router, real signature verification, real mutations —
   the provider is the only thing simulated, and it is simulated
   at the HTTP boundary exactly as Twilio/Vapi would call us.

   The spine's sequence diagram, replayed:
     dispatch → ringing → in-progress → completed → Vapi report
   plus the failure legs (rang out → retry; bad signature →
   dropped, state untouched).
   ============================================================ */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { t as makeT, seedPersona, seedYardAndScan, OWNER, TARGETS } from '../test.helpers'
import { twilioSignature } from '../adapters/phone/signature'
import { zonedEpoch } from '../core/windows'

const CHI = 'America/Chicago'
const ACTIVATION_AT = zonedEpoch(CHI, 2026, 3, 3, 10, 0)
const SITE = 'https://probe.example.convex.site'
const AUTH_TOKEN = 'test_auth_token'
const VAPI_SECRET = 'test_vapi_secret'

let t: ReturnType<typeof makeT>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(ACTIVATION_AT)
  process.env.TWILIO_ACCOUNT_SID = 'ACtest'
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
  process.env.TWILIO_FROM_NUMBERS = '+15550001111,+15550002222'
  process.env.VAPI_SIP_ADDRESS = 'asst_test@sip.vapi.ai'
  process.env.VAPI_WEBHOOK_SECRET = VAPI_SECRET
  process.env.CONVEX_SITE_URL = SITE
  t = makeT()
})
afterEach(() => {
  vi.useRealTimers()
  for (const k of [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_NUMBERS',
    'VAPI_SIP_ADDRESS',
    'VAPI_WEBHOOK_SECRET',
    'CONVEX_SITE_URL',
  ]) {
    delete process.env[k]
  }
})

async function activatedPhoneAttempt() {
  const { scanId } = await t.run(async (ctx) => {
    await seedPersona(ctx)
    return seedYardAndScan(ctx)
  })
  const res = (await t.withIdentity(OWNER).mutation(api.runs.activate.activate, {
    scanId,
    targets: { phone: TARGETS.phone, email: null, formUrl: null },
    disclosureVersion: 'v1-test',
  })) as { runId: Id<'probeRuns'> }
  const attempt = (await t.run((ctx) =>
    ctx.db
      .query('probeAttempts')
      .withIndex('by_run_channel', (q) => q.eq('runId', res.runId).eq('channel', 'phone'))
      .collect(),
  ))[0]
  /* the executor dialed and got a CallSid back (AD-9) */
  await t.mutation(internal.runs.dispatch.markDispatched, {
    attemptId: attempt._id,
    at: Date.now(),
    providerRef: 'CA_TEST_1',
  })
  return { runId: res.runId, attemptId: attempt._id }
}

/** POST a status callback the way Twilio does: form-encoded, signed
    over the public URL + params. */
async function postStatus(params: Record<string, string>, opts: { tamper?: boolean } = {}) {
  const path = '/webhooks/twilio/status?attemptId=x'
  const sig = await twilioSignature(AUTH_TOKEN, `${SITE}${path}`, params)
  return t.fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': opts.tamper ? sig.slice(0, -2) + 'xx' : sig,
    },
    body: new URLSearchParams(params).toString(),
  })
}

const getAttempt = (id: Id<'probeAttempts'>) => t.run((ctx) => ctx.db.get(id))

describe('the happy call, through the wire', () => {
  test('ringing and answer accrue telemetry; Vapi classifies; verdict-grade metrics land', async () => {
    const { attemptId } = await activatedPhoneAttempt()

    let res = await postStatus({ CallSid: 'CA_TEST_1', CallStatus: 'ringing' })
    expect(res.status).toBe(200)
    vi.setSystemTime(Date.now() + 14_000) // ~2–3 rings later
    res = await postStatus({ CallSid: 'CA_TEST_1', CallStatus: 'in-progress' })
    expect(res.status).toBe(200)

    let attempt = await getAttempt(attemptId)
    expect(attempt!.outcome).toBeNull() // still Vapi's to classify (AD-3)
    const m = attempt!.metrics as Record<string, number>
    expect(m.msToAnswer).toBe(14_000)
    expect(m.estimatedRings).toBe(2)

    res = await postStatus({ CallSid: 'CA_TEST_1', CallStatus: 'completed', CallDuration: '74' })
    expect(res.status).toBe(200)
    attempt = await getAttempt(attemptId)
    expect(attempt!.outcome).toBeNull() // completed-but-connected stays open

    const vapi = await t.fetch('/webhooks/vapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vapi-secret': VAPI_SECRET },
      body: JSON.stringify({
        message: {
          type: 'end-of-call-report',
          endedReason: 'customer-ended-call',
          durationSeconds: 74,
          call: { assistantOverrides: { variableValues: { 'x-rr-attempt': attemptId } } },
          analysis: { structuredData: { answeredBy: 'human', lineCorrect: true } },
        },
      }),
    })
    expect(vapi.status).toBe(200)

    attempt = await getAttempt(attemptId)
    expect(attempt!.outcome).toBe('responded')
    const fin = attempt!.metrics as Record<string, unknown>
    expect(fin.answeredBy).toBe('human')
    expect(fin.msToAnswer).toBe(14_000) // telemetry survived the merge
    expect(fin.counterSaysLineCorrect).toBe(true) // FR13, as a boolean (C3)
  })
})

describe('the rang-out call', () => {
  test('no-answer resolves no_response and books the FR9 retry', async () => {
    const { runId, attemptId } = await activatedPhoneAttempt()
    await postStatus({ CallSid: 'CA_TEST_1', CallStatus: 'ringing' })
    vi.setSystemTime(Date.now() + RINGOUT_MS)
    const res = await postStatus({ CallSid: 'CA_TEST_1', CallStatus: 'no-answer' })
    expect(res.status).toBe(200)

    expect((await getAttempt(attemptId))!.outcome).toBe('no_response')
    const phones = await t.run((ctx) =>
      ctx.db
        .query('probeAttempts')
        .withIndex('by_run_channel', (q) => q.eq('runId', runId).eq('channel', 'phone'))
        .collect(),
    )
    expect(phones).toHaveLength(2)
    expect(phones.find((a) => a.sequence === 2)!.window).toBe('lunch')
  })
})
const RINGOUT_MS = 45_000

describe('the edge drops what it cannot trust', () => {
  test('a tampered Twilio signature changes nothing', async () => {
    const { attemptId } = await activatedPhoneAttempt()
    const res = await postStatus(
      { CallSid: 'CA_TEST_1', CallStatus: 'no-answer' },
      { tamper: true },
    )
    expect(res.status).toBe(403)
    expect((await getAttempt(attemptId))!.outcome).toBeNull()
  })

  test('a wrong Vapi secret changes nothing', async () => {
    const { attemptId } = await activatedPhoneAttempt()
    const res = await t.fetch('/webhooks/vapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vapi-secret': 'wrong' },
      body: JSON.stringify({
        message: {
          type: 'end-of-call-report',
          call: { assistantOverrides: { variableValues: { 'x-rr-attempt': attemptId } } },
        },
      }),
    })
    expect(res.status).toBe(403)
    expect((await getAttempt(attemptId))!.outcome).toBeNull()
  })

  test('an uncorrelatable report is dropped, never guessed at', async () => {
    const { attemptId } = await activatedPhoneAttempt()
    const res = await t.fetch('/webhooks/vapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vapi-secret': VAPI_SECRET },
      body: JSON.stringify({
        message: { type: 'end-of-call-report', endedReason: 'customer-ended-call' },
      }),
    })
    expect(res.status).toBe(200) // acknowledged so Vapi stops retrying…
    expect((await getAttempt(attemptId))!.outcome).toBeNull() // …but nothing was invented
  })
})

describe('the answer webhook serves the bridge (AD-3, AD-4)', () => {
  test('valid signature → TwiML dialing Vapi with the correlation header', async () => {
    await activatedPhoneAttempt()
    const path = '/webhooks/twilio/voice?attemptId=attempt_abc'
    const params = { CallSid: 'CA_TEST_1', CallStatus: 'in-progress' }
    const sig = await twilioSignature(AUTH_TOKEN, `${SITE}${path}`, params)
    const res = await t.fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': sig,
      },
      body: new URLSearchParams(params).toString(),
    })
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('sip:asst_test@sip.vapi.ai?X-RR-Attempt=attempt_abc')
    expect(xml).not.toMatch(/machineDetection/i)
  })
})
