/* The phone adapter's pure surfaces: dialing normalisation, number
   rotation (NFR5), the status→AD-2 translation (NFR7), timing
   derivation, the bridge TwiML (AD-3/AD-4), and webhook signature
   verification against Twilio's own documented vector. */
import { describe, expect, test } from 'vitest'
import {
  toE164,
  fromNumberFor,
  resolveTwilioStatus,
  deriveTiming,
  bridgeTwiml,
  makePhoneAdapter,
  RING_TIMEOUT_SEC,
  type TwilioConfig,
} from './twilio'
import { resolveVapiReport, vapiAttemptId } from './vapi'
import { twilioSignature, verifyTwilioRequest, timingSafeEqual } from './signature'

describe('toE164', () => {
  test('normalises US formats', () => {
    expect(toE164('(979) 383-6600')).toBe('+19793836600')
    expect(toE164('979-383-6600')).toBe('+19793836600')
    expect(toE164('19793836600')).toBe('+19793836600')
    expect(toE164('+19793836600')).toBe('+19793836600')
  })
  test('rejects garbage instead of dialing it', () => {
    expect(toE164('call the yard')).toBeNull()
    expect(toE164('12345')).toBeNull()
  })
})

describe('caller number rotation (NFR5)', () => {
  test('deterministic by sequence — same attempt, same number; retry, next number', () => {
    const pool = ['+15550001111', '+15550002222', '+15550003333']
    expect(fromNumberFor(pool, 1)).toBe('+15550001111')
    expect(fromNumberFor(pool, 2)).toBe('+15550002222')
    expect(fromNumberFor(pool, 4)).toBe('+15550001111') // wraps
  })
})

describe('status → outcome translation (AD-2, NFR7)', () => {
  test('interim events carry metrics, no outcome', () => {
    expect(resolveTwilioStatus({ CallStatus: 'initiated' }).outcome).toBeNull()
    const ringing = resolveTwilioStatus({ CallStatus: 'ringing' })
    expect(ringing.outcome).toBeNull()
    expect(ringing.metrics?.ringStartedAt).toBeTypeOf('number')
    const answered = resolveTwilioStatus({ CallStatus: 'in-progress' })
    expect(answered.outcome).toBeNull()
    expect(answered.metrics?.answeredAt).toBeTypeOf('number')
  })

  test('a connected call is NOT terminal from Twilio — classification is Vapi’s (AD-3)', () => {
    const done = resolveTwilioStatus({ CallStatus: 'completed', CallDuration: '73' })
    expect(done.outcome).toBeNull()
    expect(done.metrics?.durationSec).toBe(73)
  })

  test('ring-out and busy are the yard not responding', () => {
    expect(resolveTwilioStatus({ CallStatus: 'no-answer' }).outcome).toBe('no_response')
    expect(resolveTwilioStatus({ CallStatus: 'busy' }).outcome).toBe('no_response')
  })

  test('a dead number is theirs; an unexplained failure is OURS (NFR7)', () => {
    expect(
      resolveTwilioStatus({ CallStatus: 'failed', SipResponseCode: '404' }).outcome,
    ).toBe('undeliverable_theirs')
    expect(
      resolveTwilioStatus({ CallStatus: 'failed', ErrorCode: '13224' }).outcome,
    ).toBe('undeliverable_theirs')
    // no explanation → we eat it, never the yard
    expect(resolveTwilioStatus({ CallStatus: 'failed' }).outcome).toBe('undeliverable_ours')
    expect(
      resolveTwilioStatus({ CallStatus: 'failed', SipResponseCode: '503' }).outcome,
    ).toBe('undeliverable_ours')
  })

  test('canceled measured nothing', () => {
    expect(resolveTwilioStatus({ CallStatus: 'canceled' }).outcome).toBe('aborted')
  })
})

describe('timing derivation', () => {
  test('msToAnswer and about-N-rings appear once both stamps exist', () => {
    const afterRing = deriveTiming({}, { ringStartedAt: 1_000 })
    expect(afterRing.msToAnswer).toBeUndefined()
    const afterAnswer = deriveTiming(afterRing, { answeredAt: 19_000 })
    expect(afterAnswer.msToAnswer).toBe(18_000)
    expect(afterAnswer.estimatedRings).toBe(3) // ~6s per ring
  })
})

describe('the bridge TwiML (AD-3, AD-4)', () => {
  test('dials Vapi over SIP with the attempt id as a custom header, no AMD anywhere', () => {
    const xml = bridgeTwiml('asst_123@sip.vapi.ai', 'attempt_abc')
    expect(xml).toContain('<Dial answerOnBridge="true">')
    expect(xml).toContain('sip:asst_123@sip.vapi.ai?X-RR-Attempt=attempt_abc')
    expect(xml).not.toMatch(/machineDetection|Gather|Pause/i)
  })
  test('tolerates a sip: prefix on the configured address', () => {
    expect(bridgeTwiml('sip:a@sip.vapi.ai', 'x')).toContain('<Sip>sip:a@sip.vapi.ai')
  })
})

describe('dispatch (AD-9 idempotent by attempt id)', () => {
  const cfg: TwilioConfig = {
    accountSid: 'ACxxxx',
    authToken: 'token',
    fromNumbers: ['+15550001111', '+15550002222'],
    vapiSipAddress: 'asst@sip.vapi.ai',
    siteUrl: 'https://probe.example.convex.site',
  }
  const job = {
    attemptId: 'attempt_1',
    runId: 'run_1',
    channel: 'phone' as const,
    sequence: 2,
    target: '(979) 383-6600',
    persona: null,
    machineLines: [],
    yardName: 'Test Yard',
  }

  test('creates the call with callbacks, rotation, and no machine detection', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fake: typeof fetch = async (url, init) => {
      captured = { url: String(url), init: init! }
      return new Response(JSON.stringify({ sid: 'CA123' }), { status: 201 })
    }
    const result = await makePhoneAdapter(cfg, fake).dispatch(job)
    expect(result).toEqual({ ok: true, providerRef: 'CA123' })

    expect(captured!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxxx/Calls.json')
    const body = new URLSearchParams(String(captured!.init.body))
    expect(body.get('To')).toBe('+19793836600')
    expect(body.get('From')).toBe('+15550002222') // sequence 2 → second number
    expect(body.get('Url')).toBe(
      'https://probe.example.convex.site/webhooks/twilio/voice?attemptId=attempt_1',
    )
    expect(body.get('StatusCallback')).toContain('/webhooks/twilio/status?attemptId=attempt_1')
    expect(body.get('Timeout')).toBe(String(RING_TIMEOUT_SEC))
    expect(body.getAll('StatusCallbackEvent')).toEqual([
      'initiated',
      'ringing',
      'answered',
      'completed',
    ])
    expect(body.has('MachineDetection')).toBe(false) // AD-4
  })

  test('a refused API call is OUR failure, with the diagnosis kept off the report', async () => {
    const fake: typeof fetch = async () => new Response('nope', { status: 401 })
    const result = await makePhoneAdapter(cfg, fake).dispatch(job)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.outcome).toBe('undeliverable_ours')
      expect(result.reason).toContain('401')
    }
  })

  test('an undialable consented number aborts instead of guessing', async () => {
    const fake: typeof fetch = async () => {
      throw new Error('must not be called')
    }
    const result = await makePhoneAdapter(cfg, fake).dispatch({ ...job, target: 'no number' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.outcome).toBe('aborted')
  })
})

describe('Vapi report translation', () => {
  const report = (over: Record<string, unknown>) => ({
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      durationSeconds: 74,
      call: { assistantOverrides: { variableValues: { 'x-rr-attempt': 'attempt_9' } } },
      artifact: { recordingUrl: 'https://storage.vapi.ai/rec_1.mp3' },
      ...over,
    },
  })

  test('correlates via the SIP header echoed in variableValues', () => {
    expect(vapiAttemptId(report({}))).toBe('attempt_9')
    expect(vapiAttemptId({ message: { type: 'end-of-call-report' } })).toBeNull()
  })

  test('a human conversation is responded, and its audio is staff-voice (C2)', () => {
    const r = resolveVapiReport(report({}))!
    expect(r.resolution.outcome).toBe('responded')
    expect(r.resolution.metrics?.answeredBy).toBe('human')
    expect(r.resolution.artifacts).toEqual([
      { kind: 'call_recording', url: 'https://storage.vapi.ai/rec_1.mp3', containsStaffVoice: true },
    ])
  })

  test('voicemail is the yard not responding, and OUR message is servable', () => {
    const r = resolveVapiReport(report({ endedReason: 'voicemail' }))!
    expect(r.resolution.outcome).toBe('no_response')
    expect(r.resolution.metrics?.answeredBy).toBe('voicemail')
    expect(r.resolution.metrics?.messageLeft).toBe(true) // FR14
    expect(r.resolution.artifacts?.[0]).toMatchObject({
      kind: 'voicemail_recording',
      containsStaffVoice: false,
    })
  })

  test('unclassifiable pickups err in the yard’s favour', () => {
    const r = resolveVapiReport(report({ endedReason: 'unknown-error' }))!
    expect(r.resolution.outcome).toBe('responded')
    expect(r.resolution.metrics?.answeredBy).toBe('unknown')
  })

  test('other event types are ignored', () => {
    expect(resolveVapiReport({ message: { type: 'status-update' } })).toBeNull()
  })
})

describe('webhook signature (spine conventions)', () => {
  test('matches Twilio’s documented example vector', async () => {
    // https://www.twilio.com/docs/usage/security — canonical example
    const sig = await twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', {
      CallSid: 'CA1234567890ABCDE',
      Caller: '+12349013030',
      Digits: '1234',
      From: '+12349013030',
      To: '+18005551212',
    })
    expect(sig).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=')
  })

  test('verification rejects tampered params and missing signatures', async () => {
    const url = 'https://probe.example.convex.site/webhooks/twilio/status?attemptId=a1'
    const params = { CallSid: 'CA1', CallStatus: 'completed' }
    const good = await twilioSignature('tok', url, params)
    expect(await verifyTwilioRequest('tok', url, params, good)).toBe(true)
    expect(
      await verifyTwilioRequest('tok', url, { ...params, CallStatus: 'no-answer' }, good),
    ).toBe(false)
    expect(await verifyTwilioRequest('tok', url, params, null)).toBe(false)
  })

  test('timingSafeEqual is length-safe', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
  })
})
