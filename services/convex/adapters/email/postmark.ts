/* ============================================================
   THE EMAIL ADAPTER — FR16–FR19, C7, C8, AD-14, NFR7
   ------------------------------------------------------------
   One requirements-shaped inquiry to the yard's published
   address, sent as the registered persona (AD-14) — a real
   company conducting genuine market research, disclosed in the
   FR19 debrief once the window closes.

   The C8 line, drawn in the copy itself: the inquiry asks about
   AVAILABILITY AND RATES for machine lines the owner already
   told us he rents. No invented job, no site, no delivery date —
   an invented job with a date can cause a dispatcher to reserve
   a machine, which is real commercial harm.

   Measurement (FR18) needs three webhook legs:
   - delivery events   → the NFR7 precondition. "No reply" is a
     finding only after "delivered" is a fact; a bounce or spam
     complaint is our failure or their dead mailbox, never the
     yard ignoring a customer.
   - inbound parse     → the reply timer. Correlation is
     structural: Reply-To is probe+<attemptId>@ the persona's
     reply domain, and Postmark hands the +hash back as
     MailboxHash. No fuzzy matching.
   - reply classing    → an autoresponder is not a human. The
     timer keeps running through "Thank you for your inquiry".

   Config — Convex env vars:
     POSTMARK_SERVER_TOKEN     send + who signs our requests
     POSTMARK_WEBHOOK_SECRET   shared secret Postmark presents
                               back to our webhook URLs
   The identity (from-address, reply domain, display name) comes
   from the persona ROW, never from env (AD-14).
   ============================================================ */
import type { DispatchJob, DispatchResult, ProbeAdapter, ProviderEvent, Resolution } from '../../ports/probe'

export type PostmarkConfig = { serverToken: string }

export function postmarkConfigFromEnv(): PostmarkConfig | null {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN
  return serverToken ? { serverToken } : null
}

/* ------------------------------------------------------------
   the inquiry (FR16, C8)
   ------------------------------------------------------------ */
export function inquiryCopy(job: {
  machineLines: string[]
  yardName: string
  persona: { legalName: string }
}): { subject: string; body: string } {
  /* two lines max, named the way the owner picked them */
  const lines = job.machineLines.slice(0, 2)
  const what = lines.length ? lines.join(' and ').toLowerCase() : 'rental equipment'
  return {
    subject: `Availability and rates — ${lines[0] ?? 'equipment rental'}`,
    body:
      `Hi,\n\n` +
      `Do you currently have ${what} available to rent, and what are ` +
      `your rates? Weekly and monthly pricing both useful if you have them.\n\n` +
      `Thanks,\n${job.persona.legalName}`,
  }
}

/* ------------------------------------------------------------
   dispatch
   ------------------------------------------------------------ */
export function makeEmailAdapter(
  cfg: PostmarkConfig,
  fetchImpl: typeof fetch = fetch,
): ProbeAdapter {
  return {
    channel: 'email',

    async dispatch(job: DispatchJob): Promise<DispatchResult> {
      if (!job.persona) {
        /* structurally prevented by the chokepoint (AD-14); belt only */
        return { ok: false, outcome: 'aborted', reason: 'no persona on async dispatch' }
      }
      const { subject, body } = inquiryCopy({ ...job, persona: job.persona })

      const res = await fetchImpl('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': cfg.serverToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          From: `${job.persona.legalName} <${job.persona.fromAddress}>`,
          To: job.target,
          ReplyTo: `probe+${job.attemptId}@${job.persona.replyDomain}`,
          Subject: subject,
          TextBody: body,
          MessageStream: 'outbound',
          Tag: 'probe-inquiry',
          Metadata: { attemptId: job.attemptId, runId: job.runId },
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        /* their API refusing us = the yard never saw anything = ours */
        return {
          ok: false,
          outcome: 'undeliverable_ours',
          reason: `Postmark ${res.status}: ${text.slice(0, 300)}`,
        }
      }
      const sent = (await res.json()) as { MessageID?: string }
      if (!sent.MessageID) {
        return { ok: false, outcome: 'undeliverable_ours', reason: 'Postmark returned no MessageID' }
      }
      return { ok: true, providerRef: sent.MessageID }
    },

    resolve(event: ProviderEvent): Resolution {
      return resolvePostmarkEvent(event.payload as Record<string, unknown>)
    },
  }
}

/* ------------------------------------------------------------
   delivery + bounce events → AD-2
   ------------------------------------------------------------ */

/* Hard bounces mean THEIR published address is dead — that is a
   finding about the yard's front door. Everything else (spam
   complaint, soft bounce, blocked) is our deliverability problem
   until proven otherwise (NFR7). */
const THEIRS_BOUNCE_TYPES = new Set(['HardBounce', 'BadEmailAddress', 'ManuallyDeactivated'])

export function resolvePostmarkEvent(p: Record<string, unknown>): Resolution {
  switch (p.RecordType) {
    case 'Delivery':
      /* the NFR7 precondition — from here on, silence is a finding */
      return { outcome: null, metrics: { deliveryStatus: 'delivered', deliveredAt: Date.now() } }
    case 'Bounce': {
      const type = String(p.Type ?? '')
      if (THEIRS_BOUNCE_TYPES.has(type)) {
        return {
          outcome: 'undeliverable_theirs',
          metrics: { deliveryStatus: 'bounced', bounceType: type },
          reason: `published address bounced (${type})`,
        }
      }
      return {
        outcome: 'undeliverable_ours',
        metrics: { deliveryStatus: 'bounced', bounceType: type },
        reason: `bounce ${type} — defaulting to ours per NFR7`,
      }
    }
    case 'SpamComplaint':
      return {
        outcome: 'undeliverable_ours',
        metrics: { deliveryStatus: 'spam_complaint' },
        reason: 'recipient filed spam complaint',
      }
    default:
      return { outcome: null }
  }
}

/* ------------------------------------------------------------
   inbound replies (FR18)
   ------------------------------------------------------------ */

export type InboundClass = {
  attemptId: string | null
  replyClass: 'human' | 'autoresponder'
  containedPrice: boolean
  containedNextStep: boolean
}

const AUTO_SUBJECT = /\b(auto(matic)?[ -]?reply|out of (the )?office|away from|vacation|auto[ -]?response|delivery status)\b/i

/** Header-based autoresponder detection first (RFC 3834 and friends),
    subject heuristics second. A misclassified human reply understates
    the yard's responsiveness, so the tie goes to 'human'. */
export function classifyInbound(p: Record<string, unknown>): InboundClass {
  const headers = (Array.isArray(p.Headers) ? p.Headers : []) as { Name?: string; Value?: string }[]
  const header = (name: string) =>
    headers.find((h) => h.Name?.toLowerCase() === name.toLowerCase())?.Value ?? ''

  const autoSubmitted = header('Auto-Submitted').toLowerCase()
  const isAuto =
    (autoSubmitted && autoSubmitted !== 'no') ||
    header('X-Autoreply') !== '' ||
    header('X-Autorespond') !== '' ||
    /\b(auto_reply|auto-reply|bulk)\b/i.test(header('Precedence')) ||
    AUTO_SUBJECT.test(String(p.Subject ?? ''))

  const text = `${p.Subject ?? ''}\n${p.TextBody ?? ''}`

  /* FR18's two content facts. Deliberately coarse heuristics — a false
     negative here understates the yard's answer quality, which is the
     conservative direction. */
  const containedPrice =
    /\$\s?\d/.test(text) || /\b\d[\d,.]*\s*(?:per|\/|a)\s*(?:day|week|month|hour|hr)\b/i.test(text)
  const containedNextStep =
    /\?/.test(String(p.TextBody ?? '')) ||
    /\b(?:call|phone|reach)\b[^.]{0,40}\d{3}/i.test(text) ||
    /\b(?:stop by|come by|swing by|give us a call|let (?:me|us) know|send (?:over|us))\b/i.test(text)

  /* correlation: probe+<attemptId>@replyDomain → MailboxHash */
  let attemptId = typeof p.MailboxHash === 'string' && p.MailboxHash ? p.MailboxHash : null
  if (!attemptId) {
    const to = Array.isArray(p.ToFull) ? (p.ToFull as { MailboxHash?: string }[]) : []
    attemptId = to.find((t) => t.MailboxHash)?.MailboxHash ?? null
  }
  if (!attemptId) {
    const m = /probe\+([A-Za-z0-9_-]+)@/.exec(String(p.To ?? ''))
    attemptId = m?.[1] ?? null
  }

  return {
    attemptId,
    replyClass: isAuto ? 'autoresponder' : 'human',
    containedPrice,
    containedNextStep,
  }
}

/* ------------------------------------------------------------
   the debrief (FR19, FR35)
   ------------------------------------------------------------ */
export function debriefCopy(args: {
  yardName: string
  persona: { legalName: string }
  msToFirstReply: number | null
}): { subject: string; body: string } {
  const measured =
    args.msToFirstReply === null
      ? 'no reply arrived inside the measurement window'
      : `your first reply arrived after ${formatDuration(args.msToFirstReply)}`
  return {
    subject: 'About our rental inquiry — authorised response check',
    body:
      `Hi,\n\n` +
      `The rental availability inquiry we sent recently was part of a ` +
      `booking-response check that your owner authorised for ${args.yardName}. ` +
      `It was a genuine market-research inquiry from ${args.persona.legalName}, ` +
      `not a job — no machine needs reserving and nothing further is needed ` +
      `from you.\n\n` +
      `For the record: ${measured}. This measured the system, not any ` +
      `person, and no names appear in any report.\n\n` +
      `Thanks for your time,\n${args.persona.legalName}`,
  }
}

export function formatDuration(ms: number): string {
  const hours = ms / 3600_000
  if (hours >= 48) return `${Math.round(hours / 24)} days`
  if (hours >= 1.05) return `${Math.round(hours * 10) / 10} hours`
  return `${Math.max(1, Math.round(ms / 60_000))} minutes`
}
