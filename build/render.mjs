/* ============================================================
   PAGE RENDERER
   ------------------------------------------------------------
   The site is going from 4 hand-written pages to ~45. That does
   not survive copy-pasted <nav> and <footer> blocks: the first
   time the navigation changes, 45 files have to agree, and one
   of them silently won't.

   So pages are authored as bodies in `frontend/pages/`, and this
   renderer composes them into real HTML in `frontend/` where
   Vite picks them up as MPA entry points. No framework, no
   client runtime, no hydration — the output is the same static
   HTML the site already ships.

   AUTHORING FORMAT
   ------------------------------------------------------------
   frontend/pages/the-desk.html

     <!--meta
     {
       "title":       "The Rental Revenue Desk | RentalRevive",
       "description": "...",
       "canonical":   "/the-desk",
       "bodyClass":   "page-desk",
       "navActive":   "desk"
     }
     meta-->

     <section class="slab">...</section>

   A page in `pages/foo/bar.html` renders to `frontend/foo/bar.html`
   and is served at `/foo/bar.html`.

   SLOTS available in templates/base.html:
     {{TITLE}} {{DESCRIPTION}} {{CANONICAL}} {{BODY_CLASS}}
     {{HEAD_EXTRA}} {{NAV}} {{BODY}} {{FOOTER}}

   Partials can be pulled into any page or template with:
     <!--include: nav -->        → templates/nav.html

   Generated files are gitignored. Edit `pages/`, never the
   rendered output.
   ============================================================ */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGES = join(ROOT, 'frontend', 'pages')
const TEMPLATES = join(ROOT, 'frontend', 'templates')
const OUT = join(ROOT, 'frontend')

const META_RE = /^\s*<!--meta([\s\S]*?)meta-->/
const INCLUDE_RE = /<!--\s*include:\s*([a-z0-9_-]+)\s*-->/gi

/* Walk a directory for .html files, returning paths relative to it. */
async function walk(dir, base = dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full, base)))
    else if (entry.name.endsWith('.html')) out.push(relative(base, full))
  }
  return out
}

/* Resolve <!--include: name --> against templates/, recursively, so a
   template can compose other templates. Depth-capped: a partial that
   includes itself is an authoring mistake, not a reason to hang the
   build. */
async function expandIncludes(html, cache, depth = 0) {
  if (depth > 5) throw new Error('include depth exceeded — check for a circular <!--include:-->')
  const names = [...html.matchAll(INCLUDE_RE)].map((m) => m[1])
  if (!names.length) return html

  for (const name of new Set(names)) {
    if (!cache.has(name)) {
      const path = join(TEMPLATES, `${name}.html`)
      if (!existsSync(path)) throw new Error(`include "${name}" not found at frontend/templates/${name}.html`)
      cache.set(name, await expandIncludes(await readFile(path, 'utf8'), cache, depth + 1))
    }
  }
  return html.replace(INCLUDE_RE, (_, name) => cache.get(name))
}

function parseMeta(src, pagePath) {
  const match = src.match(META_RE)
  if (!match) throw new Error(`${pagePath} has no <!--meta ... meta--> block`)
  let meta
  try {
    meta = JSON.parse(match[1])
  } catch (e) {
    throw new Error(`${pagePath} has an invalid meta block: ${e.message}`)
  }
  if (!meta.title) throw new Error(`${pagePath} meta is missing "title"`)
  if (!meta.description) throw new Error(`${pagePath} meta is missing "description"`)
  return { meta, body: src.slice(match[0].length) }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function render({ quiet = false } = {}) {
  const pages = await walk(PAGES)
  if (!pages.length) {
    if (!quiet) console.log('[render] no pages in frontend/pages — nothing to do')
    return []
  }

  const base = await readFile(join(TEMPLATES, 'base.html'), 'utf8')
  const cache = new Map()
  const written = []

  for (const rel of pages) {
    const src = await readFile(join(PAGES, rel), 'utf8')
    const { meta, body } = parseMeta(src, `frontend/pages/${rel}`)

    /* Depth of the page below the site root, so a nested page can still
       reach root-relative assets if it ever needs to. Root-relative
       hrefs are the default and need no adjustment. */
    const canonical = meta.canonical || '/' + rel.replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\.html$/, '')

    const html = (await expandIncludes(base, cache))
      .replace(/\{\{TITLE\}\}/g, esc(meta.title))
      .replace(/\{\{DESCRIPTION\}\}/g, esc(meta.description))
      .replace(/\{\{CANONICAL\}\}/g, esc(canonical))
      .replace(/\{\{BODY_CLASS\}\}/g, esc(meta.bodyClass || ''))
      .replace(/\{\{HEAD_EXTRA\}\}/g, meta.headExtra || '')
      .replace(/\{\{BODY\}\}/g, await expandIncludes(body, cache))

    const dest = join(OUT, rel)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, html, 'utf8')
    written.push(rel)
  }

  if (!quiet) console.log(`[render] ${written.length} page${written.length === 1 ? '' : 's'} → frontend/`)
  return written
}

/* Vite plugin: render before build, and re-render in dev whenever a
   page or template changes. Keeps `npm run dev` honest without a
   separate watcher process. */
export function pageRenderer() {
  return {
    name: 'rentalrevive-pages',
    async buildStart() {
      await render({ quiet: true })
    },
    configureServer(server) {
      const watched = [PAGES, TEMPLATES]
      server.watcher.add(watched)
      server.watcher.on('all', async (_event, file) => {
        if (!watched.some((dir) => file.startsWith(dir))) return
        try {
          await render({ quiet: true })
          server.ws.send({ type: 'full-reload' })
        } catch (e) {
          server.config.logger.error(`[render] ${e.message}`)
        }
      })
    },
  }
}

/* CLI: node build/render.mjs */
if (process.argv[1] && process.argv[1].endsWith('render.mjs')) {
  render().catch((e) => {
    console.error(`[render] ${e.message}`)
    process.exit(1)
  })
}
