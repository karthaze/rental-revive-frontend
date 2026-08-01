/* AD-8 — Convex is the only scheduler. These three sweeps are the whole
   background workload: retention (AD-10), run deadlines (NFR1), and
   callback reconciliation (AD-9). */
import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'retention sweep',
  { hours: 1 },
  internal.scheduler.retention.sweepArtifacts,
  {},
)

crons.interval(
  'run deadline sweep',
  { minutes: 15 },
  internal.scheduler.retention.sweepDeadlines,
  {},
)

/* AD-9 — lost provider callbacks are reconciled by querying the
   provider, never re-dispatched. */
crons.interval(
  'callback reconciliation',
  { minutes: 15 },
  internal.scheduler.reconcile.sweepLostCallbacks,
  {},
)

export default crons
