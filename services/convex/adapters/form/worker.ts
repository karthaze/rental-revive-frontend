/* ============================================================
   THE FORM ADAPTER — FR20–FR22, AD-12, NFR7
   ------------------------------------------------------------
   Convex cannot host a browser, so the submission is driven by
   the stateless worker at rentalrevive/services/form-probe (Playwright in a
   container). The boundary is exactly AD-12's: the worker
   receives a SIGNED job, holds no credentials beyond the shared
   callback secret, keeps no state between jobs, and never
   touches the database — its result comes back through the
   signature-verified /webhooks/form-probe HTTP action.

   (One measured deviation from AD-12's letter: screenshots ride
   base64 in the callback body instead of a pre-issued upload
   URL. Two screenshots are ~200KB against Convex's 20MB action
   limit, and it keeps the worker to a single round-trip. If
   full-page captures outgrow that, switch to generateUploadUrl.)

   The submission itself is the C8 line again: name, the
   persona's identity, machine lines the owner already rents,
   availability-and-rates message — the contact email is
   probe+<attemptId>@ the persona's reply domain, so a human
   reply to the form lands in the SAME inbound pipeline as the
   email probe and starts no new machinery.

   Outcome translation carries the PRD's sharpest distinction
   (data-model, metrics-by-channel): a CAPTCHA is a finding
   about the yard — friction that deters real customers — but a
   datacenter-IP challenge is OUR failure. One wall is theirs,
   the other is ours, and the vocabulary keeps them apart.

   Config — Convex env vars:
     FORM_WORKER_URL      the worker's /jobs endpoint
     FORM_WORKER_SECRET   HMAC key for job + callback signing
   ============================================================ */
import type { DispatchJob, DispatchResult, ProbeAdapter, ProviderEvent, Resolution } from '../../ports/probe'

export type FormWorkerConfig = { workerUrl: string; secret: string; siteUrl: string }

export function formWorkerConfigFromEnv(): FormWorkerConfig | null {
  const workerUrl = process.env.FORM_WORKER_URL
  const secret = process.env.FORM_WORKER_SECRET
  const siteUrl = process.env.CONVEX_SITE_URL
  if (!workerUrl || !secret || !siteUrl) return null
  return { workerUrl, secret, siteUrl }
}

/* HMAC-SHA256 over the raw body, hex — both directions (job out,
   result back) use the same shared secret. */
export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function makeFormAdapter(
  cfg: FormWorkerConfig,
  fetchImpl: typeof fetch = fetch,
): ProbeAdapter {
  return {
    channel: 'form',

    async dispatch(job: DispatchJob): Promise<DispatchResult> {
      if (!job.persona) {
        return { ok: false, outcome: 'aborted', reason: 'no persona on async dispatch' }
      }
      const lines = job.machineLines.slice(0, 2)
      const body = JSON.stringify({
        attemptId: job.attemptId,
        targetUrl: job.target,
        callbackUrl: `${cfg.siteUrl}/webhooks/form-probe`,
        fill: {
          name: job.persona.legalName,
          /* the correlation trick: replies to the form inquiry come
             back through the persona's inbound domain, tagged with
             the attempt id — same pipeline as the email probe */
          email: `probe+${job.attemptId}@${job.persona.replyDomain}`,
          phone: job.persona.phone,
          message:
            `Do you currently have ${
              lines.length ? lines.join(' and ').toLowerCase() : 'rental equipment'
            } available to rent, and what are your rates? ` +
            `Weekly and monthly pricing both useful. Thanks, ${job.persona.legalName}`,
        },
      })

      const res = await fetchImpl(cfg.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-probe-signature': await hmacHex(cfg.secret, body),
        },
        body,
      })

      if (!res.ok) {
        /* the worker refusing or being down is OUR infrastructure */
        return {
          ok: false,
          outcome: 'undeliverable_ours',
          reason: `form worker ${res.status}`,
        }
      }
      /* the job id IS the attempt id — the worker is stateless and
         idempotent per job (AD-9, AD-12) */
      return { ok: true, providerRef: `form_${job.attemptId}` }
    },

    resolve(event: ProviderEvent): Resolution {
      return resolveWorkerResult(event.payload as Record<string, unknown>)
    },
  }
}

/* ------------------------------------------------------------
   worker result → AD-2
   ------------------------------------------------------------ */
export type WorkerStatus =
  | 'submitted' // form accepted the submission
  | 'no_form' // no reachable inquiry form on the consented URL
  | 'submit_failed' // form present, submission errored or silently failed
  | 'captcha' // form demands a captcha the worker will not solve
  | 'challenge' // bot wall challenged our datacenter IP
  | 'error' // worker crashed / navigation failed

export function resolveWorkerResult(p: Record<string, unknown>): Resolution {
  const status = p.status as WorkerStatus
  const shared = {
    fieldsFilled: typeof p.fieldsFilled === 'number' ? p.fieldsFilled : undefined,
    httpStatus: typeof p.httpStatus === 'number' ? p.httpStatus : undefined,
    discoveryMethod: 'heuristic',
  }

  switch (status) {
    case 'submitted':
      /* the clock starts — a human reply resolves it through the
         inbound pipeline; delivered-and-silent is filed by the sweep */
      return {
        outcome: null,
        metrics: {
          ...shared,
          submittedAt: Date.now(),
          submissionSucceeded: true,
          confirmationDetected: p.confirmationDetected === true,
        },
      }
    case 'no_form':
      /* the consented quote path does not exist — a finding (FR22) */
      return {
        outcome: 'undeliverable_theirs',
        metrics: { ...shared, submissionSucceeded: false },
        reason: 'no inquiry form found at the consented URL',
      }
    case 'submit_failed':
      /* THE headline finding: the site eats inquiries (FR22) */
      return {
        outcome: 'undeliverable_theirs',
        metrics: { ...shared, submissionSucceeded: false },
        reason: 'form present but submission failed',
      }
    case 'captcha':
      /* friction that deters real customers — theirs, and distinct
         from a challenge by design (data-model) */
      return {
        outcome: 'blocked_by_target',
        metrics: { ...shared, captchaBlocked: true, submissionSucceeded: false },
        reason: 'form gated by captcha',
      }
    case 'challenge':
      /* Cloudflare vs our datacenter IP — OURS, never the yard's */
      return {
        outcome: 'undeliverable_ours',
        metrics: { ...shared, challengeBlocked: true },
        reason: 'bot challenge against worker IP (NFR7)',
      }
    default:
      return {
        outcome: 'undeliverable_ours',
        metrics: shared,
        reason: `worker error: ${String(p.note ?? 'unknown').slice(0, 200)}`,
      }
  }
}
