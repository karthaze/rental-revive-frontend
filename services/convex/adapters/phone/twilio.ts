/* ============================================================
   THE PHONE ADAPTER — AD-3, AD-4, FR7–FR14, NFR5, NFR7
   ------------------------------------------------------------
   Twilio owns the call; Vapi is bridged, never originates.
   Time-to-answer and ring count are the headline findings and
   they exist only as telephony events — a platform that places
   the call reports duration, not rings (AD-3). So:

   - dispatch() creates the call via Twilio's REST API. On
     answer, Twilio fetches our /webhooks/twilio/voice URL and
     the returned TwiML bridges STRAIGHT into the Vapi
     assistant's SIP endpoint — no answering-machine-detection
     gate first, because a human hearing dead air while AMD
     listens hangs up and corrupts the measurement (AD-4).
     Voicemail classification is Vapi's job, and the voicemail
     path is a deliverable (FR14), not waste.

   - resolve() translates Twilio status callbacks into the AD-2
     vocabulary. The default for an unexplained failure is
     `undeliverable_ours` — when we cannot tell whose fault a
     dead call was, we eat it. Filing our carrier trouble as the
     yard's missed call is the one bug this product cannot have
     (NFR7).

   Ring-out calls produce no recording: Twilio has no media
   until answer, so FR25's "ring-out audio" is physically the
   attempt log, not a file. Recordings come from Vapi after the
   bridge (vapi.ts).

   Config — Convex env vars (AD-13: never VITE_*):
     TWILIO_ACCOUNT_SID   ACxxxx
     TWILIO_AUTH_TOKEN    webhook signature key + API auth
     TWILIO_FROM_NUMBERS  comma-separated E.164 pool (NFR5) —
                          rotated by attempt sequence so the
                          yard never sees the same number twice
     VAPI_SIP_ADDRESS     e.g. assistant-id@sip.vapi.ai
     CONVEX_SITE_URL      provided by Convex, callback base
   ============================================================ */
import type { DispatchJob, DispatchResult, ProbeAdapter, ProviderEvent, Resolution } from '../../ports/probe'

export type TwilioConfig = {
  accountSid: string
  authToken: string
  fromNumbers: string[]
  vapiSipAddress: string
  siteUrl: string
}

export function twilioConfigFromEnv(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const pool = process.env.TWILIO_FROM_NUMBERS
  const vapiSipAddress = process.env.VAPI_SIP_ADDRESS
  const siteUrl = process.env.CONVEX_SITE_URL
  if (!accountSid || !authToken || !pool || !vapiSipAddress || !siteUrl) return null
  const fromNumbers = pool.split(',').map((s) => s.trim()).filter(Boolean)
  if (!fromNumbers.length) return null
  return { accountSid, authToken, fromNumbers, vapiSipAddress, siteUrl }
}

/* FR10 window discipline covers scheduling; this covers one dial.
   45s of ring reaches most voicemail systems (~25–40s) without
   holding a slot open forever. ~6s per ring is the telephony
   convention behind "about N rings" (data-model, phone metrics). */
export const RING_TIMEOUT_SEC = 45
export const MS_PER_RING = 6000

/** US E.164 for dialing. The consented string is stored verbatim on
    the consent row; this only normalises the wire format. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+1\d{10}$/.test(digits)) return digits
  if (/^1\d{10}$/.test(digits)) return '+' + digits
  if (/^\d{10}$/.test(digits)) return '+1' + digits
  if (/^\+\d{8,15}$/.test(digits)) return digits // already E.164, non-US
  return null
}

/** NFR5 — deterministic rotation: sequence n uses pool[(n-1) % len],
    so a retry never redials from the number that just went
    unanswered, and re-execution of the same attempt (AD-9) picks the
    same number. */
export const fromNumberFor = (pool: string[], sequence: number): string =>
  pool[(sequence - 1) % pool.length]

/* ------------------------------------------------------------
   dispatch — create the call
   ------------------------------------------------------------ */
export function makePhoneAdapter(
  cfg: TwilioConfig,
  fetchImpl: typeof fetch = fetch,
): ProbeAdapter {
  return {
    channel: 'phone',

    async dispatch(job: DispatchJob & { sequence: number }): Promise<DispatchResult> {
      const to = toE164(job.target)
      if (!to) {
        /* An unparseable consented number is nobody's missed call. */
        return { ok: false, outcome: 'aborted', reason: `target not a dialable number: ${job.target}` }
      }

      const callback = (path: string) =>
        `${cfg.siteUrl}${path}?attemptId=${encodeURIComponent(job.attemptId)}`

      const body = new URLSearchParams({
        To: to,
        From: fromNumberFor(cfg.fromNumbers, job.sequence),
        Url: callback('/webhooks/twilio/voice'),
        StatusCallback: callback('/webhooks/twilio/status'),
        Timeout: String(RING_TIMEOUT_SEC),
        /* NO MachineDetection — AD-4. The bridge answers instantly. */
      })
      for (const ev of ['initiated', 'ringing', 'answered', 'completed']) {
        body.append('StatusCallbackEvent', ev)
      }

      const res = await fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + btoa(`${cfg.accountSid}:${cfg.authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      )

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        /* The API refusing us is OUR infrastructure failing — the
           yard's phone never rang. */
        return {
          ok: false,
          outcome: 'undeliverable_ours',
          reason: `Twilio ${res.status}: ${text.slice(0, 300)}`,
        }
      }
      const created = (await res.json()) as { sid?: string }
      if (!created.sid) {
        return { ok: false, outcome: 'undeliverable_ours', reason: 'Twilio returned no CallSid' }
      }
      return { ok: true, providerRef: created.sid }
    },

    resolve(event: ProviderEvent): Resolution {
      return resolveTwilioStatus(event.payload as Record<string, string>)
    },
  }
}

/** The TwiML served on answer: bridge to Vapi immediately (AD-4),
    carrying the attempt id as a custom SIP header so the end-of-call
    report correlates without guessing (vapi.ts). */
export function bridgeTwiml(vapiSipAddress: string, attemptId: string): string {
  const sip = vapiSipAddress.replace(/^sip:/, '')
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Dial answerOnBridge="true"><Sip>${esc(
      `sip:${sip}?X-RR-Attempt=${attemptId}`,
    )}</Sip></Dial></Response>`
  )
}

/* ------------------------------------------------------------
   resolve — Twilio status callbacks → AD-2
   ------------------------------------------------------------
   The event stream for one call:
     initiated → ringing → in-progress → completed
   Interim events accrue metrics (outcome null); only `completed`
   can be terminal, and only when the call never connected — a
   connected call's human/voicemail classification belongs to
   Vapi, so its `completed` stays interim.
   ------------------------------------------------------------ */

/* SIP/Twilio codes that mean THEIR number is dead — not our carrier
   trouble. Everything else unexplained defaults to ours (NFR7). */
const THEIRS_SIP = new Set(['404', '410', '484', '604'])
const THEIRS_TWILIO_ERROR = new Set(['13224', '21217'])

export function resolveTwilioStatus(p: Record<string, string>): Resolution {
  const status = p.CallStatus
  const at = Date.now()

  switch (status) {
    case 'initiated':
      return { outcome: null, metrics: {} }
    case 'ringing':
      return { outcome: null, metrics: { ringStartedAt: at } }
    case 'in-progress':
      /* answered — the bridge is happening. Time-to-answer is derived
         against ringStartedAt in deriveTiming below. */
      return { outcome: null, metrics: { answeredAt: at } }
    case 'completed': {
      const dur = Number(p.CallDuration ?? '0')
      /* Connected calls stay open for Vapi's classification. */
      return { outcome: null, metrics: { twilioCompletedAt: at, durationSec: dur } }
    }
    case 'no-answer':
      return { outcome: 'no_response', metrics: { rangOut: true } }
    case 'busy':
      /* an engaged line is a customer not getting through — a finding */
      return { outcome: 'no_response', metrics: { busy: true } }
    case 'failed': {
      const sip = p.SipResponseCode ?? ''
      const err = p.ErrorCode ?? ''
      if (THEIRS_SIP.has(sip) || THEIRS_TWILIO_ERROR.has(err)) {
        return {
          outcome: 'undeliverable_theirs',
          metrics: { sipCode: sip || err },
          reason: `number invalid/unreachable (sip=${sip} err=${err})`,
        }
      }
      return {
        outcome: 'undeliverable_ours',
        metrics: { sipCode: sip || err },
        reason: `call failed unexplained (sip=${sip} err=${err}) — defaulting to ours per NFR7`,
      }
    }
    case 'canceled':
      return { outcome: 'aborted', reason: 'call canceled' }
    default:
      return { outcome: null }
  }
}

/** Stateless per-event resolution can't compute durations; the webhook
    handler applies this over (existing metrics, new metrics) before
    persisting. */
export function deriveTiming(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...prev, ...next }
  const ring = merged.ringStartedAt
  const ans = merged.answeredAt
  if (typeof ring === 'number' && typeof ans === 'number' && merged.msToAnswer === undefined) {
    const ms = Math.max(0, ans - ring)
    merged.msToAnswer = ms
    /* "about N rings" — never rendered as false precision (data-model) */
    merged.estimatedRings = Math.max(1, Math.round(ms / MS_PER_RING))
  }
  return merged
}
