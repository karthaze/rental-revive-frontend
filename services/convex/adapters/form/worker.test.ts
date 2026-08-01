/* The form adapter's pure surfaces: job signing and shape, and the
   worker-result→AD-2 translation where a captcha (theirs) and a bot
   challenge (ours) must never blur (data-model, NFR7). */
import { describe, expect, test } from 'vitest'
import { hmacHex, makeFormAdapter, resolveWorkerResult, type FormWorkerConfig } from './worker'

const cfg: FormWorkerConfig = {
  workerUrl: 'https://worker.internal/jobs',
  secret: 'shared_secret',
  siteUrl: 'https://probe.example.convex.site',
}

const persona = {
  legalName: 'Full Circle Contractors LLC',
  fromAddress: 'inquiries@fullcirclecontractors.com',
  replyDomain: 'reply.fullcirclecontractors.com',
  siteUrl: 'https://fullcirclecontractors.com',
  phone: '+15125550142',
}

const job = {
  attemptId: 'attempt_3',
  runId: 'run_1',
  channel: 'form' as const,
  sequence: 1,
  target: 'https://bestforkliftrentals.com/contact',
  persona,
  machineLines: ['Telehandlers'],
  yardName: 'Yard',
}

describe('dispatch', () => {
  test('signs the job and routes replies through the probe+ address', async () => {
    let captured: { body: string; sig: string } | null = null
    const fake: typeof fetch = async (_url, init) => {
      captured = {
        body: String(init!.body),
        sig: (init!.headers as Record<string, string>)['x-probe-signature'],
      }
      return new Response('accepted', { status: 202 })
    }
    const result = await makeFormAdapter(cfg, fake).dispatch(job)
    expect(result).toEqual({ ok: true, providerRef: 'form_attempt_3' })

    expect(captured!.sig).toBe(await hmacHex(cfg.secret, captured!.body))
    const parsed = JSON.parse(captured!.body)
    expect(parsed.callbackUrl).toBe('https://probe.example.convex.site/webhooks/form-probe')
    expect(parsed.fill.email).toBe('probe+attempt_3@reply.fullcirclecontractors.com')
    expect(parsed.fill.message).toContain('telehandlers')
    /* C8 — nothing that reserves a machine */
    expect(parsed.fill.message).not.toMatch(/\b(job|site|deliver|date)\b/i)
  })

  test('a down worker is OUR failure', async () => {
    const fake: typeof fetch = async () => new Response('', { status: 503 })
    const result = await makeFormAdapter(cfg, fake).dispatch(job)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.outcome).toBe('undeliverable_ours')
  })
})

describe('result translation (FR21, FR22, NFR7)', () => {
  test('submitted starts the clock — no outcome yet', () => {
    const r = resolveWorkerResult({
      status: 'submitted',
      confirmationDetected: true,
      fieldsFilled: 4,
      httpStatus: 200,
    })
    expect(r.outcome).toBeNull()
    expect(r.metrics).toMatchObject({ submissionSucceeded: true, confirmationDetected: true })
  })

  test('a broken or missing form is the yard’s front door — the FR22 headline', () => {
    expect(resolveWorkerResult({ status: 'submit_failed' }).outcome).toBe('undeliverable_theirs')
    expect(resolveWorkerResult({ status: 'no_form' }).outcome).toBe('undeliverable_theirs')
    expect(resolveWorkerResult({ status: 'submit_failed' }).metrics?.submissionSucceeded).toBe(false)
  })

  test('captcha is theirs; a bot challenge is OURS — never blurred', () => {
    const captcha = resolveWorkerResult({ status: 'captcha' })
    expect(captcha.outcome).toBe('blocked_by_target')
    expect(captcha.metrics?.captchaBlocked).toBe(true)

    const challenge = resolveWorkerResult({ status: 'challenge' })
    expect(challenge.outcome).toBe('undeliverable_ours')
    expect(challenge.metrics?.challengeBlocked).toBe(true)
  })

  test('a worker crash measured nothing about the yard', () => {
    expect(resolveWorkerResult({ status: 'error', note: 'nav timeout' }).outcome).toBe(
      'undeliverable_ours',
    )
  })
})
