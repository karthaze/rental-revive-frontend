/* Append an auditEvents row from an action context (NFR2). Actions
   have no db handle; this is their one writer for audit facts. */
import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'

export const record = internalMutation({
  args: {
    runId: v.union(v.id('probeRuns'), v.null()),
    type: v.string(),
    actor: v.string(),
    detail: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('auditEvents', { ...args, at: Date.now() })
  },
})
