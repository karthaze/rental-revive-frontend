/* ============================================================
   ENRICHMENT ANALYSIS — pure, shared between the SPA and Convex
   ------------------------------------------------------------
   The provider calls (Apify, Thum.io) live server-side in
   convex/enrichment/ (AD-13); what lives HERE is everything
   that interprets their output — review normalisation and the
   quote-path signature scan — so the browser and the server
   read provider data through the same eyes and there is no
   second interpretation to drift.

   Same rule as footprint.js one directory over: everything is
   evidence or null. No signature match is ever guessed.
   ============================================================ */

/* ------------------------------------------------------------
   reviews (moved from reviews.js, unchanged in behaviour)
   ------------------------------------------------------------ */

/* Build a Google Maps place URL the Apify actor can resolve. */
export function mapsUrlFor(placeId, url) {
  if (url && /google\.[^/]+\/maps/i.test(url)) return url
  if (placeId) return `https://www.google.com/maps/place/?q=place_id:${placeId}`
  return null
}

/* First non-empty value among candidate keys (supports dotted paths). */
function pick(obj, keys) {
  for (const k of keys) {
    const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), obj)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/* Normalise an actor review item to the app's existing review shape,
   a drop-in for anything already rendering Places reviews. */
export function normalizeReview(item) {
  const rating = Number(pick(item, ['stars', 'rating', 'reviewRating', 'score']))
  if (!Number.isFinite(rating) || rating <= 0) return null
  return {
    author_name: pick(item, ['name', 'author_name', 'reviewerName', 'reviewer.name']) || 'Google User',
    rating: Math.round(rating),
    text: pick(item, ['textTranslated', 'text', 'review', 'reviewText', 'comment']) || '',
    relative_time_description:
      pick(item, ['relativePublishTimeDescription', 'relative_time_description', 'publishAt']) || 'Recent',
    profile_photo_url: pick(item, ['reviewerPhotoUrl', 'profilePhotoUrl', 'profile_photo_url']) || null,
    time: pick(item, ['publishedAtDate', 'time', 'reviewId']) || null,
  }
}

/** Actor dataset → the aggregate the report renders. Handles both
    actor shapes: flat review items, or place objects each carrying a
    nested `reviews` array. */
export function aggregateReviews(data) {
  if (!Array.isArray(data)) return { ok: false, error: 'Unexpected Apify response' }
  const raw = []
  for (const item of data) {
    if (item && Array.isArray(item.reviews)) raw.push(...item.reviews)
    else if (item) raw.push(item)
  }
  const reviews = raw.map(normalizeReview).filter(Boolean)
  if (reviews.length === 0) return { ok: false, error: 'No reviews returned' }

  const positive = reviews.filter((r) => r.rating >= 4).length
  const critical = reviews.filter((r) => r.rating <= 3).length
  const rated = positive + critical
  const average = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
  const posPct = rated ? Math.round((positive / rated) * 100) : 0

  return {
    ok: true,
    total: reviews.length,
    average: Number(average.toFixed(2)),
    positive,
    critical,
    posPct,
    negPct: rated ? 100 - posPct : 0,
    reviews,
  }
}

/* ------------------------------------------------------------
   quote path (moved from crawler.js, unchanged in behaviour)
   ------------------------------------------------------------
   Live chat is a vendor script, not the word "chat" in a
   paragraph; a booking path is a storefront/scheduler/cart
   reference. Raw HTML is required — a tag is a script reference
   and text extraction throws exactly that away.
   ------------------------------------------------------------ */
const CHAT_SIGNATURES = [
  /intercom(cdn|\.io|settings)/i, /js\.driftt\.com|drift\.com\/include/i,
  /embed\.tawk\.to/i, /livechatinc\.com/i, /crisp\.chat/i, /tidiochat|tidio\.co/i,
  /js\.hs-scripts\.com/i, /zdassets\.com|zendesk\.com\/embeddable/i,
  /widget\.podium\.com/i, /fb-customerchat|customerchat\.js/i,
  /olark\.com/i, /smartsupp\.com/i, /gorgias\.chat/i,
]

const BOOKING_SIGNATURES = [
  /calendly\.com/i, /acuityscheduling\.com/i, /squareup\.com\/appointments/i,
  /rentalman|point-of-rental|pointofrental/i,
  /texada|quipli|ezrentout|booqable|rentle/i,
  /add-to-cart|addtocart|woocommerce|shopify/i,
  /\/(book|reserve|rent)-(now|online)\b/i,
]

const FORM_SIGNATURES = [
  /<form[^>]*>/i, /wpcf7|gravityforms|formstack|jotform|typeform|hsforms/i,
]

const QUOTE_INTENT = ['request a quote', 'get a quote', 'request quote', 'rental inquiry', 'request pricing']

const hasAny = (text, needles) => {
  const lower = text.toLowerCase()
  return needles.some((n) => lower.includes(n))
}
const hasAnyPattern = (text, patterns) => patterns.some((re) => re.test(text))

/** Markup + extracted text → the quote-path findings. Pass html=null
    when markup was unavailable and the chat/tracking reads become
    null, not false — the same tri-state law as footprint.js. */
export function analyzeQuotePath(html, text) {
  if (!html) {
    /* text-only: the booking/contact reads are still partly possible,
       the script-signature reads are not. Say so per finding. */
    return {
      foundBooking: hasAny(text || '', ['rent online', 'book online', 'reserve online']),
      foundChat: null,
      foundContact: hasAny(text || '', ['contact us', 'inquiry', 'get a quote']),
      foundQuoteIntent: hasAny(text || '', QUOTE_INTENT),
    }
  }
  const haystack = html + '\n' + (text || '')
  return {
    foundBooking: hasAnyPattern(haystack, BOOKING_SIGNATURES),
    foundChat: hasAnyPattern(haystack, CHAT_SIGNATURES),
    foundContact: hasAnyPattern(html, FORM_SIGNATURES),
    foundQuoteIntent: hasAny(text || '', QUOTE_INTENT),
  }
}
