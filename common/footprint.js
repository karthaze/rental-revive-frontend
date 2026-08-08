/* ============================================================
   THE DIGITAL FOOTPRINT
   ------------------------------------------------------------
   Three questions about how a yard shows up online, answered
   from data we already pay for:

     1. WEBSITE      is there actually a website, or does the
                     Google profile point at a Facebook page?
     2. COMPLETENESS how much of the Google Business Profile is
                     filled in — the scorecard, rental-tuned
     3. TRACKING     Facebook Pixel, Google tag, Google Ads,
                     GA4 — can this yard measure anything at all?

   ONE RULE, inherited from VOLTBOT the hard way: never fabricate
   a detection. Every result here is tri-state —

     true   = found it, with evidence
     false  = looked properly, not there
     null   = could not look

   `null` is not `false`. A yard told "no Facebook Pixel found"
   when we never fetched their HTML is being lied to, and this
   whole product is sold on numbers the owner can audit.
   ============================================================ */

/* ------------------------------------------------------------
   1. what is actually in the website field
   ------------------------------------------------------------
   A rental yard whose Google profile links a Facebook page has
   no quote path at all — the customer cannot ask for a price
   without a login. That is a finding, not a missing field.
   ------------------------------------------------------------ */
const SOCIAL_HOSTS = [
  ['facebook.com', 'Facebook'], ['fb.com', 'Facebook'], ['fb.me', 'Facebook'],
  ['instagram.com', 'Instagram'], ['linkedin.com', 'LinkedIn'],
  ['twitter.com', 'X'], ['x.com', 'X'], ['tiktok.com', 'TikTok'],
  ['youtube.com', 'YouTube'], ['nextdoor.com', 'Nextdoor'],
]

const LINK_HOSTS = [
  ['linktr.ee', 'Linktree'], ['bio.link', 'Bio.link'], ['beacons.ai', 'Beacons'],
  ['about.me', 'About.me'], ['carrd.co', 'Carrd'],
]

/* Someone else's storefront: the yard is a tenant, not an owner. */
const MARKETPLACE_HOSTS = [
  ['yelp.com', 'Yelp'], ['bbb.org', 'BBB'], ['manta.com', 'Manta'],
  ['yellowpages.com', 'Yellow Pages'], ['thumbtack.com', 'Thumbtack'],
  ['machinerytrader.com', 'Machinery Trader'], ['rentalyard.com', 'RentalYard'],
  ['equipmenttrader.com', 'Equipment Trader'], ['google.com', 'Google'],
]

const matchHost = (host, table) => table.find(([h]) => host === h || host.endsWith('.' + h))

/**
 * Classify whatever Google has in the `website` field.
 * @returns {{kind:'site'|'social'|'linkhub'|'marketplace'|'none', platform:string, url:string, host:string, auditable:boolean}}
 */
export function classifyWebsite(raw) {
  const value = String(raw || '').trim()
  if (!value) {
    return { kind: 'none', platform: '', url: '', host: '', auditable: false }
  }

  let url = value
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  let host
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return { kind: 'none', platform: '', url: '', host: '', auditable: false }
  }

  const social = matchHost(host, SOCIAL_HOSTS)
  if (social) return { kind: 'social', platform: social[1], url, host, auditable: false }

  const hub = matchHost(host, LINK_HOSTS)
  if (hub) return { kind: 'linkhub', platform: hub[1], url, host, auditable: false }

  const market = matchHost(host, MARKETPLACE_HOSTS)
  if (market) return { kind: 'marketplace', platform: market[1], url, host, auditable: false }

  return { kind: 'site', platform: '', url, host, auditable: true }
}

/* The owner-facing reading of that classification. */
export function websiteVerdict(site) {
  switch (site.kind) {
    case 'none':
      return {
        headline: 'No website on your Google profile',
        body: 'Someone who finds you on Google has exactly one way to reach you: the phone. Every leak in this scan gets worse when the phone is the only door.',
        tone: 'bad',
      }
    case 'social':
      return {
        headline: `Your Google profile points at ${site.platform}, not a website`,
        body: `A customer who wants a price has to message you on ${site.platform} and wait. There is no quote form to fill in, no after-hours path, and nothing you can instrument or measure.`,
        tone: 'bad',
      }
    case 'linkhub':
      return {
        headline: `Your Google profile points at a ${site.platform} page`,
        body: 'One more tap between a customer and a quote, and no inquiry form behind it.',
        tone: 'warn',
      }
    case 'marketplace':
      return {
        headline: `Your Google profile points at your ${site.platform} listing`,
        body: `That is ${site.platform}'s page, not yours. You cannot change the quote path on it and you cannot measure who left.`,
        tone: 'warn',
      }
    default:
      return { headline: '', body: '', tone: 'good' }
  }
}

/* ------------------------------------------------------------
   2. Google Business Profile completeness
   ------------------------------------------------------------
   Adapted from VOLTBOT's listing scorecard. The thresholds are
   re-cut for machinery yards: an industrial yard does not carry
   a gym's review volume or its star average, so scoring it on
   gym numbers would manufacture a failing grade.

   Thresholds BENCHMARKED 2026-08-06 against published Google
   Business Profile studies (values held, no longer guesses):

   photos 10        10+ photos ≈ 2× engagement (calls + messages);
                    the average verified profile has under one photo,
                    so 10 is a real bar without being punitive.
   photosStrong 20  20+ photos earn ~18% more clicks; home-services
                    profiles average ~70, so 20 is still modest.
   reviews 25       59% of consumers only trust a star rating backed
                    by 20+ reviews; the average local business holds
                    ~39. 25 sits above the trust floor and below the
                    average — a yard failing it genuinely looks thin.
   rating 4.0       consumers discount ratings below 4.0 outright;
                    the most-trusted band is 4.2–4.5. 4.0 is the
                    published trust floor, not a style choice.

   Still worth re-cutting against a metro sweep of actual machinery
   yards when one exists — these are cross-industry local-business
   numbers.
   ------------------------------------------------------------ */
export const PROFILE_THRESHOLDS = {
  photos: 10,
  photosStrong: 20,
  reviews: 25,
  rating: 4.0,
}

export function scoreProfile(place) {
  const photoCount = place.photoCount ?? null
  const reviewCount = place.reviews || 0
  const site = classifyWebsite(place.website)
  const hours = place.openingHours || null

  const checks = [
    {
      id: 'name',
      label: 'Business name',
      value: place.name || null,
      ok: !!place.name,
    },
    {
      id: 'address',
      label: 'Full address',
      value: place.address || null,
      ok: !!place.address,
    },
    {
      id: 'phone',
      label: 'Phone number',
      value: place.phone || null,
      ok: !!place.phone,
      tip: !place.phone
        ? 'No number on your profile. A customer who wants a machine today cannot reach you at all.'
        : null,
    },
    {
      id: 'website',
      label: 'Website link',
      /* a social link is a *populated* field that still fails the check */
      value: site.kind === 'site' ? site.host
        : site.kind === 'none' ? null
        : `${site.platform} link`,
      ok: site.kind === 'site',
      tip: site.kind !== 'site' ? websiteVerdict(site).headline : null,
    },
    {
      id: 'hours',
      label: 'Opening hours',
      value: hours?.weekdayText?.length ? `${hours.weekdayText.length} day schedule published` : null,
      ok: !!hours,
      tip: !hours
        ? 'With no published hours Google leaves you out of "open now" searches, the exact search a contractor runs when a machine goes down.'
        : null,
    },
    {
      id: 'categories',
      label: 'Categories',
      value: (place.types || []).length
        ? place.types.slice(0, 3).map((t) => t.replace(/_/g, ' ')).join(', ')
        : null,
      ok: (place.types || []).length > 0,
    },
    {
      id: 'photos',
      label: 'Photos',
      /* null, not 0 — an unrequested field is not an empty one */
      value: photoCount === null ? null : `${photoCount} on file`,
      ok: photoCount === null ? null : photoCount >= PROFILE_THRESHOLDS.photos,
      tip: photoCount !== null && photoCount < PROFILE_THRESHOLDS.photos
        ? `Under ${PROFILE_THRESHOLDS.photos} photos. Contractors want to see the iron before they call. ${PROFILE_THRESHOLDS.photosStrong}+ shots of real machines is the bar.`
        : null,
    },
    {
      id: 'rating',
      label: 'Star rating',
      value: place.rating ? `${place.rating.toFixed(1)} of 5.0` : null,
      ok: place.rating ? place.rating >= PROFILE_THRESHOLDS.rating : null,
      tip: place.rating && place.rating < PROFILE_THRESHOLDS.rating
        ? 'Below the local trust band. Answer the critical reviews in public. Silence reads as agreement.'
        : null,
    },
    {
      id: 'reviews',
      label: 'Review volume',
      value: reviewCount ? `${reviewCount} reviews` : null,
      ok: reviewCount >= PROFILE_THRESHOLDS.reviews,
      tip: reviewCount < PROFILE_THRESHOLDS.reviews
        ? `Under ${PROFILE_THRESHOLDS.reviews} reviews. Ask the accounts that rent from you every month. They will say yes.`
        : null,
    },
  ]

  /* A manual yard has no Google profile behind it — fields we never
     fetched are unmeasured, not missing (the tri-state law again).
     What the owner actually typed stands: the name, and the website
     when the scan asked for one. */
  if (place.manual) {
    for (const c of checks) {
      if (c.id !== 'name' && c.id !== 'website') {
        c.ok = null
        c.value = null
        c.tip = null
      }
    }
  }

  /* `ok === null` means unmeasured: it counts toward neither side */
  const measured = checks.filter((c) => c.ok !== null)
  const passed = measured.filter((c) => c.ok)

  return {
    checks,
    passed: passed.length,
    measured: measured.length,
    unmeasured: checks.length - measured.length,
    pct: measured.length ? Math.round((passed.length / measured.length) * 100) : null,
    gaps: measured.filter((c) => !c.ok).map((c) => c.label),
    website: site,
  }
}

/* ------------------------------------------------------------
   3. marketing tracking
   ------------------------------------------------------------
   Signatures run over raw HTML and, when available, the list of
   network requests the page fired. Requests are the stronger
   evidence: a tag injected by Google Tag Manager at runtime is
   invisible in the served HTML but unmistakable in the request
   log.

   Every entry answers with evidence or with null. See the file
   header — `null` is not `false`.
   ------------------------------------------------------------ */
const SIGNATURES = [
  {
    id: 'facebookPixel',
    label: 'Facebook Pixel',
    /* Two dialects in the wild: the classic pasted snippet (fbevents.js
       + fbq calls) and platform pixel-loader config — Shopify web
       pixels ship `"pixel_type":"facebook_pixel"` in served JSON and
       load fbevents at runtime, so the script reference never appears
       in the HTML. Observed live on brooklinen.com 2026-08-08. The
       JSON often arrives escaped inside a script string, hence the
       optional backslashes. */
    html: [
      /connect\.facebook\.net\/[^"']*fbevents\.js/i,
      /\bfbq\s*\(/,
      /_fbq\b/,
      /pixel_type\\?["']\s*:\s*\\?["']facebook_pixel/i,
    ],
    requests: [/facebook\.com\/tr\?/i, /connect\.facebook\.net/i],
    id_pattern: [
      /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/i,
      /pixel_id\\?["']\s*:\s*\\?["'](\d{10,20})\\?["'][^{}]{0,160}?facebook_pixel/i,
      /facebook_pixel[^{}]{0,160}?pixel_id\\?["']\s*:\s*\\?["'](\d{10,20})/i,
    ],
  },
  {
    id: 'googleTagManager',
    label: 'Google Tag Manager',
    html: [/googletagmanager\.com\/gtm\.js/i, /\bGTM-[A-Z0-9]{4,}\b/],
    requests: [/googletagmanager\.com\/gtm\.js/i],
    id_pattern: /\b(GTM-[A-Z0-9]{4,})\b/,
  },
  {
    id: 'ga4',
    label: 'Google Analytics 4',
    html: [/googletagmanager\.com\/gtag\/js\?id=G-/i, /\bG-[A-Z0-9]{8,}\b/],
    requests: [/google-analytics\.com\/g\/collect/i, /googletagmanager\.com\/gtag\/js/i],
    id_pattern: /\b(G-[A-Z0-9]{8,})\b/,
  },
  {
    id: 'googleAds',
    label: 'Google Ads conversion tag',
    html: [/\bAW-\d{9,}\b/, /googleadservices\.com/i],
    requests: [/googleads\.g\.doubleclick\.net/i, /googleadservices\.com/i],
    id_pattern: /\b(AW-\d{9,})\b/,
  },
  /* Universal Analytics was REMOVED 2026-08-06. It was retired by
     Google in 2023/24; a signal whose absence means nothing and whose
     presence means "counting nothing" earned a permanent dead row in
     the scorecard. If a yard is running only a dead UA tag, the
     GA4-missing row already tells the true story: no working
     analytics. */
]

/**
 * @param {string|null} html raw served HTML, or null if we could not fetch it
 * @param {string[]|null} requests network request URLs, or null if unobserved
 */
export function detectTrackers(html, requests = null) {
  const haveHtml = typeof html === 'string' && html.length > 0
  const haveRequests = Array.isArray(requests) && requests.length > 0

  /* Nothing to look at — report unknown across the board rather
     than a clean bill of health nobody earned. */
  if (!haveHtml && !haveRequests) {
    const unknown = {}
    for (const sig of SIGNATURES) {
      unknown[sig.id] = { label: sig.label, detected: null, evidence: null, id: null }
    }
    return { measured: false, trackers: unknown }
  }

  const trackers = {}
  for (const sig of SIGNATURES) {
    let evidence = null

    if (haveRequests) {
      const hit = requests.find((u) => sig.requests.some((re) => re.test(u)))
      if (hit) evidence = { source: 'request', detail: hit.slice(0, 200) }
    }
    if (!evidence && haveHtml) {
      const re = sig.html.find((r) => r.test(html))
      if (re) evidence = { source: 'html', detail: String(html.match(re)?.[0] || '').slice(0, 200) }
    }

    let found = null
    if (evidence && haveHtml && sig.id_pattern) {
      /* a signature may know several id dialects — first hit wins */
      for (const pat of [sig.id_pattern].flat()) {
        found = html.match(pat)?.[1] || null
        if (found) break
      }
    }

    trackers[sig.id] = {
      label: sig.label,
      detected: !!evidence,
      evidence,
      id: found,
    }
  }

  return { measured: true, trackers }
}

/**
 * What tracking absence means for the owner. The point is not that
 * pixels are good — it is that a yard with no tags cannot see its
 * own leak, which is why it takes a stranger's word for it.
 */
export function trackingVerdict(result) {
  if (!result || !result.measured) {
    return {
      headline: 'Tracking not measured',
      body: 'We could not read your site this scan, so we are not going to tell you what is or is not installed on it.',
      tone: 'unknown',
      blind: null,
    }
  }

  const t = result.trackers
  const anyGoogle = t.ga4.detected || t.googleTagManager.detected
  const retargeting = t.facebookPixel.detected || t.googleAds.detected

  if (!anyGoogle && !retargeting) {
    return {
      headline: 'No analytics and no retargeting on your site',
      body: 'Nothing is counting your visitors, so nobody, you included, knows how many people looked for a machine and left without calling. That is the leak you cannot argue about, because there is no record of it either way.',
      tone: 'bad',
      blind: true,
    }
  }
  if (anyGoogle && !retargeting) {
    return {
      headline: 'You can count visitors, but you cannot follow them',
      body: 'Analytics is installed, so you can see traffic. But with no retargeting tag, a contractor who leaves your site without calling is gone for good.',
      tone: 'warn',
      blind: false,
    }
  }
  if (!anyGoogle && retargeting) {
    return {
      headline: 'You are running ads you cannot measure',
      body: 'A retargeting tag is installed with no analytics behind it. Spend goes out, and nothing tells you what came back.',
      tone: 'warn',
      blind: true,
    }
  }
  return {
    headline: 'Your site is instrumented',
    body: 'Analytics and retargeting are both live, which means the numbers in this scan can be checked against your own data rather than taken on faith.',
    tone: 'good',
    blind: false,
  }
}
