/* ============================================================
   SITE FETCH — keyless homepage read, isolated and injectable
   ------------------------------------------------------------
   The tracking scan (Facebook Pixel, GTM, GA4, Ads tag) needs the
   yard's served HTML, and a browser cannot fetch a third-party
   site directly — CORS. The real crawl lives server-side in
   services/convex/enrichment/crawl.ts (AD-13), but when no backend
   is configured this module reads the same HTML through public
   CORS mirrors instead. No token is involved, so the concern that
   moved crawling server-side (leaked provider secrets) does not
   apply; the mirrors are keyless and interchangeable.

   The honesty rule of crawler.js carries over: this module returns
   real HTML or null — it never synthesizes, and a mirror's own
   error page is rejected by shape before it can impersonate the
   yard's site. Interpretation stays in the shared pure modules
   (enrich.js, footprint.js) via buildAudit, so browser and server
   still read markup through the same eyes.

   Everything impure arrives as an argument (fetchFn, mirrors,
   timeoutMs) — the tests inject fakes, the app takes defaults.
   ============================================================ */
import { analyzeQuotePath } from '../../../common/enrich.js'
import { detectTrackers } from '../../../common/footprint.js'

/* same ceiling as the server crawl. Sized for modern page weight:
   brooklinen.com serves 1.6MB and its pixel config sat beyond the old
   400k cap — a real detection lost to truncation, not to absence. */
const MAX_HTML = 2_000_000

/* Ordered by observed reliability. allorigins serves any client;
   corsproxy.io's free tier answers browsers only, which is exactly
   where this module runs. */
export const MIRRORS = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
]

/** A mirror that fails often returns its OWN page — JSON errors,
    "error code: 521" text, empty bodies. Only a document that is
    recognizably HTML may speak for the yard's site. */
export function looksLikeHtml(s) {
  if (typeof s !== 'string' || s.length < 200) return false
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(s)
}

/** Served HTML → the visible-ish text analyzeQuotePath expects.
    Rough is fine: the text side feeds phrase checks, not rendering. */
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|#160);/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Fetch a site's homepage HTML through the first mirror that answers
 * with something HTML-shaped. Resolves to { html, via } or null —
 * null means "could not read", never "read and found nothing".
 */
export async function fetchSiteHtml(url, {
  fetchFn = (...a) => fetch(...a),
  mirrors = MIRRORS,
  timeoutMs = 12_000,
  onAttempt = () => {},
} = {}) {
  for (const mirror of mirrors) {
    const target = mirror(url)
    onAttempt(target)
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
    try {
      const res = await fetchFn(target, ctrl ? { signal: ctrl.signal } : {})
      if (!res.ok) continue
      const html = await res.text()
      if (looksLikeHtml(html)) {
        return { html: html.slice(0, MAX_HTML), via: new URL(target).hostname }
      }
    } catch {
      /* timeout or network — try the next mirror */
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  return null
}

/** HTML → the exact result shape the server crawl returns, through
    the same shared interpreters. null html → null (caller reports
    unmeasured; nothing is fabricated here). */
export function buildAudit(html) {
  if (!looksLikeHtml(html)) return null
  return {
    ok: true,
    measured: true,
    ...analyzeQuotePath(html, htmlToText(html)),
    trackers: detectTrackers(html, null),
  }
}
