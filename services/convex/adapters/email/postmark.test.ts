/* The email adapter's pure surfaces: the C8-safe inquiry, event→AD-2
   translation, inbound reply classification and correlation, and the
   FR19 debrief copy. */
import { describe, expect, test } from 'vitest'
import {
  inquiryCopy,
  makeEmailAdapter,
  resolvePostmarkEvent,
  classifyInbound,
  debriefCopy,
  formatDuration,
} from './postmark'

const persona = {
  legalName: 'Full Circle Contractors LLC',
  fromAddress: 'inquiries@fullcirclecontractors.com',
  replyDomain: 'reply.fullcirclecontractors.com',
  siteUrl: 'https://fullcirclecontractors.com',
  phone: '+15125550142',
}

describe('the inquiry (FR16, C8)', () => {
  test('asks availability and rates for HIS machine lines — no job, no site, no date', () => {
    const { subject, body } = inquiryCopy({
      machineLines: ['Rough terrain forklifts', 'Telehandlers'],
      yardName: 'Discount Lift Rentals',
      persona,
    })
    expect(subject).toContain('Rough terrain forklifts')
    expect(body).toContain('rough terrain forklifts and telehandlers')
    expect(body).toContain('rates')
    expect(body).toContain(persona.legalName)
    /* the C8 line: nothing that could cause a dispatcher to reserve
       a machine */
    expect(body).not.toMatch(/\b(job|site|deliver|project|date|need it by|monday|friday)\b/i)
  })
  test('degrades to generic equipment when no lines were picked', () => {
    const { body } = inquiryCopy({ machineLines: [], yardName: 'X', persona })
    expect(body).toContain('rental equipment')
  })
})

describe('dispatch', () => {
  const job = {
    attemptId: 'attempt_7',
    runId: 'run_1',
    channel: 'email' as const,
    sequence: 1,
    target: 'rentals@yard.com',
    persona,
    machineLines: ['Telehandlers'],
    yardName: 'Yard',
  }

  test('sends as the persona with the probe+ reply correlation (AD-14)', async () => {
    let captured: Record<string, unknown> | null = null
    const fake: typeof fetch = async (_url, init) => {
      captured = JSON.parse(String(init!.body))
      return new Response(JSON.stringify({ MessageID: 'pm_1' }), { status: 200 })
    }
    const result = await makeEmailAdapter({ serverToken: 'tok' }, fake).dispatch(job)
    expect(result).toEqual({ ok: true, providerRef: 'pm_1' })
    expect(captured!.From).toBe('Full Circle Contractors LLC <inquiries@fullcirclecontractors.com>')
    expect(captured!.To).toBe('rentals@yard.com')
    expect(captured!.ReplyTo).toBe('probe+attempt_7@reply.fullcirclecontractors.com')
    expect(captured!.Metadata).toEqual({ attemptId: 'attempt_7', runId: 'run_1' })
  })

  test('an API refusal is OUR failure', async () => {
    const fake: typeof fetch = async () => new Response('no', { status: 422 })
    const result = await makeEmailAdapter({ serverToken: 'tok' }, fake).dispatch(job)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.outcome).toBe('undeliverable_ours')
  })
})

describe('delivery events → AD-2 (NFR7)', () => {
  test('delivery is the precondition, not an outcome', () => {
    const r = resolvePostmarkEvent({ RecordType: 'Delivery', MessageID: 'pm_1' })
    expect(r.outcome).toBeNull()
    expect(r.metrics?.deliveryStatus).toBe('delivered')
  })
  test('a dead published address is theirs; everything else is ours', () => {
    expect(resolvePostmarkEvent({ RecordType: 'Bounce', Type: 'HardBounce' }).outcome).toBe(
      'undeliverable_theirs',
    )
    expect(resolvePostmarkEvent({ RecordType: 'Bounce', Type: 'SoftBounce' }).outcome).toBe(
      'undeliverable_ours',
    )
    expect(resolvePostmarkEvent({ RecordType: 'Bounce', Type: 'Blocked' }).outcome).toBe(
      'undeliverable_ours',
    )
    expect(resolvePostmarkEvent({ RecordType: 'SpamComplaint' }).outcome).toBe(
      'undeliverable_ours',
    )
  })
})

describe('inbound classification (FR18)', () => {
  const inbound = (over: Record<string, unknown>) => ({
    MailboxHash: 'attempt_7',
    Subject: 'Re: Availability and rates',
    TextBody: 'We have two telehandlers on the yard.',
    Headers: [],
    ...over,
  })

  test('correlates via MailboxHash, then ToFull, then the To string', () => {
    expect(classifyInbound(inbound({})).attemptId).toBe('attempt_7')
    expect(
      classifyInbound(inbound({ MailboxHash: '', ToFull: [{ MailboxHash: 'attempt_8' }] }))
        .attemptId,
    ).toBe('attempt_8')
    expect(
      classifyInbound(
        inbound({ MailboxHash: '', To: 'probe+attempt_9@reply.fullcirclecontractors.com' }),
      ).attemptId,
    ).toBe('attempt_9')
    expect(classifyInbound(inbound({ MailboxHash: '', To: 'info@other.com' })).attemptId).toBeNull()
  })

  test('RFC 3834 headers and out-of-office subjects are autoresponders', () => {
    expect(
      classifyInbound(inbound({ Headers: [{ Name: 'Auto-Submitted', Value: 'auto-replied' }] }))
        .replyClass,
    ).toBe('autoresponder')
    expect(
      classifyInbound(inbound({ Headers: [{ Name: 'Precedence', Value: 'auto_reply' }] }))
        .replyClass,
    ).toBe('autoresponder')
    expect(
      classifyInbound(inbound({ Subject: 'Automatic reply: Availability and rates' })).replyClass,
    ).toBe('autoresponder')
    expect(classifyInbound(inbound({ Subject: 'Out of Office' })).replyClass).toBe('autoresponder')
  })

  test('a plain reply is human — the tie goes to the yard', () => {
    expect(classifyInbound(inbound({})).replyClass).toBe('human')
    expect(
      classifyInbound(inbound({ Headers: [{ Name: 'Auto-Submitted', Value: 'no' }] })).replyClass,
    ).toBe('human')
  })

  test('price and next-step facts (FR18)', () => {
    expect(classifyInbound(inbound({ TextBody: 'Rate is $450/day for the 8k.' })).containedPrice).toBe(true)
    expect(classifyInbound(inbound({ TextBody: '1200 per week plus delivery' })).containedPrice).toBe(true)
    expect(classifyInbound(inbound({ TextBody: 'We have them in stock.' })).containedPrice).toBe(false)
    expect(
      classifyInbound(inbound({ TextBody: 'What dates do you need it?' })).containedNextStep,
    ).toBe(true)
    expect(
      classifyInbound(inbound({ TextBody: 'Give us a call at 979-383-6600.' })).containedNextStep,
    ).toBe(true)
    expect(classifyInbound(inbound({ TextBody: 'Noted.' })).containedNextStep).toBe(false)
  })
})

describe('the debrief (FR19)', () => {
  test('discloses the audit, states the measurement, indicts nobody', () => {
    const { subject, body } = debriefCopy({
      yardName: 'Discount Lift Rentals',
      persona,
      msToFirstReply: 31 * 3600_000,
    })
    expect(subject).toContain('authorised')
    expect(body).toContain('31 hours')
    expect(body).toContain('measured the system, not any person')
    expect(body).toContain('no names appear')
  })
  test('states silence as silence', () => {
    const { body } = debriefCopy({ yardName: 'X', persona, msToFirstReply: null })
    expect(body).toContain('no reply arrived inside the measurement window')
  })
  test('duration formatting', () => {
    expect(formatDuration(4 * 60_000)).toBe('4 minutes')
    expect(formatDuration(31 * 3600_000)).toBe('31 hours')
    expect(formatDuration(31.44 * 3600_000)).toBe('31.4 hours')
    expect(formatDuration(72 * 3600_000)).toBe('3 days')
  })
})
