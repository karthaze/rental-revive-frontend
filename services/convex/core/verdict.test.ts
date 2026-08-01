/* The verdict fold — FR23 counts, NFR7's split enforced as arithmetic. */
import { describe, expect, test } from 'vitest'
import { foldVerdict, type AttemptSlice } from './verdict'

const phone = (over: Partial<AttemptSlice>): AttemptSlice => ({
  channel: 'phone',
  window: 'business',
  outcome: null,
  dispatchedAt: 1000,
  metrics: {},
  ...over,
})
const email = (over: Partial<AttemptSlice>): AttemptSlice => ({
  channel: 'email',
  window: null,
  outcome: null,
  dispatchedAt: 1000,
  metrics: {},
  ...over,
})
const form = (over: Partial<AttemptSlice>): AttemptSlice => ({
  channel: 'form',
  window: null,
  outcome: null,
  dispatchedAt: 1000,
  metrics: {},
  ...over,
})

describe('foldVerdict', () => {
  test('the FR23 headline counts, with our failures in their own column', () => {
    const fold = foldVerdict([
      phone({ outcome: 'responded', metrics: { answeredBy: 'human', msToAnswer: 8000 } }),
      phone({ outcome: 'no_response', window: 'lunch', metrics: { answeredBy: 'voicemail' } }),
      email({ outcome: 'undeliverable_ours' }), // spam-foldered — OUR fault
      form({ outcome: 'no_response' }),
    ])
    expect(fold.counts).toEqual({
      dispatched: 4,
      reachedHuman: 1,
      noResponse: 2,
      unreachableOurs: 1,
    })
  })

  test('undeliverable_ours never enters the measured shape (AD-2)', () => {
    const fold = foldVerdict([
      phone({ outcome: 'undeliverable_ours' }), // carrier spam-label
      phone({ outcome: 'no_response', window: 'lunch' }),
      email({ outcome: 'undeliverable_ours' }),
    ])
    // one valid phone attempt, not two — the spam-labelled dial is not
    // evidence about the yard
    expect(fold.measured.phone).toEqual({ valid: 1, reachedHuman: 0, afterHours: null })
    // the only async attempt was our failure → async unmeasured, so the
    // owner's own quoteSpeed answer will stand
    expect(fold.measured.async).toBeNull()
  })

  test('voicemail is the yard not responding, and feeds the after-hours band', () => {
    const fold = foldVerdict([
      phone({
        outcome: 'no_response',
        window: 'after_hours',
        metrics: { answeredBy: 'voicemail' },
      }),
    ])
    expect(fold.measured.phone?.afterHours).toBe('voicemail')
    expect(fold.counts.reachedHuman).toBe(0)
  })

  test('fastest response spans channels (FR23)', () => {
    const fold = foldVerdict([
      phone({ outcome: 'responded', metrics: { answeredBy: 'human', msToAnswer: 9000 } }),
      email({ outcome: 'responded', metrics: { replyClass: 'human', msToFirstReply: 111_600_000 } }),
    ])
    expect(fold.fastestResponseMs).toBe(9000)
  })

  test('an undispatched attempt does not exist for the verdict', () => {
    const fold = foldVerdict([
      phone({ dispatchedAt: null, outcome: 'aborted' }), // never went out
      email({ outcome: 'responded', metrics: { replyClass: 'human', msToFirstReply: 5000 } }),
    ])
    expect(fold.counts.dispatched).toBe(1)
    expect(fold.measured.phone).toBeNull()
  })

  test('partial when any channel yielded nothing usable (FR33)', () => {
    const complete = foldVerdict([
      phone({ outcome: 'no_response' }),
      email({ outcome: 'responded', metrics: { replyClass: 'human', msToFirstReply: 5000 } }),
      form({ outcome: 'no_response' }),
    ])
    expect(complete.partial).toBe(false)
    const missingForm = foldVerdict([
      phone({ outcome: 'no_response' }),
      email({ outcome: 'responded', metrics: { replyClass: 'human', msToFirstReply: 5000 } }),
      form({ outcome: 'undeliverable_ours' }), // datacenter IP challenged
    ])
    expect(missingForm.partial).toBe(true)
  })

  test('the bias note rides along once a call went out beside async clocks (FR35)', () => {
    const fold = foldVerdict([
      phone({ outcome: 'responded', metrics: { answeredBy: 'human', msToAnswer: 4000 } }),
      email({ outcome: 'no_response' }),
    ])
    expect(fold.biasNote).toBe(true)
    const asyncOnly = foldVerdict([email({ outcome: 'no_response' })])
    expect(asyncOnly.biasNote).toBe(false)
  })
})
