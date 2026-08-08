/* ============================================================
   SITE FETCH — the mirror contract and the tag scan
   ------------------------------------------------------------
   Two promises under test:
     1. fetchSiteHtml returns real HTML or null — a mirror's own
        error page must never impersonate the yard's site.
     2. buildAudit, fed HTML that carries a Facebook Pixel, says
        so — with the pixel id — and stays honest on garbage.
   Everything here is injected: no network, no DOM.
   ============================================================ */
import { describe, test, expect } from 'vitest'
import { fetchSiteHtml, buildAudit, looksLikeHtml, htmlToText } from './fetchsite.js'

const PAGE = (head = '', body = '') =>
  `<!doctype html><html><head><title>Acme Crane Rental</title>${head}</head>` +
  `<body>${body}${'x'.repeat(300)}</body></html>`

const PIXEL_HEAD = `
  <script>
    !function(f,b,e,v,n,t,s){/* … */}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '128745910387251');
    fbq('track', 'PageView');
  </script>`

const ok = (bodyText) => ({ ok: true, text: async () => bodyText })
const fail = () => { throw new Error('network down') }

describe('fetchSiteHtml — the mirror contract', () => {
  test('returns HTML from the first mirror that answers', async () => {
    const got = await fetchSiteHtml('https://acme.example', {
      fetchFn: async () => ok(PAGE()),
      mirrors: [(u) => `https://mirror-a.test/?${u}`],
    })
    expect(got).not.toBeNull()
    expect(got.html).toContain('Acme Crane Rental')
    expect(got.via).toBe('mirror-a.test')
  })

  test('falls through a dead mirror to the next one', async () => {
    const calls = []
    const got = await fetchSiteHtml('https://acme.example', {
      fetchFn: async (url) => { calls.push(url); if (url.includes('mirror-a')) fail(); return ok(PAGE()) },
      mirrors: [(u) => `https://mirror-a.test/?${u}`, (u) => `https://mirror-b.test/?${u}`],
    })
    expect(calls).toHaveLength(2)
    expect(got?.via).toBe('mirror-b.test')
  })

  test('a mirror error page is not the yard\'s site', async () => {
    for (const junk of ['error code: 521', '{"error":"upgrade your plan"}', '']) {
      const got = await fetchSiteHtml('https://acme.example', {
        fetchFn: async () => ok(junk),
        mirrors: [(u) => `https://mirror-a.test/?${u}`],
      })
      expect(got).toBeNull()
    }
  })

  test('non-2xx answers and total failure resolve to null, never throw', async () => {
    const got = await fetchSiteHtml('https://acme.example', {
      fetchFn: async (url) => (url.includes('mirror-a') ? { ok: false, text: async () => '' } : fail()),
      mirrors: [(u) => `https://mirror-a.test/?${u}`, (u) => `https://mirror-b.test/?${u}`],
    })
    expect(got).toBeNull()
  })
})

describe('buildAudit — the tag scan through the shared interpreters', () => {
  test('detects a Facebook Pixel and extracts its id', () => {
    const audit = buildAudit(PAGE(PIXEL_HEAD))
    expect(audit.measured).toBe(true)
    const px = audit.trackers.trackers.facebookPixel
    expect(px.detected).toBe(true)
    expect(px.id).toBe('128745910387251')
  })

  test('detects a Shopify web-pixel config carrying a Facebook Pixel', () => {
    /* the served-HTML dialect observed live on brooklinen.com: no
       fbevents.js anywhere, just escaped pixel-loader JSON */
    const head = `<script>webPixelsManagerAPI.publish({"configuration":
      "{\\"pixel_id\\":\\"847463095293947\\",\\"pixel_type\\":\\"facebook_pixel\\"}"})</script>`
    const audit = buildAudit(PAGE(head))
    const px = audit.trackers.trackers.facebookPixel
    expect(px.detected).toBe(true)
    expect(px.id).toBe('847463095293947')
  })

  test('a page with no tags reads as measured-and-missing, not unknown', () => {
    const audit = buildAudit(PAGE('', '<p>Cranes and boom lifts for rent.</p>'))
    expect(audit.measured).toBe(true)
    expect(audit.trackers.trackers.facebookPixel.detected).toBe(false)
    expect(audit.trackers.trackers.ga4.detected).toBe(false)
  })

  test('garbage in → null out; nothing is fabricated', () => {
    expect(buildAudit(null)).toBeNull()
    expect(buildAudit('error code: 521')).toBeNull()
  })

  test('quote-path reads ride along on the same HTML', () => {
    const audit = buildAudit(PAGE('', '<form action="/contact"><input/></form><p>Request a quote</p>'))
    expect(audit.foundContact).toBe(true)
    expect(audit.foundQuoteIntent).toBe(true)
  })
})

describe('the small parts', () => {
  test('looksLikeHtml wants a real document of real size', () => {
    expect(looksLikeHtml(PAGE())).toBe(true)
    expect(looksLikeHtml('<html>tiny</html>')).toBe(false)
    expect(looksLikeHtml('a'.repeat(500))).toBe(false)
    expect(looksLikeHtml(null)).toBe(false)
  })

  test('htmlToText strips scripts before the phrase checks see them', () => {
    const text = htmlToText(PAGE(PIXEL_HEAD, '<p>Request a quote</p>'))
    expect(text).toContain('Request a quote')
    expect(text).not.toContain('fbq')
  })
})
