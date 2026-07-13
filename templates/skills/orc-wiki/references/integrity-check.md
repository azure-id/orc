# Reference — Scan-End Integrity Self-Check (anti-drift gate)

Runs at the END of every scan/refresh (full, incremental, selective), AFTER
all docs are written and BEFORE the manifest is rewritten. The orchestrator
runs it itself — it is checklist work (file existence + cross-referencing),
not scanning, so it needs no agent. Any failed item is FIXED before the run
is declared done; if a fix needs a re-scan, that re-scan rides the current
run's consent (no new warning).

When logging is on, emit ONE trace line per item:
`WIKI-CHECK <item> ✅ PASS` or `WIKI-CHECK <item> ⛔ FAIL <what>` — and after
fixes a final `WIKI-CHECK all ✅` before the manifest write.

## The checklist

1. **index-sync** — every doc file on disk under `wiki/` (excluding
   `wiki/archive/`) has exactly one INDEX.md line, and every INDEX.md line
   points at an existing file. No extras either way.
2. **registry-sync** — the manifest's `docs` registry lists exactly the docs
   on disk; each entry's `covers` + `covered_files` mirror that doc's header.
   Headers still on v1 (no `wiki_schema: 2`) are noted for lazy upgrade, not
   failed.
3. **covers-resolve** — every doc's `covers` globs match ≥ 1 real file. Zero
   matches → route into the dead-doc sweep (staleness.md), never leave a dead
   doc indexed as live.
4. **coverage-report** — union of all docs' `covers` vs the repo's source
   tree: print coverage % and the top uncovered directories. Informational
   (feeds the coverage-gap sweep) — uncovered dirs are REPORTED with a
   proposed-area suggestion, never auto-scanned.
5. **counts-match** — `wiki-meta.json` `pages` == real doc count; the
   CLAUDE.md pointer block's doc count + "Last updated" match the manifest.
6. **anchor-spot-check** — for each doc written THIS run, pick 2 evidence
   anchors from its contract sections and confirm the cited files exist
   (existence only — cheap). A missing file = the agent cited something it
   didn't read → re-queue that doc's scan.

## Why it exists

The wiki's own artifacts (docs, INDEX.md, manifest registry, CLAUDE.md block)
are four places that can silently disagree — and a wiki that disagrees with
itself cannot be a source of truth. This gate makes internal consistency a
shipped property of every run, not a hope.
