/* ============================================================
   THE OUTCOME VOCABULARY — AD-2, NFR7
   ------------------------------------------------------------
   Every probe attempt, on every channel, resolves to exactly one
   of six outcomes. The set is CLOSED: adding a member is a spine
   change, not an implementation detail, because the whole product
   rests on one distinction this vocabulary encodes —

     "they did not respond"  vs  "we could not get through"

   A carrier spam-labels our number, a cold domain lands in spam,
   a datacenter IP gets challenged: each of those, filed as the
   yard's failure, hands the owner "proof" that is actually our
   fault. If he ever catches it, the evidence-based positioning
   dies with it. So `undeliverable_ours` is never a finding and
   never enters the leak re-pricing.

   This module is pure and dependency-free. The schema mirrors the
   same union for storage; this is the reasoning side.
   ============================================================ */

export const OUTCOMES = [
  'responded', // a human dealt with the inquiry
  'no_response', // delivered (or ringing) and nobody ever did
  'undeliverable_ours', // OUR infrastructure failed — never a finding
  'undeliverable_theirs', // their number disconnected, mailbox invalid, site down
  'blocked_by_target', // their systems actively refused (e.g. a captcha wall)
  'aborted', // kill switch, internal error — measurement never happened
] as const

export type Outcome = (typeof OUTCOMES)[number]

export const isOutcome = (x: unknown): x is Outcome =>
  typeof x === 'string' && (OUTCOMES as readonly string[]).includes(x)

/* ------------------------------------------------------------
   What each outcome is allowed to mean downstream.
   ------------------------------------------------------------ */

/** May this outcome be presented as a finding about the yard?
    `undeliverable_ours` and `aborted` may not — they are rendered as
    a distinct, clearly-labelled row that is explicitly NOT about the
    yard's business (NFR7). */
export const isYardFinding = (o: Outcome): boolean =>
  o === 'responded' ||
  o === 'no_response' ||
  o === 'undeliverable_theirs' ||
  o === 'blocked_by_target'

/** May this outcome feed the AD-11 re-pricing? Stricter still:
    only attempts where the yard had a real chance to respond count.
    `undeliverable_theirs` (dead number) and `blocked_by_target` are
    reported as findings but are not response-time evidence. */
export const entersRepricing = (o: Outcome): boolean =>
  o === 'responded' || o === 'no_response'

/** Terminal = the attempt is finished and may never change again
    (AD-6: a row gains terminal fields once). Every outcome is
    terminal; in-flight is represented by `null`, not by a member. */
export const isTerminal = (o: Outcome | null): o is Outcome => o !== null
