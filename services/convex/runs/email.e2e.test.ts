/* ============================================================
   EMAIL PROBE, END TO END THROUGH THE WEBHOOK EDGE
   ------------------------------------------------------------
   The FR18 measurement replayed over the real router: delivery
   confirms, an autoresponder does not stop the clock, the human
   reply resolves with the 31-hour timer, the follow-up counts,
   and the NFR7 precondition decides what the deadline sweep may
   file. The debrief path is exercised to its skip-and-audit leg
   (no send token in tests — nothing leaves the process).
   ============================================================ */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { t as makeT, seedPersona, seedYardAndScan, OWNER, TARGETS } from '../test.helpers'
import { zonedEpoch } from '../core/windows'

const CHI = 'America/Chicago'
const ACTIVATION_AT = zonedEpoch(CHI, 2026, 3, 3, 10, 0)
const SECRET = 'pm_webhook_secret'
const HOUR = 3600_000

let t: ReturnType<typeof makeT>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(ACTIVATION_AT)
  process.env.POSTMARK_WEBHOOK_SECRET = SECRET
  t = makeT()
})
afterEach(() => {
  vi.useRealTimers()
  delete process.env.POSTMARK_WEBHOOK_SECRET
})

async function activatedEmailAttempt() {
  const { scanId } = await t.run(async (ctx) => {
    await seedPersona(ctx)
    return seedYardAndScan(ctx)
  })
  const res = (await t.withIdentity(OWNER).mutation(api.runs.activate.activate, {
    scanId,
    targets: { phone: TARGETS.phone, email: TARGETS.email, formUrl: null },
    disclosureVersion: 'v1-test',
  })) as { runId: Id<'probeRuns'> }
  const attempts = await t.run((ctx) =>
    ctx.db
      .query('probeAttempts')
      .withIndex('by_run', (q) => q.eq('runId', res.runId))
      .collect(),
  )
  const email = attempts.find((a) => a.channel === 'email')!
  const phone = attempts.find((a) => a.channel === 'phone')!
  await t.mutation(internal.runs.dispatch.markDispatched, {
    attemptId: email._id,
    at: Date.now(),
    providerRef: 'pm_msg_1',
  })
  return { runId: res.runId, emailId: email._id, phoneId: phone._id }
}

const postJson = (path: string, body: unknown, secret = SECRET) =>
  t.fetch(`${path}?secret=${secret}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const getAttempt = (id: Id<'probeAttempts'>) => t.run((ctx) => ctx.db.get(id))

describe('the 31-hour email, through the wire', () => {
  test('delivery confirms, the autoresponder does not stop the clock, the human reply does', async () => {
    const { emailId } = await activatedEmailAttempt()

    let res = await postJson('/webhooks/postmark/events', {
      RecordType: 'Delivery',
      MessageID: 'pm_msg_1',
    })
    expect(res.status).toBe(200)
    let attempt = await getAttempt(emailId)
    expect(attempt!.outcome).toBeNull()
    expect((attempt!.metrics as Record<string, unknown>).deliveryStatus).toBe('delivered')

    /* "Thank you for your inquiry" — recorded, not counted */
    res = await postJson('/webhooks/postmark/inbound', {
      MailboxHash: emailId,
      Subject: 'Automatic reply: Availability and rates',
      TextBody: 'We will get back to you.',
      Headers: [{ Name: 'Auto-Submitted', Value: 'auto-replied' }],
    })
    expect(res.status).toBe(200)
    attempt = await getAttempt(emailId)
    expect(attempt!.outcome).toBeNull()

    /* 31 hours later, a person answers with a price */
    vi.setSystemTime(ACTIVATION_AT + 31 * HOUR)
    res = await postJson('/webhooks/postmark/inbound', {
      MailboxHash: emailId,
      Subject: 'Re: Availability and rates',
      TextBody: 'We have one available, $450/day. What dates do you need it?',
      Headers: [],
    })
    expect(res.status).toBe(200)
    attempt = await getAttempt(emailId)
    expect(attempt!.outcome).toBe('responded')
    const m = attempt!.metrics as Record<string, unknown>
    expect(m.replyClass).toBe('human')
    expect(m.msToFirstReply).toBe(31 * HOUR)
    expect(m.containedPrice).toBe(true)
    expect(m.containedNextStep).toBe(true)

    /* a second human reply is the FR18 follow-up — the outcome and
       timer are immutable, the count accrues */
    vi.setSystemTime(ACTIVATION_AT + 33 * HOUR)
    res = await postJson('/webhooks/postmark/inbound', {
      MailboxHash: emailId,
      Subject: 'Re: Availability and rates',
      TextBody: 'Following up — did you still need the machine?',
      Headers: [],
    })
    expect(res.status).toBe(200)
    attempt = await getAttempt(emailId)
    expect(attempt!.outcome).toBe('responded')
    expect((attempt!.metrics as Record<string, unknown>).msToFirstReply).toBe(31 * HOUR)
    expect((attempt!.metrics as Record<string, unknown>).followUpCount).toBe(1)
  })
})

describe('bounces', () => {
  test('a hard bounce is their dead front door; the run learns it instantly', async () => {
    const { emailId } = await activatedEmailAttempt()
    const res = await postJson('/webhooks/postmark/events', {
      RecordType: 'Bounce',
      Type: 'HardBounce',
      MessageID: 'pm_msg_1',
    })
    expect(res.status).toBe(200)
    const attempt = await getAttempt(emailId)
    expect(attempt!.outcome).toBe('undeliverable_theirs')
  })
})

describe('the edge drops what it cannot trust', () => {
  test('wrong secret → 403, nothing recorded', async () => {
    const { emailId } = await activatedEmailAttempt()
    const res = await postJson(
      '/webhooks/postmark/events',
      { RecordType: 'Delivery', MessageID: 'pm_msg_1' },
      'wrong_secret',
    )
    expect(res.status).toBe(403)
    expect(((await getAttempt(emailId))!.metrics as Record<string, unknown>).deliveryStatus)
      .toBeUndefined()
  })

  test('an uncorrelatable reply is dropped, never guessed at', async () => {
    const { emailId } = await activatedEmailAttempt()
    const res = await postJson('/webhooks/postmark/inbound', {
      Subject: 'Re: something',
      TextBody: 'hello',
      To: 'info@fullcirclecontractors.com',
      Headers: [],
    })
    expect(res.status).toBe(200)
    expect((await getAttempt(emailId))!.outcome).toBeNull()
  })
})

describe('the NFR7 precondition at the deadline', () => {
  test('dispatched but never confirmed delivered → OUR unknown, not their silence', async () => {
    const { emailId } = await activatedEmailAttempt()
    vi.setSystemTime(ACTIVATION_AT + 49 * HOUR)
    await t.mutation(internal.scheduler.retention.sweepDeadlines, {})
    const attempt = await getAttempt(emailId)
    expect(attempt!.outcome).toBe('undeliverable_ours')
    expect(attempt!.failureReason).toContain('NFR7')
  })

  test('confirmed delivered + silence → the finding', async () => {
    const { emailId } = await activatedEmailAttempt()
    await postJson('/webhooks/postmark/events', { RecordType: 'Delivery', MessageID: 'pm_msg_1' })
    vi.setSystemTime(ACTIVATION_AT + 49 * HOUR)
    await t.mutation(internal.scheduler.retention.sweepDeadlines, {})
    expect((await getAttempt(emailId))!.outcome).toBe('no_response')
  })
})

describe('the debrief (FR19)', () => {
  test('run resolution schedules it; without a send token it skips loudly, not silently', async () => {
    const { runId, emailId, phoneId } = await activatedEmailAttempt()

    await postJson('/webhooks/postmark/events', { RecordType: 'Delivery', MessageID: 'pm_msg_1' })
    vi.setSystemTime(ACTIVATION_AT + 2 * HOUR)
    await postJson('/webhooks/postmark/inbound', {
      MailboxHash: emailId,
      Subject: 'Re: Availability and rates',
      TextBody: 'Yes we have them, $500/day.',
      Headers: [],
    })
    await t.mutation(internal.runs.resolve.resolveAttempt, {
      attemptId: phoneId,
      outcome: 'responded',
      metrics: { answeredBy: 'human', msToAnswer: 9000 },
      now: Date.now(),
    })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.status).toBe('resolved')

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    /* no POSTMARK_SERVER_TOKEN in tests → the skip is an audit fact */
    const events = await t.run((ctx) =>
      ctx.db
        .query('auditEvents')
        .withIndex('by_run', (q) => q.eq('runId', runId))
        .collect(),
    )
    expect(events.some((e) => e.type === 'debrief_skipped')).toBe(true)
  })
})
