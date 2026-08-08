// @vitest-environment node
/* ============================================================
   ENV ANCHORING — the silent-failure guard
   ------------------------------------------------------------
   `vite.config.js` sets `root: 'frontend'`, and Vite's `envDir`
   defaults to `root`. Left implicit, that points env loading at
   `frontend/`, where no .env file has ever lived — so every
   VITE_* var resolved to undefined in the browser and the app
   degraded *silently*: no Maps key meant loadMaps() resolved
   false, searchYards() returned [], and the hero search box
   showed no suggestions with nothing logged anywhere.

   This is the same class of bug RUNNING.md keeps warning about
   (a mis-set env var that fails quietly, not loudly), so it is
   worth a test rather than a comment: assert Vite resolves
   env from the directory the .env files actually occupy.
   ============================================================ */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveConfig } from 'vite'

const repo = import.meta.dirname

describe('vite env loading', () => {
  it('resolves envDir to the directory that holds the .env files', async () => {
    const config = await resolveConfig({ configFile: resolve(repo, 'vite.config.js') }, 'serve')

    /* All .env files are gitignored now, .env.example included, so no file
       existence can anchor this in CI. Assert the resolved directory instead:
       envDir must be the repo root, where the local .env files live. */
    expect(resolve(config.envDir)).toBe(resolve(repo))
  })

  it('finds the developer .env.local from the resolved envDir', async () => {
    const config = await resolveConfig({ configFile: resolve(repo, 'vite.config.js') }, 'serve')

    /* Read the file at envDir rather than calling loadEnv(): loadEnv() merges
       process.env, which Vitest has already populated from the root .env.local,
       so it would report success even with envDir pointing somewhere wrong. */
    const envFile = resolve(config.envDir, '.env.local')

    /* Only meaningful on a machine that has one — CI has no secrets by design. */
    if (!existsSync(resolve(repo, '.env.local'))) return

    expect(existsSync(envFile), `Vite reads env from ${config.envDir}, but .env.local is not there`).toBe(true)
    const declared = readFileSync(envFile, 'utf8')
    expect(
      /^\s*VITE_(GOOGLE_MAPS_KEY|MAPS_API_KEY)\s*=\s*\S/m.test(declared),
      'no Maps key reached the bundle — the search box will show no suggestions',
    ).toBe(true)
  })
})
