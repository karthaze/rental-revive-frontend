/* ============================================================
   THE PROOF GATE — FR1–FR6, FR8, C4, C7
   ------------------------------------------------------------
   The activation moment. Copy descends from the addendum's
   discovery fragments: everything above this panel is an
   estimate, and estimates are arguable — the crane gets
   proof-loaded, the counter never has been.

   FR3 is the law of this panel: before authorising, the owner
   sees, in plain language, exactly what will be contacted, how
   many times, over what window, that calls are recorded and for
   how long, that his staff will not be warned, that the report
   names hours and not people (non-negotiable, C4), and the name
   of the entity the written inquiries arrive from. Nothing about
   the test is hidden from the person authorising it — only from
   his staff, which is the point.

   The disclosure text is versioned (FR4): change the copy, bump
   DISCLOSURE_VERSION, and every consent artifact records which
   version was on screen when the grant happened.
   ============================================================ */
import { ensureAuth, getAuthedConvex, api, probeConfigured } from './backend.js'

export const DISCLOSURE_VERSION = 'proof-gate-2026-07-30'

/* [ASSUMPTION] pending PRD Q1 — must match RETENTION_DAYS_DEFAULT in
   convex/runs/activate.ts; C4 requires the number ON the consent
   screen, so it is spelled out in the disclosure list below. */
const RETENTION_DAYS = 30

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** Renders the gate, or nothing when the backend is not configured.
    Without VITE_CONVEX_URL at build time this function's body is
    dead-code-eliminated by Vite (folds to `return null`) — the shipped
    bundle is NOT byte-identical; the gate chunk shrinks accordingly. */
export function renderProofGate(container, ctx) {
  if (!probeConfigured()) return null
  const { state } = ctx
  const p = state.place || {}
  const phone = p.phone || ''
  if (!phone) return null // FR6 — no confirmed counter line, no probe

  const email = state.inquiryEmail || null
  const site = p.website || null
  const count = 1 + (email ? 1 : 0) + (site ? 1 : 0)

  const gate = document.createElement('div')
  gate.className = 'proof-gate'
  gate.id = 'proofGate'
  gate.innerHTML = `
    <span class="lab panel-lab">The part you can’t argue with</span>
    <h3>Everything above is an estimate. Estimates are arguable.</h3>
    <p class="pg-lead">Your crane doesn’t get certified on an estimate. It gets proof-loaded.
      Your counter has never been tested once. Authorise it, and the first call goes out
      while you watch.</p>

    <div class="pg-disclosure">
      <span class="lab">What you’d be authorising: all of it, plainly</span>
      <ul>
        <li><b>${count} ${count > 1 ? 'inquiries' : 'inquiry'} to your own business, nobody else’s:</b>
          your counter line ${esc(phone)}${email ? `, your inquiry email` : ''}${site ? `, and the form on your website` : ''}.</li>
        <li><b>The phone:</b> up to 4 short calls over 48 hours: business hours, lunch, and after close,
          never before 8am or after 8pm your time. Calls are recorded, and whoever answers is told
          immediately it’s an authorised booking-response check, not a real rental.</li>
        <li><b>The written inquiries</b> arrive from <b>Full Circle Contractors</b>, a real, registered
          company we operate for exactly this, asking availability and rates for machines you already
          rent. No invented job, no fake delivery date, nothing a dispatcher could reserve iron against.
          Your team gets a debrief note inside 48 hours saying it was part of this check.</li>
        <li><b>Your staff aren’t warned.</b> That’s the point, but the report names <b>hours, not
          people</b>. No names, no staff audio, ever. We’re testing the system, not the people,
          and that isn’t negotiable in either direction.</li>
        <li><b>Recordings are deleted after ${RETENTION_DAYS} days</b>, automatically. A kill switch
          on the dashboard stops everything mid-run, instantly.</li>
      </ul>
    </div>

    <button class="btn-commit pg-cta" type="button" data-activate>Proof-test my counter →</button>
    <p class="pg-fine">Sign in to authorise. The consent is yours to give and yours to revoke.
      If your counter is airtight, the verdict will say exactly that.</p>
    <p class="pg-status" role="status" aria-live="polite" data-status hidden></p>`

  const status = gate.querySelector('[data-status]')
  const cta = gate.querySelector('[data-activate]')

  cta.addEventListener('click', async () => {
    cta.disabled = true
    status.hidden = false
    status.textContent = 'Waiting on sign-in…'
    try {
      const clerk = await ensureAuth()
      if (!clerk) throw new Error('Sign-in is not available right now.')
      status.textContent = 'Authorising and dialling…'

      const convex = await getAuthedConvex()
      const { scanId } = await convex.mutation(api.scans.saveScan, ctx.buildScanPayload())
      const { runId, firstCallAt } = await convex.mutation(api.runs.activate.activate, {
        scanId,
        targets: { phone, email, formUrl: site },
        disclosureVersion: DISCLOSURE_VERSION,
        userAgent: navigator.userAgent,
      })

      /* the run outlives this tab — make it findable again */
      try { localStorage.setItem('rr_probe_run', runId) } catch {}
      const url = new URL(location.href)
      url.searchParams.set('run', runId)
      history.replaceState(null, '', url)

      ctx.onActivated(runId, firstCallAt)
    } catch (e) {
      cta.disabled = false
      status.textContent =
        e?.message?.includes('timezone')
          ? 'We couldn’t pin your yard’s timezone, so the call windows can’t be set safely. This one needs a hand: reply to your report email.'
          : `Couldn’t start the test: ${e?.message || 'unknown error'}. Nothing was dispatched.`
    }
  })

  container.appendChild(gate)
  requestAnimationFrame(() => gate.classList.add('in'))
  return gate
}
