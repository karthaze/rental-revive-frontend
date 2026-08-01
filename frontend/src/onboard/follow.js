/* ============================================================
   STICK-TO-BOTTOM — the one decision scrollToEnd needs
   ------------------------------------------------------------
   A transcript that scrolls to the bottom on every append fights
   anyone reading back through it. The rule every good chat log
   follows: keep up with new content while the reader is already at
   the bottom, and stay put the moment they scroll away.

   Pure geometry so it can be tested without a DOM.
   ============================================================ */

/* How close to the bottom still counts as "following" — roughly one
   bubble, so a reader who is a line or two off the end still gets
   carried along, while one who has genuinely scrolled back does not. */
export const STICK_SLACK_PX = 140

/** @param {{scrollTop:number, scrollHeight:number, clientHeight:number}} box */
export function shouldFollow(box, slack = STICK_SLACK_PX) {
  const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight
  return distanceFromBottom <= slack
}
