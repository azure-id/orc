# Schema — Wiki Doc + Scan-Agent Contract

## Doc file format (wiki/orc-feature-{x}-overview.md etc.)

Every wiki doc starts with a metadata header, then the body.

```markdown
---
doc_type: feature | reference | architecture
area: <slug>                    # e.g. "notifications", "auth-conventions"
covers: [<glob>, ...]           # files/dirs this doc documents
scanned_at: DDMMYY HH:MM:SS     # last scan time
scanned_commit: <git-hash>      # HEAD at scan time
covered_hash: <hash>            # hash of covered files' state at scan time
status: fresh | stale           # stale when covered files changed since scan
model: opus-4.8-high
---

# {Area} Overview

## Purpose
<what this area does, in plain terms>

## Key files & responsibilities
<file → what it does>

## Public interface / entry points
<APIs, exports, routes others depend on>

## Data & state
<models, tables, key state this area owns>

## Dependencies
<what it depends on; what depends on it — blast radius>

## Conventions & gotchas
<patterns to follow, non-obvious constraints, things that bite>

## Notes for planning
<hints for the orchestrator: is this core or isolated? high-risk? fragile?>
```

The "Notes for planning" section is deliberate: it feeds the main orc's
core-vs-isolated and risk scoring directly.

## Scan-agent input slice

- area, covers[]         — the slice of the repo to document
- doc_type
- constraints[]          — from any existing intent (usually none for wiki)

## Scan-agent return (strict, orchestrator validates)

- area
- status: done | failed | partial | needs_context
- doc_body               — the filled sections above (metadata added by orchestrator)
- covered_files[]        — actual files read (→ covered_hash)
- planning_notes         — the core/isolated/risk hints, surfaced for scoring
- failure_reason         — required if failed; else null
- progress               — {percent, notes} if partial; else null

Malformed return = failure (requeue). needs_context cap 2 per area.
