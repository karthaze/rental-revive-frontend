/* ============================================================
   STICK-TO-BOTTOM — should the thread follow new content?
   ------------------------------------------------------------
   The thread used to scroll to the bottom on every append, from a
   dozen call sites per turn. Two consequences, both fixed by the
   decision under test:

     - a reader who scrolled up to re-read an answer got yanked
       back down the moment the next bubble landed
     - each call re-targeted a smooth scroll that was still
       animating, which is what read as jitter

   Following is correct only while the reader is already at the
   bottom. Everything here is a plain geometry object — no DOM.
   ============================================================ */
import { describe, test, expect } from 'vitest'
import { shouldFollow, STICK_SLACK_PX } from './follow.js'

/* a viewport 600 tall looking at 2000px of thread: bottom is 1400 */
const box = (scrollTop) => ({ scrollTop, scrollHeight: 2000, clientHeight: 600 })

describe('shouldFollow', () => {
  test('follows when pinned to the bottom', () => {
    expect(shouldFollow(box(1400))).toBe(true)
  })

  test('follows when within a bubble of the bottom', () => {
    expect(shouldFollow(box(1400 - (STICK_SLACK_PX - 10)))).toBe(true)
  })

  test('leaves the reader alone once they scroll up to re-read', () => {
    expect(shouldFollow(box(600))).toBe(false)
  })

  test('does not follow just outside the slack', () => {
    expect(shouldFollow(box(1400 - (STICK_SLACK_PX + 10)))).toBe(false)
  })

  /* scrollTop 0 is ambiguous — it is both a fresh thread and a
     reader who scrolled all the way up to re-read the opening. This
     function must NOT guess: position alone cannot tell them apart,
     so the top of a long thread reads as "not following" and the
     caller's follow flag (which starts true) covers the fresh case. */
  test('does not infer following from being at the top', () => {
    expect(shouldFollow(box(0))).toBe(false)
  })

  test('follows when the thread is shorter than the viewport', () => {
    expect(shouldFollow({ scrollTop: 0, scrollHeight: 400, clientHeight: 600 })).toBe(true)
  })

  test('the slack is about one bubble, not a screenful', () => {
    expect(STICK_SLACK_PX).toBeGreaterThan(40)
    expect(STICK_SLACK_PX).toBeLessThan(300)
  })
})
