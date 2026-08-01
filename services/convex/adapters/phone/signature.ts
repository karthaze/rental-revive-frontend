/* ============================================================
   TWILIO WEBHOOK SIGNATURE — spine conventions: every HTTP
   action verifies its provider's signature before touching
   state; unverified requests are dropped, not queued.
   ------------------------------------------------------------
   Twilio's scheme: X-Twilio-Signature is
   base64( HMAC-SHA1( authToken, url + Σ(key+value sorted by key) ) )
   over the EXACT public callback URL (query string included) and
   the POST form parameters.
   https://www.twilio.com/docs/usage/security#validating-requests
   ============================================================ */

export async function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
}

/** Constant-time comparison — a timing oracle on a webhook signature
    is a signature bypass with extra steps. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export async function verifyTwilioRequest(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false
  return timingSafeEqual(await twilioSignature(authToken, url, params), signature)
}
