/* ============================================================
   PLACES — target acquisition & competitor radar
   ------------------------------------------------------------
   The voltbot pattern, ported to heavy machinery rental:

     1. A custom search (our own dropdown, not the stock widget)
        that only surfaces US heavy machinery rental companies.
        A keyword classifier does the filtering — generous on
        positives so we cover most real yards, hard-blocking on
        the verticals that share the word "rental" but not the
        business: cars, parties, apartments, storage, tuxedos.
     2. getDetails lock-on: rating, reviews, address, PHONE —
        so the app can confirm the counter line instead of
        asking for it cold.
     3. An iterative-radius competitor radar: sweep 15 mi, and
        if the market looks thin, widen to 31 mi (the Places
        nearbySearch ceiling). Keywords rotate with the yard's
        segments; national branches get tagged.

   Every entry point degrades gracefully when there is no Maps
   key: the caller gets `false`/empty and runs the manual path.
   ============================================================ */

/* ---------------- classifier ---------------- */

const rx = (words) => new RegExp(`\\b(?:${words.join('|')})\\b`, 'i')

/* The business we are for. This must run against the business NAME,
   not the full prediction description. Full descriptions include
   city/street text, which is how a church in Crane, TX can look like
   a crane company if we are careless. */
const HARD_YES = rx([
  'equipment rentals?', 'equipment rental agenc(?:y|ies)', 'rental equipment',
  'tool rentals?', 'tool stores?', 'hardware stores?', 'rent[- ]?alls?', 'rentall',
  'construction rentals?', 'contractor rentals?', 'industrial rentals?', 'machinery rentals?',
  'rental center', 'rental store', 'rental yards?',
  'crane rentals?', 'crane service', 'crane companies?', 'boom trucks?', 'aerials?', 'boom lifts?', 'scissor lifts?',
  'telehandlers?', 'forklifts?', 'lift rentals?', 'man ?lifts?', 'access equipment',
  'excavators?', 'earthmoving', 'earth moving', 'heavy equipment', 'heavy machinery',
  'machinery', 'skid ?steers?', 'track loaders?', 'backhoes?', 'dozers?', 'trenchers?',
  'compaction', 'rollers?', 'pavers?', 'generators?', 'light towers?', 'air compressors?',
  'pumps? rental', 'dewatering', 'scaffolds?', 'scaffolding', 'hoists?', 'riggings?',
  'machinery mov(?:ers?|ing)', 'plant hire', 'attachments?',
  'construction equipment', 'contractor equipment', 'industrial equipment',
  'equipment supplier', 'construction equipment supplier', 'industrial equipment supplier',
  'material handling equipment', 'forklift dealers?', 'forklift service',
  'aerial lift', 'access platforms?', 'work platforms?', 'mobile elevating work platforms?',
  'generator rentals?', 'temporary power', 'pump rentals?', 'compressor rentals?',
  'trench shoring', 'shoring rentals?', 'traffic control rentals?', 'barricade rentals?',
  'concrete equipment', 'asphalt equipment', 'road equipment',
  'portable toilets?', 'portable restroom', 'storage containers?', 'office trailers?',
  'equipment dealers?', 'machinery dealers?', 'tractor dealers?', 'construction machinery',
  // dealer rental desks + majors read as yards too
  'cat rental', 'united rentals', 'sunbelt', 'herc', 'h ?& ?e equipment', 'equipmentshare',
  'ahern', 'sunstate', 'bigrentz', 'compact power', 'maxim crane', 'tnt crane',
  'all crane', 'bigge', 'barnhart', 'buckner', 'lampson', 'nesco', 'custom truck',
  'texas first rentals?', 'mustang rental', 'warren cat rental', 'holt rental',
])

/* The rental businesses we are NOT for. Word-boundary checked so
   "Riverside Equipment" never trips on "rv". */
const HARD_NO = rx([
  'church(?:es)?', 'temples?', 'mosques?', 'synagogues?', 'ministr(?:y|ies)', 'chapel',
  'school', 'academy', 'college', 'university',
  'restaurant', 'cafe', 'coffee', 'bar ', 'grill', 'pizza', 'tacos?',
  'baby rentals?', 'boutique baby rentals?', 'children(?:s)? rentals?', 'stroller rentals?',
  'car rentals?', 'rent[- ]a[- ]car', 'auto rentals?', 'van rentals?', 'rv rentals?',
  'campers?', 'motorhomes?', 'motorcycles?', 'boats?', 'jet ?skis?', 'kayaks?', 'canoes?',
  'paddle ?boards?', 'bike rentals?', 'bicycles?', 'scooters?', 'mopeds?', 'limos?',
  'limousines?', 'party', 'event rentals?', 'bounce', 'inflatables?', 'karaoke',
  'photo ?booths?', 'weddings?', 'bridal', 'costumes?', 'tuxedos?', 'dress rentals?',
  'furniture rentals?', 'appliance rentals?', 'rent[- ]to[- ]own',
  'self ?storage', 'storage units?', 'apartments?', 'condos?', 'townhomes?',
  'property management', 'real estate', 'vacation rentals?', 'cabin rentals?', 'villas?',
  'u[- ]?haul', 'penske', 'budget truck', 'enterprise rent', 'hertz', 'avis',
  'moving compan(?:y|ies)', 'moving & storage', 'ski rentals?', 'snowboards?', 'surfboards?',
])

const NO_TYPES = new Set([
  'car_rental', 'real_estate_agency', 'lodging', 'travel_agency', 'moving_company',
  'storage', 'clothing_store', 'furniture_store', 'bicycle_store',
  'movie_rental', 'campground', 'rv_park',
  'church', 'place_of_worship', 'school', 'university', 'restaurant', 'food', 'cafe',
  'bar', 'lodging', 'hospital', 'doctor', 'dentist', 'pharmacy', 'physiotherapist',
])

const RENTAL_ADJACENT_TYPES = new Set([
  /* Legacy Places Autocomplete usually returns broad types. Only these
     category-ish types are strong enough to rescue an otherwise opaque name. */
  'hardware_store', 'home_goods_store',
])

const RENTAL_ADJACENT_WORDS = rx([
  'equipment', 'rental', 'rentals?', 'tool', 'tools?', 'hardware', 'contractor',
  'construction', 'industrial', 'machinery', 'crane', 'lift', 'forklift',
])

const TAG_RULES = [
  { tag: 'Crane rental', re: /\b(cranes?|crane service|boom trucks?|rigging|all crane|maxim crane|tnt crane|bigge|barnhart|buckner|lampson)\b/i },
  { tag: 'Aerial rental', re: /\b(aerials?|boom lifts?|scissor lifts?|man ?lifts?|telehandlers?|access equipment)\b/i },
  { tag: 'Earthmoving rental', re: /\b(excavators?|earth ?moving|dozers?|backhoes?|skid ?steers?|track loaders?|trenchers?|heavy equipment|construction equipment)\b/i },
  { tag: 'Forklift rental', re: /\b(forklifts?|material handling)\b/i },
  { tag: 'Tool rental', re: /\b(tool rentals?|tool stores?|hardware stores?|hardware|rent[- ]?alls?|rentall|compact equipment)\b/i },
  { tag: 'Power rental', re: /\b(generators?|light towers?|air compressors?|dewatering|pumps? rental|temp(?:orary)? power)\b/i },
  { tag: 'Roadwork rental', re: /\b(compaction|rollers?|pavers?|concrete|asphalt|road equipment|traffic control|barricade)\b/i },
  { tag: 'Site services', re: /\b(united site services|willscot|mobile mini|site services|portable toilets?|portable restroom|containers?|storage containers?|office trailers?)\b/i },
  { tag: 'Shoring rental', re: /\b(trench safety|trench shoring|shoring rentals?)\b/i },
  { tag: 'Heavy equipment rental', re: /\b(equipment rentals?|rental equipment|texas first rentals?|mustang rental|warren cat rental|holt rental)\b/i },
  { tag: 'Rental yard', re: /\b(equipment rentals?|rental equipment|united rentals|sunbelt|herc|h ?& ?e equipment|equipmentshare|ahern|sunstate|bigrentz|cat rental)\b/i },
  { tag: 'Equipment dealer', re: /\b(cat rental store|wagner equipment|ziegler|holt cat|empire cat|titan machinery|rdo equipment|alta equipment|kirby[- ]smith|equipment dealers?|machinery dealers?|tractor dealers?|equipment supplier)\b/i },
]

export function rentalTag(text, types = []) {
  const t = `${String(text || '')} ${(types || []).join(' ')}`
  return TAG_RULES.find((rule) => rule.re.test(t))?.tag || 'Rental yard'
}

/**
 * 'yes'   — reads as a heavy machinery rental company
 * 'no'    — reads as a different rental vertical entirely
 * 'maybe' — name is opaque ("Smith Brothers Inc"); let it through
 *           with a softer badge rather than hide a real yard.
 */
export function classifyRental(text, types = []) {
  const t = String(text || '')
  if (HARD_NO.test(t) || types.some((ty) => NO_TYPES.has(ty))) return 'no'
  if (HARD_YES.test(t)) return 'yes'
  if (types.some((ty) => RENTAL_ADJACENT_TYPES.has(ty)) && RENTAL_ADJACENT_WORDS.test(t)) return 'yes'
  return 'maybe'
}

/* National / mega-regional branches — the midnight answerers. */
const CHAINS = [
  'united rentals', 'sunbelt', 'herc', 'h&e', 'h & e', 'equipmentshare', 'bigrentz',
  'ahern', 'sunstate', 'compact power', 'home depot', 'lowe', 'maxim crane', 'all crane',
  'all erection', 'tnt crane', 'bigge', 'barnhart', 'buckner', 'lampson', 'deep south',
  'sterling crane', 'bragg', 'nesco', 'custom truck', 'united site services', 'willscot',
  'mobile mini', 'aggreko', 'sunbelt rentals', 'cat rental store', 'wagner equipment',
  'ziegler', 'holt cat', 'empire cat', 'titan machinery', 'rdo equipment', 'alta equipment',
  'kirby-smith', 'kirby smith',
]
export const isNationalChain = (name) => {
  const n = String(name || '').toLowerCase()
  return CHAINS.some((c) => n.includes(c))
}

/* ---------------- maps loader ---------------- */

let mapsPromise = null

const mapsKey = () =>
  import.meta.env.VITE_GOOGLE_MAPS_KEY || import.meta.env.VITE_MAPS_API_KEY || ''

const placeStatusOk = () => google.maps.places.PlacesServiceStatus.OK

const locValue = (location) => {
  if (!location) return null
  const lat = typeof location.lat === 'function' ? location.lat() : location.lat
  const lng = typeof location.lng === 'function' ? location.lng() : location.lng
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

/** Resolves true when google.maps.places is usable, false otherwise. Never rejects. */
export function loadMaps() {
  if (mapsPromise) return mapsPromise
  /* already present (test stub or hand-added script tag) */
  if (window.google?.maps?.places) return (mapsPromise = Promise.resolve(true))
  const key = mapsKey()
  if (!key) return (mapsPromise = Promise.resolve(false))

  mapsPromise = new Promise((resolve) => {
    let settled = false
    const done = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const cbName = '__rrMapsReady'
    window[cbName] = () => done(!!window.google?.maps?.places)

    const existing = [...document.scripts].find((script) =>
      script.src.includes('maps.googleapis.com/maps/api/js') && script.src.includes(encodeURIComponent(key))
    )
    if (existing) {
      existing.addEventListener('load', () => done(!!window.google?.maps?.places), { once: true })
      existing.addEventListener('error', () => done(false), { once: true })
      setTimeout(() => done(!!window.google?.maps?.places), 300)
      return
    }

    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places,geometry&callback=${cbName}&loading=async`
    s.async = true
    s.defer = true
    s.onerror = () => done(false)
    document.head.appendChild(s)
    setTimeout(() => done(!!window.google?.maps?.places), 9000)
  })
  return mapsPromise
}

export const mapsUp = () => !!window.google?.maps?.places

/* Warm-paper map skin so the map sits inside the design instead of
   looking like an embedded default Google map. */
/* ------------------------------------------------------------
   Map skin — dark industrial.

   The first version of this was cream-on-cream to match the
   warm paper palette, and it read as washed out: the map
   dissolved into the page and the pins had nothing to sit
   against, so a live competitor sweep looked like nothing was
   happening. Instrument panels are dark for the same reason
   aircraft ones are — the data has to be the brightest thing
   on the surface.

   So: graphite base, roads lifted just enough to read as a
   street grid, water pushed cold and dark, and every colour
   budget spent on the markers instead. Brand red on this
   ground is unmissable.
   ------------------------------------------------------------ */
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1c1a18' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8b8378' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#15130f' }, { weight: 3 }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b2723' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#211e1a' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6f675d' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#332e29' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4a4038' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a251f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101619' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3f4c52' }] },
  { featureType: 'landscape.natural', stylers: [{ color: '#201e1a' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#232019' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3b352e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a99e90' }] },
]

/* The dark skin needs its own backdrop colour while tiles load,
   otherwise the map flashes cream then goes black. */
export const MAP_BACKDROP = '#1c1a18'

/* ---------------- search (custom dropdown data) ---------------- */

let acService = null
let sessionToken = null

/**
 * US-establishment predictions, classified and ranked: real-looking
 * yards first, opaque names after, other rental verticals dropped.
 * -> [{ placeId, name, detail, kind }]
 */
export function searchYards(input) {
  return new Promise((resolve) => {
    if (!mapsUp() || !input || input.length < 3) return resolve([])
    if (HARD_NO.test(input)) return resolve([])
    acService = acService || new google.maps.places.AutocompleteService()
    sessionToken = sessionToken || new google.maps.places.AutocompleteSessionToken()
    const toRows = (preds) => {
      const seen = new Set()
      return (preds || [])
        .map(({ prediction: p, query }) => {
          const name = p.structured_formatting?.main_text || p.description
          const detail = p.structured_formatting?.secondary_text || ''
          const kind = classifyRental(name, p.types || [])
          const queryIntent = RENTAL_ADJACENT_WORDS.test(query || input)
          const adjacentType = (p.types || []).some((ty) => RENTAL_ADJACENT_TYPES.has(ty))
          return {
            placeId: p.place_id,
            name,
            detail,
            kind,
            accept: kind === 'yes' || (kind === 'maybe' && queryIntent && adjacentType),
            tag: rentalTag(name, p.types || []),
          }
        })
        .filter((r) => r.accept)
        .filter((r) => {
          if (!r.placeId || seen.has(r.placeId)) return false
          seen.add(r.placeId)
          return true
        })
        .sort((a, b) => {
          const q = input.toLowerCase()
          const aStarts = a.name.toLowerCase().startsWith(q) ? -1 : 0
          const bStarts = b.name.toLowerCase().startsWith(q) ? -1 : 0
          return aStarts - bStarts || a.name.localeCompare(b.name)
        })
    }

    const request = (q) => new Promise((res) => {
      acService.getPlacePredictions(
        {
          input: q,
          sessionToken,
          componentRestrictions: { country: 'us' },
          types: ['establishment'],
        },
        (preds, status) => res(status === placeStatusOk() && preds
          ? preds.map((prediction) => ({ prediction, query: q }))
          : [])
      )
    })

    const lower = input.toLowerCase()
    const fallbackInputs = [
      input,
      ...(lower.includes('equipment') && lower.includes('rental') ? [] : [`${input} equipment rental`]),
      ...(lower.includes('heavy equipment') ? [] : [`${input} heavy equipment rental`]),
      ...(lower.includes('construction equipment') ? [] : [`${input} construction equipment rental`]),
      ...(lower.includes('tool') && lower.includes('rental') ? [] : [`${input} tool rental`]),
      ...(lower.includes('hardware') ? [`${input} tool rental`, `${input} equipment rental`] : [`${input} hardware store equipment rental`]),
      ...(lower.includes('crane') ? [input] : [`${input} crane service`, `${input} crane rental`]),
      ...(lower.includes('aerial') || lower.includes('lift') ? [] : [`${input} aerial lift rental`, `${input} boom lift rental`]),
      ...(lower.includes('forklift') ? [] : [`${input} forklift rental`]),
      ...(lower.includes('generator') ? [] : [`${input} generator rental`]),
      ...(lower.includes('compressor') ? [] : [`${input} compressor rental`]),
      ...(lower.includes('pump') ? [] : [`${input} pump rental`]),
      ...(lower.includes('shoring') ? [] : [`${input} trench shoring rental`]),
      ...(lower.includes('scaffold') ? [] : [`${input} scaffolding rental`]),
      ...(lower.includes('concrete') ? [] : [`${input} concrete equipment rental`]),
      ...(lower.includes('traffic') ? [] : [`${input} traffic control rental`]),
      ...(lower.includes('container') ? [] : [`${input} storage container rental`]),
    ]

    Promise.all([...new Set(fallbackInputs)].map(request))
      .then((batches) => resolve(toRows(batches.flat()).slice(0, 7)))
  })
}

/* ---------------- lock-on details ---------------- */

let svc = null
const service = (map) => {
  if (map) svc = new google.maps.places.PlacesService(map)
  if (!svc) svc = new google.maps.places.PlacesService(document.createElement('div'))
  return svc
}

const comp = (components, type) =>
  components?.find((c) => c.types.includes(type))

/** Full lock-on payload for a picked prediction. Resolves null on failure. */
export function placeDetails(placeId, map) {
  return new Promise((resolve) => {
    if (!mapsUp()) return resolve(null)
    service(map).getDetails(
      {
        placeId,
        sessionToken,
        fields: [
          'place_id', 'name', 'geometry', 'rating', 'user_ratings_total',
          'formatted_address', 'formatted_phone_number', 'website', 'types',
          'address_components', 'business_status', 'reviews',
          /* profile completeness + the after-hours narrative. opening_hours
             is Contact data and photos is Basic data — both inside SKU tiers
             this call already pays for, so neither adds a billing tier. */
          'opening_hours', 'photos',
        ],
      },
      (place, status) => {
        sessionToken = null /* session ends at details fetch */
        const loc = locValue(place?.geometry?.location)
        if (status !== placeStatusOk() || !loc) return resolve(null)
        const city = comp(place.address_components, 'locality')?.long_name
          || comp(place.address_components, 'postal_town')?.long_name
          || comp(place.address_components, 'administrative_area_level_2')?.long_name || ''
        const st = comp(place.address_components, 'administrative_area_level_1')?.short_name || ''
        resolve({
          placeId: place.place_id,
          name: place.name,
          lat: loc.lat,
          lng: loc.lng,
          rating: place.rating || 0,
          reviews: place.user_ratings_total || 0,
          reviewsList: place.reviews || [],
          address: place.formatted_address || '',
          phone: place.formatted_phone_number || '',
          website: place.website || '',
          types: place.types || [],
          /* null, not 0 — "we did not get the field" is not "there are none" */
          photoCount: place.photos ? place.photos.length : null,
          openingHours: place.opening_hours
            ? {
                weekdayText: place.opening_hours.weekday_text || [],
                periods: place.opening_hours.periods || [],
              }
            : null,
          city, state: st,
          kind: classifyRental(`${place.name} ${(place.types || []).join(' ')}`, place.types || []),
        })
      }
    )
  })
}

/* ---------------- competitor radar ---------------- */

/* Search keywords rotate with what the yard actually rents. */
const SEGMENT_KEYWORDS = {
  cranes: ['crane rental', 'crane service'],
  earthmoving: ['heavy equipment rental', 'excavator rental'],
  aerial: ['aerial lift rental', 'boom lift rental'],
  compact: ['tool rental', 'skid steer rental'],
  material: ['forklift rental'],
  road: ['construction equipment rental'],
  power: ['generator rental', 'light tower rental'],
  specialty: ['machinery movers', 'crane rigging'],
}

const M_PER_MI = 1609.34
/* nearbySearch hard-caps at 50km — sweep tight first, widen if thin. */
const TIERS_M = [24000, 50000]

const nearby = (map, request) =>
  new Promise((resolve) => {
    service(map).nearbySearch(request, (results, status) =>
      resolve(status === placeStatusOk() && results ? results : [])
    )
  })

const textSearch = (map, request) =>
  new Promise((resolve) => {
    const host = service(map)
    if (typeof host.textSearch !== 'function') return resolve([])
    host.textSearch(request, (results, status) =>
      resolve(status === placeStatusOk() && results ? results : [])
    )
  })

function distMi(a, b) {
  if (google.maps.geometry?.spherical && typeof google.maps.LatLng === 'function') {
    return google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(a.lat, a.lng), new google.maps.LatLng(b.lat, b.lng)
    ) / M_PER_MI
  }
  /* haversine fallback if the geometry lib is absent (test stubs) */
  const R = 3958.8, d = Math.PI / 180
  const dLat = (b.lat - a.lat) * d, dLng = (b.lng - a.lng) * d
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Sweep the radius for competing yards.
 * @param {object} o
 * @param {google.maps.Map} o.map          live map (service host + attribution)
 * @param {{lat,lng,placeId,name}} o.self  the locked-on yard
 * @param {string[]} o.segments            selected segment ids
 * @param {(tierMi:number)=>void} [o.onTier]  called as each ring starts
 * @returns {Promise<{competitors:Array, radiusMi:number}>}
 */
export async function radarScan({ map, self, segments, onTier }) {
  if (!mapsUp() || !Number.isFinite(self?.lat) || !Number.isFinite(self?.lng)) {
    return { competitors: [], radiusMi: 0 }
  }

  const keywords = [...new Set([
    'equipment rental',
    ...segments.flatMap((id) => SEGMENT_KEYWORDS[id] || []),
  ])].slice(0, 4)

  const seen = new Map()
  let radiusMi = 0
  const addPlace = (place) => {
    const id = place.place_id
    if (!id || seen.has(id) || id === self.placeId) return
    const name = place.name || ''
    if (!name || name.toLowerCase() === String(self.name).toLowerCase()) return
    if (place.business_status && place.business_status !== 'OPERATIONAL') return
    const kind = classifyRental(`${name} ${(place.types || []).join(' ')}`, place.types || [])
    if (kind === 'no') return
    const loc = locValue(place.geometry?.location)
    if (!loc) return
    seen.set(id, {
      placeId: id, name,
      rating: place.rating || 0,
      reviews: place.user_ratings_total || 0,
      lat: loc.lat, lng: loc.lng,
      national: isNationalChain(name),
      distance: distMi(self, loc),
      kind,
    })
  }

  for (const radius of TIERS_M) {
    radiusMi = Math.round(radius / M_PER_MI)
    onTier?.(radiusMi)

    const batches = await Promise.all(
      keywords.map((keyword) =>
        nearby(map, { location: { lat: self.lat, lng: self.lng }, radius, keyword })
      )
    )
    batches.flat().forEach(addPlace)
    if (seen.size >= 8) break /* dense market — no need to widen */
  }

  /* nearbySearch can be oddly sparse in rural markets. One text pass gives
     Places another way to surface the obvious "equipment rental near X" yards. */
  if (seen.size < 5 && (self.city || self.state)) {
    const where = [self.city, self.state].filter(Boolean).join(', ')
    const textBatches = await Promise.all(
      keywords.slice(0, 3).map((keyword) =>
        textSearch(map, {
          query: `${keyword} near ${where}`,
          location: { lat: self.lat, lng: self.lng },
          radius: TIERS_M.at(-1),
        })
      )
    )
    textBatches.flat().forEach(addPlace)
  }

  const competitors = [...seen.values()].sort((a, b) => a.distance - b.distance).slice(0, 18)
  return { competitors, radiusMi }
}
