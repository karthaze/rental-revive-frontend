/* ============================================================
   YARD PAGE GENERATOR
   ------------------------------------------------------------
   Eight segment pages, generated from common/segments.js rather
   than hand-written. That file is already the single source of
   truth for the scanner: every yard type carries its own fleet
   list, ticket bands, intake fields, demand signals and per-leak
   framing, and the scan speaks that vocabulary back to the owner.

   Hand-copying it into eight HTML files would guarantee the site
   and the scanner drift apart the first time a ticket band moves.
   So the pages are emitted in the same authoring format the rest
   of `frontend/pages/` uses, and build/render.mjs composes them
   with the shared nav and footer like any other page.

   Output is gitignored. Edit common/segments.js, never
   frontend/pages/yards/.
   ============================================================ */

import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEGMENTS } from '../common/segments.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'frontend', 'pages', 'yards')

/* The URL each yard has been linked as since the nav was built. Kept here
   rather than in segments.js: the scanner does not care about URLs, and a
   slug is a website concern. */
const SLUG = {
  cranes: 'cranes-lifting',
  earthmoving: 'earthmoving',
  aerial: 'aerial-access',
  compact: 'compact-machinery',
  material: 'material-handling',
  road: 'road-concrete-compaction',
  power: 'power-climate-site-services',
  specialty: 'heavy-haul-specialty',
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* The four leaks, in the order the landing page and the scan both use.
   `frames` in segments.js is keyed the same way. */
const LEAKS = [
  { key: 'calls', no: '01', title: 'The missed call' },
  { key: 'quotes', no: '02', title: 'The slow quote' },
  { key: 'pile', no: '03', title: 'The dead quote pile' },
  { key: 'quiet', no: '04', title: 'The quiet account' },
]

function page(seg) {
  const slug = SLUG[seg.id]
  if (!slug) throw new Error(`no slug mapped for segment "${seg.id}"`)

  const meta = {
    title: `${seg.name} rental: where the money leaks | RentalRevive`,
    description: `${seg.hook} Every call answered, every quote chased, every quiet account worked back — in your name, on your rates. Free two-minute leak scan, no email required.`,
    canonical: `/yards/${slug}`,
    bodyClass: `page-yard yard-${seg.id}`,
  }

  const leakCards = LEAKS.map(
    (l, i) => `      <div class="leakcard rv${i ? ` d${i}` : ''}">
        <div class="lk-top"><span class="lk-no">${l.no}</span></div>
        <h3>${esc(l.title)}</h3>
        <p>${esc(seg.frames[l.key])}</p>
      </div>`
  ).join('\n')

  const fleet = seg.fleet.map((f) => `        <li>${esc(f)}</li>`).join('\n')
  const intake = seg.intake.map((q) => `        <li>${esc(q)}</li>`).join('\n')
  const signals = seg.signals.map((s) => `        <li>${esc(s)}</li>`).join('\n')
  const bands = seg.ticketBands
    .map(
      (b) => `        <div class="tb-row"><span class="tb-lab">${esc(b.label)}</span>
          <span class="tb-bar"><i style="width:${Math.round(
            (b.mid / seg.ticketBands[seg.ticketBands.length - 1].mid) * 100
          )}%"></i></span></div>`
    )
    .join('\n')

  return `<!--meta
${JSON.stringify(meta, null, 2)}
meta-->

<header class="section yard-hero">
  <div class="wrap">
    <div class="head left rv">
      <span class="eyebrow"><span class="star"></span>Your kind of yard</span>
      <h1 class="rv d1">${esc(seg.name)}</h1>
      <p class="lead rv d2">${esc(seg.hook)}</p>
      <a class="btn btn-red rv d3" href="/onboard.html">Price my leak, free <span class="chip">↗</span></a>
    </div>
  </div>
</header>

<section class="section" id="leaks" style="background:var(--bg);border-top:1px solid var(--line)">
  <div class="wrap">
    <div class="head left rv">
      <span class="eyebrow"><span class="star"></span>Where it leaks here</span>
      <h2>Four ways a ${esc(seg.job)} walks out the door.</h2>
      <p>Every yard type leaks differently. These are the four we find in ${esc(
        seg.name.toLowerCase()
      )}, in the order they usually cost the most.</p>
    </div>
    <div class="leaks-grid yard-leaks">
${leakCards}
    </div>
  </div>
</section>

<section class="section" id="fleet">
  <div class="wrap">
    <div class="head left rv">
      <span class="eyebrow"><span class="star"></span>What you rent</span>
      <h2>Your fleet, written down as data rather than a brochure.</h2>
      <p>During setup we build every class you carry into ${esc(
        seg.name.toLowerCase()
      )} as real specifications, so the system can match a job to a machine instead of showing a customer a photograph and hoping.</p>
    </div>
    <div class="yard-cols">
      <ul class="tick-list rv">
${fleet}
      </ul>
      <div class="logcard rv d1">
        <div class="lab"><span class="star"></span>What a complete brief captures</div>
        <ul class="brief-list">
${intake}
        </ul>
        <p class="brief-note">Captured before the ${esc(
          seg.job
        )} ever reaches your estimator, so he prices it once instead of ringing back to ask what the job is.</p>
      </div>
    </div>
  </div>
</section>

<section class="section peach" id="demand">
  <div class="wrap">
    <div class="head left rv">
      <span class="eyebrow"><span class="star"></span>Where the work comes from</span>
      <h2>The jobs in your radius that turn into ${esc(seg.jobs)}.</h2>
      <p>These are the work types that generate ${esc(
        seg.jobs
      )} near you. Every one of them is somebody deciding which yard to call.</p>
    </div>
    <ul class="signal-list rv">
${signals}
    </ul>
    <p class="estats-note" style="margin-top:28px">${esc(seg.frames.outbound)} We do not sell that work in the first sixty days, though. Pushing more inquiries at a yard that answers slowly makes the leak bigger, not smaller.</p>
  </div>
</section>

<section class="section" id="tickets">
  <div class="wrap">
    <div class="head left rv">
      <span class="eyebrow"><span class="star"></span>What one is worth</span>
      <h2>A single recovered ${esc(seg.job)} in this business.</h2>
      <p>The scan asks which band your ${esc(
        seg.jobs
      )} usually land in and prices the leak from your own answer, not from an industry average.</p>
    </div>
    <div class="tb rv">
${bands}
    </div>
    <p class="estats-note" style="margin-top:22px">We assume roughly ${esc(
      String(seg.defaultClose)
    )}% of the quotes we chase actually close in ${esc(
    seg.name.toLowerCase()
  )}. Deliberately conservative, so every number the scan shows you is a floor rather than a hope.</p>
  </div>
</section>

<section class="section" id="desk" style="background:var(--bg);border-top:1px solid var(--line)">
  <div class="wrap">
    <div class="split">
      <div class="rv">
        <span class="eyebrow"><span class="star"></span>What we run for you</span>
        <h2 style="margin:16px 0 14px">Sixteen engines, tuned to ${esc(seg.name.toLowerCase())}.</h2>
        <p class="lead" style="margin-bottom:26px">Every ${esc(
          seg.customer
        )} who calls gets answered inside fifteen minutes. Every quote gets chased to a yes or a no. Every account that went quiet gets worked back, in your name, on scripts you approve. The system installs on your own website first; our closers work on top of it for ninety days and then hand it over.</p>
        <a class="btn btn-dark" href="/the-desk.html">See all sixteen engines <span class="chip">↗</span></a>
      </div>
      <div class="logcard rv d1">
        <div class="lab"><span class="star"></span>Built for this yard specifically</div>
        <div class="logrow"><span class="t">Your fleet classes</span><span class="ok">${esc(
          String(seg.fleet.length)
        )} built</span></div>
        <div class="logrow"><span class="t">Quote fields captured</span><span class="ok">${esc(
          String(seg.intake.length)
        )} per ${esc(seg.job)}</span></div>
        <div class="logrow"><span class="t">Response target</span><span class="ok">15 minutes</span></div>
        <div class="logrow"><span class="t">Live and taking work</span><span class="ok">7 days</span></div>
        <div class="logrow"><span class="t">Anything off a load chart</span><span class="bad">Never auto-priced</span></div>
      </div>
    </div>
  </div>
</section>

<section class="band-section">
  <div class="wrap">
    <div class="band">
      <img class="band-img" src="/img/band-fleet.jpg" alt="Rented equipment working a construction site" loading="lazy" decoding="async" />
      <div class="band-inner">
        <span class="eyebrow rv"><span class="star"></span>Two minutes, no email</span>
        <h2 class="rv d1">Find out what your yard is leaking.</h2>
        <p class="rv d2">We call your counter the way a ${esc(
          seg.customer
        )} would, time the answer, and price the gap from your own numbers. If your counter turns out to be airtight we will tell you, and there will be nothing to sell.</p>
        <a class="btn btn-red rv d3" href="/onboard.html">Run the free leak scan <span class="chip">↗</span></a>
      </div>
    </div>
  </div>
</section>
`
}

export async function buildYards({ quiet = false } = {}) {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  for (const seg of SEGMENTS) {
    await writeFile(join(OUT, `${SLUG[seg.id]}.html`), page(seg), 'utf8')
  }
  if (!quiet) console.log(`[yards] ${SEGMENTS.length} pages → frontend/pages/yards/`)
  return SEGMENTS.length
}

if (process.argv[1] && process.argv[1].endsWith('yards.mjs')) {
  buildYards().catch((e) => {
    console.error(`[yards] ${e.message}`)
    process.exit(1)
  })
}
