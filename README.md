# RentalRevive

Missed-rental recovery for independent US heavy-machinery rental yards: a
free Leak Scan (this app's main deliverable) feeding a managed revenue
recovery service. See `CONTEXT.md` in this directory for the full standing
memory — the business, the offer ladder, the scan's design, and the Revive
Agent backend.

## Install

```bash
cd rentalrevive
npm install
```

## The three processes

```bash
npm run dev          # the SPA (Vite) — landing site + the Leak Scan
npm run dev:convex   # the Revive Agent backend (Convex dev deployment)
npm run dev:probe    # the form-probe worker (services/form-probe/)
```

Start order and *why* it matters — Convex first, then the site — is in
[`../graph.md`](../graph.md). Every environment variable each process needs
is in [`../RUNNING.md`](../RUNNING.md).

## Verify

```bash
npm test         # vitest, 16 files / 167 tests
npm run typecheck   # tsc over services/convex/ only — the SPA stays plain JS
npm run build
```

## Standing memory

- **`CONTEXT.md`** — read this first in any new session: the business, the
  scan, the design rules, and the Revive Agent backend.
- **`SESSION.md`** — the pick-up-here doc for the Revive Agent build:
  current state, invariants, verification commands, deployment checklist.
