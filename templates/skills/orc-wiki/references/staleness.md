# Reference — Staleness & Refresh

## How staleness is computed

Each doc records `scanned_commit` and `covered_hash` (a hash of the covered
files' contents at scan time). A doc is STALE when the current state of its
`covers` globs differs from `covered_hash`. Cheap to check — no re-scan needed
to detect staleness, only to fix it.

## Refresh modes

1. **Full regenerate** — re-scan every area. Full cost warning. Timestamps all
   docs fresh.
2. **Selective refresh** — list stale-flagged docs; user picks which to
   re-scan. Only those spawn agents.
3. **Pre-push diff-scan** — `git diff --name-only` against the push target;
   find docs whose `covers` intersect the changed files; offer to refresh those
   before commit.

## Auto-flag hook (after orc / orc-mini runs)

GUARD FIRST: only act if `wiki/` exists AND contains > 0 files. On an empty/
absent wiki this hook is a silent no-op.

If guarded in:
1. Take the files the orc run touched (from its dispatch/actual_files).
2. Mark every wiki doc whose `covers` intersect those files as `status: stale`.
   This is a metadata flip only — instant, free, no scanning.
3. Tell the user: "N wiki docs are now stale from this change. Run
   /orc-wiki to refresh when ready." Never auto-scan.

## Consume rule (main orc + orc-mini)

Before consulting the wiki during planning/scoring: check `wiki/` exists and has
> 0 files. If yes, read the relevant `orc-feature-*` / `orc-reference-*` /
`orc-architecture-overview.md` for the area being planned. If empty/absent,
ignore entirely and plan as normal. The wiki is purely additive.
