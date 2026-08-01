/* The shared interpretation layer (../../../common/enrich.js) — one
   reading of provider output for browser and server both. */
import { describe, expect, test } from 'vitest'
import { aggregateReviews, analyzeQuotePath, mapsUrlFor } from '../../../common/enrich.js'

describe('mapsUrlFor', () => {
  test('prefers a real Maps URL, falls back to placeId, then null', () => {
    expect(mapsUrlFor('pid', 'https://www.google.com/maps/place/x')).toBe(
      'https://www.google.com/maps/place/x',
    )
    expect(mapsUrlFor('pid', 'https://bestforkliftrentals.com')).toBe(
      'https://www.google.com/maps/place/?q=place_id:pid',
    )
    expect(mapsUrlFor('', null)).toBeNull()
  })
})

describe('aggregateReviews', () => {
  test('handles flat actor items', () => {
    const r = aggregateReviews([
      { stars: 5, name: 'A', text: 'great' },
      { stars: 4, name: 'B', text: 'good' },
      { stars: 2, name: 'C', text: 'slow' },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.total).toBe(3)
      expect(r.average).toBe(3.67)
      expect(r.posPct).toBe(67) // 2 of 3 rated ≥4
      expect(r.reviews![0]!.author_name).toBe('A')
    }
  })

  test('handles place objects carrying nested reviews arrays', () => {
    const r = aggregateReviews([{ reviews: [{ rating: 5 }, { rating: 1 }] }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.total).toBe(2)
  })

  test('empty or malformed input is an error, never a fabricated aggregate', () => {
    expect(aggregateReviews([]).ok).toBe(false)
    expect(aggregateReviews([{ noRating: true }]).ok).toBe(false)
    expect(aggregateReviews('nope' as unknown as unknown[]).ok).toBe(false)
  })
})

describe('analyzeQuotePath', () => {
  test('vendor script signatures, not keywords', () => {
    const html = '<html><script src="https://embed.tawk.to/x/1.js"></script>' +
      '<form action="/contact"></form><a href="https://calendly.com/yard">book</a></html>'
    const r = analyzeQuotePath(html, 'Request a quote today')
    expect(r.foundChat).toBe(true)
    expect(r.foundBooking).toBe(true)
    expect(r.foundContact).toBe(true)
    expect(r.foundQuoteIntent).toBe(true)
  })

  test('the word "chat" in prose is not a chat widget', () => {
    const r = analyzeQuotePath('<html><p>chat with us anytime</p></html>', 'chat with us')
    expect(r.foundChat).toBe(false)
  })

  test('no markup → the script reads are null, not false (AD-16)', () => {
    const r = analyzeQuotePath(null, 'contact us to rent online')
    expect(r.foundChat).toBeNull()
    expect(r.foundBooking).toBe(true) // text read is still possible
    expect(r.foundContact).toBe(true)
  })
})
