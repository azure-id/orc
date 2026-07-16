# Reference — Refresh Protocol (per-feature freshness, multi-select)

REFRESH regenerates the onboarding pair for features the user picks. It
never runs unprompted, never regenerates everything by default, and never
persists a freshness status — freshness is computed on read, every time,
from each feature's fingerprint header.

## Inputs (all read from disk)

Per feature folder `learning-docs/<slug>/`, the `orc-learn:meta` header in
its `knowledge.md` (`template-knowledge.md`): `source_commit` +
`covered_files` (path → 6-hex md5).

## Computing freshness (on read — never stored)

The same two-pass recipe as the wiki's staleness reference, run per feature
against its own `source_commit`:

```
distance = git rev-list --count <source_commit>..HEAD
drift    = git diff --name-only <source_commit>..HEAD    (pass 2, when needed)
```

| Tier | Condition |
|-------|-----------|
| FRESH | distance < `wiki_fresh_max` (default 10) |
| AGING | `wiki_fresh_max` ≤ distance ≤ `wiki_aging_max` (default 30) |
| STALE | distance > `wiki_aging_max`, OR pass-2 drift intersects the feature's `covered_files` paths |

Pass 2 runs only when pass 1 lands AGING or worse: intersect `drift` with the
feature's `covered_files` paths. Drift hitting covered files upgrades the
tier to STALE; drift entirely elsewhere may read as "old but still accurate
for this feature". Thresholds are the existing `wiki_fresh_max` /
`wiki_aging_max` config keys — orc-learn adds no config keys of its own.

A `knowledge.md` with a missing/unparseable header cannot prove anything →
show it as STALE (header will be rewritten on regeneration). A feature
folder missing its `knowledge.md` entirely → show as BROKEN; regeneration is
the fix.

## The refresh flow

1. Enumerate `learning-docs/*/knowledge.md`; compute each feature's tier as
   above. None found → "nothing generated yet; run `/orc-learn` first", stop.
2. Present the FULL list — every feature, each with its computed tier — and
   let the user multi-select which to regenerate. FRESH features stay
   selectable (the user may want a rewrite after learning more); STALE ones
   are flagged, never auto-selected. Nothing picked → stop, zero writes.
3. Per selected feature the writer re-runs the full deepen (`deepen.md`) on
   the feature's `covers` set and regenerates BOTH files: new
   `source_commit` = current HEAD, recomputed `covered_files` hashes, a new
   line in the doc changelog, `updated:` set to today (DD-MM-YYYY). Files
   that vanished since generation drop out of the map; files the new flow
   pulls in are added.
4. After the last selected feature, re-derive `learning-docs/INDEX.md` from
   every feature's current header (all features, not just the refreshed
   ones).

## Invariants

- Freshness/tier is NEVER written to any file — not the header, not the
  index. Only `source_commit` + `covered_files` (facts) persist.
- Only user-selected features are regenerated; the rest are byte-untouched.
- DD-MM-YYYY everywhere a date is written.
- A refresh that regenerates nothing (user picked none) writes nothing.
