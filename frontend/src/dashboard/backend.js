/* ============================================================
   PROBE BACKEND CLIENT — Convex + Clerk, honestly degraded
   ------------------------------------------------------------
   Same discipline as places.js's loadMaps(): every entry point
   resolves null instead of throwing when the backend is not
   configured, and every consumer checks before rendering a
   single pixel of probe UI. With no VITE_CONVEX_URL the scan
   behaves byte-for-byte as it does today — the proof gate simply
   never appears.

   Only two values are public here, and both are meant to be:
   the Convex deployment URL and Clerk's publishable key. Every
   secret lives server-side (AD-13).

   Clerk setup this expects (documented, not assumed):
   - a Clerk app with magic-link email enabled (PRD Q5: Clerk,
     magic link)
   - a Convex-template JWT ("convex") configured in Clerk, and
     the Clerk issuer configured in the Convex dashboard's auth
     settings — the standard Clerk⇄Convex pairing.
   ============================================================ */
import { anyApi } from 'convex/server'

/* The untyped api reference — path-based, resolved server-side. The
   typed _generated/api is a TS artifact; the browser bundle only ever
   needs the function paths. */
export const api = anyApi

export const probeConfigured = () => !!import.meta.env.VITE_CONVEX_URL

let convexClient = null
export async function getConvex() {
  if (!probeConfigured()) return null
  if (convexClient) return convexClient
  const { ConvexClient } = await import('convex/browser')
  convexClient = new ConvexClient(import.meta.env.VITE_CONVEX_URL)
  return convexClient
}

/* ------------------------------------------------------------
   Clerk, loaded from its CDN the way places.js loads Maps —
   the frontend-API domain is encoded in the publishable key.
   ------------------------------------------------------------ */
let clerkPromise = null

function clerkDomain(publishableKey) {
  try {
    /* pk_test_<base64(frontend-api-domain)$> */
    const b64 = publishableKey.split('_')[2]
    return atob(b64).replace(/\$$/, '')
  } catch {
    return null
  }
}

export function loadClerk() {
  if (clerkPromise) return clerkPromise
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  const domain = key ? clerkDomain(key) : null
  if (!key || !domain) return Promise.resolve(null)

  clerkPromise = new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = `https://${domain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
    s.async = true
    s.crossOrigin = 'anonymous'
    s.setAttribute('data-clerk-publishable-key', key)
    s.onload = async () => {
      try {
        await window.Clerk.load()
        resolve(window.Clerk)
      } catch {
        resolve(null)
      }
    }
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
  return clerkPromise
}

/** Signed-in Clerk instance or null — opens the sign-in flow when
    needed. FR2: activation is authenticated or it does not happen. */
export async function ensureAuth() {
  const clerk = await loadClerk()
  if (!clerk) return null
  if (clerk.user) return clerk
  await clerk.openSignIn({})
  /* openSignIn resolves immediately; wait for the session */
  return new Promise((resolve) => {
    const off = clerk.addListener(({ user }) => {
      if (user) {
        off()
        resolve(clerk)
      }
    })
  })
}

/** A Convex client that presents the Clerk identity. */
export async function getAuthedConvex() {
  const [convex, clerk] = await Promise.all([getConvex(), loadClerk()])
  if (!convex || !clerk) return null
  convex.setAuth(async () => (await clerk.session?.getToken({ template: 'convex' })) ?? null)
  return convex
}
