import { defineConfig } from 'vite'
import { resolve, join, relative } from 'path'
import { readdirSync, existsSync } from 'fs'
import { pageRenderer } from './build/render.mjs'

const FRONTEND = resolve(__dirname, 'frontend')

/* Every .html under frontend/ is an MPA entry point, except the authoring
   sources in pages/ and templates/ — those are inputs to the renderer, not
   to Vite. Globbing rather than hand-listing is the whole point: adding a
   page means adding a file in frontend/pages/, and nothing else. */
function htmlInputs(dir = FRONTEND, out = {}) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'pages' || entry.name === 'templates' || entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) htmlInputs(full, out)
    else if (entry.name.endsWith('.html')) {
      /* key: path without extension, slashes flattened — "catch/after-hours" */
      const key = relative(FRONTEND, full).replace(/\\/g, '/').replace(/\.html$/, '')
      out[key] = full
    }
  }
  return out
}

export default defineConfig({
  root: 'frontend',
  /* envDir defaults to `root`, which would point env loading at frontend/ —
     a directory that has never held a .env file. Anchor it here, where
     .env.local and .env.example actually live, or every VITE_* var resolves
     to undefined in the browser and the app degrades silently. */
  envDir: __dirname,
  server: { port: 8000, open: false },
  plugins: [pageRenderer()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      /* Inputs are resolved at config time, and the renderer runs in the
         plugin's buildStart — which is AFTER this. So a brand-new page is
         picked up on the second build unless the renderer has already
         written it. `npm run build` runs the renderer first for exactly
         that reason; see package.json. */
      input: existsSync(FRONTEND) ? htmlInputs() : {},
    },
  },
})
