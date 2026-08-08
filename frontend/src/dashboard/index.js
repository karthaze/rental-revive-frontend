/* ============================================================
   DASHBOARD CONTROLLER — subscriptions in, renders out
   ------------------------------------------------------------
   Owns the Convex subscription, the once-a-second repaint while
   a call is ringing (the climbing ring count is FR29's whole
   show), the kill switch round-trip, and artifact loading once
   a verdict exists. view.js stays pure; this file is the only
   place the dashboard touches the network.
   ============================================================ */
import { getAuthedConvex, ensureAuth, api } from './backend.js'
import { renderDashboard, renderArtifacts } from './view.js'

export async function mountDashboard(container, runId) {
  const clerk = await ensureAuth()
  const convex = clerk ? await getAuthedConvex() : null

  const shell = document.createElement('div')
  shell.className = 'probe-dash-shell'
  container.appendChild(shell)

  if (!convex) {
    shell.innerHTML = `<div class="probe-dash"><p class="pd-note">
      The probe backend isn’t reachable from this page. Your run is safe:
      it lives server-side, but this view can’t connect. Try again from
      the link in your report email.</p></div>`
    return () => shell.remove()
  }

  let latest = null
  let tick = null
  const artifactCache = new Map()

  const paint = () => {
    if (!latest) return
    const board = renderDashboard(latest, {
      now: Date.now(),
      onKill: async () => {
        /* FR5 — one click, no ceremony beyond a confirm */
        if (!confirm('Stop the test? Every scheduled probe stands down immediately.')) return
        await convex.mutation(api.runs.kill.killRun, { runId })
      },
    })
    /* attach evidence under the board once attempts carry artifacts */
    const proofHost = board.querySelector('[data-artifacts]')
    for (const a of latest.attempts) {
      if (!a.artifactIds?.length) continue
      const cached = artifactCache.get(a.id)
      if (cached?.length) {
        const node = renderArtifacts(cached)
        if (node) proofHost.appendChild(node)
      } else if (!artifactCache.has(a.id)) {
        artifactCache.set(a.id, [])
        convex.query(api.runs.queries.attemptArtifacts, { attemptId: a.id }).then((list) => {
          artifactCache.set(a.id, list || [])
          paint()
        })
      }
    }
    shell.replaceChildren(board)
  }

  const unsubscribe = convex.onUpdate(api.runs.queries.runState, { runId }, (state) => {
    latest = state
    if (!state) {
      shell.innerHTML = `<div class="probe-dash"><p class="pd-note">
        This run isn’t visible from this account. Runs are only shown to
        the owner who authorised them.</p></div>`
      return
    }
    paint()
    /* repaint every second only while a call is actually in flight —
       the ring count climbing is the FR29 conversion moment */
    const callLive = state.run.status === 'active' &&
      state.attempts.some((a) => a.channel === 'phone' && a.outcome === null && a.dispatchedAt !== null)
    if (callLive && !tick) tick = setInterval(paint, 1000)
    if (!callLive && tick) { clearInterval(tick); tick = null }
  })

  return () => {
    unsubscribe?.()
    if (tick) clearInterval(tick)
    shell.remove()
  }
}
