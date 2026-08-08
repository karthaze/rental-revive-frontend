/* ============================================================
   GATE CLASSIFIER — who gets to appear in the search list
   ------------------------------------------------------------
   The bug this guards against: a real yard named "ABC Rentals"
   with the Google category "Equipment rental agency" was hidden
   because the bare word "Rentals" is not in HARD_YES and the
   old acceptance gate demanded a hardware-store type. The
   classifier's own law: soft-badge an opaque name, never hide
   a real yard.
   ============================================================ */
import { describe, test, expect } from 'vitest'
import { classifyRental, rentalTag } from './places.js'

describe('classifyRental', () => {
  test('the Google category alone certifies an opaque name', () => {
    expect(classifyRental('Smith Brothers Inc', ['establishment', 'equipment_rental_agency'])).toBe('yes')
    expect(classifyRental('B&B Services', ['tool_rental_service'])).toBe('yes')
    expect(classifyRental('Delta Co', ['crane_rental_agency'])).toBe('yes')
  })

  test('rental-flavored names stay maybe, never no', () => {
    expect(classifyRental('ABC Rentals', ['establishment', 'point_of_interest'])).toBe('maybe')
    expect(classifyRental('A-1 Rental', [])).toBe('maybe')
  })

  test('clear equipment names read yes on the name alone', () => {
    expect(classifyRental('ACME Equipment Rentals', [])).toBe('yes')
    expect(classifyRental('Sunbelt Rentals', [])).toBe('yes')
  })

  test('the wrong verticals stay out, category or not', () => {
    expect(classifyRental('First Baptist Church', ['church'])).toBe('no')
    expect(classifyRental('Party Time Rentals', [])).toBe('no')
    expect(classifyRental('Coastal RV Rentals', [])).toBe('no')
    /* the church-in-Crane guard: the NAME rules, not the town */
    expect(classifyRental('Grace Chapel', ['place_of_worship', 'equipment_rental_agency'])).toBe('no')
  })
})

describe('rentalTag', () => {
  test('underscored API types read as words', () => {
    expect(rentalTag('Smith Brothers Inc', ['equipment_rental_agency'])).toBe('Heavy equipment rental')
  })
  test('name evidence still wins the specific tag', () => {
    expect(rentalTag('Lone Star Crane Service', [])).toBe('Crane rental')
  })
})
