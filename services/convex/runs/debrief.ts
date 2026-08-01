/* ============================================================
   THE DEBRIEF — FR19, C7
   ------------------------------------------------------------
   When the measurement window closes, the yard is told the
   inquiry was part of the authorised audit, by the same persona
   that sent it, with the measured time stated plainly. Deferred
   disclosure is only permitted because nobody's live time was
   consumed (C5); the debrief is what closes that loop within
   the window the PRD promises.

   Send failure is logged and swallowed: the debrief is an
   obligation we retry operationally, not a measurement — it
   must never alter the attempt's outcome.
   ============================================================ */
import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { debriefCopy, postmarkConfigFromEnv } from '../adapters/email/postmark'

export const sendDebrief = internalAction({
  args: { attemptId: v.id('probeAttempts') },
  handler: async (ctx, { attemptId }) => {
    const loaded = await ctx.runQuery(internal.runs.dispatch.loadForExecute, { attemptId })
    if (!loaded) return
    const { attempt, run, consent, persona, yard } = loaded

    if (attempt.channel !== 'email') return
    const metrics = (attempt.metrics ?? {}) as Record<string, unknown>
    if (metrics.debriefSentAt !== undefined) return // idempotent (AD-9 spirit)

    const cfg = postmarkConfigFromEnv()
    if (!cfg || !persona || !consent.targets.email) {
      await ctx.runMutation(internal.runs.auditLog.record, {
        runId: run._id,
        type: 'debrief_skipped',
        actor: 'system',
        detail: { attemptId, reason: !cfg ? 'email not configured' : 'missing persona or target' },
      })
      return
    }

    const { subject, body } = debriefCopy({
      yardName: yard?.name ?? 'your yard',
      persona,
      msToFirstReply:
        typeof metrics.msToFirstReply === 'number' ? metrics.msToFirstReply : null,
    })

    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': cfg.serverToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        From: `${persona.legalName} <${persona.fromAddress}>`,
        To: consent.targets.email,
        Subject: subject,
        TextBody: body,
        MessageStream: 'outbound',
        Tag: 'probe-debrief',
      }),
    }).catch(() => null)

    if (res?.ok) {
      await ctx.runMutation(internal.runs.resolve.recordEmailFacts, {
        attemptId,
        debriefSentAt: Date.now(),
      })
    } else {
      await ctx.runMutation(internal.runs.auditLog.record, {
        runId: run._id,
        type: 'debrief_failed',
        actor: 'system',
        detail: { attemptId, status: res?.status ?? 'network error' },
      })
    }
  },
})
