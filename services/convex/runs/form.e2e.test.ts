/* ============================================================
   FORM PROBE, END TO END THROUGH THE WEBHOOK EDGE
   ------------------------------------------------------------
   The worker is simulated at the HTTP boundary with real HMAC
   signatures. The reply leg reuses the email pipeline — a form
   submission's contact address is probe+<attemptId>@, so the
   yard's emailed answer resolves the FORM attempt.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { t as makeT, seedPersona, seedYardAndScan, OWNER, TARGETS } from '../test.helpers'
import { hmacHex } from '../adapters/form/worker'
import { zonedEpoch } from '../core/windows'

const CHI = 'America/Chicago'
const ACTIVATION_AT = zonedEpoch(CHI, 2026, 3, 3, 10, 0)
const WORKER_SECRET = 'form_worker_secret'
const PM_SECRET = 'pm_webhook_secret'
const HOUR = 3600_000

let t: ReturnType<typeof makeT>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(ACTIVATION_AT)
  process.env.FORM_WORKER_SECRET = WORKER_SECRET
  process.env.POSTMARK_WEBHOOK_SECRET = PM_SECRET
  t = makeT()
})
afterEach(() => {
  vi.useRealTimers()
  delete process.env.FORM_WORKER_SECRET
  delete process.env.POSTMARK_WEBHOOK_SECRET
})

async function activatedFormAttempt() {
  const { scanId } = await t.run(async (ctx) => {
    await seedPersona(ctx)
    return seedYardAndScan(ctx)
  })
  const res = (await t.withIdentity(OWNER).mutation(api.runs.activate.activate, {
    scanId,
    targets: { phone: TARGETS.phone, email: null, formUrl: TARGETS.formUrl },
    disclosureVersion: 'v1-test',
  })) as { runId: Id<'probeRuns'> }
  const form = (await t.run((ctx) =>
    ctx.db
      .query('probeAttempts')
      .withIndex('by_run_channel', (q) => q.eq('runId', res.runId).eq('channel', 'form'))
      .collect(),
  ))[0]
  await t.mutation(internal.runs.dispatch.markDispatched, {
    attemptId: form._id,
    at: Date.now(),
    providerRef: `form_${form._id}`,
  })
  return { runId: res.runId, formId: form._id }
}

async function postResult(payload: Record<string, unknown>, opts: { tamper?: boolean } = {}) {
  const body = JSON.stringify(payload)
  const sig = await hmacHex(WORKER_SECRET, body)
  return t.fetch('/webhooks/form-probe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-probe-signature': opts.tamper ? sig.replace(/.$/, 'f') : sig,
    },
    body,
  })
}

const getAttempt = (id: Id<'probeAttempts'>) => t.run((ctx) => ctx.db.get(id))

describe('the submitted form, through the wire', () => {
  test('submission starts the clock, screenshots land as artifacts, the emailed reply resolves it', async () => {
    const { formId } = await activatedFormAttempt()

    const png = btoa('fake-png-bytes')
    let res = await postResult({
      attemptId: formId,
      status: 'submitted',
      confirmationDetected: true,
      fieldsFilled: 4,
      httpStatus: 200,
      screenshots: { before: png, after: png },
    })
    expect(res.status).toBe(200)

    let attempt = await getAttempt(formId)
    expect(attempt!.outcome).toBeNull()
    expect((attempt!.metrics as Record<string, unknown>).submissionSucceeded).toBe(true)
    expect(attempt!.artifactIds).toHaveLength(2)
    const kinds = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('artifacts')
        .withIndex('by_attempt', (q) => q.eq('attemptId', formId))
        .collect()
      return rows.map((r) => r.kind).sort()
    })
    expect(kinds).toEqual(['form_screenshot_after', 'form_screenshot_before'])

    /* the yard replies BY EMAIL to the form submission — same inbound
       pipeline, form attempt resolved */
    vi.setSystemTime(ACTIVATION_AT + 5 * HOUR)
    res = await t.fetch(`/webhooks/postmark/inbound?secret=${PM_SECRET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MailboxHash: formId,
        Subject: 'Re: your inquiry',
        TextBody: 'Telehandler is $500/day, when do you need it?',
        Headers: [],
      }),
    })
    expect(res.status).toBe(200)
    attempt = await getAttempt(formId)
    expect(attempt!.outcome).toBe('responded')
    expect((attempt!.metrics as Record<string, unknown>).msToFirstReply).toBe(5 * HOUR)
  })
})

describe('the broken form is a headline finding (FR22)', () => {
  test('submit_failed → undeliverable_theirs, evidence attached', async () => {
    const { formId } = await activatedFormAttempt()
    const res = await postResult({
      attemptId: formId,
      status: 'submit_failed',
      fieldsFilled: 3,
      httpStatus: 200,
      note: 'page unchanged after submit',
      screenshots: { before: btoa('b'), after: btoa('a') },
    })
    expect(res.status).toBe(200)
    const attempt = await getAttempt(formId)
    expect(attempt!.outcome).toBe('undeliverable_theirs')
    expect((attempt!.metrics as Record<string, unknown>).submissionSucceeded).toBe(false)
    expect(attempt!.artifactIds).toHaveLength(2)
  })
})

describe('ours vs theirs at the bot wall (NFR7)', () => {
  test('captcha blocks as a finding; a challenge resolves as OUR failure', async () => {
    const a = await activatedFormAttempt()
    await postResult({ attemptId: a.formId, status: 'captcha' })
    expect((await getAttempt(a.formId))!.outcome).toBe('blocked_by_target')

    const b = await activatedFormAttempt()
    await postResult({ attemptId: b.formId, status: 'challenge' })
    const attempt = await getAttempt(b.formId)
    expect(attempt!.outcome).toBe('undeliverable_ours')
    expect((attempt!.metrics as Record<string, unknown>).challengeBlocked).toBe(true)
  })
})

describe('the edge drops what it cannot trust', () => {
  test('a tampered worker signature changes nothing', async () => {
    const { formId } = await activatedFormAttempt()
    const res = await postResult(
      { attemptId: formId, status: 'submitted' },
      { tamper: true },
    )
    expect(res.status).toBe(403)
    expect((await getAttempt(formId))!.outcome).toBeNull()
  })
})

describe('the sweep honours the submission precondition (NFR7)', () => {
  test('accepted submission + silence → no_response; unconfirmed → ours', async () => {
    const confirmed = await activatedFormAttempt()
    await postResult({ attemptId: confirmed.formId, status: 'submitted', fieldsFilled: 3 })

    const unconfirmed = await activatedFormAttempt()
    // dispatched, but the worker never called back

    vi.setSystemTime(ACTIVATION_AT + 49 * HOUR)
    await t.mutation(internal.scheduler.retention.sweepDeadlines, {})

    expect((await getAttempt(confirmed.formId))!.outcome).toBe('no_response')
    const lost = await getAttempt(unconfirmed.formId)
    expect(lost!.outcome).toBe('undeliverable_ours')
    expect(lost!.failureReason).toContain('NFR7')
  })
})
