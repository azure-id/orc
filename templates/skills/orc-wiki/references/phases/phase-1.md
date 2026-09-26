# Phase — Phase 1 — Area planning (after consent)   (id: `phase-1`)

> **`/orc-wiki` phase file** — read when the phase fires; a wiki run reaches few of them. One consumer, so it stays home. `orc lane phases orc-wiki --json` names the file.

<!-- orc:layer full -->

## Phase 1 — Area planning (after consent)

Infer the knowledge slicing from repo structure (directories, services,
modules, routes, domains) plus cross-cutting topics (auth, data model, API
conventions, deployment, build). Produce a scan plan: scan-tasks, each = one
area/topic with the files it covers. Show the plan (areas, count, where the
5-task pauses fall). Doc types:
- `wiki/orc-feature-{x}-overview.md` — a feature/domain area
- `wiki/orc-reference-{topic}.md` — cross-cutting reference/convention
- `wiki/orc-architecture-overview.md` — the top-level map tying them together

**Standard cross-cutting reference docs** — plan these four as scan-tasks
whenever the project has the surface (they count toward the 5-task pause
cadence; SKIP any that don't apply — never fabricate one):
- `wiki/orc-reference-api-surface.md` — full route/endpoint inventory: method,
  path, handler file, owning area (the single best planning input for API work)
- `wiki/orc-reference-data-model.md` — cross-area DB/entity map: every
  table/model, owning area, key relations
- `wiki/orc-reference-glossary.md` — domain terms → meaning → where defined in
  code (kills the #1 cause of AI misreads: project jargon)
- `wiki/orc-reference-config-env.md` — every env var/config key: where read,
  default, effect

<!-- /orc:layer -->
