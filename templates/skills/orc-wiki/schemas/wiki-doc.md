# Schema — Wiki Doc + Scan-Agent Contract (v2)

## Doc file format (wiki/orc-feature-{x}-overview.md etc.)

Every wiki doc starts with a metadata header, then the body. `wiki_schema: 2`
marks the current format; a doc without it is v1 — consumers degrade gracefully
(treat as v1: no keywords, single `covered_hash`), and any refresh that touches
a v1 doc upgrades it to v2.

```markdown
---
wiki_schema: 2
doc_type: feature | reference | architecture
area: <slug>                    # e.g. "notifications", "auth-conventions"
covers: [<glob>, ...]           # files/dirs this doc documents
keywords: [<term>, ...]         # 5–10 retrieval terms (feeds INDEX.md; how
                                # consumers match a request to this page)
scanned_at: DDMMYY HH:MM:SS     # last scan time
scanned_commit: <git-hash>      # HEAD at scan time
covered_files:                  # per-file granularity (replaces covered_hash)
  <path>: <short-hash>          # hash of that file's content at scan time
status: fresh | stale           # stale when covered files changed since scan
model: opus-4.8-high
---

# {Area} Overview

## TL;DR (60-second brief)
<5–8 bullets: what this is, the 2–3 files that matter most, the one thing
 that bites. Cheap consumers may read ONLY this section — make it carry.>

## Purpose
<what this area does, in plain terms>

## Key files & responsibilities
<file → what it does>

## Public interface / entry points
<APIs, exports, routes others depend on>

## Contracts & shapes
<the area's outward-facing data, table form, one evidence anchor per row:
 API routes (method + path + handler file) · DB tables/models owned ·
 event/queue message names · env vars & config keys read.
 Omit rows that don't apply; NEVER fabricate a row.>

## Data & state
<models, tables, key state this area owns>

## Dependencies
<what it depends on; what depends on it — blast radius>

## Conventions & gotchas
<patterns to follow, non-obvious constraints, things that bite>

## Testing map
<where this area's tests live, the scoped command to run just them,
 notable gaps ("no tests for X"). "No tests found" is a valid entry.>

## Notes for planning
<hints for the orchestrator: is this core or isolated? high-risk? fragile?>
```

The "Notes for planning" section is deliberate: it feeds the main orc's
core-vs-isolated and risk scoring directly.

## Evidence anchoring (hard rule — what makes the wiki a source of truth)

Every factual claim in `Key files`, `Public interface`, `Contracts & shapes`,
`Data & state`, and `Dependencies` MUST cite the file it comes from
(`path/to/file.ext`, plus the symbol/route/table name where applicable).
**Never assert what the code doesn't show: a claim the agent can't anchor to a
file it actually read is OMITTED, not guessed.** Prose sections (`Purpose`,
`Conventions & gotchas`, `Notes for planning`) may synthesize, but any
concrete mechanism they mention must be anchorable to a `covered_files` entry.
A doc whose contract sections carry no anchors is malformed (requeue).

## Scan-agent input slice

- area, covers[]         — the slice of the repo to document
- doc_type
- constraints[]          — from any existing intent (usually none for wiki)

## Scan-agent return (strict, orchestrator validates)

- area
- status: done | failed | partial | needs_context
- doc_body               — the filled sections above (metadata added by orchestrator)
- keywords[]             — 5–10 retrieval terms for the header + INDEX.md
- covered_files          — map of {path: short-hash} for every file actually
                           read (the orchestrator writes it into the header
                           AND the manifest's per-doc registry)
- planning_notes         — the core/isolated/risk hints, surfaced for scoring
- failure_reason         — required if failed; else null
- progress               — {percent, notes} if partial; else null

Malformed return = failure (requeue) — including missing `keywords[]`/
`covered_files`, or contract sections with no evidence anchors.
needs_context cap 2 per area.
