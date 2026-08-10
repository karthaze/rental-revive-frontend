/* style.css is linked from index.html's head so the first paint is
   already styled — importing it here reintroduces the FOUC flash */
import { loadMaps, searchYards } from './onboard/places.js'

/* scroll reveal */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
  }),
  { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
)
document.querySelectorAll('.rv').forEach((el) => io.observe(el))

/* stat strip: the numerals count up once, like a panel powering on */
const strip = document.querySelector('.stat-strip')
if (strip && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const sio = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return
    sio.disconnect()
    strip.querySelectorAll('.stat b').forEach((b) => {
      const m = b.textContent.match(/^(\d+)([\s\S]*)$/)
      if (!m) return
      const to = +m[1]
      const rest = m[2]
      const t0 = performance.now()
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / 900)
        b.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + rest
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }), { threshold: 0.4 })
  sio.observe(strip)
}

/* nav: frost + shrink on scroll (cheap, class-toggle only) */
const nav = document.querySelector('.nav')
let navOn = false
const onScroll = () => {
  const past = window.scrollY > 24
  if (past !== navOn) { navOn = past; nav.classList.toggle('scrolled', past) }
}
window.addEventListener('scroll', onScroll, { passive: true })
onScroll()

/* nav: mobile menu toggle */
const burger = document.querySelector('.nav-burger')
if (nav && burger) {
  const links = nav.querySelector('.nav-links')
  const setOpen = (open) => {
    nav.classList.toggle('open', open)
    burger.setAttribute('aria-expanded', String(open))
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  }
  burger.addEventListener('click', () => setOpen(!nav.classList.contains('open')))
  links?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)))
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target)) setOpen(false)
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false) })
}

/* nav: highlight the section you're currently in (scrollspy) */
const navLinkFor = {}
document.querySelectorAll('.nav-links a[href^="#"]').forEach((a) => {
  const id = a.getAttribute('href').slice(1)
  if (id) navLinkFor[id] = a
})
const spyTargets = Object.keys(navLinkFor).map((id) => document.getElementById(id)).filter(Boolean)
if (spyTargets.length) {
  const pickActive = () => {
    const line = window.innerHeight * 0.4
    let best = null
    for (const s of spyTargets) if (s.getBoundingClientRect().top <= line) best = s.id
    Object.entries(navLinkFor).forEach(([id, a]) => a.classList.toggle('active', id === best))
  }
  window.addEventListener('scroll', pickActive, { passive: true })
  window.addEventListener('resize', pickActive, { passive: true })
  pickActive()
}

/* Control panel: skeuomorphic revenue estimator.
   Two industrial faders (missed calls/wk + average rental) feed a live money
   model; one analog gauge's needle climbs from leak to recovered when the
   single Desk toggle is flipped. The rAF loop only runs while on screen. */
const rig = document.querySelector('.rig')
if (rig) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const led = rig.querySelector('.rig-led')
  const inCalls = rig.querySelector('#inCalls')
  const inTicket = rig.querySelector('#inTicket')
  const valCalls = rig.querySelector('#valCalls')
  const valTicket = rig.querySelector('#valTicket')
  const valRate = rig.querySelector('#valRate')
  const roLab = rig.querySelector('#roLab')
  const roFig = rig.querySelector('#roFig')
  const digFormula = rig.querySelector('#digFormula')
  const toggleBtn = rig.querySelector('#deckToggle')
  const dtState = rig.querySelector('#dtState')
  const dtHint = rig.querySelector('#dtHint')

  let on = false
  let armed = false

  /* ---- analog dial faces (generated SVG: ticks, numerals, zones, glass) ---- */
  const pt = (r, v) => {
    const a = (180 + v * 1.8) * Math.PI / 180
    return [100 + r * Math.cos(a), 112 + r * Math.sin(a)]
  }
  const arc = (r, v0, v1) => {
    const [x0, y0] = pt(r, v0), [x1, y1] = pt(r, v1)
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  let dialTicks = '', dialNums = ''
  for (let v = 0; v <= 100; v += 5) {
    const major = v % 25 === 0
    const [x1, y1] = pt(major ? 76 : 81, v)
    const [x2, y2] = pt(89, v)
    dialTicks += `<line class="${major ? 'tk-maj' : 'tk-min'}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`
    if (major) {
      const [lx, ly] = pt(63, v)
      dialNums += `<text class="tk-num" x="${lx.toFixed(1)}" y="${Math.min(ly + 3.5, 107).toFixed(1)}">${v}</text>`
    }
  }
  const gauges = [...rig.querySelectorAll('.gauge')].map((host, gi) => {
    host.innerHTML = `
      <div class="g-dial">
        <svg viewBox="0 0 200 128" aria-hidden="true">
          <defs>
            <radialGradient id="gface${gi}" cx="50%" cy="10%" r="115%">
              <stop offset="0" stop-color="#2b2622"/><stop offset="1" stop-color="#120f0d"/>
            </radialGradient>
            <linearGradient id="gglass${gi}" x1="0" y1="0" x2=".55" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity=".18"/>
              <stop offset=".4" stop-color="#fff" stop-opacity=".04"/>
              <stop offset=".65" stop-color="#fff" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="M2 112 A98 98 0 0 1 198 112 Z" fill="url(#gface${gi})" stroke="rgba(255,255,255,.09)"/>
          <path class="zone lost" d="${arc(88, 2, 34)}"/>
          <path class="zone good" d="${arc(88, 66, 98)}"/>
          ${dialTicks}${dialNums}
          <line class="g-base" x1="6" y1="112" x2="194" y2="112"/>
          <g class="g-needle"><path d="M100 34 L96.2 110 L103.8 110 Z"/><path d="M97.4 112 L102.6 112 L101.2 123 L98.8 123 Z"/></g>
          <circle class="g-hub" cx="100" cy="112" r="7.5"/>
          <circle class="g-hub-pin" cx="100" cy="112" r="3"/>
          <path d="M2 112 A98 98 0 0 1 198 112 Z" fill="url(#gglass${gi})"/>
        </svg>
      </div>
      <div class="g-read"><span class="g-val">0</span><small>%</small></div>
      <div class="g-lab">${host.dataset.label}</div>`
    return {
      needle: host.querySelector('.g-needle'),
      valEl: host.querySelector('.g-val'),
      off: +host.dataset.off, on: +host.dataset.on,
      phase: gi * 2.1,
      s: { v: 0, vel: 0, t: 0 },
      shown: -1,
    }
  })
  const stepSpring = (s, dt) => {
    const a = 70 * (s.t - s.v) - 10 * s.vel
    s.vel += a * dt
    s.v += s.vel * dt
  }
  const renderGauge = (g) => {
    const val = Math.max(0, Math.min(100, g.s.v))
    /* SVG attribute rotation with an explicit pivot: CSS transform-origin on
       the <g> resolved against the wrong box in Chrome, which pivoted the
       needle around the dial centre instead of the hub. */
    g.needle.setAttribute('transform', `rotate(${(val * 1.8 - 90).toFixed(2)} 100 112)`)
    const iv = Math.round(val)
    if (iv !== g.shown) { g.shown = iv; g.valEl.textContent = iv }
  }
  gauges.forEach(renderGauge)

  /* ---- money model: (missed calls/wk) x weeks x booking rate x average rental.
     BOOK_RATE is the one fixed, industry-typical assumption; calls and ticket
     are user inputs from the two faders. Everything is shown on the panel. ---- */
  const BOOK_RATE = 0.30
  const WKS = 4.33
  let calls = +inCalls.value
  let ticket = +inTicket.value
  if (valRate) valRate.textContent = Math.round(BOOK_RATE * 100) + '%'
  const monthly = () => Math.round(calls * WKS * BOOK_RATE * ticket / 100) * 100

  let moneyRaf = 0
  let shownMoney = 0
  const setMoney = (v) => {
    shownMoney = v
    roFig.textContent = (on ? '$' : '-$') + Math.round(v).toLocaleString('en-US')
  }
  const paintMoney = (animate) => {
    cancelAnimationFrame(moneyRaf)
    roLab.textContent = on ? 'Recovered / mo' : 'Leaking / mo'
    roFig.classList.toggle('neg', !on)
    const to = monthly()
    if (!animate || reduced) { setMoney(to); return }
    const from = shownMoney
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 1100)
      setMoney(from + (to - from) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) moneyRaf = requestAnimationFrame(tick)
    }
    moneyRaf = requestAnimationFrame(tick)
  }

  /* ---- faders: paint the filled portion, recompute the money + formula ---- */
  const fillRange = (el) => {
    const pct = ((+el.value - +el.min) / (+el.max - +el.min)) * 100
    el.style.setProperty('--fill', pct.toFixed(1) + '%')
  }
  const refresh = (animate) => {
    calls = +inCalls.value
    ticket = +inTicket.value
    valCalls.textContent = String(calls)
    valTicket.textContent = '$' + ticket.toLocaleString('en-US')
    fillRange(inCalls)
    fillRange(inTicket)
    if (digFormula) digFormula.textContent = `${calls} missed calls/wk × ${Math.round(BOOK_RATE * 100)}% booked × $${ticket.toLocaleString('en-US')} average rental`
    paintMoney(animate)
  }
  inCalls.addEventListener('input', () => refresh(false))
  inTicket.addEventListener('input', () => refresh(false))

  /* ---- master state: single Desk toggle drives everything ---- */
  const apply = (animate) => {
    rig.classList.toggle('on', on)
    toggleBtn.setAttribute('aria-checked', String(on))
    led.textContent = on ? 'ONLINE' : 'LEAK'
    dtState.textContent = on ? 'Desk on' : 'Desk off'
    dtHint.textContent = on ? 'What you keep instead' : 'This is your yard today'
    gauges.forEach((g) => {
      g.s.t = on ? g.on : g.off
      if (reduced) { g.s.v = g.s.t; g.s.vel = 0; renderGauge(g) }
    })
    if (animate) shownMoney = 0
    paintMoney(animate)
  }
  toggleBtn.addEventListener('click', () => { on = !on; apply(true) })

  /* ---- animation loop: needle springs + idle wobble only ---- */
  let rafId = 0, running = false, lastTs = 0
  const loop = (ts) => {
    if (!running) return
    const dt = Math.min(0.08, Math.max(0.001, (ts - lastTs) / 1000))
    lastTs = ts
    const t = ts / 1000
    gauges.forEach((g) => {
      const base = on ? g.on : g.off
      g.s.t = base + Math.sin(t * 1.6 + g.phase) * 0.7 + Math.sin(t * 4.7 + g.phase * 2.3) * 0.3
      stepSpring(g.s, dt)
      renderGauge(g)
    })
    rafId = requestAnimationFrame(loop)
  }
  const setRunning = (r) => {
    if (reduced || r === running) return
    running = r
    cancelAnimationFrame(rafId)
    if (running) { lastTs = performance.now(); rafId = requestAnimationFrame(loop) }
  }

  refresh(false)

  // settle to the leaking baseline in view; pause the needle loop off screen
  const rio = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) {
      if (!armed) { armed = true; apply(true) }
      setRunning(true)
    } else setRunning(false)
  }), { threshold: 0.2 })
  rio.observe(rig)
}

/* Hero yard search → the leak scan. Maps loads lazily on first focus;
   picking a suggestion hands the place straight to /onboard.html (no
   re-search over there). No key or no listing → the scan's gate handles
   it with just the typed name. */
const ys = document.getElementById('yardSearch')
if (ys) {
  const input = ys.querySelector('#ysInput')
  const goBtn = ys.querySelector('#ysGo')
  const list = ys.querySelector('#ysList')
  let mapsReady = null
  let rows = []
  let active = -1
  let timer = 0

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  const ensureMaps = () => (mapsReady ||= loadMaps())

  const toScan = (row) => {
    const q = input.value.trim()
    location.href = row
      ? `/onboard.html?pid=${encodeURIComponent(row.placeId)}&n=${encodeURIComponent(row.name)}`
      : `/onboard.html${q ? `?q=${encodeURIComponent(q)}` : ''}`
  }

  const paint = () => {
    input.setAttribute('aria-expanded', rows.length ? 'true' : 'false')
    list.innerHTML = rows.map((r, i) => {
      const isBlocked = r.kind === 'no'
      return `
      <li class="ys-item${i === active ? ' active' : ''}${isBlocked ? ' blocked' : ''}" role="option" data-i="${i}" data-blocked="${isBlocked}">
        <span class="ys-pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
        <span class="ys-txt"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.detail)}</small></span>
        <i class="ys-tag ${r.kind}">${escapeHtml(r.tag || 'Rental yard')}</i>
      </li>`
    }).join('')
      + (rows.length ? '<li class="ys-src">US heavy machinery rental yards only · free scan, no forms</li>' : '')
    list.querySelectorAll('.ys-item').forEach((li) => {
      if (li.dataset.blocked !== 'true') {
        li.addEventListener('click', () => toScan(rows[+li.dataset.i]))
      }
    })
  }

  const search = async () => {
    const q = input.value.trim()
    if (q.length < 3) { rows = []; active = -1; paint(); return }
    const ok = await ensureMaps()
    if (!ok) return /* Enter still works — the scan's gate takes over */
    rows = await searchYards(q)
    active = rows.length ? 0 : -1
    paint()
  }

  input.addEventListener('focus', ensureMaps, { once: true })
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 180) })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, rows.length - 1); paint() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint() }
    else if (e.key === 'Enter') { e.preventDefault(); toScan(rows[active]) }
    else if (e.key === 'Escape') { rows = []; active = -1; paint() }
  })
  goBtn.addEventListener('click', () => toScan(rows[active]))
  document.addEventListener('click', (e) => {
    if (!ys.contains(e.target) && rows.length) { rows = []; active = -1; paint() }
  })
}

/* FAQ: single-open accordion (opening one closes the others) */
const faqItems = [...document.querySelectorAll('.faq-list details')]
faqItems.forEach((d) => d.addEventListener('toggle', () => {
  if (d.open) faqItems.forEach((o) => { if (o !== d) o.open = false })
}))

/* Audit forms: submit only when a real destination is configured. */
document.querySelectorAll('form[data-audit]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!form.reportValidity()) return

    const endpoint = form.dataset.endpoint || import.meta.env.VITE_AUDIT_ENDPOINT
    const button = form.querySelector('button[type="submit"]')
    let status = form.querySelector('[data-form-status]')
    if (!status) {
      status = document.createElement('p')
      status.dataset.formStatus = 'true'
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      status.className = 'af-fine'
      form.append(status)
    }

    if (!endpoint) {
      status.textContent = 'The audit form is not connected yet. Please contact the RentalRevive team directly while intake is being configured.'
      return
    }

    const originalLabel = button?.innerHTML
    if (button) { button.disabled = true; button.textContent = 'Sending…' }
    status.textContent = ''

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      })
      if (!response.ok) throw new Error(`Audit submission failed: ${response.status}`)
      const email = form.querySelector('input[type="email"]')?.value || 'your email'
      form.innerHTML = `<div style="padding:14px 8px;font-weight:600;color:var(--ink)" role="status">
        Your audit request is in. We will send the report to <b>${email}</b> within 48 hours.</div>`
    } catch (error) {
      console.error(error)
      status.textContent = 'That did not go through. Please try again or contact the RentalRevive team directly so we do not lose your request.'
      if (button) { button.disabled = false; button.innerHTML = originalLabel }
    }
  })
})
