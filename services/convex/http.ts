/* ============================================================
   THE WEBHOOK EDGE — spine "Edge (webhooks, HTTP)" layer
   ------------------------------------------------------------
   Three endpoints, every one signature-verified before touching
   state; unverified requests are dropped with a 403, never
   queued (spine conventions). Adapters never write the database
   (AD-5): each handler translates the provider event through
   the adapter's pure resolve function and reaches state only by
   calling internal mutations.

   The spine's tree names a convex/http/ directory; Convex
   requires the router to live at convex/http.ts, so the routes
   live here and the provider translation lives with its adapter
   (convex/adapters/phone/). One file of edge, zero logic in it.

     POST /webhooks/twilio/voice?attemptId=…   TwiML: bridge → Vapi
     POST /webhooks/twilio/status?attemptId=…  ring telemetry (AD-3)
     POST /webhooks/vapi                       end-of-call report
   ============================================================ */
import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { verifyTwilioRequest } from './adapters/phone/signature'
import { timingSafeEqual } from './adapters/phone/signature'
import {
  bridgeTwiml,
  deriveTiming,
  resolveTwilioStatus,
  twilioConfigFromEnv,
} from './adapters/phone/twilio'
import { resolveVapiReport } from './adapters/phone/vapi'
import { classifyInbound, resolvePostmarkEvent } from './adapters/email/postmark'
import { hmacHex, resolveWorkerResult } from './adapters/form/worker'

const http = httpRouter()

const forbidden = () => new Response('forbidden', { status: 403 })

/** Twilio posts form-encoded bodies; the signature covers the exact
    public URL (query included) plus every form field. */
async function verifiedTwilioForm(req: Request): Promise<Record<string, string> | null> {
  const cfg = twilioConfigFromEnv()
  if (!cfg) return null // no config → nothing was ever dispatched; drop
  const raw = await req.text()
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v
  /* Reconstruct the public URL Twilio signed: our configured site URL
     plus the path+query it called. Convex terminates TLS upstream, so
     req.url's origin is not necessarily the public one. */
  const u = new URL(req.url)
  const publicUrl = `${cfg.siteUrl}${u.pathname}${u.search}`
  const ok = await verifyTwilioRequest(
    cfg.authToken,
    publicUrl,
    params,
    req.headers.get('X-Twilio-Signature'),
  )
  return ok ? params : null
}

/* --- the answer webhook: return the bridge TwiML (AD-3, AD-4) --- */
http.route({
  path: '/webhooks/twilio/voice',
  method: 'POST',
  handler: httpAction(async (_ctx, req) => {
    const cfg = twilioConfigFromEnv()
    const params = await verifiedTwilioForm(req)
    if (!cfg || !params) return forbidden()
    const attemptId = new URL(req.url).searchParams.get('attemptId')
    if (!attemptId) return forbidden()
    return new Response(bridgeTwiml(cfg.vapiSipAddress, attemptId), {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  }),
})

/* --- status callbacks: the only source of ring timing (AD-3) --- */
http.route({
  path: '/webhooks/twilio/status',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const params = await verifiedTwilioForm(req)
    if (!params) return forbidden()

    /* Correlate by CallSid — the providerRef written at dispatch
       (AD-9). The attemptId query param is a belt-and-braces check,
       not the authority. */
    const callSid = params.CallSid
    if (!callSid) return new Response('ok', { status: 200 })
    const attempt = await ctx.runQuery(internal.runs.resolve.attemptByProviderRef, {
      providerRef: callSid,
    })
    if (!attempt || attempt.outcome !== null) return new Response('ok', { status: 200 })

    const resolution = resolveTwilioStatus(params)
    if (resolution.outcome === null) {
      if (resolution.metrics && Object.keys(resolution.metrics).length) {
        await ctx.runMutation(internal.runs.resolve.recordInterim, {
          attemptId: attempt._id,
          metrics: deriveTiming(
            (attempt.metrics ?? {}) as Record<string, unknown>,
            resolution.metrics,
          ),
        })
      }
    } else {
      await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
        attemptId: attempt._id,
        outcome: resolution.outcome,
        metrics: resolution.metrics,
        failureReason: resolution.reason,
        now: Date.now(),
      })
    }
    return new Response('ok', { status: 200 })
  }),
})

/* --- Vapi end-of-call report: conversation outcome (AD-3) --- */
http.route({
  path: '/webhooks/vapi',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.VAPI_WEBHOOK_SECRET
    const presented = req.headers.get('x-vapi-secret')
    if (!secret || !presented || !timingSafeEqual(secret, presented)) return forbidden()

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return new Response('bad request', { status: 400 })
    }

    const report = resolveVapiReport(payload)
    if (!report) return new Response('ok', { status: 200 }) // other event types

    if (!report.attemptId) {
      /* A report we cannot correlate is logged and dropped — guessing
         which yard's counter it describes would be inventing evidence. */
      console.warn('vapi report without X-RR-Attempt correlation; dropped')
      return new Response('ok', { status: 200 })
    }

    const attemptId = report.attemptId as Id<'probeAttempts'>
    const attempt = await ctx.runQuery(internal.runs.resolve.getAttempt, { attemptId })
    if (!attempt || attempt.channel !== 'phone' || attempt.outcome !== null) {
      return new Response('ok', { status: 200 })
    }

    await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
      attemptId,
      outcome: report.resolution.outcome!,
      metrics: report.resolution.metrics,
      now: Date.now(),
    })

    /* Copy recordings in AFTER resolution — evidence lands when it
       lands; the finding does not wait on a download (AD-10). */
    for (const a of report.resolution.artifacts ?? []) {
      await ctx.scheduler.runAfter(0, internal.runs.artifacts.ingestArtifact, {
        attemptId,
        kind: a.kind as 'call_recording' | 'voicemail_recording',
        url: a.url,
        containsStaffVoice: a.containsStaffVoice,
      })
    }
    return new Response('ok', { status: 200 })
  }),
})

/* ------------------------------------------------------------
   Postmark — FR16–FR19
   ------------------------------------------------------------
   Postmark does not sign webhook bodies; authentication is the
   shared secret we configure into the webhook URL, compared in
   constant time. Wrong or missing secret → 403, dropped.
   ------------------------------------------------------------ */
function verifiedPostmarkSecret(req: Request): boolean {
  const secret = process.env.POSTMARK_WEBHOOK_SECRET
  const presented = new URL(req.url).searchParams.get('secret')
  return !!secret && !!presented && timingSafeEqual(secret, presented)
}

/* delivery + bounce + spam events: the NFR7 precondition ledger */
http.route({
  path: '/webhooks/postmark/events',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!verifiedPostmarkSecret(req)) return forbidden()
    let payload: Record<string, unknown>
    try {
      payload = (await req.json()) as Record<string, unknown>
    } catch {
      return new Response('bad request', { status: 400 })
    }

    const messageId = String(payload.MessageID ?? '')
    if (!messageId) return new Response('ok', { status: 200 })
    const attempt = await ctx.runQuery(internal.runs.resolve.attemptByProviderRef, {
      providerRef: messageId,
    })
    if (!attempt || attempt.outcome !== null) return new Response('ok', { status: 200 })

    const resolution = resolvePostmarkEvent(payload)
    if (resolution.outcome === null) {
      if (resolution.metrics && Object.keys(resolution.metrics).length) {
        await ctx.runMutation(internal.runs.resolve.recordInterim, {
          attemptId: attempt._id,
          metrics: resolution.metrics,
        })
      }
    } else {
      await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
        attemptId: attempt._id,
        outcome: resolution.outcome,
        metrics: resolution.metrics,
        failureReason: resolution.reason,
        now: Date.now(),
      })
    }
    return new Response('ok', { status: 200 })
  }),
})

/* inbound parse: the reply timer (FR18) */
http.route({
  path: '/webhooks/postmark/inbound',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!verifiedPostmarkSecret(req)) return forbidden()
    let payload: Record<string, unknown>
    try {
      payload = (await req.json()) as Record<string, unknown>
    } catch {
      return new Response('bad request', { status: 400 })
    }

    const inbound = classifyInbound(payload)
    if (!inbound.attemptId) {
      /* a reply we cannot tie to an attempt is dropped, not guessed at */
      console.warn('postmark inbound without probe+ correlation; dropped')
      return new Response('ok', { status: 200 })
    }

    const attemptId = inbound.attemptId as Id<'probeAttempts'>
    const attempt = await ctx.runQuery(internal.runs.resolve.getAttempt, { attemptId })
    /* form submissions carry probe+<attemptId>@ as their contact email,
       so a yard's reply to a FORM inquiry arrives here too */
    if (!attempt || attempt.channel === 'phone') return new Response('ok', { status: 200 })

    const now = Date.now()

    if (attempt.outcome !== null) {
      /* already resolved at first human reply — this is the follow-up
         FR18 counts (the one sanctioned post-terminal fact) */
      if (inbound.replyClass === 'human') {
        await ctx.runMutation(internal.runs.resolve.recordEmailFacts, {
          attemptId,
          followUp: true,
        })
      }
      return new Response('ok', { status: 200 })
    }

    if (inbound.replyClass === 'autoresponder') {
      /* "Thank you for your inquiry" is not a human — the timer keeps
         running, the fact is recorded */
      await ctx.runMutation(internal.runs.resolve.recordInterim, {
        attemptId,
        metrics: { autoReplyAt: now },
      })
      return new Response('ok', { status: 200 })
    }

    const msToFirstReply =
      attempt.dispatchedAt !== null ? Math.max(0, now - attempt.dispatchedAt) : null
    await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
      attemptId,
      outcome: 'responded',
      metrics: {
        replyClass: 'human',
        firstReplyAt: now,
        ...(msToFirstReply !== null ? { msToFirstReply } : {}),
        containedPrice: inbound.containedPrice,
        containedNextStep: inbound.containedNextStep,
      },
      now,
    })
    return new Response('ok', { status: 200 })
  }),
})

/* ------------------------------------------------------------
   the form worker's callback (AD-12, FR20–FR22)
   ------------------------------------------------------------ */
http.route({
  path: '/webhooks/form-probe',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.FORM_WORKER_SECRET
    const presented = req.headers.get('x-probe-signature')
    const raw = await req.text()
    if (!secret || !presented || !timingSafeEqual(await hmacHex(secret, raw), presented)) {
      return forbidden()
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return new Response('bad request', { status: 400 })
    }

    const attemptId = String(payload.attemptId ?? '') as Id<'probeAttempts'>
    if (!attemptId) return new Response('ok', { status: 200 })
    const attempt = await ctx.runQuery(internal.runs.resolve.getAttempt, { attemptId })
    if (!attempt || attempt.channel !== 'form' || attempt.outcome !== null) {
      return new Response('ok', { status: 200 })
    }

    const resolution = resolveWorkerResult(payload)
    if (resolution.outcome === null) {
      await ctx.runMutation(internal.runs.resolve.recordInterim, {
        attemptId,
        metrics: resolution.metrics,
      })
    } else {
      await ctx.runMutation(internal.runs.resolve.resolveAttempt, {
        attemptId,
        outcome: resolution.outcome,
        metrics: resolution.metrics,
        failureReason: resolution.reason,
        now: Date.now(),
      })
    }

    /* FR24/FR22 evidence: before/after screenshots, stored under the
       consent's retention like every other artifact (AD-10) */
    const shots = (payload.screenshots ?? {}) as { before?: string; after?: string }
    for (const [key, kind] of [
      ['before', 'form_screenshot_before'],
      ['after', 'form_screenshot_after'],
    ] as const) {
      const b64 = shots[key]
      if (typeof b64 !== 'string' || !b64) continue
      try {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const storageId = await ctx.storage.store(new Blob([bytes], { type: 'image/png' }))
        await ctx.runMutation(internal.runs.artifacts.insertArtifact, {
          attemptId,
          kind,
          storageId,
          contentType: 'image/png',
          bytes: bytes.length,
          containsStaffVoice: false,
          now: Date.now(),
        })
      } catch {
        /* a corrupt screenshot is absent evidence, not a failure */
      }
    }
    return new Response('ok', { status: 200 })
  }),
})

export default http
