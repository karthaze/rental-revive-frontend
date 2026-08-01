/* ============================================================
   FORM-PROBE WORKER — AD-12
   ------------------------------------------------------------
   Stateless Playwright runner, outside the trust boundary:
   receives a signed job, drives the browser, POSTs a signed
   result back, and holds nothing between jobs — no database,
   no credentials beyond the shared HMAC secret.

   The job's fill values already carry the persona identity and
   the C8-safe message; this worker adds no content of its own.
   Its one judgment call is classification, and the categories
   mirror the adapter's (convex/adapters/form/worker.ts):

     submitted       the form took it (confirmation noted if seen)
     no_form         no reachable inquiry form on the page
     submit_failed   form present, submission errored/ate it
     captcha         the form demands a captcha (yard's friction)
     challenge       bot wall against OUR IP (our failure, NFR7)
     error           navigation/crash — ours

   Run: node index.mjs   (PORT, PROBE_SECRET required)
   Deploy: see Dockerfile — Fly.io / Cloud Run, one instance is
   plenty; jobs are rare and independent.
   ============================================================ */
import http from 'node:http'
import crypto from 'node:crypto'
import { chromium } from 'playwright'

const PORT = Number(process.env.PORT ?? 8080)
const SECRET = process.env.PROBE_SECRET
if (!SECRET) {
  console.error('PROBE_SECRET is required')
  process.exit(1)
}

const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex')
const safeEqual = (a, b) => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

/* ------------------------------------------------------------
   detection heuristics
   ------------------------------------------------------------ */
const CAPTCHA_SEL = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '.g-recaptcha',
  '.h-captcha',
  '[data-sitekey]',
].join(',')

const CHALLENGE_MARKERS = [
  /checking your browser/i,
  /just a moment/i,
  /cf-challenge|cf_chl/i,
  /attention required.*cloudflare/i,
  /verify you are human/i,
]

const CONFIRM_MARKERS = [
  /thank you|thanks for (reaching|contacting|your)/i,
  /we('| ha)ve received|has been (sent|received|submitted)/i,
  /message (sent|received)|submission received|we'll (be in touch|get back)/i,
]

async function runJob(job) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const result = {
    attemptId: job.attemptId,
    status: 'error',
    confirmationDetected: false,
    fieldsFilled: 0,
    httpStatus: null,
    screenshots: {},
    note: '',
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const nav = await page.goto(job.targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    result.httpStatus = nav?.status() ?? null

    const bodyText = await page.textContent('body').catch(() => '') ?? ''
    if (CHALLENGE_MARKERS.some((re) => re.test(bodyText))) {
      result.status = 'challenge'
      return result
    }

    /* find the inquiry form: prefer one with a textarea (a message
       box), else any form with an email input */
    await page.waitForTimeout(1500) // late-hydrating form builders
    const form = page.locator('form').filter({ has: page.locator('textarea') }).first()
    const fallback = page.locator('form').filter({ has: page.locator('input[type="email"]') }).first()
    const target = (await form.count()) ? form : (await fallback.count()) ? fallback : null
    if (!target) {
      result.status = 'no_form'
      result.screenshots.before = (await page.screenshot()).toString('base64')
      return result
    }

    if (await target.locator(CAPTCHA_SEL).count()) {
      result.status = 'captcha'
      result.screenshots.before = (await page.screenshot()).toString('base64')
      return result
    }

    /* fill by field intent — name/email/phone/message, nothing else */
    const fills = [
      ['input[type="email"], input[name*="email" i], input[id*="email" i]', job.fill.email],
      [
        'input[name*="name" i]:not([name*="company" i]), input[id*="name" i], input[autocomplete="name"]',
        job.fill.name,
      ],
      ['input[type="tel"], input[name*="phone" i], input[id*="phone" i]', job.fill.phone],
      ['textarea', job.fill.message],
    ]
    for (const [sel, value] of fills) {
      const field = target.locator(sel).first()
      if (await field.count()) {
        await field.fill(value, { timeout: 5000 }).then(
          () => (result.fieldsFilled += 1),
          () => {},
        )
      }
    }
    result.screenshots.before = (await page.screenshot()).toString('base64')

    if (result.fieldsFilled === 0) {
      result.status = 'submit_failed'
      result.note = 'form found but no fillable fields matched'
      return result
    }

    const beforeUrl = page.url()
    const submit = target
      .locator('button[type="submit"], input[type="submit"], button:not([type])')
      .first()
    if (!(await submit.count())) {
      result.status = 'submit_failed'
      result.note = 'no submit control'
      return result
    }
    await submit.click({ timeout: 5000 }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(2000)

    const afterText = (await page.textContent('body').catch(() => '')) ?? ''
    const confirmed =
      CONFIRM_MARKERS.some((re) => re.test(afterText)) || page.url() !== beforeUrl
    result.screenshots.after = (await page.screenshot()).toString('base64')

    /* an unchanged page with the form still showing our text is the
       silent failure FR22 is about — reported as submit_failed */
    const stillFilled = await target
      .locator('textarea')
      .first()
      .inputValue()
      .catch(() => '')
    if (!confirmed && stillFilled === job.fill.message) {
      result.status = 'submit_failed'
      result.note = 'page unchanged after submit — form appears to eat input'
      return result
    }

    result.status = 'submitted'
    result.confirmationDetected = CONFIRM_MARKERS.some((re) => re.test(afterText))
    return result
  } catch (e) {
    result.note = String(e?.message ?? e).slice(0, 300)
    return result
  } finally {
    await browser.close().catch(() => {})
  }
}

async function postResult(callbackUrl, result) {
  const body = JSON.stringify(result)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-probe-signature': sign(body) },
        body,
      })
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
  }
  console.error(`callback delivery failed for ${result.attemptId}`)
}

http
  .createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/jobs') {
      res.writeHead(404).end()
      return
    }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', async () => {
      const presented = req.headers['x-probe-signature']
      if (typeof presented !== 'string' || !safeEqual(sign(raw), presented)) {
        res.writeHead(403).end()
        return
      }
      let job
      try {
        job = JSON.parse(raw)
      } catch {
        res.writeHead(400).end()
        return
      }
      res.writeHead(202).end('accepted')
      /* fire-and-callback: the job outlives the request, the worker
         outlives nothing */
      const result = await runJob(job)
      await postResult(job.callbackUrl, result)
    })
  })
  .listen(PORT, () => console.log(`form-probe worker on :${PORT}`))
