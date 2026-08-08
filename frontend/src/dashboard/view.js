/* ============================================================
   THE PROBE DASHBOARD — pure render (FR23–FR25, FR29–FR33)
   ------------------------------------------------------------
   One function: runState in, DOM out. No network, no client —
   the controller (index.js) owns subscriptions and passes the
   latest snapshot plus `now`; this file owns what the owner
   sees. That split is what let every state below be screenshot-
   verified from fixtures before a deployment existed.

   Rendering rules that are product law, not style:
   - counts, timestamps and money — never a grade (NG1)
   - the attempt log renders IN FULL, connected attempts
     included: visible generosity is the proof (FR24)
   - `undeliverable_ours` renders as its own clearly-labelled
     row that is explicitly NOT about the yard (NFR7)
   - honest "not yet" states while in flight (FR30); a partial
     verdict says it is partial (FR33)
   - hours, never people (C1) — nothing here names a human
   ============================================================ */
import { money } from '../../../common/leaks.js'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const CHANNEL = {
  phone: { label: 'Phone probe', icon: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.5 2.8.7a2 2 0 0 1 1.7 2z"/></svg>' },
  email: { label: 'Email inquiry', icon: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>' },
  form: { label: 'Website form', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6"/><path d="M7 16h4"/></svg>' },
}

const WINDOW_LABEL = {
  business: 'business hours',
  lunch: 'lunch window',
  after_hours: 'after close',
  alt_day: 'a different day',
}

export const fmtDur = (ms) => {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} seconds`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)} minutes`
  const h = ms / 3600_000
  return h >= 48 ? `${Math.round(h / 24)} days` : `${Math.round(h * 10) / 10} hours`
}

const fmtAt = (epoch, tz) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit',
    }).format(epoch)
  } catch {
    return new Date(epoch).toLocaleString()
  }
}

/* ------------------------------------------------------------
   one attempt row (FR24, FR30, NFR7)
   ------------------------------------------------------------ */
function attemptStatus(a, tz, now) {
  const m = a.metrics || {}

  if (a.outcome === null) {
    if (a.dispatchedAt === null) {
      return a.scheduledFor > now
        ? { cls: 'wait', text: `Scheduled · ${fmtAt(a.scheduledFor, tz)}${a.window ? ` · ${WINDOW_LABEL[a.window]}` : ''}` }
        : { cls: 'wait', text: 'Queued…' }
    }
    if (a.channel === 'phone') {
      if (m.answeredAt) return { cls: 'live', text: 'Connected, on the line now' }
      if (m.ringStartedAt) {
        const rings = Math.max(1, Math.round((now - m.ringStartedAt) / 6000))
        return { cls: 'live', text: `Ringing… about ${rings} ring${rings > 1 ? 's' : ''}` }
      }
      return { cls: 'live', text: 'Dialling…' }
    }
    return {
      cls: 'wait',
      text: m.deliveryStatus === 'delivered' || m.submissionSucceeded
        ? 'Delivered · awaiting a reply, the clock is running'
        : 'Sent · confirming delivery',
    }
  }

  switch (a.outcome) {
    case 'responded': {
      if (a.channel === 'phone') {
        const rings = m.estimatedRings
        return { cls: 'ok', text: `Answered${rings ? ` in about ${rings} ring${rings > 1 ? 's' : ''}` : ''}` }
      }
      const t = typeof m.msToFirstReply === 'number' ? ` in ${fmtDur(m.msToFirstReply)}` : ''
      const facts = [m.containedPrice ? 'included a price' : null, m.containedNextStep ? 'asked a next step' : null]
        .filter(Boolean).join(', ')
      return { cls: 'ok', text: `Human reply${t}${facts ? ` · ${facts}` : ''}` }
    }
    case 'no_response':
      if (a.channel === 'phone') {
        return m.answeredBy === 'voicemail'
          ? { cls: 'gap', text: `Voicemail${m.voicemailBoxFull ? ', box full' : ''}, audit message left` }
          : { cls: 'gap', text: 'Rang out, nobody answered' }
      }
      return { cls: 'gap', text: 'Delivered, no reply inside the window' }
    case 'undeliverable_theirs':
      if (a.channel === 'phone') return { cls: 'gap', text: 'Number invalid or disconnected' }
      if (a.channel === 'email') return { cls: 'gap', text: 'Published address bounced' }
      return { cls: 'gap', text: m.submissionSucceeded === false && m.fieldsFilled ? 'Form broke, it ate the submission' : 'No working inquiry form found' }
    case 'blocked_by_target':
      return { cls: 'gap', text: 'Blocked by a captcha on your form, real customers hit it too' }
    case 'undeliverable_ours':
      /* NFR7 — rendered as OUR row, never a finding about the yard */
      return { cls: 'ours', text: 'We couldn’t get through. Our side, not yours. Not counted against you.' }
    default:
      return { cls: 'wait', text: 'Cancelled' }
  }
}

function attemptRow(a, tz, now) {
  const ch = CHANNEL[a.channel]
  const s = attemptStatus(a, tz, now)
  const when = a.dispatchedAt ?? a.scheduledFor
  return `
    <div class="pd-row ${s.cls}">
      <span class="pd-ic">${ch.icon}</span>
      <span class="pd-txt">
        <b>${ch.label}${a.channel === 'phone' ? ` · attempt ${a.sequence}` : ''}</b>
        <small>${s.text}</small>
      </span>
      <span class="pd-when">${fmtAt(when, tz)}</span>
    </div>`
}

/* ------------------------------------------------------------
   the live call hero (FR29)
   ------------------------------------------------------------ */
function liveCall(attempts, tz, now) {
  const live = attempts.find(
    (a) => a.channel === 'phone' && a.outcome === null && a.dispatchedAt !== null,
  )
  const next = attempts.find(
    (a) => a.channel === 'phone' && a.outcome === null && a.dispatchedAt === null && a.scheduledFor > now,
  )
  if (!live && !next) return ''

  if (live) {
    const m = live.metrics || {}
    const phase = m.answeredAt ? 'CONNECTED' : m.ringStartedAt ? 'RINGING' : 'DIALLING'
    const rings = m.ringStartedAt && !m.answeredAt
      ? Math.max(1, Math.round((now - m.ringStartedAt) / 6000))
      : null
    return `
      <div class="pd-live" data-phase="${phase.toLowerCase()}">
        <span class="pd-pulse"></span>
        <div class="pd-live-txt">
          <b>${phase}${rings ? ` · ~${rings} RING${rings > 1 ? 'S' : ''}` : ''}</b>
          <small>Calling your counter line now. Watch what your customers get.</small>
        </div>
      </div>`
  }
  return `
    <div class="pd-live" data-phase="scheduled">
      <span class="pd-pulse quiet"></span>
      <div class="pd-live-txt">
        <b>NEXT CALL · ${esc(fmtAt(next.scheduledFor, tz).toUpperCase())}</b>
        <small>${esc(WINDOW_LABEL[next.window] || 'scheduled')} · attempts are spread across the day on purpose.</small>
      </div>
    </div>`
}

/* ------------------------------------------------------------
   the verdict (FR23, FR26, FR33, FR35)
   ------------------------------------------------------------ */
function verdictPanel(state) {
  const v = state.verdict
  if (!v) return ''
  const c = v.counts
  const subs = (v.measured && v.measured.substitutions) || []

  const sentence = [
    `${c.dispatched} ${c.dispatched === 1 ? 'inquiry' : 'inquiries'} went out.`,
    c.reachedHuman ? `${c.reachedHuman} reached a human.` : 'None reached a human.',
    c.noResponse ? `${c.noResponse} never got a response.` : null,
    c.unreachableOurs ? `${c.unreachableOurs} couldn’t be delivered by our side, not counted.` : null,
    v.fastestResponseMs !== null ? `Fastest response: ${fmtDur(v.fastestResponseMs)}.` : null,
  ].filter(Boolean).join(' ')

  /* FR26 — the measured figure is the SERVER's verdict.repriced,
     produced by the one leak engine at resolution (AD-11). Rendering
     a client-side recompute here would be a second source for the
     headline number — the exact drift AD-11 forbids. */
  let repriceBlock = ''
  if (v.repriced && subs.length) {
    const measured = v.repriced.monthlyCents / 100
    const before = state.estimate ? state.estimate.monthlyCents / 100 : null
    repriceBlock = `
      <div class="pd-reprice">
        <div class="pd-rp-figs">
          ${before !== null ? `
          <div class="pd-rp-col">
            <span class="lab">You estimated</span>
            <b>${money(before)}<i>/mo</i></b>
            <small>from the bands you tapped</small>
          </div>
          <span class="pd-rp-arrow">→</span>` : ''}
          <div class="pd-rp-col measured">
            <span class="lab">Measured</span>
            <b>${money(measured)}<i>/mo</i></b>
            <small>same arithmetic, observed inputs</small>
          </div>
        </div>
        <div class="pd-subs">
          ${subs.map((s) => `
            <div class="pd-sub">
              <span class="pd-sub-key">${esc(
                s.key === 'missedCalls' ? 'Missed calls' : s.key === 'quoteSpeed' ? 'Quote speed' : 'After hours',
              )}</span>
              <span class="pd-sub-vals"><em>${esc(s.from ?? '–')}</em> → <b>${esc(s.to)}</b></span>
            </div>`).join('')}
        </div>
      </div>`
  }

  return `
    <div class="pd-verdict">
      <span class="lab">The verdict: counts and times, not a grade</span>
      <p class="pd-counts">${esc(sentence)}</p>
      ${repriceBlock}
      ${v.partial ? `<p class="pd-note">Some channels couldn’t be measured this run. This verdict covers what actually landed, and claims nothing else.</p>` : ''}
      ${v.biasNote ? `<p class="pd-note">The first call told your counter an audit was running. The email and form clocks started before it, so alerting could only have made these numbers better, never worse.</p>` : ''}
    </div>`
}

/* ------------------------------------------------------------
   competitor hours (FR27) — public fact only, nobody probed (C6)
   ------------------------------------------------------------ */
function hoursPanel(state) {
  const h = state.competitorHours
  if (!h || !h.measured) return ''

  const headline =
    h.openWhileYouClosedCount === null
      ? `${h.swept} yards in your ${h.radiusMi} mi radius publish their hours. Yours aren’t published, so there’s nothing to compare against.`
      : h.openWhileYouClosedCount === 0
        ? `${h.swept} yards inside ${h.radiusMi} mi. None of the ${h.measured} publishing hours covers time you don’t. Your schedule holds the line.`
        : `${h.swept} yards inside ${h.radiusMi} mi. ${h.openWhileYouClosedCount} of them ${h.openWhileYouClosedCount === 1 ? 'is' : 'are'} reachable at hours you’re closed. That’s where the missed call goes next.`

  return `
    <div class="pd-hours">
      <span class="lab">Where the next call goes: published hours, nobody contacted</span>
      <p class="pd-counts">${esc(headline)}</p>
      ${h.competitors.slice(0, 3).map((c) => `
        <div class="pd-sub">
          <span class="pd-sub-key">${esc(c.name)}${c.national ? ' <em class="pd-nat">national</em>' : ''}</span>
          <span class="pd-sub-vals">${c.weeklyHours}h/wk open${
            c.hoursWhileYouClosed !== null && c.hoursWhileYouClosed > 0
              ? ` · <b>${c.hoursWhileYouClosed}h while you’re closed</b>`
              : ''
          }</span>
        </div>`).join('')}
      ${h.yardWeeklyHours !== null ? `<p class="pd-note">Your published counter hours: ${h.yardWeeklyHours}h a week. ${h.unmeasured ? `${h.unmeasured} nearby yard${h.unmeasured > 1 ? 's publish' : ' publishes'} no hours, not counted either way.` : ''}</p>` : ''}
    </div>`
}

/* ------------------------------------------------------------
   the whole board
   ------------------------------------------------------------ */
export function renderDashboard(state, opts = {}) {
  const now = opts.now ?? Date.now()
  const tz = state.run.timezone
  const wrap = document.createElement('div')
  wrap.className = 'probe-dash'

  const status =
    state.run.status === 'active' ? (state.attempts.some((a) => a.outcome === null && a.dispatchedAt !== null && a.channel === 'phone') ? 'LIVE' : 'IN FLIGHT')
    : state.run.status === 'resolved' ? 'VERDICT'
    : state.run.status === 'killed' ? 'STOPPED'
    : 'EXPIRED'

  wrap.innerHTML = `
    <div class="pd-head">
      <span class="pd-title">
        <b>Proof load test</b>
        <small>${esc(state.yardName || 'your yard')} · all times ${esc(tz)}</small>
      </span>
      <span class="pd-status s-${status.toLowerCase().replace(' ', '')}">${status}</span>
      ${state.run.status === 'active' ? `<button class="pd-kill" type="button" data-kill>Stop everything</button>` : ''}
    </div>
    ${state.run.status === 'active' ? liveCall(state.attempts, tz, now) : ''}
    ${state.run.status === 'killed' ? `<p class="pd-note">You pulled the switch. Every scheduled probe stood down. What landed before that is below; nothing else will fire.</p>` : ''}
    ${verdictPanel(state)}
    ${state.verdict ? hoursPanel(state) : ''}
    <div class="pd-log">
      <span class="lab">The attempt log: every attempt, including the ones that connected</span>
      ${state.attempts.map((a) => attemptRow(a, tz, now)).join('')}
    </div>
    <div class="pd-artifacts" data-artifacts></div>`

  if (opts.onKill) {
    wrap.querySelector('[data-kill]')?.addEventListener('click', opts.onKill)
  }
  return wrap
}

/** FR25 — artifacts attach to their findings. The C2 filter already
    ran server-side; anything present here is servable. */
export function renderArtifacts(list) {
  if (!list.length) return null
  const box = document.createElement('div')
  box.className = 'pd-proofs'
  box.innerHTML = `
    <span class="lab">Evidence</span>
    ${list.map((a) => a.expired
      ? `<span class="pd-proof expired">${esc(kindLabel(a.kind))}, expired per the retention window you were shown</span>`
      : a.contentType.startsWith('audio/')
        ? `<figure class="pd-proof"><figcaption>${esc(kindLabel(a.kind))}</figcaption><audio controls preload="none" src="${esc(a.url)}"></audio></figure>`
        : a.contentType.startsWith('image/')
          ? `<figure class="pd-proof"><figcaption>${esc(kindLabel(a.kind))}</figcaption><img loading="lazy" src="${esc(a.url)}" alt="${esc(kindLabel(a.kind))}"></figure>`
          : `<a class="pd-proof" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(kindLabel(a.kind))}</a>`,
    ).join('')}`
  return box
}

const kindLabel = (k) => ({
  call_recording: 'Call recording',
  voicemail_recording: 'The voicemail we left in your box',
  call_transcript: 'Call transcript',
  email_body: 'The inquiry email',
  form_screenshot_before: 'Your form, filled in',
  form_screenshot_after: 'Your form, after submitting',
}[k] || k)
