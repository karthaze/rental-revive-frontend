/* ============================================================
   THE PROBE PORT — AD-1
   ------------------------------------------------------------
   One port, three adapters. A live telephony bridge, async mail
   and a headless browser behave nothing alike, but the report
   must treat them uniformly and every one must answer NFR7's
   question — did they not respond, or did we fail to get
   through? — in the same closed vocabulary.

   Two operations, matching the spine's rule verbatim:

     dispatch(attempt) → providerRef
     resolve(providerEvent) → Outcome

   Rules that make the hexagon hold:
   - Channel-specific measurements live in `attempt.metrics`,
     never in new top-level shapes.
   - Adapters return typed results and NEVER throw across this
     boundary; an unexpected throw is caught by the orchestrator
     and resolves the attempt `aborted` (spine conventions).
   - No adapter-local status string escapes an adapter — the
     translation to the AD-2 vocabulary happens inside `resolve`.
   - Adapters never touch the database (AD-5). They reach state
     only through the values they return.
   ============================================================ */
import type { Outcome } from '../core/outcome'

export type Channel = 'phone' | 'email' | 'form'

/* What the dispatch chokepoint hands an adapter: the already-written
   attempt row's identity (the idempotency key, AD-9), the consented
   target — never re-read from `yards` — and the context the channel
   needs. */
export type DispatchJob = {
  attemptId: string // provider client-reference / idempotency key
  runId: string
  channel: Channel
  sequence: number // 1-based per channel — drives caller-number rotation (NFR5)
  target: string // the consented phone / email / formUrl, exact string
  /* async channels only (AD-14): the registered persona to send as */
  persona: {
    legalName: string
    fromAddress: string
    replyDomain: string
    siteUrl: string
    phone: string
  } | null
  /* machinery context for requirements-shaped inquiries (FR16, C8):
     only lines the owner already told us he rents — never an invented
     job, site, or delivery date */
  machineLines: string[]
  yardName: string
}

/* Dispatch is fire-and-report: reaching the provider succeeded or it
   did not. Measurement outcomes arrive later through `resolve`. */
export type DispatchResult =
  | { ok: true; providerRef: string }
  | {
      ok: false
      /* Could not hand the job to the provider at all. This is OUR
         failure by definition — it resolves the attempt
         `undeliverable_ours` unless the config itself was refused,
         which is `aborted` (nothing was ever tried). */
      outcome: Extract<Outcome, 'undeliverable_ours' | 'aborted'>
      reason: string // for failureReason — diagnosis, never shown to the owner
    }

/* A provider event, signature-verified at the HTTP edge before it
   gets anywhere near an adapter (spine conventions: webhook auth). */
export type ProviderEvent = {
  providerRef: string
  kind: string // adapter-local event name; must not escape the adapter
  payload: unknown
}

/* What `resolve` returns. `outcome: null` means the event advanced
   the attempt without finishing it (a ringing callback, a delivery
   receipt) — metrics may still accrue. */
export type Resolution = {
  outcome: Outcome | null
  /* merged shallowly into attempt.metrics by the orchestrator */
  metrics?: Record<string, unknown>
  /* artifacts to copy into our storage (AD-10) — provider URLs are
     fetched once at ingestion and never stored as canonical */
  artifacts?: { kind: string; url: string; containsStaffVoice: boolean }[]
  reason?: string // failureReason for the *_ours / aborted paths
}

export interface ProbeAdapter {
  readonly channel: Channel
  dispatch(job: DispatchJob): Promise<DispatchResult>
  resolve(event: ProviderEvent): Resolution
}
