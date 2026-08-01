/* ============================================================
   VAPI END-OF-CALL TRANSLATION — AD-3, FR12–FR15, C2
   ------------------------------------------------------------
   Twilio's callbacks are the sole source of ring timing; Vapi's
   end-of-call report is the sole source of conversation outcome
   and human-vs-voicemail classification (AD-3). This module
   turns that report into the AD-2 vocabulary plus metrics.

   Correlation: the TwiML bridge carries the attempt id as the
   custom SIP header X-RR-Attempt (twilio.ts). Vapi exposes
   inbound SIP X- headers to the assistant as template variables
   and echoes them through its webhooks, so the report identifies
   its attempt directly — no fuzzy matching. The exact JSON path
   varies by payload version, so extraction checks the known
   homes in order. [ASSUMPTION] verify paths against a live
   report at integration; docs.vapi.ai/server-url/events.

   Classification rules, and their reasons:
   - voicemail        → `no_response` + answeredBy 'voicemail'.
     A machine answering IS the yard not responding; the FR14
     audit message was left, which the metrics record.
   - human            → `responded`. Only pre-disclosure facts
     are findings (FR15) — nothing here grades the person.
   - unknown          → `responded` + answeredBy 'unknown'.
     SOMETHING picked up; when we cannot classify it we err in
     the yard's favour, never toward manufacturing a miss.

   Staff protection (C2): recordings of a human conversation are
   flagged containsStaffVoice and never served by report
   queries. A voicemail recording contains only OUR assistant's
   voice, so it is the featured artifact — discretion and
   persuasiveness point the same way.
   ============================================================ */
import type { Resolution } from '../../ports/probe'

type Dict = Record<string, unknown>
const dig = (obj: unknown, path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Dict)[k] : undefined), obj)

/** Pull our X-RR-Attempt correlation id out of wherever this payload
    version put it. Header names are case-insensitive on the SIP leg
    and Vapi lowercases template variable names. */
export function vapiAttemptId(payload: unknown): string | null {
  const msg = dig(payload, ['message'])
  const homes = [
    dig(msg, ['call', 'assistantOverrides', 'variableValues']),
    dig(msg, ['assistant', 'variableValues']),
    dig(msg, ['call', 'sip', 'headers']),
    dig(msg, ['call', 'transport', 'sipHeaders']),
  ]
  for (const home of homes) {
    if (!home || typeof home !== 'object') continue
    for (const key of ['X-RR-Attempt', 'x-rr-attempt', 'rr-attempt', 'rrAttempt']) {
      const v = (home as Dict)[key]
      if (typeof v === 'string' && v) return v
    }
  }
  return null
}

export type VapiReport = {
  attemptId: string | null
  resolution: Resolution
}

export function resolveVapiReport(payload: unknown): VapiReport | null {
  const msg = dig(payload, ['message'])
  if (dig(msg, ['type']) !== 'end-of-call-report') return null

  const endedReason = String(dig(msg, ['endedReason']) ?? '')
  const structured = (dig(msg, ['analysis', 'structuredData']) ?? {}) as Dict
  const durationSec = Number(dig(msg, ['durationSeconds']) ?? 0) || undefined

  const answeredBy: 'human' | 'voicemail' | 'unknown' =
    structured.answeredBy === 'voicemail' || /voicemail/i.test(endedReason)
      ? 'voicemail'
      : structured.answeredBy === 'human' || /customer|assistant/i.test(endedReason)
        ? 'human'
        : 'unknown'

  const recordingUrl =
    (dig(msg, ['artifact', 'recordingUrl']) as string | undefined) ??
    (dig(msg, ['recordingUrl']) as string | undefined) ??
    null
  const transcript = (dig(msg, ['artifact', 'transcript']) ?? dig(msg, ['transcript'])) as
    | string
    | undefined

  const metrics: Dict = {
    answeredBy,
    endedReason,
    ...(durationSec !== undefined ? { durationSec } : {}),
  }
  if (answeredBy === 'voicemail') {
    metrics.messageLeft = true // FR14 — the assistant leaves the audit message
    if (typeof structured.voicemailBoxFull === 'boolean') {
      metrics.voicemailBoxFull = structured.voicemailBoxFull
    }
  }
  /* FR13's two questions, if the assistant captured them. Booleans
     only — the useful signal without the attributable quote (C3). */
  if (typeof structured.lineCorrect === 'boolean') {
    metrics.counterSaysLineCorrect = structured.lineCorrect
  }
  if (typeof structured.afterHoursCovered === 'boolean') {
    metrics.counterSaysAfterHoursCovered = structured.afterHoursCovered
  }

  const artifacts: NonNullable<Resolution['artifacts']> = []
  if (recordingUrl) {
    artifacts.push({
      kind: answeredBy === 'voicemail' ? 'voicemail_recording' : 'call_recording',
      url: recordingUrl,
      /* C2 — a human conversation carries a staff voice; our own
         voicemail message does not. */
      containsStaffVoice: answeredBy !== 'voicemail',
    })
  }

  return {
    attemptId: vapiAttemptId(payload),
    resolution: {
      outcome: answeredBy === 'voicemail' ? 'no_response' : 'responded',
      metrics: metrics as Record<string, unknown>,
      artifacts,
      ...(transcript ? {} : {}),
    },
  }
}
