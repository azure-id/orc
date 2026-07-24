# Reference — Scan-End Integrity Self-Check (anti-drift gate)

Runs at the END of every scan/refresh (full, incremental, selective), AFTER
all docs are written and AFTER the closing `orc wiki sync` — it VALIDATES the
derived registration rather than racing it. The orchestrator runs it itself —
it is checklist work (file existence + cross-referencing), not scanning, so it
needs no agent. Any failed item is FIXED before the run is declared done; if a
fix needs a re-scan, that re-scan rides the current run's consent (no new
warning).

When logging is on, emit ONE trace line per item:
`WIKI-CHECK <item> ✅ PASS` or `WIKI-CHECK <item> ⛔ FAIL <what>` — and after
fixes a final `WIKI-CHECK all ✅`.

## Items 1, 2, 5 and 7 — now structural

index-sync, registry-sync, counts-match and crosslink-sync used to compare four
hand-maintained artifacts against each other. Since `orc wiki sync` DERIVES
`wiki/INDEX.md` and `.claude/orc/wiki-meta.json` — the `docs` registry with each
doc's `covers` + `covered_files`, the `pages` count, and the
`crosslink_provided` index of `wiki/crosslink/` — from the one source those
artifacts were supposed to agree with (the doc headers), they cannot disagree
unless registration was never run. So the four collapse into one command:

```bash
orc wiki sync --check     # exit 0 = registration matches the docs on disk
```

Exit 0 → emit `WIKI-CHECK registration ✅ PASS`. Non-zero → sync was skipped or
a doc changed after it; run `orc wiki sync` and re-check. Never fix these by
hand-editing INDEX.md or the manifest: that re-creates the very drift the
derivation removes. Only the manifest's `commands` key is hand-maintained, and
only per staleness.md.

## The checklist

1. **covers-resolve** — every doc's `covers` globs match ≥ 1 real file. Zero
   matches → route into the dead-doc sweep (staleness.md), never leave a dead
   doc indexed as live.
2. **coverage-report** — union of all docs' `covers` vs the repo's source
   tree: print coverage % and the top uncovered directories. Informational
   (feeds the coverage-gap sweep) — uncovered dirs are REPORTED with a
   proposed-area suggestion, never auto-scanned.
3. **claudemd-match** — the CLAUDE.md pointer block's doc count + "Last
   updated" match the manifest. (The manifest's own `pages` is derived, so it
   cannot drift; the pointer block is hand-injected, so it can.)
4. **schema-upgrade-note** — list docs whose headers are still v1 (no
   `wiki_schema: 2`: no `keywords`, a single `covered_hash` instead of per-file
   `covered_files`). Derivation keeps them usable and indexed, so this is a
   NOTE for lazy upgrade on the next refresh, never a failure — the one thing
   the derived registration can't tell you, since a v1 entry looks merely
   sparse rather than wrong.
5. **anchor-spot-check** — for each doc written THIS run, pick 2 evidence
   anchors from its contract sections and confirm the cited files exist
   (existence only — cheap). A missing file = the agent cited something it
   didn't read → re-queue that doc's scan.
6. **crosslink-anchors** (UNCONDITIONAL as of v0.24.0 — this is the guard that
   catches "boundary exists but no tags", the exact silent-zero the old
   "only when this repo published a boundary this run" clause allowed). Trigger:
   if ANY doc written this run reported boundaries (`crosslink_tags` ≠ `none`)
   OR carries a non-empty `## Contracts & shapes` table, then `wiki/crosslink/`
   MUST exist and every reported tag must be on disk AND registered in
   `crosslink_provided` — else FAIL and fix before the run is declared done (the
   fix is publishing the tags, NOT a re-scan). Each `crosslink_provided` entry's
   `anchor` file must also exist (an anchor pointing at a deleted file is real
   drift no derivation can see). A ZERO-tag completion is allowed ONLY when the
   final report carries the explicit line
   "crosslink: no outward boundary ({reason})" — a bare zero-tag finish FAILS.
   Emit `WIKI-CHECK crosslink …` when logging. Consume-side needs/cache stay
   advisory and are NOT gated (a stale cache warns, never fails).
7. **orientation-check** (v0.33.0) — `wiki/orc-orientation.md` exists (it is a
   derived assemble-step output, so a scan/refresh that ends without one
   skipped a step), every `Reading order` pointer resolves to a REGISTERED doc,
   and one spot-checked `Journeys` anchor's file exists. Neighbors section
   present only when crosslink cache/atlas exists; otherwise the explicit
   "no outward crosslink configured" line. A failed item is fixed by
   re-deriving the orientation doc (free) — never a re-scan.

## Why it exists

A wiki that disagrees with itself cannot be a source of truth. Deriving the
index and manifest from the docs removes one whole class of that disagreement
by construction; this gate covers what derivation cannot see — claims pointing
at files that don't exist, docs covering nothing, and the hand-injected
CLAUDE.md block — so internal consistency is a shipped property of every run,
not a hope.
