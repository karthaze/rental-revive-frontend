/* ============================================================
   THE INVARIANTS, END TO END
   ------------------------------------------------------------
   Everything here runs against the real schema and the real
   chokepoint through convex-test. The tests are named for the
   rules they hold in place: NFR3 (no probe without consent),
   AD-6 (append-only), AD-7 (one dispatch path), FR5 (kill),
   FR9/FR10 (retry discipline), AD-16 (no adapter → honest
   abort, never a fabricated measurement), FR33 (nothing
   dead-ends), C2 (staff voice never served).
   ============================================================ */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { t as makeT, seedPersona, seedYardAndScan, OWNER, TARGETS, BASE_ANSWERS } from '../test.helpers'
import { requestAttempt, DispatchRefused } from './dispatch'
import { zonedEpoch, localMinutes } from '../core/windows'

const CHI = 'America/Chicago'
// a Tuesday, 10:00 yard-local — comfortably inside business hours
const ACTIVATION_AT = zonedEpoch(CHI, 2026, 3, 3, 10, 0)

let t: ReturnType<typeof makeT>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(ACTIVATION_AT)
  t = makeT()
})
afterEach(() => vi.useRealTimers())

async function activated(over: { email?: string | null; formUrl?: string | null } = {}) {
  const seeded = await t.run(async (ctx) => {
    const personaId = await seedPersona(ctx)
    const { yardId, scanId } = await seedYardAndScan(ctx)
    return { personaId, yardId, scanId }
  })
  const asOwner = t.withIdentity(OWNER)
  /* the bootstrap _generated api is untyped (AnyApi) until a real
     `npx convex dev` regenerates it — assert the return shape here */
  const res = (await asOwner.mutation(api.runs.activate.activate, {
    scanId: seeded.scanId,
    targets: {
      phone: TARGETS.phone,
      email: over.email === undefined ? TARGETS.email : over.email,
      formUrl: over.formUrl === undefined ? TARGETS.formUrl : over.formUrl,
    },
    disclosureVersion: 'v1-test',
  })) as { runId: Id<'probeRuns'>; consentId: Id<'consents'>; firstCallAt: number }
  return { ...seeded, ...res, asOwner }
}

const attemptsOf = (runId: Id<'probeRuns'>) =>
  t.run((ctx) =>
    ctx.db
      .query('probeAttempts')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .collect(),
  )

describe('activation (FR2, FR4, FR8, AD-15)', () => {
  test('writes the consent artifact and dispatches async first, phone at T+60s', async () => {
    const { runId, consentId, firstCallAt } = await activated()

    const consent = await t.run((ctx) => ctx.db.get(consentId))
    expect(consent?.targets).toEqual(TARGETS)
    expect(consent?.clerkUserId).toBe(OWNER.subject)
    expect(consent?.disclosureVersion).toBe('v1-test')
    expect(consent?.revokedAt).toBeNull()

    const attempts = await attemptsOf(runId)
    const by = (c: string) => attempts.find((a) => a.channel === c)!
    // AD-15 — the async clocks start at activation, before the call
    expect(by('email').scheduledFor).toBe(ACTIVATION_AT)
    expect(by('form').scheduledFor).toBe(ACTIVATION_AT)
    // FR8 — the call fires while he is watching
    expect(by('phone').scheduledFor).toBe(ACTIVATION_AT + 60_000)
    expect(by('phone').window).toBe('business')
    expect(firstCallAt).toBe(ACTIVATION_AT + 60_000)
    // every attempt is a row before anything external happens (AD-9)
    for (const a of attempts) {
      expect(a.outcome).toBeNull()
      expect(a.dispatchedAt).toBeNull()
    }
  })

  test('refuses without authentication (FR2)', async () => {
    const { scanId } = await t.run(async (ctx) => {
      await seedPersona(ctx)
      return seedYardAndScan(ctx)
    })
    await expect(
      t.mutation(api.runs.activate.activate, {
        scanId,
        targets: TARGETS,
        disclosureVersion: 'v1-test',
      }),
    ).rejects.toThrow(/authentication required/)
  })

  test('refuses without a cleared persona (C7, AD-14)', async () => {
    const { scanId } = await t.run(async (ctx) => {
      await ctx.db.insert('personas', {
        legalName: 'Uncleared Co',
        jurisdiction: 'TX',
        domain: 'x.com',
        fromAddress: 'a@x.com',
        replyDomain: 'r.x.com',
        siteUrl: 'https://x.com',
        phone: '+15550000000',
        clearedAt: null, // name clearance never finished
        retiredAt: null,
      })
      return seedYardAndScan(ctx)
    })
    await expect(
      t.withIdentity(OWNER).mutation(api.runs.activate.activate, {
        scanId,
        targets: TARGETS,
        disclosureVersion: 'v1-test',
      }),
    ).rejects.toThrow(/persona/)
  })

  test('refuses a yard with no resolved timezone (NFR4)', async () => {
    const { scanId } = await t.run(async (ctx) => {
      await seedPersona(ctx)
      return seedYardAndScan(ctx, { timezone: null })
    })
    await expect(
      t.withIdentity(OWNER).mutation(api.runs.activate.activate, {
        scanId,
        targets: TARGETS,
        disclosureVersion: 'v1-test',
      }),
    ).rejects.toThrow(/timezone/)
  })
})

describe('the chokepoint (AD-7, NFR3, FR10)', () => {
  test('refuses once consent is revoked', async () => {
    const { runId, consentId } = await activated()
    await t.run((ctx) => ctx.db.patch(consentId, { revokedAt: Date.now() }))
    await expect(
      t.run((ctx) =>
        requestAttempt(ctx, {
          runId,
          channel: 'phone',
          window: 'lunch',
          scheduledFor: Date.now() + 1000,
          now: Date.now(),
        }),
      ),
    ).rejects.toThrow(/consent revoked/)
  })

  test('refuses a channel the owner did not consent to', async () => {
    const { runId } = await activated({ email: null, formUrl: null })
    await expect(
      t.run((ctx) =>
        requestAttempt(ctx, {
          runId,
          channel: 'email',
          window: null,
          scheduledFor: Date.now(),
          now: Date.now(),
        }),
      ),
    ).rejects.toThrow(/no consented email target/)
  })

  test('enforces the phone attempt cap (FR10, CO5)', async () => {
    const { runId } = await activated()
    // activation already used attempt 1 of 4
    for (let i = 0; i < 3; i++) {
      await t.run((ctx) =>
        requestAttempt(ctx, {
          runId,
          channel: 'phone',
          window: 'alt_day',
          scheduledFor: Date.now() + (i + 2) * 100 * 60_000,
          now: Date.now(),
        }),
      )
    }
    await expect(
      t.run((ctx) =>
        requestAttempt(ctx, {
          runId,
          channel: 'phone',
          window: 'alt_day',
          scheduledFor: Date.now() + 999 * 60_000,
          now: Date.now(),
        }),
      ),
    ).rejects.toThrow(/cap reached/)
    expect((await attemptsOf(runId)).filter((a) => a.channel === 'phone')).toHaveLength(4)
  })

  test('email is one inquiry, ever (FR16)', async () => {
    const { runId } = await activated()
    await expect(
      t.run((ctx) =>
        requestAttempt(ctx, {
          runId,
          channel: 'email',
          window: null,
          scheduledFor: Date.now(),
          now: Date.now(),
        }),
      ),
    ).rejects.toThrow(/cap reached/)
  })
})

describe('append-only attempts (AD-6)', () => {
  test('a second resolution is an error, not an update', async () => {
    const { runId } = await activated()
    const phone = (await attemptsOf(runId)).find((a) => a.channel === 'phone')!
    await t.mutation(internal.runs.resolve.resolveAttempt, {
      attemptId: phone._id,
      outcome: 'no_response',
      now: Date.now(),
    })
    await expect(
      t.mutation(internal.runs.resolve.resolveAttempt, {
        attemptId: phone._id,
        outcome: 'responded',
        now: Date.now(),
      }),
    ).rejects.toThrow(/append-only/)
    // and the first outcome stands
    const after = await t.run((ctx) => ctx.db.get(phone._id))
    expect(after?.outcome).toBe('no_response')
  })
})

describe('retries (FR9, FR10)', () => {
  test('a rang-out call earns a new row in an unused window', async () => {
    const { runId } = await activated()
    const first = (await attemptsOf(runId)).find((a) => a.channel === 'phone')!
    vi.setSystemTime(ACTIVATION_AT + 5 * 60_000)
    await t.mutation(internal.runs.resolve.resolveAttempt, {
      attemptId: first._id,
      outcome: 'no_response',
      now: Date.now(),
    })
    const phones = (await attemptsOf(runId))
      .filter((a) => a.channel === 'phone')
      .sort((a, b) => a.sequence - b.sequence)
    expect(phones).toHaveLength(2)
    const retry = phones[1]
    expect(retry.outcome).toBeNull() // a NEW row, not a mutation of the old
    expect(retry.window).toBe('lunch') // soonest unused window
    expect(localMinutes(retry.scheduledFor, CHI)).toBe(12 * 60)
    // FR10 spacing from the first attempt
    expect(retry.scheduledFor - first.scheduledFor).toBeGreaterThanOrEqual(90 * 60_000)
    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.windowsUsed).toEqual(['business', 'lunch'])
  })

  test('an answered call ends the phone chase', async () => {
    const { runId } = await activated()
    const first = (await attemptsOf(runId)).find((a) => a.channel === 'phone')!
    await t.mutation(internal.runs.resolve.resolveAttempt, {
      attemptId: first._id,
      outcome: 'responded',
      metrics: { answeredBy: 'human', msToAnswer: 9000 },
      now: Date.now(),
    })
    expect((await attemptsOf(runId)).filter((a) => a.channel === 'phone')).toHaveLength(1)
  })
})

describe('the run resolves into a verdict (FR23, FR26, AD-11)', () => {
  test('measured inputs substitute the owner’s bands and re-price through the one engine', async () => {
    const { runId } = await activated()
    const attempts = await attemptsOf(runId)
    const now = Date.now()

    // simulate the executor having fired each attempt (AD-9 order)
    for (const a of attempts) {
      await t.mutation(internal.runs.dispatch.markDispatched, {
        attemptId: a._id,
        at: now,
        providerRef: `test_${a.channel}`,
      })
    }

    const by = (c: string) => attempts.find((a) => a.channel === c)!
    await t.mutation(internal.runs.resolve.resolveAttempt, {
      attemptId: by('phone')._id,
      outcome: 'responded',
      metrics: { answeredBy: 'human', msToAnswer: 8000 },
      now,
    })
    await t.mutation(internal.runs.resolve.resolveAttempt, {
      attemptId: by('email')._id,
      outcome: 'responded',
      metrics: { replyClass: 'human', msToFirstReply: 31 * 3600_000 }, // the 31-hour email
      now,
    })
    await t.mutation(internal.runs.resolve.resolveAttempt, {
      attemptId: by('form')._id,
      outcome: 'no_response',
      now,
    })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.status).toBe('resolved')

    const verdict = await t.run((ctx) =>
      ctx.db
        .query('verdicts')
        .withIndex('by_run', (q) => q.eq('runId', runId))
        .unique(),
    )
    expect(verdict).not.toBeNull()
    expect(verdict!.counts).toEqual({
      dispatched: 3,
      reachedHuman: 2,
      noResponse: 1,
      unreachableOurs: 0,
    })
    expect(verdict!.fastestResponseMs).toBe(8000)
    expect(verdict!.partial).toBe(false)
    expect(verdict!.biasNote).toBe(true)

    // the yard answered its phone: the measurement REPLACES the owner's
    // self-reported '1 – 5 a week' with 'Almost none' — the counter-metric
    // case (M4): a yard that performs well sees its number go DOWN
    const subs = (verdict!.measured as { substitutions: { key: string; to: string }[] })
      .substitutions
    expect(subs.find((s) => s.key === 'missedCalls')?.to).toBe('Almost none')
    expect(subs.find((s) => s.key === 'quoteSpeed')?.to).toBe('Next day') // 31h
    expect(verdict!.selfReported).toEqual({
      missedCalls: BASE_ANSWERS.missedCalls,
      quoteSpeed: BASE_ANSWERS.quoteSpeed,
      afterHours: BASE_ANSWERS.afterHours,
    })
    expect(verdict!.repriced).not.toBeNull()
    expect(verdict!.repriced!.monthlyCents).toBeGreaterThan(0)
  })
})

describe('no adapter configured → honest abort (AD-16)', () => {
  test('attempts abort with a diagnosis; nothing is fabricated; the run still ends', async () => {
    const { runId } = await activated()
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const attempts = await attemptsOf(runId)
    expect(attempts.length).toBeGreaterThan(0)
    for (const a of attempts) {
      expect(a.outcome).toBe('aborted')
      expect(a.failureReason).toMatch(/adapter configured/)
      expect(a.dispatchedAt).toBeNull() // nothing external ever happened
    }

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.status).toBe('resolved')

    const verdict = await t.run((ctx) =>
      ctx.db
        .query('verdicts')
        .withIndex('by_run', (q) => q.eq('runId', runId))
        .unique(),
    )
    // FR33 — nothing dead-ends, but the verdict claims NOTHING:
    // zero dispatched, no measurement, no re-priced figure
    expect(verdict!.counts.dispatched).toBe(0)
    expect(verdict!.partial).toBe(true)
    expect(verdict!.repriced).toBeNull()
    expect((verdict!.measured as { substitutions: unknown[] }).substitutions).toEqual([])
  })
})

describe('the kill switch (FR5, NFR3)', () => {
  test('revokes, aborts in-flight work, and later scheduler fires stand down', async () => {
    const { runId, consentId, asOwner } = await activated()
    await asOwner.mutation(api.runs.kill.killRun, { runId })

    const consent = await t.run((ctx) => ctx.db.get(consentId))
    expect(consent?.revokedAt).not.toBeNull()
    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.status).toBe('killed')

    const attempts = await attemptsOf(runId)
    for (const a of attempts) expect(a.outcome).toBe('aborted')

    // FR33 — the partial verdict still exists
    const verdict = await t.run((ctx) =>
      ctx.db
        .query('verdicts')
        .withIndex('by_run', (q) => q.eq('runId', runId))
        .unique(),
    )
    expect(verdict?.partial).toBe(true)

    // the already-scheduled executions fire, find the revocation, and
    // touch nothing — same rows, no new rows
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const after = await attemptsOf(runId)
    expect(after).toHaveLength(attempts.length)
    for (const a of after) expect(a.dispatchedAt).toBeNull()
  })

  test('only the granter can pull it', async () => {
    const { runId } = await activated()
    await expect(
      t.withIdentity({ subject: 'someone_else' }).mutation(api.runs.kill.killRun, { runId }),
    ).rejects.toThrow(/only the authorising owner/)
  })
})

describe('the deadline sweep (NFR1, FR33)', () => {
  test('an expired run resolves with what it has', async () => {
    const { runId } = await activated()
    const attempts = await attemptsOf(runId)
    // one attempt made it out the door — and was CONFIRMED delivered,
    // which is what licenses "no response" as a finding (NFR7)
    const email = attempts.find((a) => a.channel === 'email')!
    await t.mutation(internal.runs.dispatch.markDispatched, {
      attemptId: email._id,
      at: Date.now(),
      providerRef: 'pm_msg_1',
    })
    await t.mutation(internal.runs.resolve.recordInterim, {
      attemptId: email._id,
      metrics: { deliveryStatus: 'delivered' },
    })

    vi.setSystemTime(ACTIVATION_AT + 49 * 3600_000) // past the 48h window
    await t.mutation(internal.scheduler.retention.sweepDeadlines, {})

    const after = await attemptsOf(runId)
    // delivered + silence for the window = no_response, THE measurement
    expect(after.find((a) => a.channel === 'email')?.outcome).toBe('no_response')
    // never dispatched = measured nothing, says so
    expect(after.find((a) => a.channel === 'phone')?.outcome).toBe('aborted')
    expect(after.find((a) => a.channel === 'form')?.outcome).toBe('aborted')

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.status).toBe('resolved')
    const verdict = await t.run((ctx) =>
      ctx.db
        .query('verdicts')
        .withIndex('by_run', (q) => q.eq('runId', runId))
        .unique(),
    )
    expect(verdict!.partial).toBe(true)
    // silence on the one delivered inquiry maps to the slowest band
    const subs = (verdict!.measured as { substitutions: { key: string; to: string }[] })
      .substitutions
    expect(subs.find((s) => s.key === 'quoteSpeed')?.to).toBe('Two days or more')
  })
})

describe('staff protection at the query layer (C2)', () => {
  test('a staff-voice artifact is stored but never served', async () => {
    const { runId, asOwner } = await activated()
    const phone = (await attemptsOf(runId)).find((a) => a.channel === 'phone')!

    await t.run(async (ctx) => {
      const ringOut = await ctx.storage.store(new Blob(['ring-out audio']))
      const staffVoice = await ctx.storage.store(new Blob(['a person speaking']))
      const mk = (storageId: Id<'_storage'>, containsStaffVoice: boolean) =>
        ctx.db.insert('artifacts', {
          attemptId: phone._id,
          kind: 'call_recording',
          storageId,
          contentType: 'audio/mpeg',
          bytes: 14,
          containsStaffVoice,
          retainUntil: Date.now() + 30 * 24 * 3600_000,
          deletedAt: null,
        })
      await mk(ringOut, false)
      await mk(staffVoice, true)
    })

    const served = await asOwner.query(api.runs.queries.attemptArtifacts, {
      attemptId: phone._id,
    })
    expect(served).toHaveLength(1) // the ring-out only — C2 holds
    expect(served[0].url).toBeTruthy()

    // and the run state never leaks failureReason diagnosis
    const state = await asOwner.query(api.runs.queries.runState, { runId })
    for (const a of state!.attempts) expect('failureReason' in a).toBe(false)

    // a stranger sees nothing at all
    const stranger = await t
      .withIdentity({ subject: 'not_the_owner' })
      .query(api.runs.queries.runState, { runId })
    expect(stranger).toBeNull()
  })
})
