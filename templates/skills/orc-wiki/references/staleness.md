# Reference — Freshness, Staleness & Refresh

THE canonical freshness reference for the whole constellation. Every skill that
consults the wiki (orc, /orc-ultra, orc-mini, orc-fast, planners) follows the
rules here; this file is the single source of truth for the manifest format,
the tier thresholds, and the refresh modes.

## The manifest — `.claude/orc/wiki-meta.json`

Written **ONLY by orc-wiki**, at the end of every scan/refresh (full,
selective, or incremental). No other skill ever writes it — a stored freshness
status goes stale the moment anyone commits, so consumers never persist a
status; they compute it (below). Lives outside `templates/` next to the
pattern cache, so `orc update` never clobbers it.

```json
{
  "last_scan": "12-07-2026 14:32:05",
  "scan_commit": "<full git hash — HEAD at scan time>",
  "branch": "main",
  "pages": 14,
  "commands": {
    "build": "npm run build",
    "test_fast": "npm test",
    "lint": "npm run lint"
  }
}
```

- `last_scan`: dd-mm-yyyy hh:mm:ss, local time.
- `scan_commit`: the anchor every staleness compute measures against.
- `commands`: the project's build/test/lint invocations, discovered ONCE during
  the scan. Consumers (especially orc-fast's smoke gate) run these directly
  instead of rediscovering the project's tooling every run. Omit keys the
  project doesn't have; never guess.

## Computing freshness (on read — never stored)

Two git commands, no file reads:

```
distance = git rev-list --count <scan_commit>..HEAD
drift    = git diff --name-only <scan_commit>..HEAD    (pass 2, only when needed)
```

| Tier | Condition (pass 1) |
|-------|--------------------|
| FRESH | distance < `wiki_fresh_max` (default 10) |
| AGING | `wiki_fresh_max` ≤ distance ≤ `wiki_aging_max` (default 30) |
| STALE | distance > `wiki_aging_max`, OR pass-2 drift intersects the `covers` globs of the docs being consulted |

Pass 2 runs only when pass 1 lands AGING or worse: intersect `drift` with the
relevant docs' `covers`. Drift touching covered files upgrades severity; drift
entirely elsewhere may be read as "old but still accurate for this area".
Thresholds come from config (`wiki_fresh_max`, `wiki_aging_max`).

If `wiki-meta.json` is ABSENT but `wiki/` has docs (a pre-manifest wiki),
treat as STALE with the notice: "wiki predates the freshness manifest — run
/orc-wiki refresh to enable freshness tracking."

## Per-skill reactions

| Tier | orc / /orc-ultra / planners | orc-mini | orc-fast |
|-------|-----------------------------|----------|----------|
| FRESH | silent | silent | proceed |
| AGING | one-line notice, proceed | one-line notice, proceed | one-line notice, proceed |
| STALE | prominent warning, continue (these lanes self-ground) | prominent warning, continue | **user gate** — see the orc-fast skill (refresh-then-continue recommended / drop to mini / continue anyway) |

## Per-doc staleness (advisory second signal)

Each doc records `scanned_commit` and `covered_hash` (a hash of the covered
files' contents at scan time). A doc is stale when the current state of its
`covers` globs differs from `covered_hash`. Cheap to check, no re-scan needed.
The doc-header `status: fresh|stale` flag is ADVISORY only — it is flipped by
the auto-flag hook below, which fires only on ORC runs, so commits made outside
ORC never flip it. The computed tier above is always the authoritative check.

## Refresh modes

1. **Incremental (recommended default when a manifest exists)** —
   `git diff --name-only <scan_commit>..HEAD`, match changed files against each
   doc's `covers` globs, re-scan ONLY the affected docs, then rewrite
   `wiki-meta.json` with the new `scan_commit` + timestamp. A delta pass, not a
   full re-scan — this is what makes "refresh first" cheap enough to recommend.
2. **Full regenerate** — re-scan every area. Full cost warning. Timestamps all
   docs fresh.
3. **Selective refresh** — list stale-flagged docs; user picks which to
   re-scan. Only those spawn agents.
4. **Pre-push diff-scan** — `git diff --name-only` against the push target;
   find docs whose `covers` intersect the changed files; offer to refresh those
   before commit.

## Post-ship refresh ask (big runs — full orc + /orc-ultra ship phase)

GUARD FIRST: only if `wiki/` exists AND contains > 0 docs. No wiki → completely
silent (no ask, no note).

A run counts as BIG when, judged by FINAL counts at ship time (so a medium run
that grew counts): tasks dispatched ≥ `wiki_refresh_ask_tasks` (default 3), OR
union of executors' touched files > `wiki_refresh_ask_files` (default 10), OR
waves > 1. Relevance check: if the run's touched files intersect ZERO docs'
`covers`, downgrade to the passive note regardless of size.

- **BIG** → right after ship, ask:
  1. **Refresh wiki now** *(recommended)* — incremental refresh (mode 1),
     scoped to the docs this run staled.
  2. **Later** — print: "This was a big change — N wiki docs are now stale.
     Refresh ASAP (/orc-wiki) or orc-fast and future runs will degrade." Stamp
     `wiki_refresh_declined` in the checkpoint so /orc-retro can correlate.
- **Small runs** → the passive auto-flag note below only. No ask.

orc-mini keeps the passive note only (single-task lane); orc-fast never asks
(its preflight polices freshness on the way in).

## Auto-flag hook (after orc / orc-mini runs)

GUARD FIRST: only act if `wiki/` exists AND contains > 0 files. On an empty/
absent wiki this hook is a silent no-op.

If guarded in:
1. Take the files the orc run touched (from its dispatch/actual_files).
2. Mark every wiki doc whose `covers` intersect those files as `status: stale`.
   This is a metadata flip only — instant, free, no scanning.
3. Tell the user: "N wiki docs are now stale from this change. Run
   /orc-wiki to refresh when ready." Never auto-scan. (On a BIG full-lane run
   the post-ship refresh ask above replaces this passive note.)

## Consume rule (main orc + orc-mini)

Before consulting the wiki during planning/scoring: check `wiki/` exists and has
> 0 files. If yes, compute the freshness tier (above) and react per the
per-skill table, then read the relevant `orc-feature-*` / `orc-reference-*` /
`orc-architecture-overview.md` for the area being planned — selecting pages via
`wiki/INDEX.md` (one line per doc) instead of globbing and skimming headers.
If empty/absent, ignore entirely and plan as normal. The wiki is purely
additive.
